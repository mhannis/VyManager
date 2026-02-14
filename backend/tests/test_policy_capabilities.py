from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.local_route.local_route as local_route_router
import routers.route_map.route_map as route_map_router
import routers.as_path_list.as_path_list as as_path_list_router
import routers.community_list.community_list as community_list_router
import routers.extcommunity_list.extcommunity_list as extcommunity_list_router
import routers.large_community_list.large_community_list as large_community_list_router
import utils.router_helpers as router_helpers


class DummyService:
    def get_version(self) -> str:
        return "1.5"


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(route_map_router.router)
    app.include_router(local_route_router.router)
    app.include_router(as_path_list_router.router)
    app.include_router(community_list_router.router)
    app.include_router(extcommunity_list_router.router)
    app.include_router(large_community_list_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    monkeypatch.setattr(router_helpers, "require_read_permission", allow_read)


@pytest.fixture()
def mock_service(monkeypatch):
    monkeypatch.setattr(router_helpers, "get_session_vyos_service", lambda _req: DummyService())


def test_route_map_capabilities_loads_successfully(app, allow_permissions, mock_service):
    client = TestClient(app)
    response = client.get("/vyos/route-map/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("version") == "1.5"
    assert "features" in payload


def test_local_route_capabilities_loads_successfully(app, allow_permissions, mock_service):
    client = TestClient(app)
    response = client.get("/vyos/local-route/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("version") == "1.5"
    assert "features" in payload


@pytest.mark.parametrize(
    ("path", "expected_key"),
    [
        ("/vyos/as-path-list/capabilities", "features"),
        ("/vyos/community-list/capabilities", "features"),
        ("/vyos/extcommunity-list/capabilities", "features"),
        ("/vyos/large-community-list/capabilities", "features"),
    ],
)
def test_bgp_policy_capability_endpoints_load_successfully(
    app,
    allow_permissions,
    mock_service,
    path,
    expected_key,
):
    client = TestClient(app)
    response = client.get(path)

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("version") == "1.5"
    assert expected_key in payload
