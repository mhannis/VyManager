import routers.system as system_router
from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_parse_cpu_temperature_prefers_cpu_related_lines():
    output = """
temp1:        +34.0 C
CPU Package:  +62.5 C
nvme:         +48.0 C
"""
    parsed = system_router._parse_cpu_temperature_output(output)
    assert parsed["cpu_temperature_celsius"] == 62.5


def test_parse_cpu_temperature_converts_fahrenheit():
    output = """
CPU Tctl: +149.0 F
"""
    parsed = system_router._parse_cpu_temperature_output(output)
    # 149 F = 65 C
    assert parsed["cpu_temperature_celsius"] == 65.0


def test_parse_cpu_temperature_falls_back_to_any_sensor():
    output = """
Board temp: +41.0 C
"""
    parsed = system_router._parse_cpu_temperature_output(output)
    assert parsed["cpu_temperature_celsius"] == 41.0


def test_parse_cpu_temperature_empty_output():
    parsed = system_router._parse_cpu_temperature_output("")
    assert parsed["cpu_temperature_celsius"] is None


def test_dashboard_summary_temperature_falls_back_to_generate_when_show_invalid(monkeypatch):
    class DummyResponse:
        def __init__(self, status: int = 200, output: str = "", error: str = ""):
            self.status = status
            self.result = {"data": output}
            self.error = error

    class DummyDevice:
        def show(self, path=None):
            if path == ["version"]:
                return DummyResponse(output="Version: VyOS 2026.02.11\n")
            if path == ["system", "uptime"]:
                return DummyResponse(output="Uptime: 1 day\n")
            if path == ["system", "cpu"]:
                return DummyResponse(output="CPU model: Demo CPU\n")
            if path == ["system", "memory"]:
                return DummyResponse(output="Total: 1G\nUsed: 512M\nFree: 512M\n")
            if path == ["sensors"]:
                return DummyResponse(status=400, error="HTTP Error 400: Invalid command: show [sensors]")
            return DummyResponse(status=400, error=f"unsupported show path: {path}")

        def generate(self, path=None):
            if path == ["sensors"]:
                return DummyResponse(
                    output=(
                        "coretemp-isa-0000\n"
                        "Package id 0:  +57.0°C  (high = +80.0°C, crit = +100.0°C)\n"
                    )
                )
            return DummyResponse(status=400, error=f"unsupported generate path: {path}")

    class DummyService:
        device = DummyDevice()

        def get_full_config(self, refresh=False):
            return {"system": {"host-name": "vyos-lab1"}}

    async def allow_read(*_args, **_kwargs):
        return None

    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: DummyService())
    monkeypatch.setattr(system_router, "require_read_permission", allow_read)

    app = FastAPI()
    app.include_router(system_router.router)
    client = TestClient(app)

    response = client.get("/vyos/system/dashboard-summary")
    assert response.status_code == 200
    payload = response.json()
    assert payload["cpu_temperature_celsius"] == 57.0
    assert payload["cpu_temperature_supported"] is True


def test_dashboard_summary_temperature_marked_unsupported_when_sensor_commands_absent(monkeypatch):
    class DummyResponse:
        def __init__(self, status: int = 200, output: str = "", error: str = ""):
            self.status = status
            self.result = {"data": output}
            self.error = error

    class DummyDevice:
        def show(self, path=None):
            if path == ["version"]:
                return DummyResponse(output="Version: VyOS 2026.02.11\n")
            if path == ["system", "uptime"]:
                return DummyResponse(output="Uptime: 1 day\n")
            if path == ["system", "cpu"]:
                return DummyResponse(output="CPU model: Demo CPU\n")
            if path == ["system", "memory"]:
                return DummyResponse(output="Total: 1G\nUsed: 512M\nFree: 512M\n")
            return DummyResponse(status=400, error=f"unsupported show path: {path}")

        def generate(self, path=None):
            return DummyResponse(status=400, error=f"unsupported generate path: {path}")

    class DummyService:
        device = DummyDevice()

        def get_full_config(self, refresh=False):
            return {"system": {"host-name": "vyos-lab1"}}

    async def allow_read(*_args, **_kwargs):
        return None

    monkeypatch.setattr(system_router, "get_session_vyos_service", lambda _req: DummyService())
    monkeypatch.setattr(system_router, "require_read_permission", allow_read)

    app = FastAPI()
    app.include_router(system_router.router)
    client = TestClient(app)

    response = client.get("/vyos/system/dashboard-summary")
    assert response.status_code == 200
    payload = response.json()
    assert payload["cpu_temperature_celsius"] is None
    assert payload["cpu_temperature_supported"] is False
