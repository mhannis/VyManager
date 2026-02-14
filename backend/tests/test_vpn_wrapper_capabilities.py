from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.vpn_rsa_keys.rsa_keys as vpn_rsa_keys_router
import routers.vpn_l2tp.l2tp as vpn_l2tp_router
import routers._vpn_wrapper as vpn_wrapper_module


class DummyService:
    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return {
            "vpn": {
                "l2tp": {
                    "remote-access": {
                        "outside-address": "192.0.2.2",
                    }
                },
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
    app.include_router(vpn_l2tp_router.router)
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


@pytest.mark.parametrize(
    ("path", "expected_vpn"),
    [
        ("/vyos/vpn-rsa-keys/capabilities", "rsa-keys"),
        ("/vyos/vpn-l2tp/capabilities", "l2tp"),
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
