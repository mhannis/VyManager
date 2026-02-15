from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers._config_tree_wrapper as config_tree_wrapper_module
import routers.high_availability.high_availability as high_availability_router
import routers.interfaces.bonding as bonding_router
import routers.interfaces.bridge as bridge_router
import routers.interfaces.geneve as geneve_router
import routers.interfaces.l2tpv3 as l2tpv3_router
import routers.interfaces.macsec as macsec_router
import routers.interfaces.openvpn as openvpn_router
import routers.interfaces.pseudo_ethernet as pseudo_ethernet_router
import routers.interfaces.sstpc as sstpc_router
import routers.interfaces.tunnel as tunnel_router
import routers.interfaces.virtual_ethernet as virtual_ethernet_router
import routers.interfaces.vti as vti_router
import routers.interfaces.vxlan as vxlan_router
import routers.interfaces.wireless as wireless_router
import routers.interfaces.wwan as wwan_router
import routers.interfaces.loopback as loopback_router
import routers.interfaces.pppoe as pppoe_router
import routers.system_proxy as system_proxy_router
import routers.system_sysctl as system_sysctl_router
import routers.system_flow_accounting as system_flow_accounting_router
import routers.load_balancing.load_balancing as load_balancing_router
import routers.pki.pki as pki_router
import routers.traffic_policy.traffic_policy as traffic_policy_router
import routers.vrf.vrf as vrf_router


