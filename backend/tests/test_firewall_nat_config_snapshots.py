import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.firewall.groups as firewall_groups_router
import routers.firewall.ipv4 as firewall_ipv4_router
import routers.firewall.ipv6 as firewall_ipv6_router
import routers.nat.nat as nat_router


SNAPSHOT_PATH = Path(__file__).resolve().parent / "snapshots" / "firewall_nat_config_snapshots.json"

ROUTER_MODULES = (
    firewall_ipv4_router,
    firewall_ipv6_router,
    firewall_groups_router,
    nat_router,
)


class SnapshotDummyService:
    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return {
            "firewall": {
                "ipv4": {
                    "forward": {
                        "filter": {
                            "default-action": "drop",
                            "rule": {
                                "100": {},
                            },
                        }
                    }
                },
                "ipv6": {
                    "forward": {
                        "filter": {
                            "default-action": "drop",
                            "rule": {
                                "200": {},
                            },
                        }
                    }
                },
                "group": {
                    "address-group": {
                        "LAB-NETS": {
                            "address": {
                                "10.0.0.0/8": {},
                            }
                        }
                    }
                },
            },
            "nat": {
                "source": {
                    "rule": {
                        "100": {},
                    }
                }
            },
        }


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(firewall_ipv4_router.router)
    app.include_router(firewall_ipv6_router.router)
    app.include_router(firewall_groups_router.router)
    app.include_router(nat_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow(*_args, **_kwargs):
        return None

    for module in ROUTER_MODULES:
        monkeypatch.setattr(module, "require_read_permission", allow)
        monkeypatch.setattr(module, "require_write_permission", allow)


@pytest.fixture()
def mock_service(monkeypatch):
    service = SnapshotDummyService()

    def service_factory(_request):
        return service

    for module in ROUTER_MODULES:
        monkeypatch.setattr(module, "get_session_vyos_service", service_factory)


def load_snapshots():
    return json.loads(SNAPSHOT_PATH.read_text())


@pytest.mark.parametrize(
    ("endpoint", "expected_payload"),
    list(load_snapshots().items()),
)
def test_firewall_nat_config_snapshots(app, allow_permissions, mock_service, endpoint, expected_payload):
    client = TestClient(app)
    response = client.get(endpoint)
    assert response.status_code == 200
    assert response.json() == expected_payload
