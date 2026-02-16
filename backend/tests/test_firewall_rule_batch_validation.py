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


def _patch_permissions(monkeypatch):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(ipv4_router, "require_write_permission", allow_write)
    monkeypatch.setattr(ipv6_router, "require_write_permission", allow_write)


def test_ipv4_rejects_invalid_base_chain(monkeypatch, app):
    _patch_permissions(monkeypatch)
    monkeypatch.setattr(ipv4_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/ipv4/batch",
        json={
            "chain": "wan",
            "rule_number": 10,
            "is_custom_chain": False,
            "operations": [{"op": "set_base_chain_rule"}],
        },
    )

    assert response.status_code == 400
    assert "Invalid base chain" in response.json()["detail"]


def test_ipv4_rejects_missing_rule_number(monkeypatch, app):
    _patch_permissions(monkeypatch)
    monkeypatch.setattr(ipv4_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/ipv4/batch",
        json={
            "chain": "forward",
            "is_custom_chain": False,
            "operations": [{"op": "set_rule_action", "value": "accept"}],
        },
    )

    assert response.status_code == 400
    assert "requires rule_number" in response.json()["detail"]


def test_ipv4_rejects_missing_required_value(monkeypatch, app):
    _patch_permissions(monkeypatch)
    monkeypatch.setattr(ipv4_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/ipv4/batch",
        json={
            "chain": "forward",
            "rule_number": 10,
            "is_custom_chain": False,
            "operations": [{"op": "set_rule_action"}],
        },
    )

    assert response.status_code == 400
    assert "requires a value" in response.json()["detail"]


def test_ipv6_rejects_value_for_no_value_operation(monkeypatch, app):
    _patch_permissions(monkeypatch)
    monkeypatch.setattr(ipv6_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/ipv6/batch",
        json={
            "chain": "forward",
            "rule_number": 10,
            "is_custom_chain": False,
            "operations": [
                {"op": "set_base_chain_rule"},
                {"op": "set_rule_log", "value": "on"},
            ],
        },
    )

    assert response.status_code == 400
    assert "does not accept a value" in response.json()["detail"]


def test_ipv6_legacy_alias_requires_value(monkeypatch, app):
    _patch_permissions(monkeypatch)
    monkeypatch.setattr(ipv6_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/ipv6/batch",
        json={
            "chain": "forward",
            "rule_number": 10,
            "is_custom_chain": False,
            "operations": [{"op": "set_rule_set_ttl"}],
        },
    )

    assert response.status_code == 400
    assert "requires a value" in response.json()["detail"]


def test_ipv6_accepts_uppercase_base_chain_and_executes(monkeypatch, app):
    _patch_permissions(monkeypatch)
    service = DummyService()
    monkeypatch.setattr(ipv6_router, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/ipv6/batch",
        json={
            "chain": "FORWARD",
            "rule_number": 10,
            "is_custom_chain": False,
            "operations": [
                {"op": "set_base_chain_rule"},
                {"op": "set_rule_action", "value": "accept"},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    paths = [" ".join(item.get("path", [])) for item in service.last_operations]
    assert any("firewall ipv6 forward" in path for path in paths)
    assert any("action accept" in path for path in paths)
