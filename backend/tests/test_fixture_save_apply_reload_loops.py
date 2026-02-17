import copy
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers._config_tree_wrapper as config_tree_wrapper_module
import routers._service_wrapper as service_wrapper_module
import routers._vpn_wrapper as vpn_wrapper_module
import routers.config_sync_service.config_sync_service as config_sync_service_router
import routers.dmvpn.dmvpn as dmvpn_router
import routers.dns.dns as dns_service_router
import routers.high_availability.high_availability as high_availability_router
import routers.isis.isis as isis_router
import routers.lldp.lldp as lldp_service_router
import routers.load_balancing.load_balancing as load_balancing_router
import routers.mpls.mpls as mpls_router
import routers.nat.nat as nat_router
import routers.ntp.ntp as ntp_service_router
import routers.ospf.ospf as ospf_router
import routers.pki.pki as pki_router
import routers.qos.qos as qos_router
import routers.rip.rip as rip_router
import routers.router_advert_service.router_advert_service as router_advert_service_router
import routers.segment_routing.segment_routing as segment_routing_router
import routers.system_conntrack as system_conntrack_router
import routers.system_flow_accounting as system_flow_accounting_router
import routers.system_frr as system_frr_router
import routers.system_ip as system_ip_router
import routers.system_ipv6 as system_ipv6_router
import routers.system_lcd as system_lcd_router
import routers.system_proxy as system_proxy_router
import routers.system_sflow as system_sflow_router
import routers.system_sysctl as system_sysctl_router
import routers.system_task_scheduler as system_task_scheduler_router
import routers.traffic_policy.traffic_policy as traffic_policy_router
import routers.vpn_l2tp.l2tp as vpn_l2tp_router
import routers.vpn_openconnect.openconnect as vpn_openconnect_router
import routers.vpn_pptp.pptp as vpn_pptp_router
import routers.vpn_rsa_keys.rsa_keys as vpn_rsa_keys_router
import routers.vpn_sstp.sstp as vpn_sstp_router
import routers.vrf.vrf as vrf_router


FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "config_apply_loops.json"

PROTOCOL_ROUTER_MODULES = (
    ospf_router,
    rip_router,
    isis_router,
    mpls_router,
    segment_routing_router,
)

SERVICE_ROUTER_MODULES = (
    dns_service_router,
    ntp_service_router,
    lldp_service_router,
    router_advert_service_router,
    config_sync_service_router,
)

VPN_ROUTER_MODULES = (
    vpn_l2tp_router,
    vpn_openconnect_router,
    vpn_pptp_router,
    vpn_sstp_router,
    vpn_rsa_keys_router,
)

DIRECT_ROUTER_MODULES = (
    dmvpn_router,
    nat_router,
)


