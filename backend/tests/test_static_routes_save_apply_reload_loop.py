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
        arp_root = self._config.setdefault("protocols", {}).setdefault("static", {}).setdefault("arp", {}).setdefault("interface", {})
        mroute_root = self._config.setdefault("protocols", {}).setdefault("static", {}).setdefault("mroute", {})

        for operation in self.last_batch_operations:
            tokens = operation.get("path") or []
            if len(tokens) >= 6 and tokens[:3] == ["protocols", "static", "route"] and tokens[4] == "next-hop":
                destination = tokens[3]
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

            if len(tokens) >= 7 and tokens[:4] == ["protocols", "static", "arp", "interface"] and tokens[5] == "address":
                interface = tokens[4]
                ip_address = tokens[6]
                interface_tree = arp_root.setdefault(interface, {}).setdefault("address", {})

                if operation.get("op") == "set" and len(tokens) >= 9 and tokens[7] == "mac":
                    mac_address = tokens[8]
                    interface_tree[ip_address] = {"mac": mac_address}
                elif operation.get("op") == "delete":
                    interface_tree.pop(ip_address, None)
                    if not interface_tree:
                        arp_root.pop(interface, None)

            if len(tokens) >= 6 and tokens[:3] == ["protocols", "static", "mroute"] and tokens[4] == "next-hop":
                prefix = tokens[3]
                next_hop = tokens[5]
                prefix_tree = mroute_root.setdefault(prefix, {})
                next_hop_tree = prefix_tree.setdefault("next-hop", {})

                if operation.get("op") == "set":
                    next_hop_tree[next_hop] = {}
                elif operation.get("op") == "delete":
                    next_hop_tree.pop(next_hop, None)
                    if not next_hop_tree:
                        prefix_tree.pop("next-hop", None)
                    if not prefix_tree:
                        mroute_root.pop(prefix, None)

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


def _find_arp_entry(payload: dict, interface: str, ip_address: str):
    for iface in payload.get("arp_interfaces", []):
        if iface.get("interface") != interface:
            continue
        for entry in iface.get("entries", []):
            if entry.get("ip_address") == ip_address:
                return entry
    return None


def _find_mroute(payload: dict, prefix: str):
    for route in payload.get("multicast_routes", []):
        if route.get("prefix") == prefix:
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


def test_static_routes_arp_save_apply_reload_loop(app, allow_permissions, mutable_service):
    client = TestClient(app)

    interface = "eth1"
    ip_address = "192.0.2.10"
    mac_address = "00:11:22:33:44:55"

    before = client.get("/vyos/static-routes/config", params={"refresh": "true"})
    assert before.status_code == 200
    assert _find_arp_entry(before.json(), interface, ip_address) is None

    set_payload = {
        "interface": interface,
        "ip_address": ip_address,
        "operations": [
            {"op": "set_arp_entry", "value": mac_address}
        ],
    }
    apply_set = client.post("/vyos/static-routes/arp/batch", json=set_payload)
    assert apply_set.status_code == 200
    assert apply_set.json().get("success") is True
    assert mutable_service.last_batch_operations == [
        {
            "op": "set",
            "path": ["protocols", "static", "arp", "interface", interface, "address", ip_address, "mac", mac_address],
        }
    ]

    mid = client.get("/vyos/static-routes/config", params={"refresh": "true"})
    assert mid.status_code == 200
    arp_entry = _find_arp_entry(mid.json(), interface, ip_address)
    assert arp_entry is not None
    assert arp_entry.get("mac_address") == mac_address

    delete_payload = {
        "interface": interface,
        "ip_address": ip_address,
        "operations": [
            {"op": "delete_arp_entry"}
        ],
    }
    apply_delete = client.post("/vyos/static-routes/arp/batch", json=delete_payload)
    assert apply_delete.status_code == 200
    assert apply_delete.json().get("success") is True
    assert mutable_service.last_batch_operations == [
        {
            "op": "delete",
            "path": ["protocols", "static", "arp", "interface", interface, "address", ip_address],
        }
    ]

    after = client.get("/vyos/static-routes/config", params={"refresh": "true"})
    assert after.status_code == 200
    assert _find_arp_entry(after.json(), interface, ip_address) is None


def test_static_routes_mroute_save_apply_reload_loop(app, allow_permissions, mutable_service):
    client = TestClient(app)

    prefix = "239.1.1.0/24"
    next_hop = "192.0.2.20"

    before = client.get("/vyos/static-routes/config", params={"refresh": "true"})
    assert before.status_code == 200
    assert _find_mroute(before.json(), prefix) is None

    set_payload = {
        "prefix": prefix,
        "operations": [
            {"op": "set_mroute_next_hop", "value": next_hop}
        ],
    }
    apply_set = client.post("/vyos/static-routes/mroute/batch", json=set_payload)
    assert apply_set.status_code == 200
    assert apply_set.json().get("success") is True
    assert mutable_service.last_batch_operations == [
        {"op": "set", "path": ["protocols", "static", "mroute", prefix, "next-hop", next_hop]}
    ]

    mid = client.get("/vyos/static-routes/config", params={"refresh": "true"})
    assert mid.status_code == 200
    mroute = _find_mroute(mid.json(), prefix)
    assert mroute is not None
    assert any(hop.get("address") == next_hop for hop in mroute.get("next_hops", []))

    delete_payload = {
        "prefix": prefix,
        "operations": [
            {"op": "delete_mroute_next_hop", "value": next_hop}
        ],
    }
    apply_delete = client.post("/vyos/static-routes/mroute/batch", json=delete_payload)
    assert apply_delete.status_code == 200
    assert apply_delete.json().get("success") is True
    assert mutable_service.last_batch_operations == [
        {"op": "delete", "path": ["protocols", "static", "mroute", prefix, "next-hop", next_hop]}
    ]

    after = client.get("/vyos/static-routes/config", params={"refresh": "true"})
    assert after.status_code == 200
    assert _find_mroute(after.json(), prefix) is None
