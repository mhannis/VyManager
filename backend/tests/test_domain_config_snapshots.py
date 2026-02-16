import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers._config_tree_wrapper as config_tree_wrapper_module
import routers.high_availability.high_availability as high_availability_router
import routers.igmp_proxy.igmp_proxy as igmp_proxy_router
import routers.isis.isis as isis_router
import routers.load_balancing.load_balancing as load_balancing_router
import routers.mpls.mpls as mpls_router
import routers.openfabric.openfabric as openfabric_router
import routers.ospf.ospf as ospf_router
import routers.rip.rip as rip_router
import routers.rpki.rpki as rpki_router
import routers.segment_routing.segment_routing as segment_routing_router
import routers.system_conntrack as system_conntrack_router
import routers.system_frr as system_frr_router
import routers.system_ip as system_ip_router
import routers.traffic_policy.traffic_policy as traffic_policy_router
import routers.vrf.vrf as vrf_router


SNAPSHOT_PATH = Path(__file__).resolve().parent / "snapshots" / "domain_config_snapshots.json"

PROTOCOL_MODULES = (
    ospf_router,
    rip_router,
    isis_router,
    mpls_router,
    openfabric_router,
    rpki_router,
    igmp_proxy_router,
    segment_routing_router,
)


class SnapshotDummyService:
    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return {
            "protocols": {
                "ospf": {
                    "parameters": {
                        "router-id": "1.1.1.1",
                        "opaque-lsa": {},
                    },
                    "segment-routing": {
                        "global-block": {
                            "low-label-value": "1000",
                            "high-label-value": "1100",
                        }
                    },
                },
                "rip": {
                    "network": {
                        "10.0.0.0/8": {},
                    }
                },
                "isis": {
                    "net": "49.0001.0102.0304.0506.00",
                    "segment-routing": {
                        "global-block": {
                            "low-label-value": "1000",
                            "high-label-value": "1100",
                        }
                    },
                },
                "mpls": {
                    "interface": {
                        "eth2": {},
                    }
                },
                "openfabric": {
                    "domain": {
                        "1": {
                            "net": "49.0001.0102.0304.0506.00",
                        }
                    }
                },
                "rpki": {
                    "cache": {
                        "192.0.2.10": {
                            "port": "3323",
                        }
                    }
                },
                "igmp-proxy": {
                    "interface": {
                        "eth1": {
                            "role": "upstream",
                        }
                    }
                },
            },
            "vrf": {
                "name": {
                    "BLUE": {
                        "table": "10",
                    }
                }
            },
            "load-balancing": {
                "wan": {
                    "interface-health": {
                        "eth1": {
                            "nexthop": "203.0.113.1",
                        }
                    }
                }
            },
            "high-availability": {
                "vrrp": {
                    "group": {
                        "WAN": {
                            "interface": "eth0",
                            "vrid": "10",
                        }
                    }
                }
            },
            "traffic-policy": {
                "shaper": {
                    "WAN-OUT": {
                        "bandwidth": "100mbit",
                    }
                }
            },
            "system": {
                "ip": {
                    "disable-forwarding": {},
                },
                "conntrack": {
                    "table-size": "262144",
                },
                "frr": {
                    "profile": "traditional",
                },
            },
        }

    def configure_batch(self, commands):  # noqa: ARG002
        return {
            "success": True,
            "data": {},
            "error": None,
        }


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(ospf_router.router)
    app.include_router(rip_router.router)
    app.include_router(isis_router.router)
    app.include_router(mpls_router.router)
    app.include_router(openfabric_router.router)
    app.include_router(rpki_router.router)
    app.include_router(igmp_proxy_router.router)
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

    for module in PROTOCOL_MODULES:
        monkeypatch.setattr(module, "require_read_permission", allow_read)
        monkeypatch.setattr(module, "require_write_permission", allow_write)


@pytest.fixture()
def mock_service(monkeypatch):
    service = SnapshotDummyService()

    def service_factory(_request):
        return service

    monkeypatch.setattr(config_tree_wrapper_module, "get_session_vyos_service", service_factory)
    for module in PROTOCOL_MODULES:
        monkeypatch.setattr(module, "get_session_vyos_service", service_factory)


def load_snapshots():
    return json.loads(SNAPSHOT_PATH.read_text())


@pytest.mark.parametrize(
    ("endpoint", "expected_payload"),
    list(load_snapshots().items()),
)
def test_domain_config_snapshot_payloads(app, allow_permissions, mock_service, endpoint, expected_payload):
    client = TestClient(app)
    response = client.get(endpoint)
    assert response.status_code == 200
    assert response.json() == expected_payload

