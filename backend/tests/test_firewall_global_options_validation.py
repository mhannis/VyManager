from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import routers.firewall_global_options.firewall_global_options as global_options_router


class DummyResponse:
    def __init__(self, status: int = 200, result=None, error: str = ""):
        self.status = status
        self.result = result if result is not None else {}
        self.error = error


class DummyService:
    def __init__(self):
        self.last_batch_count = 0

    def get_version(self):
        return "1.5"

    def get_full_config(self, refresh: bool = False):
        _ = refresh
        return {"firewall": {"global-options": {}}}

    def execute_batch(self, batch):
        self.last_batch_count = batch.operation_count()
        return DummyResponse(status=200, result={"ok": True})


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(global_options_router.router)
    return app


def test_invalid_enable_disable_value_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService()
    monkeypatch.setattr(global_options_router, "require_write_permission", allow_write)
    monkeypatch.setattr(global_options_router, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/global-options/update",
        json={"all_ping": "enabled"},
    )

    assert response.status_code == 400
    assert "Invalid value for all_ping" in response.json()["detail"]


def test_invalid_state_policy_log_level_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService()
    monkeypatch.setattr(global_options_router, "require_write_permission", allow_write)
    monkeypatch.setattr(global_options_router, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/global-options/update",
        json={
            "state_policy_invalid": {
                "action": "drop",
                "log": True,
                "log_level": "verbose",
            }
        },
    )

    assert response.status_code == 400
    assert "Invalid value for state_policy_invalid.log_level" in response.json()["detail"]


def test_invalid_timeout_range_returns_400(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService()
    monkeypatch.setattr(global_options_router, "require_write_permission", allow_write)
    monkeypatch.setattr(global_options_router, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/global-options/update",
        json={"timeouts": {"icmp": 0}},
    )

    assert response.status_code == 400
    assert "Invalid timeout for timeouts.icmp" in response.json()["detail"]


def test_valid_payload_applies_successfully(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService()
    monkeypatch.setattr(global_options_router, "require_write_permission", allow_write)
    monkeypatch.setattr(global_options_router, "get_session_vyos_service", lambda _request: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/firewall/global-options/update",
        json={
            "all_ping": "enable",
            "source_validation": "strict",
            "timeouts": {"icmp": 30},
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert service.last_batch_count > 0
