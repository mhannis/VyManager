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
        self.device = self.DummyDevice(self)

    def get_full_config(self, refresh: bool = False):
        return self._full_config

    def apply_operations(self, operations, **_kwargs):
        return self.device.configure_multiple_op(op_path=operations)

    class DummyDevice:
        def __init__(self, _parent: "DummyService"):
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


def test_get_local_users_parses_principal_and_otp(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "system": {
                "login": {
                    "user": {
                        "alice": {
                            "full-name": "Alice Operator",
                            "level": "admin",
                            "authentication": {
                                "principal": "alice@lab.local",
                                "otp": {
                                    "key": "supersecret",
                                    "rate-limit": "20",
                                    "window-size": "8",
                                },
                                "public-keys": {
                                    "key-1": {"key": "ssh-ed25519 AAAAB3NzaC1yc2EAAAADAQABAAABAQCalice"}
                                },
                            },
                        }
                    }
                }
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.get("/vyos/system/local-users")
    assert response.status_code == 200
    data = response.json()

    assert data["total"] == 1
    user = data["users"][0]
    assert user["username"] == "alice"
    assert user["principal"] == "alice@lab.local"
    assert user["otp_key_configured"] is True
    assert user["otp_rate_limit"] == 20
    assert user["otp_window_size"] == 8
    assert user["auth"]["has_principal"] is True
    assert user["auth"]["has_otp"] is True


def test_create_local_user_rejects_otp_tuning_without_key(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"system": {"login": {"user": {}}}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/system/local-users",
        json={
            "username": "alice",
            "level": "admin",
            "password": "Password123!",
            "password_type": "plaintext",
            "ssh_public_keys": [],
            "otp_rate_limit": 15,
        },
    )

    assert response.status_code == 400
    assert "otp_key is required" in response.json().get("detail", "")


def test_update_local_user_emits_principal_and_otp_set_operations(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "system": {
                "login": {
                    "user": {
                        "alice": {
                            "level": "admin",
                            "authentication": {"plaintext-password": "existing-password"},
                        }
                    }
                }
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.put(
        "/vyos/system/local-users/alice",
        json={
            "principal": "alice@lab.local",
            "otp_key": "new-secret",
            "otp_rate_limit": 30,
            "otp_window_size": 6,
        },
    )
    assert response.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    op_paths = [tuple(op.get("path") or []) for op in service.device.configure_calls[-1]]
    assert ("system", "login", "user", "alice", "authentication", "principal", "alice@lab.local") in op_paths
    assert ("system", "login", "user", "alice", "authentication", "otp", "key", "new-secret") in op_paths
    assert ("system", "login", "user", "alice", "authentication", "otp", "rate-limit", "30") in op_paths
    assert ("system", "login", "user", "alice", "authentication", "otp", "window-size", "6") in op_paths


def test_update_local_user_emits_principal_and_otp_delete_operations(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "system": {
                "login": {
                    "user": {
                        "alice": {
                            "authentication": {
                                "principal": "alice@old.local",
                                "otp": {
                                    "key": "old-secret",
                                    "rate-limit": "20",
                                    "window-size": "7",
                                },
                            }
                        }
                    }
                }
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.put(
        "/vyos/system/local-users/alice",
        json={
            "principal": "",
            "otp_key": "",
            "otp_rate_limit": None,
            "otp_window_size": None,
        },
    )
    assert response.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    op_paths = [tuple(op.get("path") or []) for op in service.device.configure_calls[-1]]
    assert ("system", "login", "user", "alice", "authentication", "principal") in op_paths
    assert ("system", "login", "user", "alice", "authentication", "otp", "key") in op_paths
    assert ("system", "login", "user", "alice", "authentication", "otp", "rate-limit") in op_paths
    assert ("system", "login", "user", "alice", "authentication", "otp", "window-size") in op_paths
