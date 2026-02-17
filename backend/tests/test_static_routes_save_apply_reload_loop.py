import copy

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.static_routes.static_routes as static_routes_router


class MutableStaticRoutesService:
    def __init__(self):
        self._config = {
            "protocols": {
                "static": {}
            }
        }
        self.last_batch_operations = []

    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return copy.deepcopy(self._config)

    def execute_batch(self, batch):
        self.last_batch_operations = batch.get_operations()
        route_root = self._config.setdefault("protocols", {}).setdefault("static", {}).setdefault("route", {})

        for operation in self.last_batch_operations:
            tokens = operation.get("path") or []
            if len(tokens) < 6:
                continue
            if tokens[:3] != ["protocols", "static", "route"]:
                continue

            destination = tokens[3]
            if tokens[4] != "next-hop":
                continue
            next_hop = tokens[5]

            destination_tree = route_root.setdefault(destination, {})
            next_hop_tree = destination_tree.setdefault("next-hop", {})

            if operation.get("op") == "set":
                next_hop_tree[next_hop] = {}
            elif operation.get("op") == "delete":
                next_hop_tree.pop(next_hop, None)
                if not next_hop_tree:
                    destination_tree.pop("next-hop", None)
                if not destination_tree:
                    route_root.pop(destination, None)

        class DummyResponse:
            status = 200
            error = None

        return DummyResponse()


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(static_routes_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(static_routes_router, "require_read_permission", allow_read)
    monkeypatch.setattr(static_routes_router, "require_write_permission", allow_write)


@pytest.fixture()
def mutable_service(monkeypatch):
    service = MutableStaticRoutesService()

    def service_factory(_request):
        return service

    monkeypatch.setattr(static_routes_router, "get_session_vyos_service", service_factory)
    return service


def _find_route(payload: dict, destination: str):
    for route in payload.get("ipv4_routes", []):
        if route.get("destination") == destination:
            return route
    return None


def test_static_routes_save_apply_reload_loop(app, allow_permissions, mutable_service):
    client = TestClient(app)

    destination = "198.51.100.0/24"
    next_hop = "192.0.2.1"

    before = client.get("/vyos/static-routes/config", params={"refresh": "true"})
    assert before.status_code == 200
    assert _find_route(before.json(), destination) is None

    set_payload = {
        "destination": destination,
        "route_type": "ipv4",
        "operations": [
            {"op": "set_ipv4_route_next_hop", "value": next_hop}
        ],
    }
    apply_set = client.post("/vyos/static-routes/batch", json=set_payload)
    assert apply_set.status_code == 200
    assert apply_set.json().get("success") is True
    assert mutable_service.last_batch_operations == [
        {"op": "set", "path": ["protocols", "static", "route", destination, "next-hop", next_hop]}
    ]

    mid = client.get("/vyos/static-routes/config", params={"refresh": "true"})
    assert mid.status_code == 200
    mid_route = _find_route(mid.json(), destination)
    assert mid_route is not None
    assert any(hop.get("address") == next_hop for hop in mid_route.get("next_hops", []))

    delete_payload = {
        "destination": destination,
        "route_type": "ipv4",
        "operations": [
            {"op": "delete_ipv4_route_next_hop", "value": next_hop}
        ],
    }
    apply_delete = client.post("/vyos/static-routes/batch", json=delete_payload)
    assert apply_delete.status_code == 200
    assert apply_delete.json().get("success") is True
    assert mutable_service.last_batch_operations == [
        {"op": "delete", "path": ["protocols", "static", "route", destination, "next-hop", next_hop]}
    ]

    after = client.get("/vyos/static-routes/config", params={"refresh": "true"})
    assert after.status_code == 200
    assert _find_route(after.json(), destination) is None
