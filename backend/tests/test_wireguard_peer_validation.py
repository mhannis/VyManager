from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.wireguard.wireguard as wireguard_router


class DummyVyOSResponse:
    def __init__(self, status: int = 200, error: str = "", result: object | None = None):
        self.status = status
        self.error = error
        self.result = result if result is not None else {"ok": True}


class FakeBuilder:
    def __init__(self, version: str):
        self.version = version
        self.calls: list[tuple[str, tuple]] = []

    def __getattr__(self, name: str):
        def _method(*args):
            self.calls.append((name, args))
            return self

        return _method


class FakeService:
    def __init__(self, full_config: dict):
        self._full_config = full_config
        self.last_builder: FakeBuilder | None = None

    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):
        return self._full_config

    def execute_batch(self, builder: FakeBuilder) -> DummyVyOSResponse:
        self.last_builder = builder
        return DummyVyOSResponse(status=200)


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(wireguard_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(wireguard_router, "require_read_permission", allow_read)
    monkeypatch.setattr(wireguard_router, "require_write_permission", allow_write)


def _base_config() -> dict:
    return {
        "interfaces": {
            "wireguard": {
                "wg0": {
                    "peer": {
                        "peerA": {
                            "allowed-ips": ["10.0.0.2/32"],
                            "host-name": "peer-a.example.com",
                        },
                        "peerB": {
                            "allowed-ips": ["10.0.0.3/32"],
                        },
                    }
                }
            }
        }
    }


def _setup(monkeypatch, full_config: dict):
    service = FakeService(full_config)

    async def get_service(_request):
        return service

    monkeypatch.setattr(wireguard_router, "get_user_vyos_service", get_service)
    monkeypatch.setattr(wireguard_router, "WireGuardBatchBuilder", FakeBuilder)
    return service


def test_rejects_endpoint_address_and_hostname_together(monkeypatch, app, allow_permissions):
    _setup(monkeypatch, _base_config())
    client = TestClient(app)

    response = client.post(
        "/vyos/vpn/wireguard/peer/batch",
        json={
            "interface": "wg0",
            "peer": "peerC",
            "operations": [
                {"op": "set_peer_address", "value": "198.51.100.20"},
                {"op": "set_peer_host_name", "value": "vpn.example.com"},
            ],
        },
    )

    assert response.status_code == 400
    assert "both address and host-name" in response.json().get("detail", "")


def test_rejects_duplicate_allowed_ips_across_peers(monkeypatch, app, allow_permissions):
    _setup(monkeypatch, _base_config())
    client = TestClient(app)

    response = client.post(
        "/vyos/vpn/wireguard/peer/batch",
        json={
            "interface": "wg0",
            "peer": "peerC",
            "operations": [
                {"op": "set_peer_allowed_ips", "value": "10.0.0.2/32"},
            ],
        },
    )

    assert response.status_code == 400
    assert "already assigned to another peer" in response.json().get("detail", "")


def test_rejects_peer_port_without_endpoint(monkeypatch, app, allow_permissions):
    _setup(monkeypatch, _base_config())
    client = TestClient(app)

    response = client.post(
        "/vyos/vpn/wireguard/peer/batch",
        json={
            "interface": "wg0",
            "peer": "peerB",
            "operations": [
                {"op": "set_peer_port", "value": "51820"},
            ],
        },
    )

    assert response.status_code == 400
    assert "port requires an endpoint" in response.json().get("detail", "")


def test_accepts_peer_port_with_hostname_endpoint(monkeypatch, app, allow_permissions):
    service = _setup(monkeypatch, _base_config())
    client = TestClient(app)

    response = client.post(
        "/vyos/vpn/wireguard/peer/batch",
        json={
            "interface": "wg0",
            "peer": "peerA",
            "operations": [
                {"op": "set_peer_port", "value": "51820"},
            ],
        },
    )

    assert response.status_code == 200
    assert service.last_builder is not None


def test_rejects_invalid_keepalive(monkeypatch, app, allow_permissions):
    _setup(monkeypatch, _base_config())
    client = TestClient(app)

    response = client.post(
        "/vyos/vpn/wireguard/peer/batch",
        json={
            "interface": "wg0",
            "peer": "peerA",
            "operations": [
                {"op": "set_peer_persistent_keepalive", "value": "999999"},
            ],
        },
    )

    assert response.status_code == 400
    assert "Persistent keepalive" in response.json().get("detail", "")