class MutableDummyService:
    def __init__(self):
        self.revision = 0
        self._config = {
            "interfaces": {
                "tunnel": {
                    "tun100": {
                        "source-interface": "eth0",
                        "encapsulation": "gre",
                    }
                }
            },
            "protocols": {
                "ospf": {"parameters": {}},
                "rip": {},
                "isis": {},
                "mpls": {},
                "nhrp": {
                    "tunnel": {
                        "tun100": {
                            "network-id": "1",
                        }
                    }
                },
            },
            "vrf": {},
            "load-balancing": {"wan": {}},
            "nat": {
                "cgnat": {
                    "rule": {
                        "10": {
                            "source": {"pool": "INT-POOL"},
                            "translation": {"pool": "EXT-POOL"},
                        }
                    }
                }
            },
            "high-availability": {"vrrp": {"group": {"WAN": {}}}},
            "traffic-policy": {"shaper": {"WAN-OUT": {}}},
            "pki": {
                "ca": {
                    "LAB-CA": {
                        "certificate": "-----BEGIN CERTIFICATE-----",
                    }
                }
            },
            "qos": {
                "policy": {
                    "shaper": {
                        "WAN-QOS": {
                            "bandwidth": "1gbit",
                        }
                    }
                }
            },
            "system": {
                "ip": {},
                "conntrack": {},
                "frr": {},
                "proxy": {},
                "sysctl": {},
                "flow-accounting": {},
                "ipv6": {},
                "lcd": {},
                "sflow": {},
                "task-scheduler": {},
            },
            "service": {
                "dns": {
                    "forwarding": {
                        "listen-address": {"192.168.1.1": {}},
                    }
                },
                "ntp": {
                    "server": {"time.cloudflare.com": {}},
                },
                "lldp": {
                    "interface": {"eth0": {}},
                },
                "router-advert": {
                    "interface": {
                        "eth0": {
                            "prefix": {"2001:db8:2::/64": {}},
                        }
                    }
                },
                "config-sync": {
                    "mode": "load",
                },
            },
            "vpn": {
                "l2tp": {
                    "remote-access": {"outside-address": "192.0.2.2"},
                },
                "openconnect": {
                    "authentication": {"mode": "local"},
                },
                "pptp": {
                    "remote-access": {"default-pool": "PPTP-POOL"},
                },
                "sstp": {
                    "authentication": {"mode": "local"},
                },
                "rsa-keys": {
                    "LAB-PEER": {
                        "key": "ssh-rsa AAAAB3Nza",
                    }
                },
                "ipsec": {
                    "profile": {
                        "NHRPVPN": {
                            "bind": {
                                "tunnel": "tun100",
                            }
                        }
                    }
                },
            },
        }

    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return copy.deepcopy(self._config)

    def _mark_revision(self, command: str) -> None:
        tokens = command.strip().split()
        if len(tokens) < 2:
            return

        if tokens[:3] in (["set", "protocols", "ospf"], ["delete", "protocols", "ospf"]):
            self._config["protocols"].setdefault("ospf", {})["__rev"] = str(self.revision)
            if "segment-routing" in tokens or tokens[:4] == ["set", "protocols", "ospf", "parameters"]:
                self._config["protocols"].setdefault("ospf", {}).setdefault("segment-routing", {})[
                    "__rev"
                ] = str(self.revision)
        if tokens[:3] in (["set", "protocols", "rip"], ["delete", "protocols", "rip"]):
            self._config["protocols"].setdefault("rip", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "protocols", "isis"], ["delete", "protocols", "isis"]):
            self._config["protocols"].setdefault("isis", {})["__rev"] = str(self.revision)
            if "segment-routing" in tokens:
                self._config["protocols"].setdefault("isis", {}).setdefault("segment-routing", {})[
                    "__rev"
                ] = str(self.revision)
        if tokens[:3] in (["set", "protocols", "mpls"], ["delete", "protocols", "mpls"]):
            self._config["protocols"].setdefault("mpls", {})["__rev"] = str(self.revision)

        if tokens[:2] in (["set", "vrf"], ["delete", "vrf"]):
            self._config.setdefault("vrf", {})["__rev"] = str(self.revision)
        if tokens[:2] in (["set", "load-balancing"], ["delete", "load-balancing"]):
            self._config.setdefault("load-balancing", {})["__rev"] = str(self.revision)
        if tokens[:2] in (["set", "nat"], ["delete", "nat"]):
            self._config.setdefault("nat", {})["__rev"] = str(self.revision)
        if tokens[:2] in (["set", "high-availability"], ["delete", "high-availability"]):
            self._config.setdefault("high-availability", {})["__rev"] = str(self.revision)
        if tokens[:2] in (["set", "traffic-policy"], ["delete", "traffic-policy"]):
            self._config.setdefault("traffic-policy", {})["__rev"] = str(self.revision)
        if tokens[:2] in (["set", "pki"], ["delete", "pki"]):
            self._config.setdefault("pki", {})["__rev"] = str(self.revision)
        if tokens[:2] in (["set", "qos"], ["delete", "qos"]):
            self._config.setdefault("qos", {})["__rev"] = str(self.revision)

        if tokens[:3] in (["set", "system", "ip"], ["delete", "system", "ip"]):
            self._config.setdefault("system", {}).setdefault("ip", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "system", "conntrack"], ["delete", "system", "conntrack"]):
            self._config.setdefault("system", {}).setdefault("conntrack", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "system", "frr"], ["delete", "system", "frr"]):
            self._config.setdefault("system", {}).setdefault("frr", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "system", "proxy"], ["delete", "system", "proxy"]):
            self._config.setdefault("system", {}).setdefault("proxy", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "system", "sysctl"], ["delete", "system", "sysctl"]):
            self._config.setdefault("system", {}).setdefault("sysctl", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "system", "flow-accounting"], ["delete", "system", "flow-accounting"]):
            self._config.setdefault("system", {}).setdefault("flow-accounting", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "system", "ipv6"], ["delete", "system", "ipv6"]):
            self._config.setdefault("system", {}).setdefault("ipv6", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "system", "lcd"], ["delete", "system", "lcd"]):
            self._config.setdefault("system", {}).setdefault("lcd", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "system", "sflow"], ["delete", "system", "sflow"]):
            self._config.setdefault("system", {}).setdefault("sflow", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "system", "task-scheduler"], ["delete", "system", "task-scheduler"]):
            self._config.setdefault("system", {}).setdefault("task-scheduler", {})["__rev"] = str(self.revision)

        if tokens[:2] in (["set", "service"], ["delete", "service"]) and len(tokens) >= 3:
            service_name = tokens[2]
            self._config.setdefault("service", {}).setdefault(service_name, {})["__rev"] = str(self.revision)

        if tokens[:2] in (["set", "vpn"], ["delete", "vpn"]) and len(tokens) >= 3:
            vpn_name = tokens[2]
            self._config.setdefault("vpn", {}).setdefault(vpn_name, {})["__rev"] = str(self.revision)

        if tokens[:3] in (["set", "interfaces", "tunnel"], ["delete", "interfaces", "tunnel"]):
            self._config.setdefault("interfaces", {}).setdefault("tunnel", {})["__rev"] = str(self.revision)
        if tokens[:3] in (["set", "protocols", "nhrp"], ["delete", "protocols", "nhrp"]):
            self._config.setdefault("protocols", {}).setdefault("nhrp", {})["__rev"] = str(self.revision)

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
    app.include_router(pki_router.router)
    app.include_router(qos_router.router)
    app.include_router(system_proxy_router.system_proxy)
    app.include_router(system_sysctl_router.system_sysctl)
    app.include_router(system_flow_accounting_router.system_flow_accounting)
    app.include_router(system_ipv6_router.system_ipv6)
    app.include_router(system_lcd_router.system_lcd)
    app.include_router(system_sflow_router.system_sflow)
    app.include_router(system_task_scheduler_router.system_task_scheduler)
    app.include_router(dns_service_router.router)
    app.include_router(ntp_service_router.router)
    app.include_router(lldp_service_router.router)
    app.include_router(router_advert_service_router.router)
    app.include_router(vpn_l2tp_router.router)
    app.include_router(vpn_openconnect_router.router)
    app.include_router(vpn_pptp_router.router)
    app.include_router(vpn_sstp_router.router)
    app.include_router(vpn_rsa_keys_router.router)
    app.include_router(dmvpn_router.router)
    app.include_router(nat_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(config_tree_wrapper_module, "require_read_permission", allow_read)
    monkeypatch.setattr(config_tree_wrapper_module, "require_write_permission", allow_write)
    monkeypatch.setattr(service_wrapper_module, "require_read_permission", allow_read)
    monkeypatch.setattr(service_wrapper_module, "require_write_permission", allow_write)
    monkeypatch.setattr(vpn_wrapper_module, "require_read_permission", allow_read)
    monkeypatch.setattr(vpn_wrapper_module, "require_write_permission", allow_write)

    for module in (
        *PROTOCOL_ROUTER_MODULES,
        *SERVICE_ROUTER_MODULES,
        *VPN_ROUTER_MODULES,
        *DIRECT_ROUTER_MODULES,
    ):
        monkeypatch.setattr(module, "require_read_permission", allow_read, raising=False)
        monkeypatch.setattr(module, "require_write_permission", allow_write, raising=False)


@pytest.fixture()
def mutable_service(monkeypatch):
    service = MutableDummyService()

    def service_factory(_request):
        return service

    monkeypatch.setattr(config_tree_wrapper_module, "get_session_vyos_service", service_factory)
    monkeypatch.setattr(service_wrapper_module, "get_session_vyos_service", service_factory)
    monkeypatch.setattr(vpn_wrapper_module, "get_session_vyos_service", service_factory)

    for module in (*PROTOCOL_ROUTER_MODULES, *SERVICE_ROUTER_MODULES, *VPN_ROUTER_MODULES, *DIRECT_ROUTER_MODULES):
        monkeypatch.setattr(module, "get_session_vyos_service", service_factory, raising=False)

    return service


def _extract_revision(payload: dict, response_key: str) -> int:
    root = payload.get(response_key) or {}
    if response_key == "segment_routing":
        ospf = root.get("ospf", {}).get("segment-routing", {})
        isis = root.get("isis", {}).get("segment-routing", {})
        rev = ospf.get("__rev") or isis.get("__rev")
        return int(rev) if rev is not None else 0
    if not isinstance(root, dict):
        return 0
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
    apply_set_payload = apply_set.json()
    assert apply_set_payload.get("success") is True
    assert apply_set_payload.get("data", {}).get("commands") == set_operations

    mid = client.get(config_endpoint, params={"refresh": "true"})
    assert mid.status_code == 200
    mid_rev = _extract_revision(mid.json(), response_key)
    assert mid_rev >= before_rev + 1

    apply_delete = client.post(batch_endpoint, json={"operations": delete_operations})
    assert apply_delete.status_code == 200
    apply_delete_payload = apply_delete.json()
    assert apply_delete_payload.get("success") is True
    assert apply_delete_payload.get("data", {}).get("commands") == delete_operations

    after = client.get(config_endpoint, params={"refresh": "true"})
    assert after.status_code == 200
    after_rev = _extract_revision(after.json(), response_key)
    assert after_rev >= mid_rev + 1
