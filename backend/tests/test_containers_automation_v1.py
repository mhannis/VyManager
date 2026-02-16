import ipaddress
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import pytest

import routers.containers as containers_router
from utils.ssh_exec import SshResult


class DummyVyOSResponse:
    def __init__(self, status: int = 200, error: str = "", result: object | None = None):
        self.status = status
        self.error = error
        self.result = result if result is not None else {"data": ""}


class DummyService:
    def __init__(
        self,
        hostname: str,
        full_config: dict,
        show_outputs: dict[tuple[str, ...], str] | None = None,
    ):
        self._full_config = full_config
        self._show_outputs = show_outputs or {}
        self.device = self.DummyDevice(self)

        class DummyConfig:
            def __init__(self, host: str):
                self.hostname = host

        self.config = DummyConfig(hostname)

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

            # Minimal state updates for bootstrap tests.
            for op in op_path or []:
                op_type = op.get("op")
                path = op.get("path") or []
                if not path:
                    continue

                if op_type == "set":
                    if path == ["service", "ssh"]:
                        self._parent._full_config.setdefault("service", {})["ssh"] = {}

                    if (
                        len(path) >= 9
                        and path[:8]
                        == [
                            "system",
                            "login",
                            "user",
                            "vyos",
                            "authentication",
                            "public-keys",
                            "vymanager",
                            "key",
                        ]
                    ):
                        key_value = path[8]
                        entry = (
                            self._parent._full_config.setdefault("system", {})
                            .setdefault("login", {})
                            .setdefault("user", {})
                            .setdefault("vyos", {})
                            .setdefault("authentication", {})
                            .setdefault("public-keys", {})
                            .setdefault("vymanager", {})
                        )
                        entry["key"] = key_value

                    if (
                        len(path) >= 9
                        and path[:8]
                        == [
                            "system",
                            "login",
                            "user",
                            "vyos",
                            "authentication",
                            "public-keys",
                            "vymanager",
                            "type",
                        ]
                    ):
                        type_value = path[8]
                        entry = (
                            self._parent._full_config.setdefault("system", {})
                            .setdefault("login", {})
                            .setdefault("user", {})
                            .setdefault("vyos", {})
                            .setdefault("authentication", {})
                            .setdefault("public-keys", {})
                            .setdefault("vymanager", {})
                        )
                        entry["type"] = type_value

                    if len(path) >= 4 and path[:2] == ["container", "network"]:
                        network_name = path[2]
                        network_node = (
                            self._parent._full_config.setdefault("container", {})
                            .setdefault("network", {})
                            .setdefault(network_name, {})
                        )
                        tail = path[3:]
                        if not tail:
                            continue
                        if tail[0] == "prefix" and len(tail) >= 2:
                            network_node.setdefault("prefix", {})[tail[1]] = {}
                        elif tail[0] == "description" and len(tail) >= 2:
                            network_node["description"] = tail[1]
                        elif tail[0] == "mtu" and len(tail) >= 2:
                            network_node["mtu"] = tail[1]
                        elif tail[0] == "vrf" and len(tail) >= 2:
                            network_node["vrf"] = tail[1]
                        elif tail[0] == "no-name-server":
                            network_node["no-name-server"] = {}
                elif op_type == "delete":
                    if len(path) >= 3 and path[:2] == ["container", "network"]:
                        network_name = path[2]
                        container_root = self._parent._full_config.get("container", {})
                        network_root = container_root.get("network", {})
                        if network_name in network_root and len(path) == 3:
                            del network_root[network_name]
                        elif network_name in network_root and len(path) >= 4:
                            node = network_root[network_name]
                            key = path[3]
                            node.pop(key, None)

            return DummyVyOSResponse(status=200)

        def show(self, path=None):
            key = tuple(path or [])
            payload = self._parent._show_outputs.get(key, "")
            if isinstance(payload, DummyVyOSResponse):
                return payload
            if isinstance(payload, dict):
                return DummyVyOSResponse(status=200, result=payload)
            return DummyVyOSResponse(status=200, result={"data": str(payload)})


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(containers_router.router)
    return app


