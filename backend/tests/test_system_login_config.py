from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.system as system_router


class DummyVyOSResponse:
    def __init__(self, status: int = 200, error: str = "", result: object | None = None):
        self.status = status
        self.error = error
        self.result = result if result is not None else {"data": ""}


class DummyService:
    def __init__(self, full_config: dict):
        self._full_config = full_config
        self.device = self.DummyDevice()

    def get_full_config(self, refresh: bool = False):
        return self._full_config

    def apply_operations(self, operations, **_kwargs):
        return self.device.configure_multiple_op(op_path=operations)

    class DummyDevice:
        def __init__(self):
            self.configure_calls: list[list[dict]] = []

        def configure_multiple_op(self, op_path=None):
            self.configure_calls.append(op_path or [])
            return DummyVyOSResponse(status=200)

        def show(self, path=None):
            return DummyVyOSResponse(status=200, result={"data": ""})


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(system_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(system_router, "require_read_permission", allow_read)
    monkeypatch.setattr(system_router, "require_write_permission", allow_write)


def test_get_login_config_parses_radius_and_tacacs(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "system": {
                "login": {
                    "banner": {
                        "pre-login": "Authorized users only.",
                        "post-login": "Welcome to VyOS",
                    },
                    "max-sessions-per-user": "5",
                    "timeout": "15",
                    "radius": {
                        "source-address": "192.0.2.10",
                        "server": {
                            "198.51.100.10": {
                                "key": "radius-key",
                                "port": "1812",
                                "timeout": "12",
                            }
                        },
                    },
                    "tacacs": {
                        "server": {
                            "198.51.100.20": {
                                "key": "tacacs-key",
                                "port": "49",
                                "timeout": "7",
                            }
                        },
                    },
                }
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.get("/vyos/system/login-config")
    assert response.status_code == 200
    data = response.json()

    assert data["configured"] is True
    assert data["banner_pre_login"] == "Authorized users only."
    assert data["banner_post_login"] == "Welcome to VyOS"
    assert data["max_sessions_per_user"] == 5
    assert data["timeout"] == 15
    assert data["radius_source_address"] == "192.0.2.10"
    assert data["radius_servers"][0]["address"] == "198.51.100.10"
    assert data["radius_servers"][0]["key"] == "radius-key"
    assert data["radius_servers"][0]["port"] == 1812
    assert data["radius_servers"][0]["timeout"] == 12
    assert data["tacacs_servers"][0]["address"] == "198.51.100.20"
    assert data["tacacs_servers"][0]["key"] == "tacacs-key"


def test_update_login_config_emits_expected_operations(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "system": {
                "login": {
                    "banner": {"pre-login": "Old", "post-login": "Old post"},
                    "max-sessions-per-user": "2",
                    "timeout": "10",
                    "radius": {
                        "source-address": "192.0.2.10",
                        "server": {
                            "198.51.100.10": {"key": "old-key", "port": "1812", "timeout": "5"}
                        },
                    },
                    "tacacs": {"server": {}},
                }
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.put(
        "/vyos/system/login-config",
        json={
            "banner_pre_login": "New pre-login banner",
            "banner_post_login": "",
            "max_sessions_per_user": 4,
            "timeout": 30,
            "radius_source_address": "192.0.2.11",
            "radius_servers": [
                {"address": "198.51.100.10", "key": "new-key", "port": 1812, "timeout": 8},
                {"address": "198.51.100.11", "key": "new-key-2", "port": 1812, "timeout": 8},
            ],
            "tacacs_servers": [
                {"address": "198.51.100.20", "key": "tacacs-key", "port": 49, "timeout": 6},
            ],
        },
    )
    assert response.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    op_paths = [tuple(op.get("path") or []) for op in service.device.configure_calls[-1]]

    assert ("system", "login", "banner", "pre-login", "New pre-login banner") in op_paths
    assert ("system", "login", "banner", "post-login") in op_paths
    assert ("system", "login", "max-sessions-per-user", "4") in op_paths
    assert ("system", "login", "timeout", "30") in op_paths
    assert ("system", "login", "radius", "source-address", "192.0.2.11") in op_paths
    assert ("system", "login", "radius", "server", "198.51.100.10") in op_paths
    assert ("system", "login", "radius", "server", "198.51.100.10", "key", "new-key") in op_paths
    assert ("system", "login", "radius", "server", "198.51.100.11") in op_paths
    assert ("system", "login", "tacacs", "server", "198.51.100.20") in op_paths
    assert ("system", "login", "tacacs", "server", "198.51.100.20", "key", "tacacs-key") in op_paths


def test_update_login_config_rejects_server_without_key(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"system": {"login": {}}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.put(
        "/vyos/system/login-config",
        json={
            "radius_servers": [
                {"address": "198.51.100.10", "key": "", "port": 1812, "timeout": 8},
            ],
            "tacacs_servers": [],
        },
    )

    assert response.status_code == 400
    assert "requires key" in response.json().get("detail", "")
