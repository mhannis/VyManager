from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.system as system_router


class DummyVyOSResponse:
    def __init__(self, status: int = 200, error: str = "", result: object | None = None):
        self.status = status
        self.error = error
        self.result = result if result is not None else {"data": ""}


class DummyService:
    def __init__(self, full_config: dict):
        self._full_config = full_config
        self.device = self.DummyDevice(self)

    def get_full_config(self, refresh: bool = False):
        return self._full_config

    def apply_operations(self, operations, **_kwargs):
        return self.device.configure_multiple_op(op_path=operations)

    class DummyDevice:
        def __init__(self, parent: "DummyService"):
            self._parent = parent
            self.configure_calls: list[list[dict]] = []

        def configure_multiple_op(self, op_path=None):
            self.configure_calls.append(op_path or [])
            return DummyVyOSResponse(status=200)

        def show(self, path=None):
            return DummyVyOSResponse(status=200, result={"data": ""})


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(system_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(system_router, "require_read_permission", allow_read)
    monkeypatch.setattr(system_router, "require_write_permission", allow_write)


def test_get_ssh_config_parses_enabled_service(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "service": {
                "ssh": {
                    "port": "2222",
                    "listen-address": {
                        "192.0.2.10": {},
                        "10.0.0.1": {},
                    },
                    "disable-password-authentication": {},
                }
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    resp = client.get("/vyos/system/ssh-config")
    assert resp.status_code == 200
    data = resp.json()

    assert data["enabled"] is True
    assert data["port"] == 2222
    assert sorted(data["listen_addresses"]) == ["10.0.0.1", "192.0.2.10"]
    assert data["disable_password_authentication"] is True


def test_update_ssh_config_emits_expected_operations(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {"ssh": {"port": "22"}}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "port": 2222,
        "listen_addresses": ["192.0.2.10"],
        "disable_password_authentication": True,
    }

    resp = client.put("/vyos/system/ssh-config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]

    assert ("service", "ssh") in op_paths
    assert ("service", "ssh", "port", "2222") in op_paths
    assert ("service", "ssh", "listen-address", "192.0.2.10") in op_paths
    assert ("service", "ssh", "disable-password-authentication") in op_paths


def test_update_system_config_emits_expected_operations(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "system": {
                "host-name": "vyos-old",
                "time-zone": "UTC",
                "domain-name": "old.local",
                "name-server": {"1.1.1.1": {}},
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "hostname": "vyos-new",
        "timezone": "America/New_York",
        "domain_name": "lab.local",
        "name_servers": ["9.9.9.9", "1.1.1.1"],
    }

    resp = client.put("/vyos/system/config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]

    assert ("system", "host-name", "vyos-new") in op_paths
    assert ("system", "time-zone", "America/New_York") in op_paths
    assert ("system", "domain-name", "lab.local") in op_paths
    assert ("system", "name-server", "9.9.9.9") in op_paths


def test_update_system_config_rejects_invalid_timezone(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"system": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "hostname": "vyos-new",
        "timezone": "America/New York",  # contains whitespace; invalid token
        "domain_name": "lab.local",
        "name_servers": ["9.9.9.9"],
    }

    resp = client.put("/vyos/system/config", json=body)
    assert resp.status_code == 400
    assert "Invalid timezone" in resp.json().get("detail", "")


def test_update_system_config_without_name_servers_preserves_existing_entries(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "system": {
                "host-name": "vyos-old",
                "time-zone": "UTC",
                "domain-name": "old.local",
                "name-server": {"1.1.1.1": {}, "9.9.9.9": {}},
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "hostname": "vyos-new",
        "timezone": "America/New_York",
        "domain_name": "lab.local",
    }

    resp = client.put("/vyos/system/config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]

    assert ("system", "host-name", "vyos-new") in op_paths
    assert ("system", "time-zone", "America/New_York") in op_paths
    assert ("system", "domain-name", "lab.local") in op_paths
    assert not any(path[:2] == ("system", "name-server") for path in op_paths)


def test_update_dns_config_emits_forwarding_and_host_override_ops(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {}, "system": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "local_domain_name": "lab.local",
        "listen_addresses": ["192.168.50.1"],
        "allow_from": ["192.168.50.0/24"],
        "name_servers": ["1.1.1.1", "9.9.9.9"],
        "use_system_name_servers": False,
        "system_name_servers": ["8.8.8.8", "resolver.lab.local"],
        "system_domain_search": ["lab.local", "corp.example.com"],
        "cache_size": 150,
        "authoritative_domains": ["lab.local", "50.168.192.in-addr.arpa"],
        "domain_overrides": [
            {
                "domain": "corp.example.com",
                "name_servers": ["10.10.10.10"],
            }
        ],
        "host_overrides": [
            {
                "hostname": "pihole.lab.local",
                "addresses": ["192.168.50.2"],
                "aliases": ["dns"],
            }
        ],
    }

    resp = client.put("/vyos/system/dns-config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]

    assert ("service", "dns", "forwarding") in op_paths
    assert ("service", "dns", "forwarding", "listen-address", "192.168.50.1") in op_paths
    assert ("service", "dns", "forwarding", "allow-from", "192.168.50.0/24") in op_paths
    assert ("service", "dns", "forwarding", "name-server", "1.1.1.1") in op_paths
    assert ("service", "dns", "forwarding", "cache-size", "150") in op_paths
    assert ("system", "name-server", "8.8.8.8") in op_paths
    assert ("system", "name-server", "resolver.lab.local") in op_paths
    assert ("system", "domain-search", "lab.local") in op_paths
    assert ("system", "domain-search", "corp.example.com") in op_paths
    assert (
        "service",
        "dns",
        "forwarding",
        "domain",
        "corp.example.com",
        "name-server",
        "10.10.10.10",
    ) in op_paths
    assert ("system", "domain-name", "lab.local") in op_paths
    assert (
        "system",
        "static-host-mapping",
        "host-name",
        "pihole.lab.local",
        "inet",
        "192.168.50.2",
    ) in op_paths


def test_update_dns_config_defaults_allow_from_when_empty(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {}, "system": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "allow_from": [],
    }

    resp = client.put("/vyos/system/dns-config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]
    assert ("service", "dns", "forwarding", "allow-from", "0.0.0.0/0") in op_paths
    assert ("service", "dns", "forwarding", "allow-from", "::/0") in op_paths


def test_update_dns_config_defaults_allow_from_when_omitted(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {}, "system": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "name_servers": ["1.1.1.1"],
    }

    resp = client.put("/vyos/system/dns-config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]
    assert ("service", "dns", "forwarding", "allow-from", "0.0.0.0/0") in op_paths
    assert ("service", "dns", "forwarding", "allow-from", "::/0") in op_paths
    assert ("service", "dns", "forwarding", "name-server", "1.1.1.1") in op_paths


def test_get_dns_config_includes_system_name_servers_and_domain_search(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "service": {
                "dns": {
                    "forwarding": {
                        "name-server": {"1.1.1.1": {}},
                    }
                }
            },
            "system": {
                "name-server": {"9.9.9.9": {}, "resolver.lab.local": {}},
                "domain-search": {"lab.local": {}, "corp.example.com": {}},
            },
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    resp = client.get("/vyos/system/dns-config")
    assert resp.status_code == 200
    data = resp.json()
    assert sorted(data["system_name_servers"]) == ["9.9.9.9", "resolver.lab.local"]
    assert sorted(data["system_domain_search"]) == ["corp.example.com", "lab.local"]


def test_update_dns_config_rejects_invalid_system_domain_search(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {}, "system": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": False,
        "system_domain_search": ["bad domain!"],
    }

    resp = client.put("/vyos/system/dns-config", json=body)
    assert resp.status_code == 400
    assert "Invalid system domain-search" in resp.json().get("detail", "")


def test_get_dynamic_dns_config_hides_password_value(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "service": {
                "dns": {
                    "dynamic": {
                        "interface": {
                            "eth0": {
                                "service": {
                                    "duckdns": {
                                        "host-name": "edge.example.com",
                                        "login": "edge-user",
                                        "password": "super-secret",
                                        "server": "www.duckdns.org",
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    resp = client.get("/vyos/system/dynamic-dns-config")
    assert resp.status_code == 200
    data = resp.json()

    assert data["configured"] is True
    assert data["enabled"] is True
    assert len(data["entries"]) == 1
    assert data["entries"][0]["interface"] == "eth0"
    assert data["entries"][0]["service"] == "duckdns"
    assert data["entries"][0]["host_name"] == "edge.example.com"
    assert data["entries"][0]["login"] == "edge-user"
    assert data["entries"][0]["server"] == "www.duckdns.org"
    assert data["entries"][0]["has_password"] is True
    assert "password" not in data["entries"][0]


def test_update_dynamic_dns_preserves_existing_password_when_omitted(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "service": {
                "dns": {
                    "dynamic": {
                        "interface": {
                            "eth0": {
                                "service": {
                                    "duckdns": {
                                        "host-name": "edge.example.com",
                                        "login": "edge-user",
                                        "password": "super-secret",
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "entries": [
            {
                "interface": "eth0",
                "service": "duckdns",
                "host_name": "edge.example.com",
                "login": "edge-user",
                "server": "www.duckdns.org",
                "password": "",
            }
        ],
    }

    resp = client.put("/vyos/system/dynamic-dns-config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]

    assert ("service", "dns", "dynamic") in op_paths
    assert ("service", "dns", "dynamic", "interface", "eth0", "service", "duckdns") in op_paths
    assert (
        "service",
        "dns",
        "dynamic",
        "interface",
        "eth0",
        "service",
        "duckdns",
        "password",
        "super-secret",
    ) in op_paths


def test_update_dhcp_relay_config_emits_expected_operations(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "interfaces": ["eth2"],
        "servers": ["192.168.50.10"],
    }

    resp = client.put("/vyos/system/dhcp-relay-config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]

    assert ("service", "dhcp-relay") in op_paths
    assert ("service", "dhcp-relay", "interface", "eth2") in op_paths
    assert ("service", "dhcp-relay", "server", "192.168.50.10") in op_paths


def test_update_dynamic_dns_rejects_duplicate_interface_service(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {"dns": {}}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "entries": [
            {
                "interface": "eth0",
                "service": "duckdns",
                "host_name": "edge-a.example.com",
            },
            {
                "interface": "eth0",
                "service": "duckdns",
                "host_name": "edge-b.example.com",
            },
        ],
    }

    resp = client.put("/vyos/system/dynamic-dns-config", json=body)
    assert resp.status_code == 400
    assert "Duplicate Dynamic DNS entry" in resp.json().get("detail", "")


def test_update_dynamic_dns_disable_ignores_invalid_entry_payload(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "service": {
                "dns": {
                    "dynamic": {
                        "interface": {
                            "eth0": {"service": {"duckdns": {"password": "existing-secret"}}}
                        }
                    }
                }
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": False,
        "entries": [
            {
                "interface": "eth0 bad",
                "service": "duckdns",
                "host_name": "example.invalid",
            }
        ],
    }

    resp = client.put("/vyos/system/dynamic-dns-config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]
    assert ("service", "dns", "dynamic") in op_paths


def test_update_dhcp_relay_disable_ignores_invalid_payload(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "service": {
                "dhcp-relay": {
                    "interface": {"eth2": {}},
                    "server": {"192.168.50.10": {}},
                }
            }
        }
    )
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": False,
        "interfaces": ["eth2 bad"],
        "servers": ["not a valid token"],
    }

    resp = client.put("/vyos/system/dhcp-relay-config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"

    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]
    assert ("service", "dhcp-relay") in op_paths


def test_get_lldp_status_parses_structured_neighbors_payload(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "service": {
                "lldp": {
                    "interface": {
                        "all": {}
                    }
                }
            }
        }
    )

    def show(path=None):
        if path == ["lldp", "neighbors"]:
            return DummyVyOSResponse(
                status=200,
                result={
                    "data": [
                        {
                            "interface": "eth5",
                            "chassis-id": "00:11:22:33:44:55",
                            "port-id": "Gi1/0/1",
                            "systemName": "core-switch",
                        }
                    ]
                },
            )
        if path == ["lldp", "neighbors", "detail"]:
            return DummyVyOSResponse(status=200, result={"data": ""})
        return DummyVyOSResponse(status=200, result={"data": ""})

    service.device.show = show
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    resp = client.get("/vyos/system/lldp-status")
    assert resp.status_code == 200
    data = resp.json()

    assert data["enabled"] is True
    assert len(data["neighbors"]) == 1
    assert data["neighbors"][0]["local_interface"] == "eth5"
    assert data["neighbors"][0]["chassis_id"] == "00:11:22:33:44:55"
    assert data["neighbors"][0]["port_id"] == "Gi1/0/1"
    assert data["neighbors"][0]["system_name"] == "core-switch"
    assert not data.get("error")


def test_get_lldp_status_falls_back_to_structured_detail_payload(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "service": {
                "lldp": {
                    "interface": {
                        "all": {}
                    }
                }
            }
        }
    )

    def show(path=None):
        if path == ["lldp", "neighbors"]:
            return DummyVyOSResponse(status=200, result={"data": ""})
        if path == ["lldp", "neighbors", "detail"]:
            return DummyVyOSResponse(
                status=200,
                result={
                    "data": {
                        "eth6": {
                            "chassisId": "66:77:88:99:aa:bb",
                            "portId": "Gi1/0/2",
                            "systemName": "edge-switch",
                        }
                    }
                },
            )
        return DummyVyOSResponse(status=200, result={"data": ""})

    service.device.show = show
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    resp = client.get("/vyos/system/lldp-status")
    assert resp.status_code == 200
    data = resp.json()

    assert data["enabled"] is True
    assert len(data["neighbors"]) == 1
    assert data["neighbors"][0]["local_interface"] == "eth6"
    assert data["neighbors"][0]["chassis_id"] == "66:77:88:99:aa:bb"
    assert data["neighbors"][0]["port_id"] == "Gi1/0/2"
    assert data["neighbors"][0]["system_name"] == "edge-switch"
    assert not data.get("error")


def test_get_lldp_status_parses_json_text_neighbors_payload(monkeypatch, app, allow_permissions):
    service = DummyService(
        full_config={
            "service": {
                "lldp": {
                    "interface": {
                        "all": {}
                    }
                }
            }
        }
    )

    def show(path=None):
        if path == ["lldp", "neighbors"]:
            return DummyVyOSResponse(
                status=200,
                result={
                    "data": "{\"neighbors\":[{\"interface\":\"eth8\",\"chassis-id\":\"11:22:33:44:55:66\",\"port-id\":\"Gi1/0/8\",\"systemName\":\"agg-switch\"}]}"
                },
            )
        if path == ["lldp", "neighbors", "detail"]:
            return DummyVyOSResponse(status=200, result={"data": ""})
        return DummyVyOSResponse(status=200, result={"data": ""})

    service.device.show = show
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    resp = client.get("/vyos/system/lldp-status")
    assert resp.status_code == 200
    data = resp.json()

    assert data["enabled"] is True
    assert len(data["neighbors"]) == 1
    assert data["neighbors"][0]["local_interface"] == "eth8"
    assert data["neighbors"][0]["chassis_id"] == "11:22:33:44:55:66"
    assert data["neighbors"][0]["port_id"] == "Gi1/0/8"
    assert data["neighbors"][0]["system_name"] == "agg-switch"
    assert not data.get("error")


def test_update_dns_config_rejects_invalid_listen_address(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {}, "system": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "listen_addresses": ["192.168.50.1 bad"],
    }

    resp = client.put("/vyos/system/dns-config", json=body)
    assert resp.status_code == 400
    assert "Invalid listen address" in resp.json().get("detail", "")


def test_update_dns_config_rejects_invalid_allow_from_network(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {}, "system": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "allow_from": ["192.168.50.500/24"],
    }

    resp = client.put("/vyos/system/dns-config", json=body)
    assert resp.status_code == 400
    assert "Invalid allow-from network" in resp.json().get("detail", "")


def test_update_dns_config_rejects_invalid_name_server(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {}, "system": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "name_servers": ["resolver local!"],
    }

    resp = client.put("/vyos/system/dns-config", json=body)
    assert resp.status_code == 400
    assert "Invalid DNS name server" in resp.json().get("detail", "")


def test_update_dns_config_accepts_hostname_name_server(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {}, "system": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "name_servers": ["resolver.lab.local"],
    }

    resp = client.put("/vyos/system/dns-config", json=body)
    assert resp.status_code == 200
    assert service.device.configure_calls, "Expected configure operation call"
    operations = service.device.configure_calls[-1]
    op_paths = [tuple(op.get("path") or []) for op in operations]
    assert ("service", "dns", "forwarding", "name-server", "resolver.lab.local") in op_paths


def test_update_dns_config_rejects_invalid_local_domain_name(monkeypatch, app, allow_permissions):
    service = DummyService(full_config={"service": {}, "system": {}})
    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    body = {
        "enabled": True,
        "local_domain_name": "bad domain!",
    }

    resp = client.put("/vyos/system/dns-config", json=body)
    assert resp.status_code == 400
    assert "Invalid local domain name" in resp.json().get("detail", "")
