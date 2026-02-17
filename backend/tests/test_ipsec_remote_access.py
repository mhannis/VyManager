import copy

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.ipsec as ipsec_router


class DummyApplyResponse:
    def __init__(self, status=200, result=None, error=None):
        self.status = status
        self.result = result if result is not None else {"ok": True}
        self.error = error


class DummyService:
    def __init__(self):
        self.full_config = {"vpn": {"ipsec": {}}}
        self.last_operations = []

    def get_full_config(self, refresh=False):  # noqa: ARG002
        return copy.deepcopy(self.full_config)

    def apply_operations(self, operations):
        self.last_operations = copy.deepcopy(operations)
        return DummyApplyResponse(status=200)

    def refresh_config(self):
        return None


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(ipsec_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow(*_args, **_kwargs):
        return None

    monkeypatch.setattr(ipsec_router, "require_read_permission", allow)
    monkeypatch.setattr(ipsec_router, "require_write_permission", allow)


@pytest.fixture()
def service(monkeypatch):
    svc = DummyService()

    def service_factory(_request):
        return svc

    monkeypatch.setattr(ipsec_router, "get_session_vyos_service", service_factory)
    return svc


def test_get_remote_access_empty(app, allow_permissions, service):
    client = TestClient(app)

    response = client.get("/vyos/vpn/ipsec/remote-access")

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["client_dns_servers"] == []


def test_update_remote_access_local_auth(app, allow_permissions, service):
    client = TestClient(app)

    payload = {
        "enabled": True,
        "connection_method": "ikev2",
        "pool_prefix": "192.168.77.0/24",
        "server_address": "198.51.100.10",
        "authentication_mode": "local",
        "local_users": [{"username": "alice", "password": "secret123"}],
        "client_dns_servers": ["1.1.1.1"],
        "split_include_subnets": ["10.0.0.0/8"],
    }

    response = client.put("/vyos/vpn/ipsec/remote-access", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["resource"] == "remote-access"

    operation_paths = [" ".join(op["path"]) for op in service.last_operations]
    assert "vpn ipsec remote-access connection-method ikev2" in operation_paths
    assert "vpn ipsec remote-access pool prefix 192.168.77.0/24" in operation_paths
    assert "vpn ipsec remote-access server 198.51.100.10" in operation_paths
    assert "vpn ipsec remote-access authentication mode local" in operation_paths
    assert (
        "vpn ipsec remote-access authentication local-users username alice password secret123"
        in operation_paths
    )


def test_update_remote_access_requires_pool_prefix(app, allow_permissions, service):
    client = TestClient(app)

    payload = {
        "enabled": True,
        "connection_method": "ikev2",
        "server_address": "198.51.100.10",
        "authentication_mode": "local",
        "local_users": [{"username": "alice", "password": "secret123"}],
    }

    response = client.put("/vyos/vpn/ipsec/remote-access", json=payload)

    assert response.status_code == 400
    assert "pool_prefix" in response.json()["detail"]


def test_update_remote_access_radius_requires_server(app, allow_permissions, service):
    client = TestClient(app)

    payload = {
        "enabled": True,
        "connection_method": "ikev2",
        "pool_prefix": "192.168.77.0/24",
        "server_address": "198.51.100.10",
        "authentication_mode": "radius",
        "radius_servers": [],
    }

    response = client.put("/vyos/vpn/ipsec/remote-access", json=payload)

    assert response.status_code == 400
    assert "RADIUS server" in response.json()["detail"]
