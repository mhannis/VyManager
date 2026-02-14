"""
Safe Apply helpers for high-risk VyOS configuration changes.

The VyOS HTTPS API applies `configure` operations immediately and does not expose
a first-class commit-confirm transaction. This module provides an emulated
commit-confirm workflow for risky paths:

1) Save a config snapshot to disk
2) Apply operations
3) Probe connectivity
4) Roll back from snapshot on probe failure
"""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from pyvyos.core.rest_client import ApiResponse


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except Exception:
        return default
    return max(minimum, value)


@dataclass
class SafeApplySettings:
    enabled: bool = True
    confirm_window_seconds: int = 20
    probe_interval_seconds: int = 2
    backup_dir: str = "/config/.vymanager-safe-apply"
    risky_roots: Set[str] = field(
        default_factory=lambda: {
            "interfaces",
            "firewall",
            "nat",
            "vrf",
            "policy",
            "route",
            "routes",
            "protocols",
        }
    )
    risky_subtrees: Set[Tuple[str, ...]] = field(
        default_factory=lambda: {
            ("vpn", "ipsec"),
            ("vpn", "wireguard"),
        }
    )

    @classmethod
    def from_env(cls) -> "SafeApplySettings":
        return cls(
            enabled=_env_bool("SAFE_APPLY_ENABLED", True),
            confirm_window_seconds=_env_int(
                "SAFE_APPLY_CONFIRM_WINDOW_SECONDS", 20, minimum=5
            ),
            probe_interval_seconds=_env_int(
                "SAFE_APPLY_PROBE_INTERVAL_SECONDS", 2, minimum=1
            ),
            backup_dir=os.getenv("SAFE_APPLY_BACKUP_DIR", "/config/.vymanager-safe-apply"),
        )


