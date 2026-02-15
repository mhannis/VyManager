import routers.firewall.zones as zones_router


def test_parse_zone_sets_local_zone_true_when_tag_present():
    parsed = zones_router._parse_zone(
        "LAN",
        {
            "description": "LAN zone",
            "default-action": "drop",
            "local-zone": {},
            "interface": {"eth1": {}, "eth2": {}},
            "from": {"WAN": {"firewall": {"name": "WAN-TO-LAN"}}},
        },
    )

    assert parsed.name == "LAN"
    assert parsed.local_zone is True
    assert parsed.model_dump(by_alias=True)["local-zone"] is True
    assert sorted(parsed.interfaces) == ["eth1", "eth2"]


def test_parse_zone_sets_local_zone_false_when_tag_missing():
    parsed = zones_router._parse_zone(
        "WAN",
        {
            "default-action": "drop",
            "interface": {"eth0": {}},
            "from": {},
        },
    )

    assert parsed.name == "WAN"
    assert parsed.local_zone is False
    assert parsed.model_dump(by_alias=True)["local-zone"] is False
