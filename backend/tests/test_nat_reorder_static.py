from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.nat.nat as nat_router


class DummyExecuteBatchResponse:
    def __init__(self, status: int = 200, result=None, error=None):
        self.status = status
        self.result = result
        self.error = error


class DummyService:
    def get_version(self) -> str:
        return "1.5"

    def execute_batch(self, batch):
        return DummyExecuteBatchResponse(
            status=200,
            result={"operation_count": len(batch.get_operations())},
            error=None,
        )


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(nat_router.router)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow(*_args, **_kwargs):
        return None

    monkeypatch.setattr(nat_router, "require_read_permission", allow)
    monkeypatch.setattr(nat_router, "require_write_permission", allow)


@pytest.fixture()
def mock_service(monkeypatch):
    service = DummyService()

    def service_factory(_request):
        return service

    monkeypatch.setattr(nat_router, "get_session_vyos_service", service_factory)


def test_reorder_static_nat_uses_supported_builder_methods(app, allow_permissions, mock_service):
    client = TestClient(app)

    payload = {
        "nat_type": "static",
        "rules": [
            {
                "old_number": 100,
                "new_number": 200,
                "rule_data": {
                    "description": "server-one",
                    "destination_address": "203.0.113.10",
                    "inbound_interface": "eth0",
                    "translation_address": "192.168.10.10",
                },
            }
        ],
    }

    response = client.post("/vyos/nat/reorder", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "operation_count" in (body.get("data") or {})
