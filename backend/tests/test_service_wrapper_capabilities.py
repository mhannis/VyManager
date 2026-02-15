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
import routers.console_server_service.console_server_service as console_server_router
import routers.salt_minion_service.salt_minion_service as salt_minion_router
import routers.suricata_service.suricata_service as suricata_router
import routers.broadcast_relay_service.broadcast_relay_service as broadcast_relay_router
import routers.config_sync_service.config_sync_service as config_sync_router
import routers.conntrack_sync_service.conntrack_sync_service as conntrack_sync_router
import routers.event_handler_service.event_handler_service as event_handler_router
import routers.router_advert_service.router_advert_service as router_advert_router
import routers.monitoring_service.monitoring_service as monitoring_router
import routers.webproxy_service.webproxy_service as webproxy_router
import routers.pppoe_server_service.pppoe_server_service as pppoe_server_router
import routers.ipoe_server_service.ipoe_server_service as ipoe_server_router
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
    console_server_router,
    salt_minion_router,
    suricata_router,
    broadcast_relay_router,
    config_sync_router,
    conntrack_sync_router,
    event_handler_router,
    router_advert_router,
    monitoring_router,
    webproxy_router,
    pppoe_server_router,
    ipoe_server_router,
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
                "console-server": {
                    "device": {
                        "ttyUSB0": {
                            "alias": "core-switch",
                        }
                    }
                },
                "salt-minion": {
                    "master": "192.168.10.5",
                },
                "suricata": {
                    "interface": {
                        "eth1": {},
                    }
                },
                "broadcast-relay": {
                    "id": {
                        "1": {
                            "port": {
                                "1900": {},
                            },
                        },
                    },
                },
                "config-sync": {
                    "mode": "load",
                    "secondary": {
                        "address": "192.0.2.20",
                    },
                },
                "conntrack-sync": {
                    "listen-address": "192.0.2.10",
                },
                "event-handler": {
                    "event": {
                        "INTERFACE_DOWN": {
                            "script": {
                                "path": "/config/scripts/if-down.sh",
                            },
                        },
                    },
                },
                "router-advert": {
                    "interface": {
                        "eth0": {
                            "prefix": {
                                "2001:db8:2::/64": {},
                            },
                        },
                    },
                },
                "monitoring": {
                    "prometheus": {
                        "node-exporter": {
                            "port": "9100",
                        },
                    },
                },
                "webproxy": {
                    "default-port": "8080",
                },
                "pppoe-server": {
                    "interface": {
                        "eth2": {},
                    },
                },
                "ipoe-server": {
                    "interface": {
                        "eth3": {},
                    },
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
    app.include_router(console_server_router.router)
    app.include_router(salt_minion_router.router)
    app.include_router(suricata_router.router)
    app.include_router(broadcast_relay_router.router)
    app.include_router(config_sync_router.router)
    app.include_router(conntrack_sync_router.router)
    app.include_router(event_handler_router.router)
    app.include_router(router_advert_router.router)
    app.include_router(monitoring_router.router)
    app.include_router(webproxy_router.router)
    app.include_router(pppoe_server_router.router)
    app.include_router(ipoe_server_router.router)
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
        "/vyos/service-console-server/capabilities",
        "/vyos/service-salt-minion/capabilities",
        "/vyos/service-suricata/capabilities",
        "/vyos/service-broadcast-relay/capabilities",
        "/vyos/service-config-sync/capabilities",
        "/vyos/service-conntrack-sync/capabilities",
        "/vyos/service-event-handler/capabilities",
        "/vyos/service-router-advert/capabilities",
        "/vyos/service-monitoring/capabilities",
        "/vyos/service-webproxy/capabilities",
        "/vyos/service-pppoe-server/capabilities",
        "/vyos/service-ipoe-server/capabilities",
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
        ("/vyos/service-console-server/config", "device"),
        ("/vyos/service-salt-minion/config", "master"),
        ("/vyos/service-suricata/config", "interface"),
        ("/vyos/service-broadcast-relay/config", "id"),
        ("/vyos/service-config-sync/config", "mode"),
        ("/vyos/service-conntrack-sync/config", "listen-address"),
        ("/vyos/service-event-handler/config", "event"),
        ("/vyos/service-router-advert/config", "interface"),
        ("/vyos/service-monitoring/config", "prometheus"),
        ("/vyos/service-webproxy/config", "default-port"),
        ("/vyos/service-pppoe-server/config", "interface"),
        ("/vyos/service-ipoe-server/config", "interface"),
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
        (
            "/vyos/service-console-server/batch",
            "set service console-server device ttyUSB0 speed 9600",
            "set service suricata interface eth1",
        ),
        (
            "/vyos/service-salt-minion/batch",
            "set service salt-minion master 192.0.2.10",
            "set service console-server device ttyUSB0 speed 9600",
        ),
        (
            "/vyos/service-suricata/batch",
            "set service suricata interface eth2",
            "set service salt-minion master 192.0.2.2",
        ),
        (
            "/vyos/service-broadcast-relay/batch",
            "set service broadcast-relay id 1 port 1900",
            "set service conntrack-sync listen-address 192.0.2.2",
        ),
        (
            "/vyos/service-config-sync/batch",
            "set service config-sync mode load",
            "set service conntrack-sync listen-address 192.0.2.10",
        ),
        (
            "/vyos/service-conntrack-sync/batch",
            "set service conntrack-sync listen-address 192.0.2.10",
            "set service broadcast-relay id 1 port 1900",
        ),
        (
            "/vyos/service-event-handler/batch",
            "set service event-handler event TEST script path /config/scripts/test.sh",
            "set service conntrack-sync listen-address 192.0.2.10",
        ),
        (
            "/vyos/service-router-advert/batch",
            "set service router-advert interface eth0 prefix 2001:db8:2::/64",
            "set service config-sync mode load",
        ),
        (
            "/vyos/service-monitoring/batch",
            "set service monitoring prometheus node-exporter port 9100",
            "set service webproxy default-port 8080",
        ),
        (
            "/vyos/service-webproxy/batch",
            "set service webproxy default-port 8080",
            "set service monitoring prometheus node-exporter port 9100",
        ),
        (
            "/vyos/service-pppoe-server/batch",
            "set service pppoe-server interface eth2",
            "set service ipoe-server interface eth3",
        ),
        (
            "/vyos/service-ipoe-server/batch",
            "set service ipoe-server interface eth3",
            "set service pppoe-server interface eth2",
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
