from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.arp.arp as arp_router
import routers.ospf.ospf as ospf_router
import routers.rip.rip as rip_router
import routers.isis.isis as isis_router
import routers.igmp_proxy.igmp_proxy as igmp_proxy_router
import routers.static.static as static_router
import routers.failover.failover as failover_router
import routers.mpls.mpls as mpls_router
import routers.segment_routing.segment_routing as segment_routing_router
import routers.openfabric.openfabric as openfabric_router
import routers.rpki.rpki as rpki_router
import routers.pim.pim as pim_router
import routers.pim6.pim6 as pim6_router
import routers.protocols.protocols as protocols_router


ROUTER_MODULES = (
    arp_router,
    ospf_router,
    rip_router,
    isis_router,
    igmp_proxy_router,
    static_router,
    failover_router,
    mpls_router,
    segment_routing_router,
    openfabric_router,
    rpki_router,
    pim_router,
    pim6_router,
    protocols_router,
)


class DummyService:
    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return {
            "protocols": {
                "static": {
                    "arp": {
                        "interface": {
                            "eth0": {
                                "address": {
                                    "192.0.2.10": {
                                        "mac": "00:11:22:33:44:55",
                                    }
                                }
                            }
                        }
                    },
                    "route": {"0.0.0.0/0": {"next-hop": {"192.0.2.1": {}}}},
                },
                "ospf": {
                    "parameters": {"router-id": "1.1.1.1", "opaque-lsa": {}},
                    "segment-routing": {
                        "global-block": {
                            "low-label-value": "1000",
                            "high-label-value": "1100",
                        }
                    },
                },
                "rip": {"network": {"10.0.0.0/8": {}}},
                "isis": {
                    "interface": {"eth0": {}},
                    "segment-routing": {
                        "prefix": {
                            "10.255.255.1/32": {
                                "index": {
                                    "value": "100",
                                }
                            }
                        }
                    },
                },
                "igmp-proxy": {"interface": {"eth1": {"role": "upstream"}}},
                "failover": {"route": {"0.0.0.0/0": {"next-hop": {"192.0.2.1": {}}}}},
                "mpls": {"interface": {"eth2": {}}},
                "openfabric": {"interface": {"eth2": {}}},
                "rpki": {"cache": {"192.0.2.10": {"port": "3323"}}},
                "pim": {"interface": {"eth3": {"mode": "sm"}}},
                "pim6": {"interface": {"eth3": {"mode": "sm"}}},
            }
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
    app.include_router(arp_router.router)
    app.include_router(ospf_router.router)
    app.include_router(rip_router.router)
    app.include_router(isis_router.router)
    app.include_router(igmp_proxy_router.router)
    app.include_router(static_router.router)
    app.include_router(failover_router.router)
    app.include_router(mpls_router.router)
    app.include_router(segment_routing_router.router)
    app.include_router(openfabric_router.router)
    app.include_router(rpki_router.router)
    app.include_router(pim_router.router)
    app.include_router(pim6_router.router)
    app.include_router(protocols_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    for router_module in ROUTER_MODULES:
        if hasattr(router_module, "require_read_permission"):
            monkeypatch.setattr(router_module, "require_read_permission", allow_read)
        if hasattr(router_module, "require_write_permission"):
            monkeypatch.setattr(router_module, "require_write_permission", allow_write)


@pytest.fixture()
def mock_service(monkeypatch):
    def service_factory(_request):
        return DummyService()

    for router_module in ROUTER_MODULES:
        monkeypatch.setattr(router_module, "get_session_vyos_service", service_factory)


@pytest.mark.parametrize(
    ("path", "expected_keys"),
    [
        ("/vyos/arp/capabilities", ("protocol", "version", "features")),
        ("/vyos/ospf/capabilities", ("protocol", "version", "features")),
        ("/vyos/rip/capabilities", ("protocol", "version", "features")),
        ("/vyos/isis/capabilities", ("protocol", "version", "features")),
        ("/vyos/igmp-proxy/capabilities", ("protocol", "version", "features")),
        ("/vyos/static-protocol/capabilities", ("protocol", "version", "features")),
        ("/vyos/failover/capabilities", ("protocol", "version", "features")),
        ("/vyos/mpls/capabilities", ("protocol", "version", "features")),
        ("/vyos/segment-routing/capabilities", ("protocol", "version", "features")),
        ("/vyos/openfabric/capabilities", ("protocol", "version", "features")),
        ("/vyos/rpki/capabilities", ("protocol", "version", "features")),
        ("/vyos/pim/capabilities", ("protocol", "version", "features")),
        ("/vyos/pim6/capabilities", ("protocol", "version", "features")),
        ("/vyos/protocols/capabilities", ("protocol", "version", "features")),
    ],
)
def test_protocol_capabilities_endpoints_return_expected_payload(
    app,
    allow_permissions,
    mock_service,
    path,
    expected_keys,
):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    for key in expected_keys:
        assert key in payload


@pytest.mark.parametrize(
    ("path", "config_key"),
    [
        ("/vyos/arp/config", "arp"),
        ("/vyos/ospf/config", "ospf"),
        ("/vyos/rip/config", "rip"),
        ("/vyos/isis/config", "isis"),
        ("/vyos/igmp-proxy/config", "igmp_proxy"),
        ("/vyos/static-protocol/config", "static"),
        ("/vyos/failover/config", "failover"),
        ("/vyos/mpls/config", "mpls"),
        ("/vyos/segment-routing/config", "segment_routing"),
        ("/vyos/openfabric/config", "openfabric"),
        ("/vyos/rpki/config", "rpki"),
        ("/vyos/pim/config", "pim"),
        ("/vyos/pim6/config", "pim6"),
        ("/vyos/protocols/config", "protocols"),
    ],
)
def test_protocol_config_endpoints_return_expected_payload(
    app,
    allow_permissions,
    mock_service,
    path,
    config_key,
):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    assert config_key in payload
    assert isinstance(payload[config_key], dict)


@pytest.mark.parametrize(
    ("path", "valid_command", "invalid_command"),
    [
        (
            "/vyos/arp/batch",
            "set protocols static arp interface eth0 address 192.0.2.20 mac 00:11:22:33:44:66",
            "set interfaces ethernet eth0 address 192.0.2.1/24",
        ),
        (
            "/vyos/ospf/batch",
            "set protocols ospf parameters router-id 1.1.1.1",
            "set protocols rip network 10.0.0.0/8",
        ),
        (
            "/vyos/rip/batch",
            "set protocols rip network 10.0.0.0/8",
            "set protocols ospf parameters router-id 1.1.1.1",
        ),
        (
            "/vyos/isis/batch",
            "set protocols isis interface eth0",
            "set protocols bgp system-as 64512",
        ),
        (
            "/vyos/igmp-proxy/batch",
            "set protocols igmp-proxy interface eth1 role upstream",
            "set protocols pim interface eth1",
        ),
        (
            "/vyos/static-protocol/batch",
            "set protocols static route 0.0.0.0/0 next-hop 192.0.2.1",
            "set protocols rip network 10.0.0.0/8",
        ),
        (
            "/vyos/failover/batch",
            "set protocols failover route 0.0.0.0/0 next-hop 192.0.2.1 interface eth0",
            "set protocols static route 0.0.0.0/0 next-hop 192.0.2.1",
        ),
        (
            "/vyos/mpls/batch",
            "set protocols mpls interface eth2",
            "set interfaces ethernet eth2 description TEST",
        ),
        (
            "/vyos/segment-routing/batch",
            "set protocols ospf segment-routing global-block low-label-value 1000",
            "set protocols mpls interface eth2",
        ),
        (
            "/vyos/openfabric/batch",
            "set protocols openfabric interface eth2",
            "set protocols ospf parameters router-id 1.1.1.1",
        ),
        (
            "/vyos/rpki/batch",
            "set protocols rpki cache 192.0.2.10 port 3323",
            "set protocols bgp system-as 64512",
        ),
        (
            "/vyos/pim/batch",
            "delete protocols pim",
            "set protocols pim6 interface eth3 mode sm",
        ),
        (
            "/vyos/pim6/batch",
            "delete protocols pim6",
            "set protocols pim interface eth3 mode sm",
        ),
    ],
)
def test_protocol_batch_validates_command_scope(
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
    payload = response.json()
    assert payload.get("success") is True

    denied = client.post(path, json={"operations": [invalid_command]})
    assert denied.status_code == 400
