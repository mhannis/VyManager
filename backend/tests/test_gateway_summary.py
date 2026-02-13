import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.show as show_router


class DummyResponse:
    def __init__(self, status: int = 200, output: str = "", error: str = ""):
        self.status = status
        self.result = {"data": output}
        self.error = error


def test_parse_active_ipv4_default_route_frr_table():
    output = "S>* 0.0.0.0/0 [1/0] via 192.168.1.1, eth0, 00:00:10\n"
    gw, iface, proto = show_router.parse_active_ipv4_default_route(output)
    assert gw == "192.168.1.1"
    assert iface == "eth0"
    assert proto is None


def test_parse_active_ipv4_default_route_frr_detailed():
    output = """Routing entry for 0.0.0.0/0
  Known via "static", distance 1, metric 0
  * 203.0.113.1, via eth0, weight 1, 00:00:10
"""
    gw, iface, proto = show_router.parse_active_ipv4_default_route(output)
    assert gw == "203.0.113.1"
    assert iface == "eth0"
    assert proto == "static"


def test_parse_active_ipv4_default_route_iproute2():
    output = "default via 10.0.0.1 dev eth0 proto dhcp metric 100\n"
    gw, iface, proto = show_router.parse_active_ipv4_default_route(output)
    assert gw == "10.0.0.1"
    assert iface == "eth0"
    assert proto == "dhcp"


def test_parse_active_ipv4_default_route_default_dev():
    output = "default dev eth0 proto kernel\n"
    gw, iface, proto = show_router.parse_active_ipv4_default_route(output)
    assert gw is None
    assert iface == "eth0"
    assert proto == "kernel"


def test_extract_configured_ipv4_default_gateway():
    full_config = {
        "protocols": {
            "static": {
                "route": {
                    "0.0.0.0/0": {
                        "description": "VyManager Setup Wizard: WAN default route",
                        "next-hop": {"192.0.2.1": {"interface": "eth0"}},
                        "dhcp-interface": "eth0",
                    }
                }
            }
        }
    }
    configured, preferred_iface, warnings = show_router.extract_configured_ipv4_default_gateway(full_config)
    assert warnings == []
    assert configured is not None
    assert configured.destination == "0.0.0.0/0"
    assert configured.next_hops == ["192.0.2.1"]
    assert configured.dhcp_interfaces == ["eth0"]
    assert configured.description == "VyManager Setup Wizard: WAN default route"
    assert preferred_iface == "eth0"


def test_extract_configured_ipv4_default_gateway_prefers_dhcp_interface():
    full_config = {
        "protocols": {
            "static": {
                "route": {
                    "0.0.0.0/0": {
                        "dhcp-interface": "eth5",
                    }
                }
            }
        }
    }
    configured, preferred_iface, warnings = show_router.extract_configured_ipv4_default_gateway(full_config)
    assert warnings == []
    assert configured is not None
    assert configured.next_hops == []
    assert configured.dhcp_interfaces == ["eth5"]
    assert preferred_iface == "eth5"


def test_gateway_summary_endpoint_happy_path(monkeypatch):
    class DummyDevice:
        def show(self, path=None):
            if path == ["ip", "route", "0.0.0.0/0"]:
                return DummyResponse(output="S>* 0.0.0.0/0 [1/0] via 192.168.1.1, eth0\n")
            if path == ["interfaces", "ethernet", "eth0", "physical"]:
                return DummyResponse(
                    output="speed: 1000Mb/s\n"
                    "duplex: Full\n"
                    "link detected: yes\n"
                )
            raise AssertionError(f"Unexpected show path: {path}")

    class DummyService:
        device = DummyDevice()

        def get_full_config(self, refresh=False):
            return {
                "protocols": {
                    "static": {
                        "route": {
                            "0.0.0.0/0": {
                                "description": "default route",
                                "next-hop": {"192.168.1.1": {"interface": "eth0"}},
                            }
                        }
                    }
                }
            }

    async def allow_read(*_args, **_kwargs):
        return None

    monkeypatch.setattr(show_router, "get_session_vyos_service", lambda _req: DummyService())
    monkeypatch.setattr(show_router, "require_read_permission", allow_read)

    app = FastAPI()
    app.include_router(show_router.router)
    client = TestClient(app)

    resp = client.get("/vyos/show/gateway-summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ipv4_default"]["next_hop"] == "192.168.1.1"
    assert data["ipv4_default"]["interface"] == "eth0"
    assert data["interface"]["name"] == "eth0"
    assert data["interface"]["link_up"] is True
    assert data["configured_ipv4_default"]["next_hops"] == ["192.168.1.1"]
    assert data["warnings"] == []


def test_gateway_summary_endpoint_fallback_to_table(monkeypatch):
    class DummyDevice:
        def show(self, path=None):
            if path == ["ip", "route", "0.0.0.0/0"]:
                return DummyResponse(output="")
            if path == ["ip", "route"]:
                return DummyResponse(output="S>* 0.0.0.0/0 [1/0] via 198.51.100.1, eth1\n")
            if path == ["interfaces", "ethernet", "eth1", "physical"]:
                return DummyResponse(output="link detected: no\n")
            raise AssertionError(f"Unexpected show path: {path}")

    class DummyService:
        device = DummyDevice()

        def get_full_config(self, refresh=False):
            return {}

    async def allow_read(*_args, **_kwargs):
        return None

    monkeypatch.setattr(show_router, "get_session_vyos_service", lambda _req: DummyService())
    monkeypatch.setattr(show_router, "require_read_permission", allow_read)

    app = FastAPI()
    app.include_router(show_router.router)
    client = TestClient(app)

    resp = client.get("/vyos/show/gateway-summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ipv4_default"]["next_hop"] == "198.51.100.1"
    assert data["ipv4_default"]["interface"] == "eth1"
    assert data["ipv4_default"]["source"] == "opstate-fallback"
    assert any("Fell back" in warning for warning in data["warnings"])
    assert data["interface"]["link_up"] is False


def test_gateway_summary_endpoint_unparsable_output_warns(monkeypatch):
    class DummyDevice:
        def show(self, path=None):
            if path == ["ip", "route", "0.0.0.0/0"]:
                return DummyResponse(output="0.0.0.0/0 via ???\n")
            if path == ["interfaces", "ethernet", "eth0", "physical"]:
                return DummyResponse(output="link detected: yes\n")
            raise AssertionError(f"Unexpected show path: {path}")

    class DummyService:
        device = DummyDevice()

        def get_full_config(self, refresh=False):
            return {"protocols": {"static": {"route": {"0.0.0.0/0": {"dhcp-interface": "eth0"}}}}}

    async def allow_read(*_args, **_kwargs):
        return None

    monkeypatch.setattr(show_router, "get_session_vyos_service", lambda _req: DummyService())
    monkeypatch.setattr(show_router, "require_read_permission", allow_read)

    app = FastAPI()
    app.include_router(show_router.router)
    client = TestClient(app)

    resp = client.get("/vyos/show/gateway-summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ipv4_default"] is None
    assert any("Unable to parse active default route" in warning for warning in data["warnings"])
