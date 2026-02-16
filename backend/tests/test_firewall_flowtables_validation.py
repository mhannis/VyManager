from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import routers.firewall.flowtables as flowtables_router


class DummyResponse:
    def __init__(self, status: int = 200, result=None, error: str = ""):
        self.status = status
        self.result = result if result is not None else {}
        self.error = error


class DummyService:
    def __init__(self):
        self.last_ops = []

    def get_version(self):
        return "1.5"

    def execute_batch(self, batch):
        self.last_ops = batch.get_operations()
        return DummyResponse(status=200, result={"ok": True})


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(flowtables_router.router)
    return app


def test_invalid_flowtable_name_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(flowtables_router, "require_write_permission", allow_write)
    monkeypatch.setattr(flowtables_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/flowtables/batch",
        json={
            "flowtable_name": "bad name",
            "operations": [{"op": "set_flowtable"}],
        },
    )
    assert response.status_code == 400
    assert "Invalid flowtable name" in response.json()["detail"]


def test_invalid_offload_value_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(flowtables_router, "require_write_permission", allow_write)
    monkeypatch.setattr(flowtables_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/flowtables/batch",
        json={
            "flowtable_name": "FT_LAN",
            "operations": [
                {"op": "set_flowtable"},
                {"op": "set_flowtable_offload", "value": "asic"},
            ],
        },
    )
    assert response.status_code == 400
    assert "Invalid offload type" in response.json()["detail"]


def test_invalid_interface_name_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(flowtables_router, "require_write_permission", allow_write)
    monkeypatch.setattr(flowtables_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/flowtables/batch",
        json={
            "flowtable_name": "FT_LAN",
            "operations": [
                {"op": "set_flowtable"},
                {"op": "set_flowtable_interface", "value": "eth 0"},
            ],
        },
    )
    assert response.status_code == 400
    assert "Invalid interface name" in response.json()["detail"]


def test_missing_required_operation_value_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(flowtables_router, "require_write_permission", allow_write)
    monkeypatch.setattr(flowtables_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/flowtables/batch",
        json={
            "flowtable_name": "FT_LAN",
            "operations": [
                {"op": "set_flowtable"},
                {"op": "set_flowtable_interface"},
            ],
        },
    )
    assert response.status_code == 400
    assert "requires a value" in response.json()["detail"]


def test_valid_batch_succeeds_and_normalizes_values(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService()
    monkeypatch.setattr(flowtables_router, "require_write_permission", allow_write)
    monkeypatch.setattr(flowtables_router, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/flowtables/batch",
        json={
            "flowtable_name": "  FT_LAN  ",
            "operations": [
                {"op": "set_flowtable"},
                {"op": "set_flowtable_interface", "value": "eth0"},
                {"op": "set_flowtable_offload", "value": "SOFTWARE"},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    paths = [" ".join(item.get("path", [])) for item in service.last_ops]
    assert any("firewall flowtable FT_LAN" in path for path in paths)
    assert any("offload software" in path for path in paths)


def test_delete_invalid_flowtable_name_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(flowtables_router, "require_write_permission", allow_write)
    monkeypatch.setattr(flowtables_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.delete("/vyos/firewall/flowtables/bad name")
    assert response.status_code == 400
    assert "Invalid flowtable name" in response.json()["detail"]


def test_rejects_duplicate_interface_entries_in_batch(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(flowtables_router, "require_write_permission", allow_write)
    monkeypatch.setattr(flowtables_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/flowtables/batch",
        json={
            "flowtable_name": "FT_DUP",
            "operations": [
                {"op": "set_flowtable"},
                {"op": "set_flowtable_interface", "value": "eth0"},
                {"op": "set_flowtable_interface", "value": "eth0"},
            ],
        },
    )
    assert response.status_code == 400
    assert "Duplicate interface in batch" in response.json()["detail"]


def test_rejects_conflicting_offload_values_in_batch(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(flowtables_router, "require_write_permission", allow_write)
    monkeypatch.setattr(flowtables_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/flowtables/batch",
        json={
            "flowtable_name": "FT_DUP",
            "operations": [
                {"op": "set_flowtable"},
                {"op": "set_flowtable_offload", "value": "hardware"},
                {"op": "set_flowtable_offload", "value": "software"},
            ],
        },
    )
    assert response.status_code == 400
    assert "Conflicting offload values" in response.json()["detail"]
