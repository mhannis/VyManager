from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.interfaces.ethernet as ethernet_router


class DummyVyOSResponse:
    def __init__(self, status: int = 200, error: str = "", result: object | None = None):
        self.status = status
        self.error = error
        self.result = result if result is not None else {"ok": True}


class FakeBatch:
    def __init__(self):
        self._operations: list[dict] = []

    def get_operations(self) -> list[dict]:
        return self._operations

    def is_empty(self) -> bool:
        return len(self._operations) == 0

    def _add_set(self, path: list[str]):
        self._operations.append({"op": "set", "path": path})
        return self

    def _add_delete(self, path: list[str]):
        self._operations.append({"op": "delete", "path": path})
        return self

    def set_dhcp_options_reject(self, interface: str, value: str):
        return self._add_set(["interfaces", "ethernet", interface, "dhcp-options", "reject", value])

    def delete_dhcp_options_reject(self, interface: str, value: str):
        return self._add_delete(["interfaces", "ethernet", interface, "dhcp-options", "reject", value])

    def set_dhcp_options_no_default_route(self, interface: str):
        return self._add_set(["interfaces", "ethernet", interface, "dhcp-options", "no-default-route"])

    def delete_dhcp_options_no_default_route(self, interface: str):
        return self._add_delete(["interfaces", "ethernet", interface, "dhcp-options", "no-default-route"])

    def set_ipv6_address_autoconf(self, interface: str):
        return self._add_set(["interfaces", "ethernet", interface, "ipv6", "address", "autoconf"])

    def delete_ipv6_address_autoconf(self, interface: str):
        return self._add_delete(["interfaces", "ethernet", interface, "ipv6", "address", "autoconf"])

    def set_ipv6_accept_dad(self, interface: str, mode: str):
        return self._add_set(["interfaces", "ethernet", interface, "ipv6", "accept-dad", mode])

    def set_dhcpv6_options_no_release(self, interface: str):
        return self._add_set(["interfaces", "ethernet", interface, "dhcpv6-options", "no-release"])

    def delete_dhcpv6_options_no_release(self, interface: str):
        return self._add_delete(["interfaces", "ethernet", interface, "dhcpv6-options", "no-release"])


class FakeService:
    def __init__(self):
        self.last_batch: FakeBatch | None = None

    def create_ethernet_batch(self) -> FakeBatch:
        return FakeBatch()

    def execute_batch(self, batch: FakeBatch) -> DummyVyOSResponse:
        self.last_batch = batch
        return DummyVyOSResponse(status=200)


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(ethernet_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    async def allow_write(*_args, **_kwargs):
        return None

    monkeypatch.setattr(ethernet_router, "require_read_permission", allow_read)
    monkeypatch.setattr(ethernet_router, "require_write_permission", allow_write)


def test_set_dhcp_reject_route(monkeypatch, app, allow_permissions):
    service = FakeService()
    monkeypatch.setattr(ethernet_router, "get_session_vyos_service", lambda _req: service)

    response = TestClient(app).post(
        "/vyos/ethernet/batch",
        json={
            "interface": "eth1",
            "operations": [{"op": "set_dhcp_options_reject", "value": "198.51.100.1/32"}],
        },
    )

    assert response.status_code == 200
    assert service.last_batch is not None
    assert service.last_batch.get_operations() == [
        {
            "op": "set",
            "path": ["interfaces", "ethernet", "eth1", "dhcp-options", "reject", "198.51.100.1/32"],
        }
    ]


def test_set_dhcp_no_default_route_false_maps_to_delete(monkeypatch, app, allow_permissions):
    service = FakeService()
    monkeypatch.setattr(ethernet_router, "get_session_vyos_service", lambda _req: service)

    response = TestClient(app).post(
        "/vyos/ethernet/batch",
        json={
            "interface": "eth1",
            "operations": [{"op": "set_dhcp_options_no_default_route", "value": "false"}],
        },
    )

    assert response.status_code == 200
    assert service.last_batch is not None
    assert service.last_batch.get_operations() == [
        {
            "op": "delete",
            "path": ["interfaces", "ethernet", "eth1", "dhcp-options", "no-default-route"],
        }
    ]


def test_set_ipv6_autoconf_false_maps_to_delete(monkeypatch, app, allow_permissions):
    service = FakeService()
    monkeypatch.setattr(ethernet_router, "get_session_vyos_service", lambda _req: service)

    response = TestClient(app).post(
        "/vyos/ethernet/batch",
        json={
            "interface": "eth2",
            "operations": [{"op": "set_ipv6_address_autoconf", "value": "false"}],
        },
    )

    assert response.status_code == 200
    assert service.last_batch is not None
    assert service.last_batch.get_operations() == [
        {
            "op": "delete",
            "path": ["interfaces", "ethernet", "eth2", "ipv6", "address", "autoconf"],
        }
    ]


def test_set_ipv6_accept_dad_requires_value(monkeypatch, app, allow_permissions):
    service = FakeService()
    monkeypatch.setattr(ethernet_router, "get_session_vyos_service", lambda _req: service)

    response = TestClient(app).post(
        "/vyos/ethernet/batch",
        json={
            "interface": "eth2",
            "operations": [{"op": "set_ipv6_accept_dad"}],
        },
    )

    assert response.status_code == 400
    assert "requires a value" in response.json().get("detail", "")


def test_set_ipv6_accept_dad_with_value(monkeypatch, app, allow_permissions):
    service = FakeService()
    monkeypatch.setattr(ethernet_router, "get_session_vyos_service", lambda _req: service)

    response = TestClient(app).post(
        "/vyos/ethernet/batch",
        json={
            "interface": "eth2",
            "operations": [{"op": "set_ipv6_accept_dad", "value": "2"}],
        },
    )

    assert response.status_code == 200
    assert service.last_batch is not None
    assert service.last_batch.get_operations() == [
        {
            "op": "set",
            "path": ["interfaces", "ethernet", "eth2", "ipv6", "accept-dad", "2"],
        }
    ]


def test_set_dhcpv6_no_release_false_maps_to_delete(monkeypatch, app, allow_permissions):
    service = FakeService()
    monkeypatch.setattr(ethernet_router, "get_session_vyos_service", lambda _req: service)

    response = TestClient(app).post(
        "/vyos/ethernet/batch",
        json={
            "interface": "eth3",
            "operations": [{"op": "set_dhcpv6_options_no_release", "value": "false"}],
        },
    )

    assert response.status_code == 200
    assert service.last_batch is not None
    assert service.last_batch.get_operations() == [
        {
            "op": "delete",
            "path": ["interfaces", "ethernet", "eth3", "dhcpv6-options", "no-release"],
        }
    ]
