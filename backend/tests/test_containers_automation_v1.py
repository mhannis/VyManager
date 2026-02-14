from pathlib import Path

from fastapi import FastAPI
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
    def __init__(self, hostname: str, full_config: dict):
        self._full_config = full_config
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
                if op.get("op") != "set":
                    continue
                path = op.get("path") or []
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

            return DummyVyOSResponse(status=200)

        def show(self, path=None):
            # Not used by these tests (overview is patched for install).
            return DummyVyOSResponse(status=200, result={"data": ""})


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
