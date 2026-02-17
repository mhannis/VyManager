import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers._config_tree_wrapper as config_tree_wrapper_module
import routers._service_wrapper as service_wrapper_module
import routers._vpn_wrapper as vpn_wrapper_module
import routers.dmvpn.dmvpn as dmvpn_router
import routers.dns.dns as dns_service_router
import routers.high_availability.high_availability as high_availability_router
import routers.igmp_proxy.igmp_proxy as igmp_proxy_router
import routers.isis.isis as isis_router
import routers.lldp.lldp as lldp_service_router
import routers.load_balancing.load_balancing as load_balancing_router
import routers.mpls.mpls as mpls_router
import routers.ntp.ntp as ntp_service_router
import routers.openfabric.openfabric as openfabric_router
import routers.ospf.ospf as ospf_router
import routers.pki.pki as pki_router
import routers.qos.qos as qos_router
import routers.rip.rip as rip_router
import routers.router_advert_service.router_advert_service as router_advert_service_router
import routers.rpki.rpki as rpki_router
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

SERVICE_MODULES = (
    dns_service_router,
    ntp_service_router,
    lldp_service_router,
    router_advert_service_router,
)

VPN_MODULES = (
    vpn_l2tp_router,
    vpn_openconnect_router,
    vpn_pptp_router,
    vpn_sstp_router,
    vpn_rsa_keys_router,
)

DIRECT_MODULES = (
    dmvpn_router,
)


class SnapshotDummyService:
    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return {
            "interfaces": {
                "tunnel": {
                    "tun100": {
                        "address": {"10.0.0.1/32": {}},
                        "source-interface": "eth0",
                        "encapsulation": "gre",
                    }
                }
            },
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
                "nhrp": {
                    "tunnel": {
                        "tun100": {
                            "network-id": "1",
                            "shortcut": {},
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
            "pki": {
                "ca": {
                    "LAB-CA": {
                        "certificate": "-----BEGIN CERTIFICATE-----...",
                    }
                },
                "certificate": {
                    "LAB-PEER": {
                        "description": "Site peer cert",
                    }
                },
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
                "ip": {
                    "disable-forwarding": {},
                },
                "conntrack": {
                    "table-size": "262144",
                    "timeout": {
                        "tcp": {
                            "established": "600",
                            "time-wait": "120",
                        },
                        "custom": {
                            "ipv4": {
                                "rule": {
                                    "10": {
                                        "protocol": "tcp",
                                        "source": {
                                            "address": "192.0.2.0/24",
                                        },
                                        "timeout": "300",
                                    }
                                }
                            }
                        },
                    },
                    "ignore": {
                        "ipv4": {
                            "rule": {
                                "20": {
                                    "protocol": "udp",
                                }
                            }
                        }
                    },
                    "log": {
                        "invalid-state": {},
                        "tcp": {
                            "established": {},
                        },
                    },
                },
                "frr": {
                    "profile": "traditional",
                },
                "proxy": {
                    "url": "http://proxy.lab:3128",
                },
                "sysctl": {
                    "parameter": {
                        "net.ipv4.ip_forward": {
                            "value": "1",
                        }
                    }
                },
                "flow-accounting": {
                    "interface": {
                        "eth0": {},
                    }
                },
                "ipv6": {
                    "disable-forwarding": {},
                },
                "lcd": {
                    "model": "CFA635",
                },
                "sflow": {
                    "sampling-rate": "1000",
                },
                "task-scheduler": {
                    "task": {
                        "backup": {
                            "interval": "daily",
                        }
                    }
                },
            },
            "service": {
                "dns": {
                    "forwarding": {
                        "listen-address": {
                            "192.168.1.1": {},
                        }
                    }
                },
                "ntp": {
                    "server": {
                        "time.cloudflare.com": {},
                    }
                },
                "lldp": {
                    "interface": {
                        "eth0": {},
                    }
                },
                "router-advert": {
                    "interface": {
                        "eth0": {
                            "prefix": {
                                "2001:db8:2::/64": {},
                            }
                        }
                    }
                },
            },
            "vpn": {
                "l2tp": {
                    "remote-access": {
                        "outside-address": "192.0.2.2",
                    }
                },
                "openconnect": {
                    "authentication": {
                        "mode": {
                            "local": {
                                "password": {},
                            }
                        }
                    }
                },
                "pptp": {
                    "remote-access": {
                        "default-pool": "PPTP-POOL",
                    }
                },
                "sstp": {
                    "authentication": {
                        "mode": "local",
                    }
                },
                "rsa-keys": {
                    "LAB-PEER": {
                        "key": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC...",
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

    for module in (*PROTOCOL_MODULES, *SERVICE_MODULES, *VPN_MODULES, *DIRECT_MODULES):
        monkeypatch.setattr(module, "require_read_permission", allow_read, raising=False)
        monkeypatch.setattr(module, "require_write_permission", allow_write, raising=False)


@pytest.fixture()
def mock_service(monkeypatch):
    service = SnapshotDummyService()

    def service_factory(_request):
        return service

    monkeypatch.setattr(config_tree_wrapper_module, "get_session_vyos_service", service_factory)
    monkeypatch.setattr(service_wrapper_module, "get_session_vyos_service", service_factory)
    monkeypatch.setattr(vpn_wrapper_module, "get_session_vyos_service", service_factory)
    for module in (*PROTOCOL_MODULES, *SERVICE_MODULES, *VPN_MODULES, *DIRECT_MODULES):
        monkeypatch.setattr(module, "get_session_vyos_service", service_factory, raising=False)


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
