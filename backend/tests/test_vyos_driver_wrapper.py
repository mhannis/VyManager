from __future__ import annotations

from pyvyos.core.rest_client import ApiResponse

from vyos_driver import VyOSDriver


def _response(status: int = 200):
    return ApiResponse(status=status, request={}, result={"ok": True}, error=False)


class FakeService:
    def __init__(self):
        self.device = object()
        self.calls = []
        self.version = "1.5"

    def apply_operations(self, operations, *, safe_apply=None, probe_target=None, reason=None):
        self.calls.append(
            {
                "operations": operations,
                "safe_apply": safe_apply,
                "probe_target": probe_target,
                "reason": reason,
            }
        )
        return _response(200)

    def get_version(self):
        return self.version


def test_driver_delegates_to_service_and_preserves_probe_target():
    service = FakeService()
    driver = VyOSDriver(service, probe_target="192.168.10.50")
    ops = [{"op": "set", "path": ["interfaces", "ethernet", "eth1", "description", "LAN"]}]

    response = driver.apply_operations(ops, safe_apply=True, reason="test")

    assert response.status == 200
    assert len(service.calls) == 1
    assert service.calls[0]["operations"] == ops
    assert service.calls[0]["safe_apply"] is True
    assert service.calls[0]["probe_target"] == "192.168.10.50"
    assert service.calls[0]["reason"] == "test"


def test_driver_passthrough_for_existing_service_methods():
    service = FakeService()
    driver = VyOSDriver(service)
    assert driver.get_version() == "1.5"

