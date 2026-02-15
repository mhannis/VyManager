from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers._config_tree_wrapper as config_tree_wrapper_module
import routers.high_availability.high_availability as high_availability_router
import routers.load_balancing.load_balancing as load_balancing_router
import routers.pki.pki as pki_router
import routers.traffic_policy.traffic_policy as traffic_policy_router
import routers.vrf.vrf as vrf_router


class DummyService:
    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return {
            "vrf": {
                "name": {
                    "BLUE": {
                        "table": "10",
                        "description": "Internal tenant",
                    }
                }
            },
            "load-balancing": {
                "wan": {
                    "interface-health": {
                        "eth1": {
                            "nexthop": "203.0.113.1",
                        }
                    }
                }
            },
            "high-availability": {
                "vrrp": {
                    "group": {
                        "WAN": {
                            "interface": "eth0",
                            "vrid": "10",
                        }
                    }
                }
            },
            "traffic-policy": {
                "shaper": {
                    "WAN-OUT": {
                        "bandwidth": "100mbit",
                    }
                }
            },
            "pki": {
                "ca": {
                    "LAB-CA": {
                        "certificate": "-----BEGIN CERTIFICATE-----...",
                    }
                }
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
    app.include_router(vrf_router.router)
    app.include_router(load_balancing_router.router)
    app.include_router(high_availability_router.router)
    app.include_router(traffic_policy_router.router)
    app.include_router(pki_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(config_tree_wrapper_module, "require_read_permission", allow_read)
    monkeypatch.setattr(config_tree_wrapper_module, "require_write_permission", allow_write)


@pytest.fixture()
def mock_service(monkeypatch):
    def service_factory(_request):
        return DummyService()

    monkeypatch.setattr(config_tree_wrapper_module, "get_session_vyos_service", service_factory)


@pytest.mark.parametrize(
    "path",
    [
        "/vyos/vrf/capabilities",
        "/vyos/load-balancing/capabilities",
        "/vyos/high-availability/capabilities",
        "/vyos/traffic-policy/capabilities",
        "/vyos/pki/capabilities",
    ],
)
def test_config_tree_wrapper_capabilities_payload(app, allow_permissions, mock_service, path):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    assert "tree" in payload
    assert "version" in payload
    assert "features" in payload


@pytest.mark.parametrize(
    ("path", "response_key", "marker"),
    [
        ("/vyos/vrf/config", "vrf", "name"),
        ("/vyos/load-balancing/config", "load_balancing", "wan"),
        ("/vyos/high-availability/config", "high_availability", "vrrp"),
        ("/vyos/traffic-policy/config", "traffic_policy", "shaper"),
        ("/vyos/pki/config", "pki", "ca"),
    ],
)
def test_config_tree_wrapper_config_payload(
    app,
    allow_permissions,
    mock_service,
    path,
    response_key,
    marker,
):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    assert response_key in payload
    assert marker in payload[response_key]


@pytest.mark.parametrize(
    ("path", "valid_command", "invalid_command"),
    [
        (
            "/vyos/vrf/batch",
            "set vrf name BLUE table 10",
            "set load-balancing wan interface-health eth1 nexthop 203.0.113.1",
        ),
        (
            "/vyos/load-balancing/batch",
            "set load-balancing wan interface-health eth1 nexthop 203.0.113.1",
            "set vrf name BLUE table 10",
        ),
        (
            "/vyos/high-availability/batch",
            "set high-availability vrrp group WAN interface eth0",
            "set traffic-policy shaper WAN-OUT bandwidth 100mbit",
        ),
        (
            "/vyos/traffic-policy/batch",
            "set traffic-policy shaper WAN-OUT bandwidth 100mbit",
            "set high-availability vrrp group WAN vrid 10",
        ),
        (
            "/vyos/pki/batch",
            "set pki ca LAB-CA certificate -----BEGIN",
            "set traffic-policy shaper WAN-OUT bandwidth 100mbit",
        ),
    ],
)
def test_config_tree_wrapper_batch_scope_validation(
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
