from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.dns.dns as dns_router
import routers.ssh.ssh as ssh_router
import routers.ntp.ntp as ntp_router
import routers.lldp.lldp as lldp_router
import routers.mdns.mdns as mdns_router
import routers.https_service.https_service as https_router
import routers.snmp_service.snmp_service as snmp_router
import routers.tftp_server_service.tftp_server_service as tftp_router
import routers._service_wrapper as service_wrapper_module


ROUTER_MODULES = (
    dns_router,
    ssh_router,
    ntp_router,
    lldp_router,
    mdns_router,
    https_router,
    snmp_router,
    tftp_router,
)


class DummyService:
    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return {
            "service": {
                "dns": {
                    "forwarding": {
                        "listen-address": {"192.168.1.1": {}},
                    },
                },
                "ssh": {
                    "port": "22",
                },
                "ntp": {
                    "server": {
                        "time.cloudflare.com": {},
                    },
                },
                "lldp": {
                    "interface": {
                        "eth0": {},
                    },
                },
                "mdns": {
                    "repeater": {
                        "interface": {
                            "eth1": {},
                        },
                    },
                },
                "https": {
                    "port": "443",
                },
                "snmp": {
                    "community": {
                        "public": {
                            "authorization": "ro",
                        }
                    }
                },
                "tftp-server": {
                    "directory": "/config/tftpboot",
                },
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
    app.include_router(dns_router.router)
    app.include_router(ssh_router.router)
    app.include_router(ntp_router.router)
    app.include_router(lldp_router.router)
    app.include_router(mdns_router.router)
    app.include_router(https_router.router)
    app.include_router(snmp_router.router)
    app.include_router(tftp_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(service_wrapper_module, "require_read_permission", allow_read)
    monkeypatch.setattr(service_wrapper_module, "require_write_permission", allow_write)


@pytest.fixture()
def mock_service(monkeypatch):
    def service_factory(_request):
        return DummyService()

    monkeypatch.setattr(service_wrapper_module, "get_session_vyos_service", service_factory)


@pytest.mark.parametrize(
    "path",
    [
        "/vyos/service-dns/capabilities",
        "/vyos/service-ssh/capabilities",
        "/vyos/service-ntp/capabilities",
        "/vyos/service-lldp/capabilities",
        "/vyos/service-mdns/capabilities",
        "/vyos/service-https/capabilities",
        "/vyos/service-snmp/capabilities",
        "/vyos/service-tftp-server/capabilities",
    ],
)
def test_service_wrapper_capabilities_payload(app, allow_permissions, mock_service, path):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    assert "service" in payload
    assert "version" in payload
    assert "features" in payload


@pytest.mark.parametrize(
    ("path", "expected_marker"),
    [
        ("/vyos/service-dns/config", "forwarding"),
        ("/vyos/service-ssh/config", "port"),
        ("/vyos/service-ntp/config", "server"),
        ("/vyos/service-lldp/config", "interface"),
        ("/vyos/service-mdns/config", "repeater"),
        ("/vyos/service-https/config", "port"),
        ("/vyos/service-snmp/config", "community"),
        ("/vyos/service-tftp-server/config", "directory"),
    ],
)
def test_service_wrapper_config_payload(app, allow_permissions, mock_service, path, expected_marker):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    assert "service" in payload
    assert expected_marker in payload["service"]


@pytest.mark.parametrize(
    ("path", "valid_command", "invalid_command"),
    [
        (
            "/vyos/service-dns/batch",
            "set service dns forwarding listen-address 192.168.1.1",
            "set service ssh port 2222",
        ),
        (
            "/vyos/service-ssh/batch",
            "delete service ssh",
            "set service dns forwarding system",
        ),
        (
            "/vyos/service-ntp/batch",
            "set service ntp server time.cloudflare.com",
            "set service lldp interface eth0",
        ),
        (
            "/vyos/service-lldp/batch",
            "set service lldp interface eth0",
            "set service mdns repeater interface eth1",
        ),
        (
            "/vyos/service-mdns/batch",
            "delete service mdns",
            "set service lldp interface eth0",
        ),
        (
            "/vyos/service-https/batch",
            "set service https port 443",
            "set service snmp contact ops",
        ),
        (
            "/vyos/service-snmp/batch",
            "set service snmp community public authorization ro",
            "set service https port 8443",
        ),
        (
            "/vyos/service-tftp-server/batch",
            "set service tftp-server directory /config/tftp",
            "set service snmp location dc1",
        ),
    ],
)
def test_service_wrapper_batch_scope_validation(
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