def _normalize_operations(operations: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for op in operations:
        if not isinstance(op, dict):
            continue
        path = op.get("path")
        if not isinstance(path, list):
            continue
        normalized.append(op)
    return normalized


def is_risky_operation(operation: Dict[str, Any], settings: SafeApplySettings) -> bool:
    path = operation.get("path")
    if not isinstance(path, list) or not path:
        return False

    first = str(path[0]).strip().lower()
    if first in settings.risky_roots:
        return True

    path_tuple = tuple(str(part).strip().lower() for part in path[:2])
    return path_tuple in settings.risky_subtrees


def should_use_safe_apply(
    operations: Sequence[Dict[str, Any]], settings: SafeApplySettings
) -> bool:
    if not settings.enabled:
        return False
    normalized = _normalize_operations(operations)
    return any(is_risky_operation(op, settings) for op in normalized)


def _result_as_dict(result: Any) -> Dict[str, Any]:
    if isinstance(result, dict):
        return dict(result)
    if result in (None, ""):
        return {}
    return {"result": result}


def _is_ping_success(output: str) -> bool:
    lower = output.lower()
    if "100% packet loss" in lower:
        return False
    if " 0 received" in lower or ", 0 received" in lower:
        return False
    if "1 received" in lower or " 1 packets received" in lower:
        return True
    if "bytes from" in lower:
        return True
    return False


def probe_device_connectivity(
    device: Any,
    *,
    probe_target: Optional[str],
    timeout_seconds: int,
    interval_seconds: int,
) -> Tuple[bool, str]:
    deadline = time.monotonic() + max(timeout_seconds, interval_seconds)
    last_error = "probe timeout"

    while time.monotonic() < deadline:
        try:
            liveness = device.show(path=["version"])
            if getattr(liveness, "status", None) == 200:
                if not probe_target:
                    return True, "API liveness probe succeeded"

                ping = device.show(
                    path=[
                        "ping",
                        probe_target,
                        "count",
                        "1",
                        "deadline",
                        "1",
                    ]
                )
                if getattr(ping, "status", None) == 200:
                    ping_text = str(getattr(ping, "result", "") or "")
                    if _is_ping_success(ping_text):
                        return True, f"API+ping probe succeeded ({probe_target})"
                    last_error = f"ping failed for {probe_target}"
                else:
                    # Ping command may not be available in all builds; keep API probe as source of truth.
                    return True, "API liveness probe succeeded (ping unsupported)"
            else:
                last_error = str(getattr(liveness, "error", "") or "liveness check failed")
        except Exception as exc:
            last_error = str(exc)

        time.sleep(interval_seconds)

    return False, last_error


def _build_safe_apply_metadata(
    *,
    backup_file: str,
    rollback_triggered: bool,
    reason: Optional[str],
    probe_detail: str,
) -> Dict[str, Any]:
    return {
        "mode": "emulated_commit_confirm",
        "backup_file": backup_file,
        "rollback_triggered": rollback_triggered,
        "reason": reason,
        "probe_detail": probe_detail,
    }


def apply_with_safe_apply(
    device: Any,
    operations: Sequence[Dict[str, Any]],
    *,
    settings: Optional[SafeApplySettings] = None,
    probe_target: Optional[str] = None,
    reason: Optional[str] = None,
    force_safe_apply: Optional[bool] = None,
) -> ApiResponse:
    cfg = settings or SafeApplySettings.from_env()
    normalized = _normalize_operations(operations)
    if not normalized:
        return ApiResponse(
            status=400,
            request={},
            result={},
            error="No valid configure operations provided",
        )

    safe_required = (
        force_safe_apply
        if force_safe_apply is not None
        else should_use_safe_apply(normalized, cfg)
    )

    # If the device doesn't expose config snapshot helpers (e.g., test doubles),
    # fall back to direct apply to preserve existing test contracts.
    has_snapshot_api = all(
        hasattr(device, attr) and callable(getattr(device, attr))
        for attr in ("config_file_save", "config_file_load")
    )
    if not safe_required or not has_snapshot_api:
        return device.configure_multiple_op(op_path=normalized)

    backup_file = (
        f"{cfg.backup_dir.rstrip('/')}/safe-apply-"
        f"{int(time.time())}-{uuid.uuid4().hex[:8]}.boot"
    )

    save_response = device.config_file_save(file=backup_file)
    if getattr(save_response, "status", None) != 200:
        return ApiResponse(
            status=500,
            request=getattr(save_response, "request", {}) or {},
            result={},
            error=(
                "Safe apply pre-check failed: unable to create config snapshot "
                f"at '{backup_file}': {getattr(save_response, 'error', None) or 'unknown error'}"
            ),
        )

    apply_response = device.configure_multiple_op(op_path=normalized)
    if getattr(apply_response, "status", None) != 200:
        return apply_response

    probe_ok, probe_detail = probe_device_connectivity(
        device,
        probe_target=probe_target,
        timeout_seconds=cfg.confirm_window_seconds,
        interval_seconds=cfg.probe_interval_seconds,
    )

    if probe_ok:
        result = _result_as_dict(getattr(apply_response, "result", {}))
        result["_safe_apply"] = _build_safe_apply_metadata(
            backup_file=backup_file,
            rollback_triggered=False,
            reason=reason,
            probe_detail=probe_detail,
        )
        return ApiResponse(
            status=getattr(apply_response, "status", 200),
            request=getattr(apply_response, "request", {}) or {},
            result=result,
            error=getattr(apply_response, "error", False),
        )

    rollback_response = device.config_file_load(file=backup_file)
    rollback_ok = getattr(rollback_response, "status", None) == 200
    result = _result_as_dict(getattr(apply_response, "result", {}))
    result["_safe_apply"] = _build_safe_apply_metadata(
        backup_file=backup_file,
        rollback_triggered=True,
        reason=reason,
        probe_detail=probe_detail,
    )

    rollback_error = ""
    if not rollback_ok:
        rollback_error = (
            f" Rollback failed: {getattr(rollback_response, 'error', None) or 'unknown error'}"
        )

    return ApiResponse(
        status=500,
        request=getattr(apply_response, "request", {}) or {},
        result=result,
        error=(
            "Safe apply connectivity probe failed; previous configuration was "
            f"{'restored' if rollback_ok else 'NOT restored'} from snapshot."
            f"{rollback_error}"
        ),
    )

