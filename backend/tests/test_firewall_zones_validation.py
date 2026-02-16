from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import routers.firewall.zones as zones_router


class DummyResponse:
    def __init__(self, status: int = 200, result=None, error: str = ""):
        self.status = status
        self.result = result if result is not None else {}
        self.error = error


class DummyService:
    def __init__(self, full_config):
        self.full_config = full_config
        self.last_operations = []

    def get_full_config(self, refresh: bool = False):
        _ = refresh
        return self.full_config

    def apply_operations(self, operations):
        self.last_operations = operations
        return DummyResponse(status=200, result={"ok": True})

    def refresh_config(self):
        return None


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(zones_router.router)
    return app


def _patch_service(monkeypatch, config):
    async def allow_write(*_args, **_kwargs):
        return None

    service = DummyService(config)
    monkeypatch.setattr(zones_router, "require_write_permission", allow_write)
    monkeypatch.setattr(zones_router, "get_session_vyos_service", lambda _request: service)
    return service


def _base_config():
    return {
        "firewall": {
            "zone": {
                "WAN": {"interface": {"eth0": {}}, "default-action": "drop"},
                "LAN": {"interface": {"eth1": {}}, "default-action": "drop"},
            }
        }
    }


def test_upsert_rejects_interface_overlap_with_other_zone(monkeypatch, app):
    _patch_service(monkeypatch, _base_config())
    client = TestClient(app)

    response = client.put(
        "/vyos/firewall/zones/zone/DMZ",
        json={
            "description": "DMZ",
            "default_action": "drop",
            "interfaces": ["eth1"],
            "from_policies": [],
        },
    )

    assert response.status_code == 400
    assert "already assigned to zone 'LAN'" in response.json()["detail"]


def test_upsert_rejects_unknown_from_zone(monkeypatch, app):
    _patch_service(monkeypatch, _base_config())
    client = TestClient(app)

    response = client.put(
        "/vyos/firewall/zones/zone/LAN",
        json={
            "description": "LAN",
            "default_action": "drop",
            "interfaces": ["eth1"],
            "from_policies": [{"from_zone": "DMZ", "firewall_ruleset": "DMZ-TO-LAN"}],
        },
    )

    assert response.status_code == 400
    assert "does not exist" in response.json()["detail"]


def test_upsert_normalizes_from_zone_case_and_allows_local(monkeypatch, app):
    service = _patch_service(monkeypatch, _base_config())
    client = TestClient(app)

    response = client.put(
        "/vyos/firewall/zones/zone/LAN",
        json={
            "description": "LAN",
            "default_action": "drop",
            "interfaces": ["eth1"],
            "from_policies": [
                {"from_zone": "wan", "firewall_ruleset": "WAN-TO-LAN"},
                {"from_zone": "local", "firewall_ruleset": "LOCAL-TO-LAN"},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True

    paths = [" ".join(op.get("path", [])) for op in service.last_operations]
    assert any("firewall zone LAN from WAN firewall name WAN-TO-LAN" in path for path in paths)
    assert any("firewall zone LAN from LOCAL firewall name LOCAL-TO-LAN" in path for path in paths)


def test_upsert_rejects_duplicate_from_zone_after_canonicalization(monkeypatch, app):
    _patch_service(monkeypatch, _base_config())
    client = TestClient(app)

    response = client.put(
        "/vyos/firewall/zones/zone/LAN",
        json={
            "description": "LAN",
            "default_action": "drop",
            "interfaces": ["eth1"],
            "from_policies": [
                {"from_zone": "WAN", "firewall_ruleset": "WAN-TO-LAN"},
                {"from_zone": "wan", "firewall_ruleset": "WAN-TO-LAN-2"},
            ],
        },
    )

    assert response.status_code == 400
    assert "Duplicate from policy for zone: WAN" in response.json()["detail"]
