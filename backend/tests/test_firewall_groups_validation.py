from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import routers.firewall.groups as groups_router


class DummyResponse:
    def __init__(self, status: int = 200, result=None, error: str = ""):
        self.status = status
        self.result = result if result is not None else {}
        self.error = error


class DummyBatch:
    def __init__(self):
        self.calls: list[tuple[str, tuple]] = []

    def __getattr__(self, name: str):
        def _method(*args):
            self.calls.append((name, args))
            return self

        return _method


class DummyService:
    def __init__(self):
        self.batch = DummyBatch()

    def create_firewall_groups_batch(self):
        return self.batch

    def execute_batch(self, _batch):
        return DummyResponse(status=200, result={"ok": True})


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(groups_router.router)
    return app


def _allow_write(*_args, **_kwargs):
    return None


def test_invalid_group_name_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(groups_router, "require_write_permission", allow_write)
    monkeypatch.setattr(groups_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/groups/batch",
        json={
            "group_name": "bad name with spaces",
            "operations": [{"op": "set_address_group"}],
        },
    )
    assert response.status_code == 400
    assert "Invalid group_name" in response.json()["detail"]


def test_invalid_remote_group_url_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(groups_router, "require_write_permission", allow_write)
    monkeypatch.setattr(groups_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/groups/batch",
        json={
            "group_name": "REMOTE_FEED",
            "operations": [
                {"op": "set_remote_group"},
                {"op": "set_remote_group_url", "value": "ftp://example.com/list.txt"},
            ],
        },
    )
    assert response.status_code == 400
    assert "Invalid remote-group URL" in response.json()["detail"]


def test_invalid_mac_value_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(groups_router, "require_write_permission", allow_write)
    monkeypatch.setattr(groups_router, "get_session_vyos_service", lambda _request: DummyService())

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/groups/batch",
        json={
            "group_name": "MAC_GROUP",
            "operations": [
                {"op": "set_mac_group"},
                {"op": "set_mac_group_mac", "value": "zz:11:22:33:44:55"},
            ],
        },
    )
    assert response.status_code == 400
    assert "Invalid MAC address" in response.json()["detail"]


def test_valid_remote_group_batch_returns_success(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService()
    monkeypatch.setattr(groups_router, "require_write_permission", allow_write)
    monkeypatch.setattr(groups_router, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/groups/batch",
        json={
            "group_name": "REMOTE_FEED",
            "operations": [
                {"op": "set_remote_group"},
                {"op": "set_remote_group_url", "value": "https://example.com/list.txt"},
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert ("set_remote_group", ("REMOTE_FEED",)) in service.batch.calls
    assert ("set_remote_group_url", ("REMOTE_FEED", "https://example.com/list.txt")) in service.batch.calls
