"""System update-check configuration router.

Exposes scoped read/batch operations for `system update-check` plus runtime
status probing (`show system updates`).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from fastapi_permissions import require_read_permission
from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


system_update_check = build_config_tree_router(
    tree_path=["system", "update-check"],
    endpoint_slug="system-update-check",
    tag="system-update-check",
    display_name="System update-check",
    feature_group=FeatureGroup.SYSTEM,
    response_key="update_check",
)


class SystemUpdateCheckStatusResponse(BaseModel):
    """Best-effort runtime status for VyOS image update checks."""

    available: bool = False
    checked_at: str
    command_used: Optional[str] = None
    current_version: Optional[str] = None
    update_available: Optional[bool] = None
    update_version: Optional[str] = None
    update_url: Optional[str] = None
    summary: Optional[str] = None
    raw_output: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


def _extract_show_output(result: Any) -> str:
    if isinstance(result, dict):
        data = result.get("data", "")
        return data if isinstance(data, str) else str(data or "")
    if isinstance(result, str):
        return result
    return str(result or "")


def _parse_key_value_line(output: str, key: str) -> Optional[str]:
    key_lower = key.lower()
    for line in output.splitlines():
        if ":" not in line:
            continue
        left, right = line.split(":", 1)
        if left.strip().lower() == key_lower:
            value = right.strip()
            return value or None
    return None


def _build_status_from_output(
    output: str,
    command_used: str,
    warnings: List[str],
) -> SystemUpdateCheckStatusResponse:
    current_version = _parse_key_value_line(output, "Current version")
    update_version = _parse_key_value_line(output, "Update available")
    update_url = _parse_key_value_line(output, "Update URL")

    output_lower = output.lower()
    if update_version:
        normalized = update_version.strip().lower()
        update_available: Optional[bool] = not (
            normalized.startswith("no ")
            or normalized in {"none", "n/a", "not available"}
        )
    elif any(marker in output_lower for marker in ("no update available", "up to date", "already up-to-date")):
        update_available = False
    elif any(marker in output_lower for marker in ("update available", "new version")):
        update_available = True
    else:
        update_available = None

    if update_available is True:
        summary = f"Update available: {update_version}" if update_version else "Update available."
    elif update_available is False:
        summary = "System is up to date."
    else:
        first_line = next((line.strip() for line in output.splitlines() if line.strip()), None)
        summary = first_line or "Unable to determine update status from command output."

    return SystemUpdateCheckStatusResponse(
        available=True,
        checked_at=datetime.now(timezone.utc).isoformat(),
        command_used=command_used,
        current_version=current_version,
        update_available=update_available,
        update_version=update_version,
        update_url=update_url,
        summary=summary,
        raw_output=output,
        warnings=warnings,
    )


@system_update_check.get("/status", response_model=SystemUpdateCheckStatusResponse)
async def get_system_update_check_status(request: Request, refresh: bool = False) -> SystemUpdateCheckStatusResponse:
    """
    Get runtime update status using best-effort op-mode probes.

    Primary command: `show system updates`
    Fallbacks: `show system update-check`, then generate variants.
    """
    await require_read_permission(request, FeatureGroup.SYSTEM)

    warnings: List[str] = []
    _ = refresh  # reserved for future cache-control parity

    probes = [
        ("show system updates", "show", ["system", "updates"]),
        ("show system update-check", "show", ["system", "update-check"]),
        ("show system image", "show", ["system", "image"]),
        ("generate system updates", "generate", ["system", "updates"]),
        ("generate system update-check", "generate", ["system", "update-check"]),
        ("generate system image", "generate", ["system", "image"]),
    ]

    try:
        service = get_session_vyos_service(request)

        for label, method_name, command_path in probes:
            method = getattr(service.device, method_name, None)
            if method is None:
                warnings.append(f"{label}: command method '{method_name}' is unavailable on this target.")
                continue

            try:
                response = await run_in_threadpool(method, path=command_path)
            except Exception as exc:
                warnings.append(f"{label}: command execution failed ({exc}).")
                continue

            status = getattr(response, "status", None)
            if status != 200:
                error = getattr(response, "error", "") or "non-200 response"
                warnings.append(f"{label}: {error}.")
                continue

            output = _extract_show_output(getattr(response, "result", ""))
            if not output.strip():
                warnings.append(f"{label}: command returned empty output.")
                continue

            return _build_status_from_output(output=output, command_used=label, warnings=warnings)

        return SystemUpdateCheckStatusResponse(
            available=False,
            checked_at=datetime.now(timezone.utc).isoformat(),
            summary="Unable to retrieve update status from this VyOS target.",
            warnings=warnings,
        )
    except Exception as exc:
        warnings.append(str(exc))
        return SystemUpdateCheckStatusResponse(
            available=False,
            checked_at=datetime.now(timezone.utc).isoformat(),
            summary="Failed to retrieve update status.",
            warnings=warnings,
        )
