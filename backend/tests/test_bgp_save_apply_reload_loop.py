import copy

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.bgp.bgp as bgp_router


class MutableBgpService:
    def __init__(self):
        self._config = {
            "protocols": {
                "bgp": {
                    "system-as": "64512",
                    "parameters": {
                        "router-id": "1.1.1.1",
                    },
                }
            }
        }
        self.last_batch_operations = []

    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return copy.deepcopy(self._config)

    def execute_batch(self, batch):
        self.last_batch_operations = batch.get_operations()
        for operation in self.last_batch_operations:
            tokens = operation.get("path") or []
            if len(tokens) >= 5 and operation.get("op") == "set":
                if tokens[:4] == ["protocols", "bgp", "parameters", "router-id"]:
                    self._config["protocols"]["bgp"].setdefault("parameters", {})["router-id"] = tokens[4]
            if operation.get("op") == "delete" and tokens[:4] == ["protocols", "bgp", "parameters", "router-id"]:
                self._config["protocols"]["bgp"].setdefault("parameters", {}).pop("router-id", None)

        class DummyResponse:
            status = 200
            error = None

        return DummyResponse()


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(bgp_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(bgp_router, "require_read_permission", allow_read)
    monkeypatch.setattr(bgp_router, "require_write_permission", allow_write)


@pytest.fixture()
def mutable_service(monkeypatch):
    service = MutableBgpService()

    def service_factory(_request):
        return service

    monkeypatch.setattr(bgp_router, "get_session_vyos_service", service_factory)
    return service


def test_bgp_save_apply_reload_loop(app, allow_permissions, mutable_service):
    client = TestClient(app)

    before = client.get("/vyos/bgp/config", params={"refresh": "true"})
    assert before.status_code == 200
    before_payload = before.json()
    assert before_payload.get("system_as") == "64512"
    assert before_payload.get("parameters", {}).get("router_id") == "1.1.1.1"

    set_operations = [{"op": "set_parameters_router_id", "value": "2.2.2.2"}]
    apply_set = client.post("/vyos/bgp/batch", json={"operations": set_operations})
    assert apply_set.status_code == 200
    apply_set_payload = apply_set.json()
    assert apply_set_payload.get("success") is True
    assert apply_set_payload.get("data", {}).get("message") == "BGP configuration updated"
    assert mutable_service.last_batch_operations == [
        {"op": "set", "path": ["protocols", "bgp", "parameters", "router-id", "2.2.2.2"]}
    ]

    mid = client.get("/vyos/bgp/config", params={"refresh": "true"})
    assert mid.status_code == 200
    assert mid.json().get("parameters", {}).get("router_id") == "2.2.2.2"

    delete_operations = [{"op": "delete_parameters_router_id"}]
    apply_delete = client.post("/vyos/bgp/batch", json={"operations": delete_operations})
    assert apply_delete.status_code == 200
    apply_delete_payload = apply_delete.json()
    assert apply_delete_payload.get("success") is True
    assert apply_delete_payload.get("data", {}).get("message") == "BGP configuration updated"
    assert mutable_service.last_batch_operations == [
        {"op": "delete", "path": ["protocols", "bgp", "parameters", "router-id"]}
    ]

    after = client.get("/vyos/bgp/config", params={"refresh": "true"})
    assert after.status_code == 200
    assert after.json().get("parameters", {}).get("router_id") is None
