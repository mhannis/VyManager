import copy
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers._config_tree_wrapper as config_tree_wrapper_module
import routers.high_availability.high_availability as high_availability_router
import routers.isis.isis as isis_router
import routers.load_balancing.load_balancing as load_balancing_router
import routers.mpls.mpls as mpls_router
import routers.ospf.ospf as ospf_router
import routers.rip.rip as rip_router
import routers.segment_routing.segment_routing as segment_routing_router
import routers.system_conntrack as system_conntrack_router
import routers.system_frr as system_frr_router
import routers.system_ip as system_ip_router
import routers.traffic_policy.traffic_policy as traffic_policy_router
import routers.vrf.vrf as vrf_router


FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "config_apply_loops.json"

ROUTER_MODULES = (
    ospf_router,
    rip_router,
    isis_router,
    mpls_router,
    segment_routing_router,
)


class MutableDummyService:
    def __init__(self):
        self.revision = 0
        self._config = {
            "protocols": {
                "ospf": {"parameters": {}},
                "rip": {},
                "isis": {},
                "mpls": {},
            },
            "vrf": {},
            "load-balancing": {"wan": {}},
            "high-availability": {"vrrp": {"group": {"WAN": {}}}},
            "traffic-policy": {"shaper": {"WAN-OUT": {}}},
            "system": {
                "ip": {},
                "conntrack": {},
                "frr": {},
            },
        }

    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return copy.deepcopy(self._config)

    def _mark_revision(self, command: str) -> None:
        tokens = command.strip().split()
        if len(tokens) < 3:
            return

        if tokens[:3] == ["set", "protocols", "ospf"] or tokens[:3] == ["delete", "protocols", "ospf"]:
            self._config["protocols"].setdefault("ospf", {})["__rev"] = str(self.revision)
            if "segment-routing" in tokens or tokens[:4] == ["set", "protocols", "ospf", "parameters"]:
                self._config["protocols"].setdefault("ospf", {}).setdefault("segment-routing", {})[
                    "__rev"
                ] = str(self.revision)
        if tokens[:3] == ["set", "protocols", "rip"] or tokens[:3] == ["delete", "protocols", "rip"]:
            self._config["protocols"].setdefault("rip", {})["__rev"] = str(self.revision)
        if tokens[:3] == ["set", "protocols", "isis"] or tokens[:3] == ["delete", "protocols", "isis"]:
            self._config["protocols"].setdefault("isis", {})["__rev"] = str(self.revision)
            if "segment-routing" in tokens:
                self._config["protocols"].setdefault("isis", {}).setdefault("segment-routing", {})[
                    "__rev"
                ] = str(self.revision)
        if tokens[:3] == ["set", "protocols", "mpls"] or tokens[:3] == ["delete", "protocols", "mpls"]:
            self._config["protocols"].setdefault("mpls", {})["__rev"] = str(self.revision)
        if tokens[:3] == ["set", "vrf", "name"] or tokens[:2] == ["set", "vrf"] or tokens[:2] == ["delete", "vrf"]:
            self._config.setdefault("vrf", {})["__rev"] = str(self.revision)
        if tokens[:2] == ["set", "load-balancing"] or tokens[:2] == ["delete", "load-balancing"]:
            self._config.setdefault("load-balancing", {})["__rev"] = str(self.revision)
        if tokens[:2] == ["set", "high-availability"] or tokens[:2] == ["delete", "high-availability"]:
            self._config.setdefault("high-availability", {})["__rev"] = str(self.revision)
        if tokens[:2] == ["set", "traffic-policy"] or tokens[:2] == ["delete", "traffic-policy"]:
            self._config.setdefault("traffic-policy", {})["__rev"] = str(self.revision)
        if tokens[:3] == ["set", "system", "ip"] or tokens[:3] == ["delete", "system", "ip"]:
            self._config.setdefault("system", {}).setdefault("ip", {})["__rev"] = str(self.revision)
        if tokens[:3] == ["set", "system", "conntrack"] or tokens[:3] == ["delete", "system", "conntrack"]:
            self._config.setdefault("system", {}).setdefault("conntrack", {})["__rev"] = str(self.revision)
        if tokens[:3] == ["set", "system", "frr"] or tokens[:3] == ["delete", "system", "frr"]:
            self._config.setdefault("system", {}).setdefault("frr", {})["__rev"] = str(self.revision)

    def configure_batch(self, commands):
        self.revision += 1
        for command in commands:
            self._mark_revision(command)
        return {
            "success": True,
            "data": {"commands": commands, "revision": self.revision},
            "error": None,
        }


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(ospf_router.router)
    app.include_router(rip_router.router)
    app.include_router(isis_router.router)
    app.include_router(mpls_router.router)
    app.include_router(segment_routing_router.router)
    app.include_router(vrf_router.router)
    app.include_router(load_balancing_router.router)
    app.include_router(high_availability_router.router)
    app.include_router(traffic_policy_router.router)
    app.include_router(system_ip_router.system_ip)
    app.include_router(system_conntrack_router.system_conntrack)
    app.include_router(system_frr_router.system_frr)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(config_tree_wrapper_module, "require_read_permission", allow_read)
    monkeypatch.setattr(config_tree_wrapper_module, "require_write_permission", allow_write)

    for module in ROUTER_MODULES:
        monkeypatch.setattr(module, "require_read_permission", allow_read)
        monkeypatch.setattr(module, "require_write_permission", allow_write)


