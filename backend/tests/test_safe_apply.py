from __future__ import annotations

from typing import Any, Dict, List

from pyvyos.core.rest_client import ApiResponse

from safe_apply import SafeApplySettings, apply_with_safe_apply, should_use_safe_apply


def _response(status: int = 200, result: Any = None, error: Any = False) -> ApiResponse:
    return ApiResponse(status=status, request={}, result=result if result is not None else {}, error=error)


class DummyDevice:
    def __init__(self, *, probe_ok: bool = True):
        self.probe_ok = probe_ok
        self.configure_calls: List[List[Dict[str, Any]]] = []
        self.save_calls: List[str] = []
        self.load_calls: List[str] = []

    def configure_multiple_op(self, op_path=None):
        self.configure_calls.append(op_path or [])
        return _response(200, {"applied": True})

    def config_file_save(self, file=None):
        self.save_calls.append(file or "")
        return _response(200, {"saved": file})

    def config_file_load(self, file=None):
        self.load_calls.append(file or "")
        return _response(200, {"loaded": file})

    def show(self, path=None):
        if self.probe_ok:
            return _response(200, "VyOS 1.5")
        return _response(500, error="probe failed")


class DummyDeviceMissingBackupDir(DummyDevice):
    def config_file_save(self, file=None):
        self.save_calls.append(file or "")
        file_text = str(file or "")
        if file_text.startswith("/config/.vymanager-safe-apply/"):
            return _response(
                400,
                error=(
                    "failed to write config file, write_file_atomic: "
                    "[Errno 2] No such file or directory"
                ),
            )
        return _response(200, {"saved": file})


def test_should_use_safe_apply_for_risky_paths():
    settings = SafeApplySettings(enabled=True)
    operations = [{"op": "set", "path": ["interfaces", "ethernet", "eth1", "description", "WAN"]}]
    assert should_use_safe_apply(operations, settings) is True


def test_should_not_use_safe_apply_for_non_risky_paths():
    settings = SafeApplySettings(enabled=True)
    operations = [{"op": "set", "path": ["service", "ntp", "server", "time.google.com"]}]
    assert should_use_safe_apply(operations, settings) is False


def test_apply_with_safe_apply_success_path():
    device = DummyDevice(probe_ok=True)
    settings = SafeApplySettings(enabled=True, confirm_window_seconds=1, probe_interval_seconds=1)
    operations = [{"op": "set", "path": ["interfaces", "ethernet", "eth2", "description", "LAN"]}]

    response = apply_with_safe_apply(
        device,
        operations,
        settings=settings,
        reason="unit-test",
        force_safe_apply=True,
    )

    assert response.status == 200
    assert len(device.save_calls) == 1
    assert len(device.configure_calls) == 1
    assert len(device.load_calls) == 0
    assert response.result.get("_safe_apply", {}).get("rollback_triggered") is False


def test_apply_with_safe_apply_rolls_back_on_probe_failure():
    device = DummyDevice(probe_ok=False)
    settings = SafeApplySettings(enabled=True, confirm_window_seconds=1, probe_interval_seconds=1)
    operations = [{"op": "set", "path": ["firewall", "ipv4", "name", "WAN-IN"]}]

    response = apply_with_safe_apply(
        device,
        operations,
        settings=settings,
        reason="unit-test",
        force_safe_apply=True,
    )

    assert response.status == 500
    assert len(device.save_calls) == 1
    assert len(device.configure_calls) == 1
    assert len(device.load_calls) == 1
    assert response.result.get("_safe_apply", {}).get("rollback_triggered") is True


def test_apply_with_safe_apply_falls_back_to_config_root_when_backup_dir_missing():
    device = DummyDeviceMissingBackupDir(probe_ok=True)
    settings = SafeApplySettings(enabled=True, confirm_window_seconds=1, probe_interval_seconds=1)
    operations = [{"op": "set", "path": ["interfaces", "ethernet", "eth2", "description", "LAN"]}]

    response = apply_with_safe_apply(
        device,
        operations,
        settings=settings,
        reason="unit-test",
        force_safe_apply=True,
    )

    assert response.status == 200
    assert len(device.save_calls) == 2
    assert device.save_calls[0].startswith("/config/.vymanager-safe-apply/")
    assert device.save_calls[1].startswith("/config/safe-apply-")
    assert response.result.get("_safe_apply", {}).get("backup_file", "").startswith("/config/safe-apply-")
