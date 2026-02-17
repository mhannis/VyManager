from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

import routers.system_update_check as update_check_router


class DummyVyOSResponse:
    def __init__(self, status: int = 200, error: str = "", result: object | None = None):
        self.status = status
        self.error = error
        self.result = result if result is not None else {"data": ""}


class DummyDevice:
    def __init__(
        self,
        show_responses: list[DummyVyOSResponse] | None = None,
        generate_responses: list[DummyVyOSResponse] | None = None,
    ):
        self._show_responses = list(show_responses or [])
        self._generate_responses = list(generate_responses or [])

    def show(self, path=None):  # noqa: ARG002
        if self._show_responses:
            return self._show_responses.pop(0)
        return DummyVyOSResponse(status=400, error="Invalid command")

    def generate(self, path=None):  # noqa: ARG002
        if self._generate_responses:
            return self._generate_responses.pop(0)
        return DummyVyOSResponse(status=400, error="Invalid command")


class DummyService:
    def __init__(
        self,
        show_responses: list[DummyVyOSResponse] | None = None,
        generate_responses: list[DummyVyOSResponse] | None = None,
    ):
        self.device = DummyDevice(show_responses=show_responses, generate_responses=generate_responses)


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(update_check_router.system_update_check)
    return app


@pytest.fixture()
def allow_permissions(monkeypatch):
    async def allow_read(*_args, **_kwargs):
        return None

    monkeypatch.setattr(update_check_router, "require_read_permission", allow_read)


def test_status_reports_available_update(monkeypatch, app, allow_permissions):
    output = (
        "Current version: 1.5-rolling-202312220023\n"
        "Update available: 1.5-rolling-202312250024\n"
        "Update URL: https://dev.packages.vyos.net/\n"
    )
    service = DummyService(show_responses=[DummyVyOSResponse(status=200, result={"data": output})])
    monkeypatch.setattr(update_check_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.get("/vyos/system-update-check/status")
    assert response.status_code == 200
    payload = response.json()

    assert payload["available"] is True
    assert payload["command_used"] == "show system updates"
    assert payload["update_available"] is True
    assert payload["current_version"] == "1.5-rolling-202312220023"
    assert payload["update_version"] == "1.5-rolling-202312250024"
    assert payload["update_url"] == "https://dev.packages.vyos.net/"
    assert payload["raw_output"] == output


def test_status_reports_up_to_date(monkeypatch, app, allow_permissions):
    output = (
        "Current version: 1.5-rolling-202312250024\n"
        "No update available\n"
    )
    service = DummyService(show_responses=[DummyVyOSResponse(status=200, result={"data": output})])
    monkeypatch.setattr(update_check_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.get("/vyos/system-update-check/status")
    assert response.status_code == 200
    payload = response.json()

    assert payload["available"] is True
    assert payload["update_available"] is False
    assert "up to date" in (payload["summary"] or "").lower()


def test_status_falls_back_to_generate(monkeypatch, app, allow_permissions):
    show_fail = DummyVyOSResponse(status=400, error="Invalid command")
    generate_success = DummyVyOSResponse(
        status=200,
        result={"data": "Current version: 1.5-rolling-202401010001\nUpdate available: 1.5-rolling-202401020001\n"},
    )
    service = DummyService(
        show_responses=[show_fail, show_fail, show_fail],
        generate_responses=[generate_success],
    )
    monkeypatch.setattr(update_check_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.get("/vyos/system-update-check/status")
    assert response.status_code == 200
    payload = response.json()

    assert payload["available"] is True
    assert payload["command_used"] == "generate system updates"
    assert payload["update_available"] is True
    assert len(payload["warnings"]) >= 1


def test_status_returns_unavailable_when_all_probes_fail(monkeypatch, app, allow_permissions):
    service = DummyService()
    monkeypatch.setattr(update_check_router, "get_session_vyos_service", lambda _req: service)

    client = TestClient(app)
    response = client.get("/vyos/system-update-check/status")
    assert response.status_code == 200
    payload = response.json()

    assert payload["available"] is False
    assert payload["summary"] == "Unable to retrieve update status from this VyOS target."
    assert len(payload["warnings"]) >= 1