def test_bootstrap_enables_ssh_and_installs_key(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(containers_router, "require_write_permission", allow_write)
    monkeypatch.setattr(
        containers_router,
        "ensure_ssh_keypair",
        lambda comment="vymanager": (Path("/tmp/id_ed25519"), "ssh-ed25519", "AAAATESTKEY"),
    )

    service = DummyService(hostname="192.0.2.10", full_config={})
    monkeypatch.setattr(containers_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    resp = client.post("/vyos/containers/bootstrap")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ssh_enabled"] is True
    assert data["ssh_key_installed"] is True
    assert data["ssh_key_identifier"] == "vymanager"
    assert service.device.configure_calls, "Expected bootstrap to write config operations"


def test_install_pulls_image_creates_dirs_and_commits_config(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(containers_router, "require_write_permission", allow_write)
    monkeypatch.setattr(
        containers_router,
        "ensure_ssh_keypair",
        lambda comment="vymanager": (Path("/tmp/id_ed25519"), "ssh-ed25519", "AAAATESTKEY"),
    )

    full_config = {
        "service": {"ssh": {}},
        "system": {
            "login": {
                "user": {
                    "vyos": {
                        "authentication": {
                            "public-keys": {"vymanager": {"key": "AAAATESTKEY", "type": "ssh-ed25519"}}
                        }
                    }
                }
            }
        },
    }
    service = DummyService(hostname="192.0.2.10", full_config=full_config)
    monkeypatch.setattr(containers_router, "get_session_vyos_service", lambda _req: service)

    mkdir_calls: list[tuple[str, list[str]]] = []
    pull_calls: list[tuple[str, str]] = []

    monkeypatch.setattr(
        containers_router,
        "ssh_mkdir_p",
        lambda host, paths, prefix="/config/containers/": mkdir_calls.append((host, paths))
        or SshResult(host=host, command="mkdir", exit_code=0, stdout="", stderr=""),
    )
    monkeypatch.setattr(
        containers_router,
        "ssh_pull_container_image",
        lambda host, image: pull_calls.append((host, image))
        or SshResult(host=host, command="pull", exit_code=0, stdout="pulled", stderr=""),
    )

    async def fake_overview(_request, refresh: bool = False):
        container = containers_router.ContainerSummary(
            name="pihole",
            image="pihole/pihole:latest",
            enabled=True,
            allow_host_networks=False,
            environment=[],
            ports=[
                containers_router.ContainerPortMapping(
                    name="web", source=8081, destination=80, protocol="tcp"
                )
            ],
            volumes=[],
            links=[],
        )
        overview = containers_router.ContainersOverviewResponse(
            connection_host="192.0.2.10",
            configured_total=1,
            active_total=1,
            containers=[container],
        )
        return service, overview

    monkeypatch.setattr(containers_router, "_load_container_overview", fake_overview)

    client = TestClient(app)
    body = {
        "image": "pihole/pihole:latest",
        "description": "Pi-hole",
        "entrypoint": None,
        "command": None,
        "arguments": None,
        "host_name": "pihole",
        "restart": "always",
        "enabled": True,
        "allow_host_networks": False,
        "network": None,
        "network_address": None,
        "environment": [{"key": "TZ", "value": "UTC"}],
        "ports": [{"name": "web", "source": 8081, "destination": 80, "protocol": "tcp"}],
        "volumes": [
            {
                "name": "etc-pihole",
                "source": "/config/containers/pihole/etc-pihole",
                "destination": "/etc/pihole",
                "mode": "rw",
            }
        ],
    }

    resp = client.post("/vyos/containers/pihole/install", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["image_pulled"] is True
    assert "/config/containers/pihole/etc-pihole" in data["created_volume_paths"]
    assert mkdir_calls == [("192.0.2.10", ["/config/containers/pihole/etc-pihole"])]
    assert pull_calls == [("192.0.2.10", "pihole/pihole:latest")]
    assert service.device.configure_calls, "Expected install to commit container configuration"


def test_bootstrap_allows_network_setup_without_ssh_automation(monkeypatch, app):
    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(containers_router, "require_write_permission", allow_write)

    def _should_not_run(*_args, **_kwargs):
        raise AssertionError("ensure_ssh_keypair should not run when enable_automation=false")

    monkeypatch.setattr(containers_router, "ensure_ssh_keypair", _should_not_run)

    service = DummyService(hostname="192.0.2.20", full_config={})
    monkeypatch.setattr(containers_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    payload = {
        "enable_automation": False,
        "create_default_network": True,
        "network_name": "containers-lan",
        "network_prefix": "172.20.20.0/24",
        "network_description": "Container services network",
        "network_mtu": 1500,
        "network_vrf": "main",
        "disable_network_dns": True,
    }

    resp = client.post("/vyos/containers/bootstrap", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["ssh_enabled"] is False
    assert data["ssh_key_installed"] is False
    assert data["network_count"] == 1
    assert len(data["networks"]) == 1
    assert data["networks"][0]["name"] == "containers-lan"
    assert data["networks"][0]["prefixes"] == ["172.20.20.0/24"]
    assert data["networks"][0]["description"] == "Container services network"
    assert data["networks"][0]["mtu"] == 1500
    assert data["networks"][0]["vrf"] == "main"
    assert data["networks"][0]["dns_disabled"] is True


def test_build_container_set_operations_includes_advanced_fields():
    body = containers_router.ContainerUpsertRequest(
        image="ghcr.io/example/app:1.0",
        description="Example",
        enabled=True,
        allow_host_networks=False,
        allow_host_pid=True,
        network="containers-lan",
        network_address="172.20.20.10",
        name_servers=["1.1.1.1", "9.9.9.9"],
        uid=1000,
        gid=1000,
        cpu_quota=50000,
        memory=512,
        capabilities=["NET_ADMIN"],
        tmpfs=[containers_router.ContainerTmpfsMapping(name="cache", destination="/tmp/cache", size_mb=64)],
        devices=[
            containers_router.ContainerDeviceMapping(
                name="tun",
                source="/dev/net/tun",
                destination="/dev/net/tun",
            )
        ],
        sysctls=[containers_router.ContainerKeyValue(key="net.ipv4.ip_forward", value="1")],
        labels=[containers_router.ContainerKeyValue(key="com.example.role", value="dns")],
        health_check_enabled=True,
        health_check_command="/usr/bin/healthcheck",
        health_check_interval="30s",
        health_check_timeout="5s",
        health_check_retries=3,
        log_driver="journald",
        environment=[],
        ports=[],
        volumes=[],
    )

    operations = containers_router._build_container_set_operations(
        name="example",
        body=body,
        replace_existing=False,
    )
    set_paths = {tuple(op["path"]) for op in operations if op.get("op") == "set"}

    assert ("container", "name", "example", "allow-host-pid") in set_paths
    assert ("container", "name", "example", "name-server", "1.1.1.1") in set_paths
    assert ("container", "name", "example", "uid", "1000") in set_paths
    assert ("container", "name", "example", "gid", "1000") in set_paths
    assert ("container", "name", "example", "cpu-quota", "50000") in set_paths
    assert ("container", "name", "example", "memory", "512") in set_paths
    assert ("container", "name", "example", "capability", "NET_ADMIN") in set_paths
    assert (
        "container",
        "name",
        "example",
        "tmpfs",
        "cache",
        "destination",
        "/tmp/cache",
    ) in set_paths
    assert (
        "container",
        "name",
        "example",
        "tmpfs",
        "cache",
        "size",
        "64",
    ) in set_paths
    assert (
        "container",
        "name",
        "example",
        "device",
        "tun",
        "source",
        "/dev/net/tun",
    ) in set_paths
    assert (
        "container",
        "name",
        "example",
        "sysctl",
        "parameter",
        "net.ipv4.ip_forward",
        "value",
        "1",
    ) in set_paths
    assert (
        "container",
        "name",
        "example",
        "label",
        "com.example.role",
        "value",
        "dns",
    ) in set_paths
    assert ("container", "name", "example", "health-check") in set_paths
    assert (
        "container",
        "name",
        "example",
        "health-check",
        "command",
        "/usr/bin/healthcheck",
    ) in set_paths
    assert ("container", "name", "example", "log-driver", "journald") in set_paths


def test_parse_container_from_config_reads_advanced_fields():
    raw = {
        "image": "ghcr.io/example/app:1.0",
        "allow-host-pid": {},
        "name-server": {"1.1.1.1": {}, "9.9.9.9": {}},
        "uid": "1000",
        "gid": "1000",
        "cpu-quota": "50000",
        "memory": "512",
        "capability": {"NET_ADMIN": {}},
        "tmpfs": {
            "cache": {
                "destination": "/tmp/cache",
                "size": "64",
            }
        },
        "device": {
            "tun": {
                "source": "/dev/net/tun",
                "destination": "/dev/net/tun",
            }
        },
        "sysctl": {
            "parameter": {
                "net.ipv4.ip_forward": {"value": "1"},
            }
        },
        "label": {
            "com.example.role": {"value": "dns"},
        },
        "health-check": {
            "command": "/usr/bin/healthcheck",
            "interval": "30s",
            "timeout": "5s",
            "retries": "3",
        },
        "log-driver": "journald",
    }

    summary = containers_router._parse_container_from_config("example", raw)
    assert summary.allow_host_pid is True
    assert summary.name_servers == ["1.1.1.1", "9.9.9.9"]
    assert summary.uid == 1000
    assert summary.gid == 1000
    assert summary.cpu_quota == 50000
    assert summary.memory == 512
    assert summary.capabilities == ["NET_ADMIN"]
    assert len(summary.tmpfs) == 1
    assert summary.tmpfs[0].name == "cache"
    assert summary.tmpfs[0].destination == "/tmp/cache"
    assert summary.tmpfs[0].size_mb == 64
    assert len(summary.devices) == 1
    assert summary.devices[0].name == "tun"
    assert summary.devices[0].source == "/dev/net/tun"
    assert summary.devices[0].destination == "/dev/net/tun"
    assert summary.sysctls == [containers_router.ContainerKeyValue(key="net.ipv4.ip_forward", value="1")]
    assert summary.labels == [containers_router.ContainerKeyValue(key="com.example.role", value="dns")]
    assert summary.health_check_enabled is True
    assert summary.health_check_command == "/usr/bin/healthcheck"
    assert summary.health_check_interval == "30s"
    assert summary.health_check_timeout == "5s"
    assert summary.health_check_retries == 3
    assert summary.log_driver == "journald"


def test_get_container_images_merges_runtime_and_configured(monkeypatch, app):
    async def allow_read(*_args, **_kwargs):
        return None

    monkeypatch.setattr(containers_router, "require_read_permission", allow_read)

    full_config = {
        "container": {
            "name": {
                "pihole": {"image": "pihole/pihole:latest"},
                "grafana": {"image": "grafana/grafana:latest"},
            }
        }
    }
    service = DummyService(
        hostname="192.0.2.10",
        full_config=full_config,
        show_outputs={
            ("container", "image"): "pihole/pihole:latest\nquay.io/prom/node-exporter:latest\n",
        },
    )
    monkeypatch.setattr(containers_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    resp = client.get("/vyos/containers/images?refresh=true")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured_images"] == ["grafana/grafana:latest", "pihole/pihole:latest"]

    runtime_map = {entry["reference"]: entry["source"] for entry in data["runtime_images"]}
    assert runtime_map["pihole/pihole:latest"] == "runtime"
    assert runtime_map["quay.io/prom/node-exporter:latest"] == "runtime"
    assert runtime_map["grafana/grafana:latest"] == "configured"


def test_get_container_registries_returns_summary(monkeypatch, app):
    async def allow_read(*_args, **_kwargs):
        return None

    monkeypatch.setattr(containers_router, "require_read_permission", allow_read)

    full_config = {
        "container": {
            "registry": {
                "docker.io": {
                    "insecure": {},
                    "authentication": {"username": "robot", "password": "secret"},
                    "mirror": {"host-name": "cache.local", "port": "5443"},
                },
                "quay.io": {
                    "disable": {},
                },
            }
        }
    }
    service = DummyService(hostname="192.0.2.10", full_config=full_config)
    monkeypatch.setattr(containers_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    resp = client.get("/vyos/containers/registries?refresh=true")
    assert resp.status_code == 200
    data = resp.json()
    registry_map = {entry["name"]: entry for entry in data}

    assert registry_map["docker.io"]["enabled"] is True
    assert registry_map["docker.io"]["insecure"] is True
    assert registry_map["docker.io"]["username"] == "robot"
    assert registry_map["docker.io"]["password_set"] is True
    assert registry_map["docker.io"]["mirror"]["host_name"] == "cache.local"
    assert registry_map["docker.io"]["mirror"]["port"] == 5443

    assert registry_map["quay.io"]["enabled"] is False
    assert registry_map["quay.io"]["insecure"] is False


def test_validate_container_network_prefixes_rejects_overlap():
    existing = {
        "containers-lan": containers_router.ContainerNetworkSummary(
            name="containers-lan",
            description=None,
            prefixes=["172.20.20.0/24"],
            mtu=None,
            vrf=None,
            dns_disabled=False,
        )
    }

    with pytest.raises(HTTPException) as exc:
        containers_router._validate_container_network_prefixes_or_400(
            "apps",
            ["172.20.20.128/25"],
            existing,
        )

    assert exc.value.status_code == 400
    assert "overlaps" in str(exc.value.detail)


def test_validate_container_network_attachments_rejects_out_of_subnet_address():
    with pytest.raises(HTTPException) as exc:
        containers_router._validate_container_network_attachments_or_400(
            [containers_router.ContainerNetworkAttachment(name="containers-lan", address="10.0.0.10")],
            {"containers-lan": [ipaddress.ip_network("172.20.20.0/24")]},
        )

    assert exc.value.status_code == 400
    assert "outside" in str(exc.value.detail)


def test_validate_container_network_attachments_rejects_network_address():
    with pytest.raises(HTTPException) as exc:
        containers_router._validate_container_network_attachments_or_400(
            [containers_router.ContainerNetworkAttachment(name="containers-lan", address="172.20.20.0")],
            {"containers-lan": [ipaddress.ip_network("172.20.20.0/24")]},
        )

    assert exc.value.status_code == 400
    assert "network address" in str(exc.value.detail)


def test_validate_container_network_attachments_accepts_valid_host_address():
    containers_router._validate_container_network_attachments_or_400(
        [containers_router.ContainerNetworkAttachment(name="containers-lan", address="172.20.20.10")],
        {"containers-lan": [ipaddress.ip_network("172.20.20.0/24")]},
    )