@pytest.fixture()
def mutable_service(monkeypatch):
    service = MutableDummyService()

    def service_factory(_request):
        return service

    monkeypatch.setattr(config_tree_wrapper_module, "get_session_vyos_service", service_factory)
    for module in ROUTER_MODULES:
        monkeypatch.setattr(module, "get_session_vyos_service", service_factory)
    return service


def _extract_revision(payload: dict, response_key: str) -> int:
    root = payload.get(response_key) or {}
    if response_key == "segment_routing":
        ospf = root.get("ospf", {}).get("segment-routing", {})
        isis = root.get("isis", {}).get("segment-routing", {})
        rev = ospf.get("__rev") or isis.get("__rev")
        return int(rev) if rev is not None else 0
    rev = root.get("__rev")
    return int(rev) if rev is not None else 0


def load_loop_fixtures():
    data = json.loads(FIXTURE_PATH.read_text())
    return data["fixtures"]


@pytest.mark.parametrize("fixture_item", load_loop_fixtures(), ids=lambda item: item["id"])
def test_fixture_save_apply_reload_loop(app, allow_permissions, mutable_service, fixture_item):
    client = TestClient(app)

    config_endpoint = fixture_item["config_endpoint"]
    batch_endpoint = fixture_item["batch_endpoint"]
    response_key = fixture_item["response_key"]
    set_operations = fixture_item["set_operations"]
    delete_operations = fixture_item["delete_operations"]

    before = client.get(config_endpoint, params={"refresh": "true"})
    assert before.status_code == 200
    before_rev = _extract_revision(before.json(), response_key)

    apply_set = client.post(batch_endpoint, json={"operations": set_operations})
    assert apply_set.status_code == 200
    assert apply_set.json().get("success") is True

    mid = client.get(config_endpoint, params={"refresh": "true"})
    assert mid.status_code == 200
    mid_rev = _extract_revision(mid.json(), response_key)
    assert mid_rev >= before_rev + 1

    apply_delete = client.post(batch_endpoint, json={"operations": delete_operations})
    assert apply_delete.status_code == 200
    assert apply_delete.json().get("success") is True

    after = client.get(config_endpoint, params={"refresh": "true"})
    assert after.status_code == 200
    after_rev = _extract_revision(after.json(), response_key)
    assert after_rev >= mid_rev + 1
