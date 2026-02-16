from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import routers.firewall.ipv4 as ipv4_router
import routers.firewall.ipv6 as ipv6_router


class DummyResponse:
    def __init__(self, status: int = 200, result=None, error: str = ""):
        self.status = status
        self.result = result if result is not None else {}
        self.error = error


class DummyService:
    def __init__(self):
        self.last_operations = []

    def get_version(self):
        return "1.5"

    def execute_batch(self, batch):
        self.last_operations = batch.get_operations()
        return DummyResponse(status=200, result={"ok": True})


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(ipv4_router.router)
    app.include_router(ipv6_router.router)
    return app


def test_ipv4_unknown_operation_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService()
    monkeypatch.setattr(ipv4_router, "require_write_permission", allow_write)
    monkeypatch.setattr(ipv4_router, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/ipv4/batch",
        json={
            "chain": "forward",
            "rule_number": 100,
            "is_custom_chain": False,
            "operations": [{"op": "not_a_real_op"}],
        },
    )

    assert response.status_code == 400
    assert "Unknown operation" in response.json()["detail"]


def test_ipv6_unknown_operation_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService()
    monkeypatch.setattr(ipv6_router, "require_write_permission", allow_write)
    monkeypatch.setattr(ipv6_router, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/ipv6/batch",
        json={
            "chain": "forward",
            "rule_number": 100,
            "is_custom_chain": False,
            "operations": [{"op": "not_a_real_op"}],
        },
    )

    assert response.status_code == 400
    assert "Unknown operation" in response.json()["detail"]


def test_ipv6_legacy_operation_aliases_still_apply(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService()
    monkeypatch.setattr(ipv6_router, "require_write_permission", allow_write)
    monkeypatch.setattr(ipv6_router, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/ipv6/batch",
        json={
            "chain": "forward",
            "rule_number": 100,
            "is_custom_chain": False,
            "operations": [
                {"op": "set_base_chain_rule"},
                {"op": "set_rule_action", "value": "accept"},
                {"op": "set_rule_set_ttl", "value": "64"},
                {"op": "set_rule_icmp_type_name", "value": "echo-request"},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True

    paths = [" ".join(op.get("path", [])) for op in service.last_operations if op.get("op") == "set"]
    assert any("hop-limit" in path for path in paths)
    assert any("icmpv6" in path for path in paths)