class DummyService:
    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return {
            "interfaces": {
                "bonding": {
                    "bond0": {
                        "mode": "802.3ad",
                        "member": {
                            "interface": {
                                "eth2": {},
                                "eth3": {},
                            }
                        },
                    }
                },
                "bridge": {
                    "br0": {
                        "member": {
                            "interface": {
                                "eth4": {},
                                "eth5": {},
                            }
                        }
                    }
                },
                "geneve": {
                    "gnv0": {
                        "remote": "203.0.113.50",
                        "source-interface": "eth0",
                        "vni": "1000",
                    }
                },
                "l2tpv3": {
                    "l2tpeth0": {
                        "remote": "203.0.113.60",
                        "source-address": "192.0.2.10",
                        "session-id": "200",
                    }
                },
                "macsec": {
                    "macsec0": {
                        "source-interface": "eth1",
                        "security": {
                            "cipher": "gcm-aes-128",
                        },
                    }
                },
                "openvpn": {
                    "vtun0": {
                        "mode": "site-to-site",
                        "protocol": "udp",
                        "remote-host": "198.51.100.20",
                    }
                },
                "pseudo-ethernet": {
                    "peth0": {
                        "source-interface": "eth2",
                        "address": ["10.50.0.1/24"],
                    }
                },
                "sstpc": {
                    "sstpc0": {
                        "server": "vpn.example.net",
                        "username": "vpnuser",
                    }
                },
                "virtual-ethernet": {
                    "veth10": {
                        "peer-name": "veth11",
                        "address": ["100.64.0.0/31"],
                    }
                },
                "tunnel": {
                    "tun100": {
                        "encapsulation": "gre",
                        "source-address": "198.51.100.2",
                        "remote": "203.0.113.10",
                    }
                },
                "vti": {
                    "vti0": {
                        "address": ["192.168.2.249/30"],
                        "description": "IPsec VTI",
                    }
                },
                "vxlan": {
                    "vxlan241": {
                        "vni": "241",
                        "group": "239.0.0.241",
                        "source-interface": "eth0",
                    }
                },
                "wireless": {
                    "wlan0": {
                        "type": "access-point",
                        "mode": "n",
                        "ssid": "LabWifi",
                    }
                },
                "wwan": {
                    "wwan0": {
                        "apn": "internet.example",
                        "address": ["dhcp"],
                    }
                },
                "loopback": {
                    "lo": {
                        "description": "router-id loopback",
                        "address": ["10.255.255.1/32"],
                    }
                },
                "pppoe": {
                    "pppoe0": {
                        "source-interface": "eth0",
                        "authentication": {
                            "username": "isp-user",
                            "password": "isp-pass",
                        },
                        "ip": {
                            "source-validation": "strict",
                        },
                    }
                },
            },
            "vrf": {
                "name": {
                    "BLUE": {
                        "table": "10",
                        "description": "Internal tenant",
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
                }
            },
            "system": {
                "wireless": {
                    "country-code": "us",
                },
                "proxy": {
                    "url": "http://proxy.lab.local",
                    "port": "3128",
                    "username": "proxy-user",
                },
                "sysctl": {
                    "parameter": {
                        "net.ipv4.ip_forward": {"value": "1"},
                    }
                },
                "flow-accounting": {
                    "interface": {
                        "eth0": {},
                        "eth1": {},
                    },
                    "disable-imt": {},
                    "enable-egress": {},
                    "netflow": {
                        "version": "9",
                        "engine-id": "7",
                        "server": {
                            "192.0.2.50": {
                                "port": "2055",
                            }
                        },
                    },
                    "sflow": {
                        "server": {
                            "192.0.2.60": {},
                        },
                        "sampling-rate": "2048",
                    },
                },
            },
        }

    def configure_batch(self, commands):
        return {
            "success": True,
            "data": {"commands": commands},
            "error": None,
        }


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(bonding_router.router)
    app.include_router(bridge_router.router)
    app.include_router(geneve_router.router)
    app.include_router(l2tpv3_router.router)
    app.include_router(macsec_router.router)
    app.include_router(openvpn_router.router)
    app.include_router(pseudo_ethernet_router.router)
    app.include_router(sstpc_router.router)
    app.include_router(tunnel_router.router)
    app.include_router(virtual_ethernet_router.router)
    app.include_router(vti_router.router)
    app.include_router(vxlan_router.router)
    app.include_router(wireless_router.router)
    app.include_router(wwan_router.router)
    app.include_router(loopback_router.router)
    app.include_router(pppoe_router.router)
    app.include_router(vrf_router.router)
    app.include_router(load_balancing_router.router)
    app.include_router(high_availability_router.router)
    app.include_router(traffic_policy_router.router)
    app.include_router(pki_router.router)
    app.include_router(system_proxy_router.system_proxy)
    app.include_router(system_sysctl_router.system_sysctl)
    app.include_router(system_flow_accounting_router.system_flow_accounting)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(config_tree_wrapper_module, "require_read_permission", allow_read)
    monkeypatch.setattr(config_tree_wrapper_module, "require_write_permission", allow_write)
    monkeypatch.setattr(wireless_router, "require_read_permission", allow_read)
    monkeypatch.setattr(wireless_router, "require_write_permission", allow_write)


@pytest.fixture()
def mock_service(monkeypatch):
    def service_factory(_request):
        return DummyService()

    monkeypatch.setattr(config_tree_wrapper_module, "get_session_vyos_service", service_factory)
    monkeypatch.setattr(wireless_router, "get_session_vyos_service", service_factory)


@pytest.mark.parametrize(
    "path",
    [
        "/vyos/bonding/capabilities",
        "/vyos/bridge/capabilities",
        "/vyos/geneve/capabilities",
        "/vyos/l2tpv3/capabilities",
        "/vyos/macsec/capabilities",
        "/vyos/interface-openvpn/capabilities",
        "/vyos/pseudo-ethernet/capabilities",
        "/vyos/sstpc/capabilities",
        "/vyos/tunnel-interface/capabilities",
        "/vyos/virtual-ethernet/capabilities",
        "/vyos/vti-interface/capabilities",
        "/vyos/vxlan-interface/capabilities",
        "/vyos/wireless-interface/capabilities",
        "/vyos/wwan-interface/capabilities",
        "/vyos/loopback-interface/capabilities",
        "/vyos/pppoe-interface/capabilities",
        "/vyos/vrf/capabilities",
        "/vyos/load-balancing/capabilities",
        "/vyos/high-availability/capabilities",
        "/vyos/traffic-policy/capabilities",
        "/vyos/pki/capabilities",
        "/vyos/system-proxy/capabilities",
        "/vyos/system-sysctl/capabilities",
        "/vyos/system-flow-accounting/capabilities",
    ],
)
def test_config_tree_wrapper_capabilities_payload(app, allow_permissions, mock_service, path):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    assert "tree" in payload
    assert "version" in payload
    assert "features" in payload


@pytest.mark.parametrize(
    ("path", "response_key", "marker"),
    [
        ("/vyos/bonding/config", "bonding", "bond0"),
        ("/vyos/bridge/config", "bridge", "br0"),
        ("/vyos/geneve/config", "geneve", "gnv0"),
        ("/vyos/l2tpv3/config", "l2tpv3", "l2tpeth0"),
        ("/vyos/macsec/config", "macsec", "macsec0"),
        ("/vyos/interface-openvpn/config", "openvpn", "vtun0"),
        ("/vyos/pseudo-ethernet/config", "pseudo_ethernet", "peth0"),
        ("/vyos/sstpc/config", "sstpc", "sstpc0"),
        ("/vyos/tunnel-interface/config", "tunnel", "tun100"),
        ("/vyos/virtual-ethernet/config", "virtual_ethernet", "veth10"),
        ("/vyos/vti-interface/config", "vti", "vti0"),
        ("/vyos/vxlan-interface/config", "vxlan", "vxlan241"),
        ("/vyos/wireless-interface/config", "wireless", "wlan0"),
        ("/vyos/wwan-interface/config", "wwan", "wwan0"),
        ("/vyos/loopback-interface/config", "loopback", "lo"),
        ("/vyos/pppoe-interface/config", "pppoe", "pppoe0"),
        ("/vyos/vrf/config", "vrf", "name"),
        ("/vyos/load-balancing/config", "load_balancing", "wan"),
        ("/vyos/high-availability/config", "high_availability", "vrrp"),
        ("/vyos/traffic-policy/config", "traffic_policy", "shaper"),
        ("/vyos/pki/config", "pki", "ca"),
        ("/vyos/system-proxy/config", "proxy", "url"),
        ("/vyos/system-sysctl/config", "sysctl", "parameter"),
        ("/vyos/system-flow-accounting/config", "flow_accounting", "interface"),
    ],
)
def test_config_tree_wrapper_config_payload(
    app,
    allow_permissions,
    mock_service,
    path,
    response_key,
    marker,
):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    assert response_key in payload
    assert marker in payload[response_key]


def test_wireless_config_includes_country_code(app, allow_permissions, mock_service):
    client = TestClient(app)
    response = client.get("/vyos/wireless-interface/config")

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("country_code") == "us"


@pytest.mark.parametrize(
    ("path", "valid_command", "invalid_command"),
    [
        (
            "/vyos/bonding/batch",
            "set interfaces bonding bond0 mode 802.3ad",
            "set interfaces ethernet eth0 description WAN",
        ),
        (
            "/vyos/bridge/batch",
            "set interfaces bridge br0 member interface eth4",
            "set interfaces bonding bond0 mode 802.3ad",
        ),
        (
            "/vyos/geneve/batch",
            "set interfaces geneve gnv0 remote 203.0.113.50",
            "set interfaces bridge br0 member interface eth4",
        ),
        (
            "/vyos/l2tpv3/batch",
            "set interfaces l2tpv3 l2tpeth0 remote 203.0.113.60",
            "set interfaces geneve gnv0 remote 203.0.113.50",
        ),
        (
            "/vyos/macsec/batch",
            "set interfaces macsec macsec0 source-interface eth1",
            "set interfaces l2tpv3 l2tpeth0 remote 203.0.113.60",
        ),
        (
            "/vyos/interface-openvpn/batch",
            "set interfaces openvpn vtun0 mode site-to-site",
            "set interfaces macsec macsec0 source-interface eth1",
        ),
        (
            "/vyos/pseudo-ethernet/batch",
            "set interfaces pseudo-ethernet peth0 source-interface eth2",
            "set interfaces openvpn vtun0 mode site-to-site",
        ),
        (
            "/vyos/sstpc/batch",
            "set interfaces sstpc sstpc0 server vpn.example.net",
            "set interfaces pseudo-ethernet peth0 source-interface eth2",
        ),
        (
            "/vyos/virtual-ethernet/batch",
            "set interfaces virtual-ethernet veth10 peer-name veth11",
            "set interfaces sstpc sstpc0 server vpn.example.net",
        ),
        (
            "/vyos/tunnel-interface/batch",
            "set interfaces tunnel tun100 encapsulation gre",
            "set interfaces virtual-ethernet veth10 peer-name veth11",
        ),
        (
            "/vyos/vti-interface/batch",
            "set interfaces vti vti0 description IPSecVTI",
            "set interfaces tunnel tun100 encapsulation gre",
        ),
        (
            "/vyos/vxlan-interface/batch",
            "set interfaces vxlan vxlan241 vni 241",
            "set interfaces vti vti0 description IPSecVTI",
        ),
        (
            "/vyos/wireless-interface/batch",
            "set interfaces wireless wlan0 ssid LabWifi",
            "set interfaces vxlan vxlan241 vni 241",
        ),
        (
            "/vyos/wwan-interface/batch",
            "set interfaces wwan wwan0 apn internet.example",
            "set interfaces wireless wlan0 ssid LabWifi",
        ),
        (
            "/vyos/loopback-interface/batch",
            "set interfaces loopback lo description router-id loopback",
            "set interfaces wwan wwan0 apn internet.example",
        ),
        (
            "/vyos/pppoe-interface/batch",
            "set interfaces pppoe pppoe0 source-interface eth0",
            "set interfaces loopback lo description router-id loopback",
        ),
        (
            "/vyos/vrf/batch",
            "set vrf name BLUE table 10",
            "set load-balancing wan interface-health eth1 nexthop 203.0.113.1",
        ),
        (
            "/vyos/load-balancing/batch",
            "set load-balancing wan interface-health eth1 nexthop 203.0.113.1",
            "set vrf name BLUE table 10",
        ),
        (
            "/vyos/high-availability/batch",
            "set high-availability vrrp group WAN interface eth0",
            "set traffic-policy shaper WAN-OUT bandwidth 100mbit",
        ),
        (
            "/vyos/traffic-policy/batch",
            "set traffic-policy shaper WAN-OUT bandwidth 100mbit",
            "set high-availability vrrp group WAN vrid 10",
        ),
        (
            "/vyos/pki/batch",
            "set pki ca LAB-CA certificate -----BEGIN",
            "set traffic-policy shaper WAN-OUT bandwidth 100mbit",
        ),
        (
            "/vyos/system-proxy/batch",
            "set system proxy url http://proxy.lab.local:3128",
            "set system sysctl parameter net.ipv4.ip_forward value 1",
        ),
        (
            "/vyos/system-sysctl/batch",
            "set system sysctl parameter net.ipv4.ip_forward value 1",
            "set system flow-accounting netflow version 9",
        ),
        (
            "/vyos/system-flow-accounting/batch",
            "set system flow-accounting netflow version 9",
            "set system proxy url http://proxy.lab.local:3128",
        ),
    ],
)
def test_config_tree_wrapper_batch_scope_validation(
    app,
    allow_permissions,
    mock_service,
    path,
    valid_command,
    invalid_command,
):
    client = TestClient(app)

    response = client.post(path, json={"operations": [valid_command]})
    assert response.status_code == 200
    assert response.json().get("success") is True

    denied = client.post(path, json={"operations": [invalid_command]})
    assert denied.status_code == 400
