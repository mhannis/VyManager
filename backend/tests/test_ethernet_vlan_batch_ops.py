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

    def is_empty(self) -> bool:
        return len(self._operations) == 0

    def get_operations(self) -> list[dict]:
        return self._operations

    def delete_vif_s(self, interface: str, vlan_id: str):
        self._operations.append(
            {
                "op": "delete",
                "path": ["interfaces", "ethernet", interface, "vif-s", vlan_id],
            }
        )
        return self

    def delete_vif_c(self, interface: str, s_vlan_id: str, c_vlan_id: str):
        self._operations.append(
            {
                "op": "delete",
                "path": ["interfaces", "ethernet", interface, "vif-s", s_vlan_id, "vif-c", c_vlan_id],
            }
        )
        return self


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


def test_batch_delete_vif_s_operation(monkeypatch, app, allow_permissions):
    service = FakeService()
    monkeypatch.setattr(ethernet_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/ethernet/batch",
        json={
            "interface": "eth2",
            "operations": [{"op": "delete_vif_s", "value": "100"}],
        },
    )

    assert response.status_code == 200
    assert service.last_batch is not None
    assert service.last_batch.get_operations() == [
        {
            "op": "delete",
            "path": ["interfaces", "ethernet", "eth2", "vif-s", "100"],
        }
    ]


def test_batch_delete_vif_c_operation(monkeypatch, app, allow_permissions):
    service = FakeService()
    monkeypatch.setattr(ethernet_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/ethernet/batch",
        json={
            "interface": "eth2",
            "operations": [{"op": "delete_vif_c", "value": "100,200"}],
        },
    )

    assert response.status_code == 200
    assert service.last_batch is not None
    assert service.last_batch.get_operations() == [
        {
            "op": "delete",
            "path": ["interfaces", "ethernet", "eth2", "vif-s", "100", "vif-c", "200"],
        }
    ]


def test_batch_delete_vif_c_rejects_invalid_payload(monkeypatch, app, allow_permissions):
    service = FakeService()
    monkeypatch.setattr(ethernet_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.post(
        "/vyos/ethernet/batch",
        json={
            "interface": "eth2",
            "operations": [{"op": "delete_vif_c", "value": "100"}],
        },
    )

    assert response.status_code == 400
    assert "value must be 's_vlan,c_vlan'" in response.json().get("detail", "")
