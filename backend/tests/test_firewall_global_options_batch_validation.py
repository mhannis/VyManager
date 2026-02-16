from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import routers.firewall_global_options.firewall_global_options as router_module


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
    app.include_router(router_module.router)
    return app


def test_batch_rejects_missing_value_for_set_operation(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(router_module, "require_write_permission", allow_write)
    monkeypatch.setattr(router_module, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/global-options/batch",
        json={"operations": [{"op": "set_all_ping"}]},
    )

    assert response.status_code == 400
    assert "requires a value" in response.json()["detail"]


def test_batch_rejects_value_for_delete_operation(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(router_module, "require_write_permission", allow_write)
    monkeypatch.setattr(router_module, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/global-options/batch",
        json={"operations": [{"op": "delete_all_ping", "value": "enable"}]},
    )

    assert response.status_code == 400
    assert "does not accept a value" in response.json()["detail"]


def test_batch_rejects_invalid_enable_disable_value(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(router_module, "require_write_permission", allow_write)
    monkeypatch.setattr(router_module, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/global-options/batch",
        json={"operations": [{"op": "set_all_ping", "value": "enabled"}]},
    )

    assert response.status_code == 400
    assert "Invalid value for set_all_ping" in response.json()["detail"]


def test_batch_rejects_invalid_timeout_value(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(router_module, "require_write_permission", allow_write)
    monkeypatch.setattr(router_module, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/global-options/batch",
        json={"operations": [{"op": "set_timeout_icmp", "value": "abc"}]},
    )

    assert response.status_code == 400
    assert "requires an integer timeout value" in response.json()["detail"]


def test_batch_rejects_timeout_out_of_range(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(router_module, "require_write_permission", allow_write)
    monkeypatch.setattr(router_module, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/global-options/batch",
        json={"operations": [{"op": "set_timeout_icmp", "value": "0"}]},
    )

    assert response.status_code == 400
    assert "must be between 1" in response.json()["detail"]


def test_batch_normalizes_valid_values_and_succeeds(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService()
    monkeypatch.setattr(router_module, "require_write_permission", allow_write)
    monkeypatch.setattr(router_module, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/global-options/batch",
        json={
            "operations": [
                {"op": "set_all_ping", "value": "ENABLE"},
                {"op": "set_timeout_icmp", "value": "300"},
            ]
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True

    paths = [" ".join(op.get("path", [])) for op in service.last_operations if op.get("op") == "set"]
    assert any("all-ping enable" in path for path in paths)
    assert any("timeout icmp 300" in path for path in paths)
