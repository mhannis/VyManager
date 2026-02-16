import routers.system as system_router


def test_parse_lldp_neighbors_output_table_format():
    output = """
Interface    Chassis ID          Port ID     Sys Name
eth5         00:11:22:33:44:55   Gi1/0/1     core-switch
"""

    neighbors = system_router._parse_lldp_neighbors_output(output)
    assert len(neighbors) == 1
    assert neighbors[0].local_interface == "eth5"
    assert neighbors[0].chassis_id == "00:11:22:33:44:55"
    assert neighbors[0].port_id == "Gi1/0/1"
    assert neighbors[0].system_name == "core-switch"


def test_parse_lldp_neighbors_detail_output_lldpd_style():
    output = """
----------------------------------------------------------------------------
Interface:    eth5, via: LLDP, RID: 1, Time: 0 day, 00:01:23
  Chassis:
    ChassisID:    mac 00:11:22:33:44:55
    SysName:      core-switch
    SysDescr:     Core distribution switch
  Port:
    PortID:       ifname Gi1/0/1
    PortDescr:    Uplink
----------------------------------------------------------------------------
Interface:    eth6, via: LLDP, RID: 1, Time: 0 day, 00:00:45
  Chassis:
    ChassisID:    mac 66:77:88:99:aa:bb
    SysName:      edge-switch
  Port:
    PortID:       ifname Gi1/0/2
"""

    neighbors = system_router._parse_lldp_neighbors_detail_output(output)
    assert len(neighbors) == 2

    first = neighbors[0]
    assert first.local_interface == "eth5"
    assert first.chassis_id == "mac 00:11:22:33:44:55"
    assert first.port_id == "ifname Gi1/0/1"
    assert first.port_description == "Uplink"
    assert first.system_name == "core-switch"
    assert first.system_description == "Core distribution switch"

    second = neighbors[1]
    assert second.local_interface == "eth6"
    assert second.chassis_id == "mac 66:77:88:99:aa:bb"
    assert second.port_id == "ifname Gi1/0/2"
    assert second.system_name == "edge-switch"


def test_parse_lldp_neighbors_structured_output_list():
    payload = {
        "success": True,
        "data": [
            {
                "interface": "eth5",
                "chassis-id": "00:11:22:33:44:55",
                "port-id": "Gi1/0/1",
                "sys-name": "core-switch",
                "port-description": "Uplink",
            }
        ],
    }

    neighbors = system_router._parse_lldp_neighbors_structured_output(payload)
    assert len(neighbors) == 1
    assert neighbors[0].local_interface == "eth5"
    assert neighbors[0].chassis_id == "00:11:22:33:44:55"
    assert neighbors[0].port_id == "Gi1/0/1"
    assert neighbors[0].system_name == "core-switch"
    assert neighbors[0].port_description == "Uplink"


def test_parse_lldp_neighbors_structured_output_nested_with_interface_hint():
    payload = {
        "data": {
            "eth6": {
                "chassisId": "66:77:88:99:aa:bb",
                "portId": "Gi1/0/2",
                "systemName": "edge-switch",
            }
        }
    }

    neighbors = system_router._parse_lldp_neighbors_structured_output(payload)
    assert len(neighbors) == 1
    assert neighbors[0].local_interface == "eth6"
    assert neighbors[0].chassis_id == "66:77:88:99:aa:bb"
    assert neighbors[0].port_id == "Gi1/0/2"
    assert neighbors[0].system_name == "edge-switch"
