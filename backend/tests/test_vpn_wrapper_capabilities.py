from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.vpn_rsa_keys.rsa_keys as vpn_rsa_keys_router
import routers._vpn_wrapper as vpn_wrapper_module


class DummyService:
    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return {
            "vpn": {
                "rsa-keys": {
                    "LAB-PEER": {
                        "key": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC...",
                    }
                }
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
    app.include_router(vpn_rsa_keys_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(vpn_wrapper_module, "require_read_permission", allow_read)
    monkeypatch.setattr(vpn_wrapper_module, "require_write_permission", allow_write)


@pytest.fixture()
def mock_service(monkeypatch):
    def service_factory(_request):
        return DummyService()

    monkeypatch.setattr(vpn_wrapper_module, "get_session_vyos_service", service_factory)


def test_vpn_rsa_keys_capabilities_payload(app, allow_permissions, mock_service):
    client = TestClient(app)
    response = client.get("/vyos/vpn-rsa-keys/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert payload["vpn"] == "rsa-keys"
    assert "version" in payload
    assert payload["features"]["supports_batch"] is True


def test_vpn_rsa_keys_config_payload(app, allow_permissions, mock_service):
    client = TestClient(app)
    response = client.get("/vyos/vpn-rsa-keys/config")

    assert response.status_code == 200
    payload = response.json()
    assert "vpn" in payload
    assert "LAB-PEER" in payload["vpn"]


def test_vpn_rsa_keys_batch_scope_validation(app, allow_permissions, mock_service):
    client = TestClient(app)

    response = client.post(
        "/vyos/vpn-rsa-keys/batch",
        json={"operations": ["set vpn rsa-keys LAB-PEER key ssh-rsa AAAAB3Nza"]},
    )
    assert response.status_code == 200
    assert response.json().get("success") is True

    denied = client.post(
        "/vyos/vpn-rsa-keys/batch",
        json={"operations": ["set vpn ipsec esp-group ESP128 proposal 1 encryption aes128"]},
    )
    assert denied.status_code == 400
