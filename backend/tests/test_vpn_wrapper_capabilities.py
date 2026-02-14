from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers._vpn_wrapper as vpn_wrapper_module
import routers.dmvpn.dmvpn as vpn_dmvpn_router
import routers.vpn.vpn as vpn_overview_router
import routers.vpn_l2tp.l2tp as vpn_l2tp_router
import routers.vpn_openconnect.openconnect as vpn_openconnect_router
import routers.vpn_pptp.pptp as vpn_pptp_router
import routers.vpn_rsa_keys.rsa_keys as vpn_rsa_keys_router
import routers.vpn_sstp.sstp as vpn_sstp_router


class DummyService:
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
                "nhrp": {
                    "tunnel": {
                        "tun100": {
                            "network-id": "1",
                            "shortcut": {},
                        }
                    }
                }
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
                            "local": {"password": {}},
                        }
                    }
                },
                "pptp": {
                    "remote-access": {
                        "default-pool": "PPTP-POOL",
                    }
                },
                "rsa-keys": {
                    "LAB-PEER": {
                        "key": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC...",
                    }
                },
                "sstp": {
                    "authentication": {
                        "mode": "local",
                    }
                },
                "ipsec": {
                    "profile": {
                        "NHRPVPN": {
                            "bind": {"tunnel": "tun100"},
                        }
                    }
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
    app.include_router(vpn_overview_router.router)
    app.include_router(vpn_rsa_keys_router.router)
    app.include_router(vpn_l2tp_router.router)
    app.include_router(vpn_openconnect_router.router)
    app.include_router(vpn_pptp_router.router)
    app.include_router(vpn_sstp_router.router)
    app.include_router(vpn_dmvpn_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(vpn_wrapper_module, "require_read_permission", allow_read)
    monkeypatch.setattr(vpn_wrapper_module, "require_write_permission", allow_write)
    monkeypatch.setattr(vpn_overview_router, "require_read_permission", allow_read)
    monkeypatch.setattr(vpn_dmvpn_router, "require_read_permission", allow_read)
    monkeypatch.setattr(vpn_dmvpn_router, "require_write_permission", allow_write)


@pytest.fixture()
def mock_service(monkeypatch):
    def service_factory(_request):
        return DummyService()

    monkeypatch.setattr(vpn_wrapper_module, "get_session_vyos_service", service_factory)
    monkeypatch.setattr(vpn_overview_router, "get_session_vyos_service", service_factory)
    monkeypatch.setattr(vpn_dmvpn_router, "get_session_vyos_service", service_factory)


@pytest.mark.parametrize(
    ("path", "expected_vpn"),
    [
        ("/vyos/vpn-rsa-keys/capabilities", "rsa-keys"),
        ("/vyos/vpn-l2tp/capabilities", "l2tp"),
        ("/vyos/vpn-openconnect/capabilities", "openconnect"),
        ("/vyos/vpn-pptp/capabilities", "pptp"),
        ("/vyos/vpn-sstp/capabilities", "sstp"),
    ],
)
def test_vpn_capabilities_payload(app, allow_permissions, mock_service, path, expected_vpn):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    assert payload["vpn"] == expected_vpn
    assert "version" in payload
    assert payload["features"]["supports_batch"] is True


@pytest.mark.parametrize(
    ("path", "expected_marker"),
    [
        ("/vyos/vpn-rsa-keys/config", "LAB-PEER"),
        ("/vyos/vpn-l2tp/config", "remote-access"),
        ("/vyos/vpn-openconnect/config", "authentication"),
        ("/vyos/vpn-pptp/config", "remote-access"),
        ("/vyos/vpn-sstp/config", "authentication"),
    ],
)
def test_vpn_config_payload(app, allow_permissions, mock_service, path, expected_marker):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    assert "vpn" in payload
    assert expected_marker in payload["vpn"]


@pytest.mark.parametrize(
    ("path", "valid_command", "invalid_command"),
    [
        (
            "/vyos/vpn-rsa-keys/batch",
            "set vpn rsa-keys LAB-PEER key ssh-rsa AAAAB3Nza",
            "set vpn l2tp remote-access outside-address 192.0.2.2",
        ),
        (
            "/vyos/vpn-l2tp/batch",
            "set vpn l2tp remote-access outside-address 192.0.2.2",
            "set vpn rsa-keys LAB-PEER key ssh-rsa AAAAB3Nza",
        ),
        (
            "/vyos/vpn-openconnect/batch",
            "set vpn openconnect authentication mode radius",
            "set vpn sstp authentication mode local",
        ),
        (
            "/vyos/vpn-pptp/batch",
            "set vpn pptp remote-access authentication mode local",
            "set vpn openconnect authentication mode radius",
        ),
        (
            "/vyos/vpn-sstp/batch",
            "set vpn sstp authentication mode local",
            "set vpn pptp remote-access authentication mode local",
        ),
    ],
)
def test_vpn_batch_scope_validation(
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


def test_vpn_overview_and_capabilities(app, allow_permissions, mock_service):
    client = TestClient(app)

    capabilities = client.get("/vyos/vpn/capabilities")
    assert capabilities.status_code == 200
    assert capabilities.json()["protocol"] == "vpn"

    overview = client.get("/vyos/vpn/overview")
    assert overview.status_code == 200
    payload = overview.json()
    assert "vpn" in payload
    assert "protocols" in payload
    assert "l2tp" in payload["protocols"]


def test_dmvpn_capabilities_and_config(app, allow_permissions, mock_service):
    client = TestClient(app)

    capabilities = client.get("/vyos/vpn-dmvpn/capabilities")
    assert capabilities.status_code == 200
    assert capabilities.json()["protocol"] == "dmvpn"

    config = client.get("/vyos/vpn-dmvpn/config")
    assert config.status_code == 200
    payload = config.json()
    assert "interfaces_tunnel" in payload
    assert "nhrp_tunnel" in payload
    assert "ipsec" in payload


@pytest.mark.parametrize(
    ("valid_command", "invalid_command"),
    [
        (
            "set protocols nhrp tunnel tun100 network-id 1",
            "set vpn openconnect authentication mode radius",
        ),
        (
            "set interfaces tunnel tun100 source-interface eth0",
            "set firewall ipv4 name WAN-IN default-action drop",
        ),
        (
            "set vpn ipsec profile NHRPVPN bind tunnel tun100",
            "set vpn l2tp remote-access default-pool POOL1",
        ),
    ],
)
def test_dmvpn_scope_validation(app, allow_permissions, mock_service, valid_command, invalid_command):
    client = TestClient(app)

    response = client.post("/vyos/vpn-dmvpn/batch", json={"operations": [valid_command]})
    assert response.status_code == 200
    assert response.json().get("success") is True

    denied = client.post("/vyos/vpn-dmvpn/batch", json={"operations": [invalid_command]})
    assert denied.status_code == 400

