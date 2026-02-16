import copy

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.firewall.groups as firewall_groups_router
import routers.firewall.ipv4 as firewall_ipv4_router
import routers.firewall.ipv6 as firewall_ipv6_router
import routers.nat.nat as nat_router
from vyos_builders import FirewallGroupsBatchBuilder


ROUTER_MODULES = (
    firewall_ipv4_router,
    firewall_ipv6_router,
    firewall_groups_router,
    nat_router,
)


class DummyExecuteBatchResponse:
    def __init__(self, status: int = 200, result=None, error=None):
        self.status = status
        self.result = result
        self.error = error


class MutableDummyService:
    def __init__(self):
        self._config = {
            "firewall": {
                "ipv4": {},
                "ipv6": {},
                "group": {},
            },
            "nat": {},
        }

    def get_version(self) -> str:
        return "1.5"

    def get_full_config(self, refresh: bool = False):  # noqa: ARG002
        return copy.deepcopy(self._config)

    def create_firewall_groups_batch(self):
        return FirewallGroupsBatchBuilder(version=self.get_version())

    @staticmethod
    def _apply_set_path(root: dict, path: list[str]) -> None:
        if not path:
            return
        node = root
        for token in path[:-1]:
            child = node.get(token)
            if not isinstance(child, dict):
                child = {}
                node[token] = child
            node = child
        leaf = path[-1]
        existing = node.get(leaf)
        if not isinstance(existing, dict):
            node[leaf] = {}

    @staticmethod
    def _apply_delete_path(root: dict, path: list[str]) -> None:
        if not path:
            return
        node = root
        for token in path[:-1]:
            child = node.get(token)
            if not isinstance(child, dict):
                return
            node = child
        node.pop(path[-1], None)

    def execute_batch(self, batch):
        operations = batch.get_operations() if hasattr(batch, "get_operations") else []
        for operation in operations:
            path = operation.get("path") or []
            op = operation.get("op")
            if op == "set":
                self._apply_set_path(self._config, path)
            elif op == "delete":
                self._apply_delete_path(self._config, path)
        return DummyExecuteBatchResponse(
            status=200,
            result={"operation_count": len(operations)},
            error=None,
        )


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
    service = MutableDummyService()

    def service_factory(_request):
        return service

    for module in ROUTER_MODULES:
        monkeypatch.setattr(module, "get_session_vyos_service", service_factory)


@pytest.mark.parametrize(
    "config_endpoint,batch_endpoint,set_body,delete_body,count_key",
    [
        (
            "/vyos/firewall/ipv4/config",
            "/vyos/firewall/ipv4/batch",
            {
                "chain": "forward",
                "rule_number": 100,
                "is_custom_chain": False,
                "operations": [{"op": "set_base_chain_rule"}],
            },
            {
                "chain": "forward",
                "rule_number": 100,
                "is_custom_chain": False,
                "operations": [{"op": "delete_base_chain_rule"}],
            },
            "total_rules",
        ),
        (
            "/vyos/firewall/ipv6/config",
            "/vyos/firewall/ipv6/batch",
            {
                "chain": "forward",
                "rule_number": 200,
                "is_custom_chain": False,
                "operations": [{"op": "set_base_chain_rule"}],
            },
            {
                "chain": "forward",
                "rule_number": 200,
                "is_custom_chain": False,
                "operations": [{"op": "delete_base_chain_rule"}],
            },
            "total_rules",
        ),
        (
            "/vyos/firewall/groups/config",
            "/vyos/firewall/groups/batch",
            {
                "group_name": "LAB-NETS",
                "operations": [{"op": "set_address_group"}],
            },
            {
                "group_name": "LAB-NETS",
                "operations": [{"op": "delete_address_group"}],
            },
            "total",
        ),
        (
            "/vyos/nat/config",
            "/vyos/nat/batch",
            {
                "rule_number": 100,
                "nat_type": "source",
                "operations": [{"op": "set_source_rule"}],
            },
            {
                "rule_number": 100,
                "nat_type": "source",
                "operations": [{"op": "delete_source_rule"}],
            },
            "total",
        ),
    ],
)
def test_firewall_nat_save_apply_reload_loops(
    app,
    allow_permissions,
    mock_service,
    config_endpoint,
    batch_endpoint,
    set_body,
    delete_body,
    count_key,
):
    client = TestClient(app)

    before_response = client.get(config_endpoint, params={"refresh": "true"})
    assert before_response.status_code == 200
    before_count = int(before_response.json().get(count_key, 0))

    apply_set_response = client.post(batch_endpoint, json=set_body)
    assert apply_set_response.status_code == 200
    assert apply_set_response.json().get("success") is True

    mid_response = client.get(config_endpoint, params={"refresh": "true"})
    assert mid_response.status_code == 200
    mid_count = int(mid_response.json().get(count_key, 0))
    assert mid_count >= before_count + 1

    apply_delete_response = client.post(batch_endpoint, json=delete_body)
    assert apply_delete_response.status_code == 200
    assert apply_delete_response.json().get("success") is True

    after_response = client.get(config_endpoint, params={"refresh": "true"})
    assert after_response.status_code == 200
    after_count = int(after_response.json().get(count_key, 0))
    assert after_count == before_count
