from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.nat.nat as nat_router


class DummyNatService:
    def __init__(self):
        self.last_commands = []
        self._config = {
            "nat": {
                "cgnat": {
                    "log-allocation": {},
                    "pool": {
                        "internal": {
                            "INT-POOL": {
                                "range": {"100.64.0.0/24": {}},
                            }
                        },
                        "external": {
                            "EXT-POOL": {
                                "range": {"203.0.113.10/32": {"seq": "10"}},
                            }
                        },
                    },
                    "rule": {
                        "10": {
                            "source": {"pool": "INT-POOL"},
                            "translation": {"pool": "EXT-POOL"},
                        }
                    },
                }
            }
        }

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return self._config

    def configure_batch(self, commands):
        self.last_commands = list(commands)
        return {
            "success": True,
            "data": {"commands": list(commands)},
            "error": None,
        }


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(nat_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(nat_router, "require_read_permission", allow_read, raising=False)
    monkeypatch.setattr(nat_router, "require_write_permission", allow_write, raising=False)


@pytest.fixture()
def dummy_service(monkeypatch):
    service = DummyNatService()

    def service_factory(_request):
        return service

    monkeypatch.setattr(nat_router, "get_session_vyos_service", service_factory, raising=False)
    return service


def test_get_nat_tree_config_returns_raw_nat_tree(app, allow_permissions, dummy_service):
    client = TestClient(app)

    response = client.get("/vyos/nat/tree-config", params={"refresh": "true"})
    assert response.status_code == 200
    payload = response.json()
    assert "nat" in payload
    assert payload["nat"]["cgnat"]["rule"]["10"]["translation"]["pool"] == "EXT-POOL"


def test_apply_nat_tree_batch_executes_commands(app, allow_permissions, dummy_service):
    client = TestClient(app)
    commands = [
        "set nat cgnat log-allocation",
        "set nat cgnat rule 10 source pool INT-POOL",
    ]

    response = client.post("/vyos/nat/tree-batch", json={"operations": commands})
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["commands"] == commands
    assert dummy_service.last_commands == commands


def test_apply_nat_tree_batch_requires_non_empty_operations(app, allow_permissions, dummy_service):
    client = TestClient(app)
    response = client.post("/vyos/nat/tree-batch", json={"operations": []})
    assert response.status_code == 400
    assert response.json()["detail"] == "No operations provided"
