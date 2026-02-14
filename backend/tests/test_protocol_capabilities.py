from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.arp.arp as arp_router
import routers.ospf.ospf as ospf_router
import routers.rip.rip as rip_router
import routers.isis.isis as isis_router
import routers.igmp_proxy.igmp_proxy as igmp_proxy_router


ROUTER_MODULES = (
    arp_router,
    ospf_router,
    rip_router,
    isis_router,
    igmp_proxy_router,
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
                    }
                },
                "ospf": {"parameters": {"router-id": "1.1.1.1"}},
                "rip": {"network": {"10.0.0.0/8": {}}},
                "isis": {"interface": {"eth0": {}}},
                "igmp-proxy": {"interface": {"eth1": {"role": "upstream"}}},
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
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    for router_module in ROUTER_MODULES:
        monkeypatch.setattr(router_module, "require_read_permission", allow_read)
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
