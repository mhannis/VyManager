import routers.system as system_router


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
