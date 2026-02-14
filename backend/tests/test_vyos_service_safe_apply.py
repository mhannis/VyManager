from __future__ import annotations

from pyvyos.core.rest_client import ApiResponse

from safe_apply import SafeApplySettings
from vyos_service import VyOSService


def _response(status: int = 200):
    return ApiResponse(status=status, request={}, result={"ok": True}, error=False)


class DummyDevice:
    def __init__(self):
        self.calls = []

    def configure_multiple_op(self, op_path=None):
        self.calls.append(op_path)
        return _response(200)


class FakeBatch:
    def __init__(self, operations):
        self._operations = operations

    def is_empty(self):
        return len(self._operations) == 0

    def get_operations(self):
        return self._operations


def test_apply_operations_invalidate_cache_on_success():
    service = VyOSService.__new__(VyOSService)
    service.device = DummyDevice()
    service._cached_config = {"cached": True}
    service._safe_apply_settings = SafeApplySettings(enabled=False)

    operations = [{"op": "set", "path": ["service", "ntp"]}]
    response = service.apply_operations(operations, safe_apply=False)

    assert response.status == 200
    assert service._cached_config is None
    assert len(service.device.calls) == 1


def test_execute_batch_uses_apply_operations():
    service = VyOSService.__new__(VyOSService)
    captured = {}

    def fake_apply(operations, *, safe_apply=None, probe_target=None, reason=None):
        captured["operations"] = operations
        captured["reason"] = reason
        return _response(200)

    service.apply_operations = fake_apply  # type: ignore[assignment]

    operations = [{"op": "set", "path": ["service", "ssh"]}]
    response = VyOSService.execute_batch(service, FakeBatch(operations))

    assert response.status == 200
    assert captured["operations"] == operations
    assert captured["reason"] == "execute_batch"

