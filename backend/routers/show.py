"""
Show Operations Router

API endpoints for VyOS show commands (interface counters, system info, etc.).
Uses session-based architecture - VyOS instance comes from user's active session.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Callable, Tuple
import logging
import re
import threading

from session_vyos_service import get_session_vyos_service
from fastapi_permissions import require_write_permission
from rbac_permissions import FeatureGroup
from vyos_service import VyOSDeviceConfig, VyOSService

router = APIRouter(prefix="/vyos/show", tags=["show"])
logger = logging.getLogger(__name__)


# ========================================================================
# Pydantic Models
# ========================================================================


class InterfaceCounter(BaseModel):
    """Model for interface counter statistics."""
    interface: str
    rx_packets: int
    rx_bytes: int
    tx_packets: int
    tx_bytes: int
    rx_dropped: int
    tx_dropped: int
    rx_errors: int
    tx_errors: int


class InterfaceCountersResponse(BaseModel):
    """Response containing interface counter data."""
    interfaces: List[InterfaceCounter]
    total: int


class InterfacePhysical(BaseModel):
    """Model for interface physical/operational details."""
    interface: str
    nic_model: Optional[str] = None
    driver: Optional[str] = None
    firmware_version: Optional[str] = None
    bus_info: Optional[str] = None
    speed: Optional[str] = None
    duplex: Optional[str] = None
    auto_negotiation: Optional[str] = None
    link_up: Optional[bool] = None


class InterfacePhysicalResponse(BaseModel):
    """Response containing interface physical/operational details."""
    interfaces: List[InterfacePhysical]
    total: int


class InterfaceBlinkRequest(BaseModel):
    """Request model for interface LED identify/blink."""
    interface: str
    duration_seconds: int = 5


class InterfaceBlinkResponse(BaseModel):
    """Response for interface LED identify/blink action."""
    success: bool
    interface: str
    duration_seconds: int
    method: str
    output: Optional[str] = None


BlinkAttempt = Tuple[str, int, Callable[[], Any]]


# ========================================================================
# Helper: Parse Interface Counters
# ========================================================================


def parse_interface_counters(output: str) -> List[InterfaceCounter]:
    """
    Parse VyOS 'show interface counters' output into structured data.
    
    Example output:
    Interface    Rx Packets    Rx Bytes      Tx Packets    Tx Bytes      Rx Dropped    Tx Dropped    Rx Errors    Tx Errors
    -----------  ------------  ------------  ------------  ------------  ------------  ------------  -----------  -----------
    eth0         270118073     394898880459  116821247     124641177808  0             0             0            0
    """
    interfaces = []
    
    if not output or not isinstance(output, str):
        return interfaces
    
    lines = output.strip().split('\n')
    
    # Skip header lines (first 2 lines)
    for line in lines[2:]:
        # Split by whitespace
        parts = line.split()
        
        if len(parts) >= 9:
            try:
                interface = InterfaceCounter(
                    interface=parts[0],
                    rx_packets=int(parts[1]),
                    rx_bytes=int(parts[2]),
                    tx_packets=int(parts[3]),
                    tx_bytes=int(parts[4]),
                    rx_dropped=int(parts[5]),
                    tx_dropped=int(parts[6]),
                    rx_errors=int(parts[7]),
                    tx_errors=int(parts[8])
                )
                interfaces.append(interface)
            except (ValueError, IndexError):
                # Skip malformed lines
                continue
    
    return interfaces


def extract_show_output(result: Any) -> str:
    """
    Extract text output from pyvyos show result payload.
    """
    if isinstance(result, dict):
        data = result.get("data", "")
        return data if isinstance(data, str) else str(data or "")
    if isinstance(result, str):
        return result
    return str(result or "")


def _normalize_pci_bus_id(value: Optional[str]) -> Optional[str]:
    """
    Normalize PCI bus ID to domain-prefixed lowercase format.
    Example: '03:00.0' -> '0000:03:00.0'
    """
    if not value:
        return None

    match = re.search(
        r"(?i)(?:([0-9a-f]{4}):)?([0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])",
        value.strip(),
    )
    if not match:
        return None

    domain = (match.group(1) or "0000").lower()
    bus = match.group(2).lower()
    return f"{domain}:{bus}"


def parse_hardware_pci_models(output: str) -> Dict[str, str]:
    """
    Parse PCI hardware output and build bus-id -> NIC model map.

    Expected line examples:
      0000:03:00.0 Ethernet controller: Intel Corporation Ethernet Controller X553
      03:00.0 Ethernet controller: Intel Corporation Ethernet Controller X553
    """
    models: Dict[str, str] = {}

    if not output or not isinstance(output, str):
        return models

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        match = re.search(
            r"(?i)^(?:([0-9a-f]{4}):)?([0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])\s+(.+)$",
            line,
        )
        if not match:
            continue

        domain = (match.group(1) or "0000").lower()
        bus = match.group(2).lower()
        description = match.group(3).strip()
        lowered = description.lower()

        if not any(token in lowered for token in ["ethernet", "network", "controller"]):
            continue

        nic_model = description.split(":", 1)[1].strip() if ":" in description else description
        if nic_model:
            models[f"{domain}:{bus}"] = nic_model

    return models


def parse_interface_physical_details(
    interface_name: str,
    output: str,
    nic_models_by_bus: Optional[Dict[str, str]] = None,
) -> InterfacePhysical:
    """
    Parse VyOS `show interfaces ethernet <iface> physical` output.
    """
    details = InterfacePhysical(interface=interface_name)
    nic_models_by_bus = nic_models_by_bus or {}

    if not output or not isinstance(output, str):
        return details

    patterns = {
        "driver": r"^\s*driver:\s*(.+?)\s*$",
        "firmware_version": r"^\s*firmware-version:\s*(.+?)\s*$",
        "bus_info": r"^\s*bus-info:\s*(.+?)\s*$",
        "speed": r"^\s*speed:\s*(.+?)\s*$",
        "duplex": r"^\s*duplex:\s*(.+?)\s*$",
        "auto_negotiation": r"^\s*auto-negotiation:\s*(.+?)\s*$",
        "link_detected": r"^\s*link detected:\s*(.+?)\s*$",
    }

    parsed: Dict[str, str] = {}
    for line in output.splitlines():
        for field, pattern in patterns.items():
            match = re.match(pattern, line, re.IGNORECASE)
            if match:
                parsed[field] = match.group(1).strip()

    details.driver = parsed.get("driver")
    details.firmware_version = parsed.get("firmware_version")
    details.bus_info = parsed.get("bus_info")
    details.speed = parsed.get("speed")
    details.duplex = parsed.get("duplex")
    details.auto_negotiation = parsed.get("auto_negotiation")

    link_detected = parsed.get("link_detected")
    if link_detected:
        link_value = link_detected.lower()
        if link_value in {"yes", "up", "true", "1"}:
            details.link_up = True
        elif link_value in {"no", "down", "false", "0"}:
            details.link_up = False

    normalized_bus = _normalize_pci_bus_id(details.bus_info)
    if normalized_bus and normalized_bus in nic_models_by_bus:
        details.nic_model = nic_models_by_bus[normalized_bus]

    return details


def _build_interface_blink_attempts(device: Any, interface_name: str, duration: int) -> List[BlinkAttempt]:
    """
    Build command variants for interface identify/bink compatibility.

    Upstream VyOS op-mode typically supports:
      show interfaces ethernet <iface> identify
    which triggers a fixed 30-second identify cycle.
    """
    return [
        (
            "show interfaces ethernet <iface> identify",
            30,
            lambda: device.show(
                path=[
                    "interfaces",
                    "ethernet",
                    interface_name,
                    "identify",
                ]
            ),
        ),
        (
            "show interfaces ethernet <iface> physical identify",
            30,
            lambda: device.show(
                path=[
                    "interfaces",
                    "ethernet",
                    interface_name,
                    "physical",
                    "identify",
                ]
            ),
        ),
        (
            "generate interfaces ethernet <iface> identify",
            30,
            lambda: device.generate(
                path=[
                    "interfaces",
                    "ethernet",
                    interface_name,
                    "identify",
                ]
            ),
        ),
        (
            "generate interfaces ethernet <iface> physical identify",
            30,
            lambda: device.generate(
                path=[
                    "interfaces",
                    "ethernet",
                    interface_name,
                    "physical",
                    "identify",
                ]
            ),
        ),
        (
            "show interfaces ethernet <iface> identify <seconds>",
            duration,
            lambda: device.show(
                path=[
                    "interfaces",
                    "ethernet",
                    interface_name,
                    "identify",
                    str(duration),
                ]
            ),
        ),
        (
            "show interfaces ethernet <iface> physical identify <seconds>",
            duration,
            lambda: device.show(
                path=[
                    "interfaces",
                    "ethernet",
                    interface_name,
                    "physical",
                    "identify",
                    str(duration),
                ]
            ),
        ),
        (
            "generate interfaces ethernet <iface> identify <seconds>",
            duration,
            lambda: device.generate(
                path=[
                    "interfaces",
                    "ethernet",
                    interface_name,
                    "identify",
                    str(duration),
                ]
            ),
        ),
        (
            "generate interfaces ethernet <iface> physical identify <seconds>",
            duration,
            lambda: device.generate(
                path=[
                    "interfaces",
                    "ethernet",
                    interface_name,
                    "physical",
                    "identify",
                    str(duration),
                ]
            ),
        ),
    ]


def _run_interface_blink_in_background(
    service_config: VyOSDeviceConfig,
    interface_name: str,
    duration: int,
) -> None:
    """
    Run interface identify command(s) in a detached worker.

    This keeps the API response immediate while still attempting the identify
    operation on the device.
    """
    worker_service = VyOSService(service_config)
    errors: List[str] = []

    for method_name, _effective_duration, method_call in _build_interface_blink_attempts(
        worker_service.device,
        interface_name,
        duration,
    ):
        try:
            response = method_call()
            if response.status == 200:
                logger.info(
                    "Interface blink triggered for %s using method: %s",
                    interface_name,
                    method_name,
                )
                return

            error_text = response.error or extract_show_output(response.result) or "unknown"
            if len(error_text) > 240:
                error_text = f"{error_text[:240]}..."
            errors.append(f"{method_name}: status={response.status}, error={error_text}")
        except Exception as command_error:
            errors.append(f"{method_name}: {str(command_error)}")

    logger.warning(
        "Interface blink/identify unsupported or failed for %s: %s",
        interface_name,
        "; ".join(errors),
    )


# ========================================================================
# Endpoint: Interface Counters
# ========================================================================


@router.get("/interface-counters", response_model=InterfaceCountersResponse)
async def get_interface_counters(request: Request):
    """
    Get interface counter statistics from VyOS.

    Returns:
        Structured interface counter data for all interfaces
    """
    try:
        service = get_session_vyos_service(request)

        # Execute 'show interface counters' command
        response = service.device.show(path=["interfaces", "counters"])

        if response.status != 200:
            raise HTTPException(
                status_code=500,
                detail=f"VyOS command failed: {response.error}"
            )

        # Parse the output
        output = ""
        if isinstance(response.result, dict) and "data" in response.result:
            output = response.result["data"]
        elif isinstance(response.result, str):
            output = response.result

        interfaces = parse_interface_counters(output)

        return InterfaceCountersResponse(
            interfaces=interfaces,
            total=len(interfaces)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================================
# Endpoint: Interface Physical (Link + NIC details)
# ========================================================================


@router.get("/interface-physical", response_model=InterfacePhysicalResponse)
async def get_interface_physical(request: Request):
    """
    Get physical interface details (driver/model/link/speed) for ethernet interfaces.

    This is best-effort by design:
    - It returns partial data when some commands are unavailable on a device.
    - It never fails the entire request for a single interface parse issue.
    """
    try:
        service = get_session_vyos_service(request)

        full_config = service.get_full_config(refresh=False)
        ethernet_config = full_config.get("interfaces", {}).get("ethernet", {})

        if not isinstance(ethernet_config, dict):
            return InterfacePhysicalResponse(interfaces=[], total=0)

        interface_names = sorted(ethernet_config.keys())

        # Build a PCI bus-id -> model map (best effort)
        nic_models_by_bus: Dict[str, str] = {}
        for hardware_path in (["hardware", "pci"], ["hardware"]):
            hardware_response = service.device.show(path=hardware_path)
            if hardware_response.status != 200:
                continue
            hardware_output = extract_show_output(hardware_response.result)
            nic_models_by_bus = parse_hardware_pci_models(hardware_output)
            if nic_models_by_bus:
                break

        physical_interfaces: List[InterfacePhysical] = []

        for interface_name in interface_names:
            output = ""
            for show_path in (
                ["interfaces", "ethernet", interface_name, "physical"],
                ["interfaces", "ethernet", interface_name],
            ):
                response = service.device.show(path=show_path)
                if response.status == 200:
                    output = extract_show_output(response.result)
                    if output:
                        break

            parsed = parse_interface_physical_details(
                interface_name=interface_name,
                output=output,
                nic_models_by_bus=nic_models_by_bus,
            )
            physical_interfaces.append(parsed)

        return InterfacePhysicalResponse(
            interfaces=physical_interfaces,
            total=len(physical_interfaces),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================================
# Endpoint: All Interfaces (from config)
# ========================================================================


class InterfaceName(BaseModel):
    """Model for interface name from config."""
    name: str
    type: str


class AllInterfacesResponse(BaseModel):
    """Response containing all interface names from config."""
    interfaces: List[InterfaceName]
    total: int


@router.get("/all-interfaces", response_model=AllInterfacesResponse)
async def get_all_interfaces(request: Request):
    """
    Get all interface names from VyOS configuration.

    This returns all configured interfaces regardless of their active/up status,
    including VLANs (vif) and other sub-interfaces.

    Returns:
        List of all interface names from the config
    """
    try:
        service = get_session_vyos_service(request)

        # Get full config to extract all interfaces
        full_config = service.get_full_config(refresh=False)
        interfaces_config = full_config.get("interfaces", {})

        interfaces = []

        # Process each interface type
        for iface_type, iface_data in interfaces_config.items():
            if not isinstance(iface_data, dict):
                continue

            # Each interface type contains interface names as keys
            for iface_name, iface_config in iface_data.items():
                interfaces.append(InterfaceName(name=iface_name, type=iface_type))

                # Handle VLANs (vif) - 802.1q sub-interfaces
                if isinstance(iface_config, dict) and "vif" in iface_config:
                    vif_data = iface_config["vif"]
                    if isinstance(vif_data, dict):
                        for vlan_id in vif_data.keys():
                            vif_name = f"{iface_name}.{vlan_id}"
                            interfaces.append(InterfaceName(name=vif_name, type="vif"))

                # Handle VIF-S (QinQ service VLANs)
                if isinstance(iface_config, dict) and "vif-s" in iface_config:
                    vif_s_data = iface_config["vif-s"]
                    if isinstance(vif_s_data, dict):
                        for s_vlan_id, s_vlan_config in vif_s_data.items():
                            vif_s_name = f"{iface_name}.{s_vlan_id}"
                            interfaces.append(InterfaceName(name=vif_s_name, type="vif-s"))

                            # Handle VIF-C (QinQ customer VLANs) nested in VIF-S
                            if isinstance(s_vlan_config, dict) and "vif-c" in s_vlan_config:
                                vif_c_data = s_vlan_config["vif-c"]
                                if isinstance(vif_c_data, dict):
                                    for c_vlan_id in vif_c_data.keys():
                                        vif_c_name = f"{iface_name}.{s_vlan_id}.{c_vlan_id}"
                                        interfaces.append(InterfaceName(name=vif_c_name, type="vif-c"))

        # Sort interfaces by name for consistent ordering
        interfaces.sort(key=lambda x: x.name)

        return AllInterfacesResponse(
            interfaces=interfaces,
            total=len(interfaces)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================================
# Endpoint: Interface Blink / Identify
# ========================================================================


@router.post("/interface-blink", response_model=InterfaceBlinkResponse)
async def blink_interface_led(request: Request, body: InterfaceBlinkRequest):
    """
    Trigger interface locator LED identify/blink on supported NICs.

    This uses VyOS operational commands and is best-effort:
    - Some hardware/drivers do not support identify.
    - Command availability may vary across VyOS versions/platforms.
    """
    await require_write_permission(request, FeatureGroup.INTERFACES)

    interface_name = body.interface.strip()
    if not interface_name:
        raise HTTPException(status_code=400, detail="Interface name is required")
    if not re.match(r"^[A-Za-z0-9._:-]+$", interface_name):
        raise HTTPException(status_code=400, detail="Invalid interface name")

    duration = max(1, min(int(body.duration_seconds), 30))

    try:
        service = get_session_vyos_service(request)
        queued_method = "show interfaces ethernet <iface> identify"
        queued_duration = 30

        # Clone config for thread safety and run command in detached worker.
        worker_config = VyOSDeviceConfig(
            hostname=service.config.hostname,
            apikey=service.config.apikey,
            version=service.config.version,
            protocol=service.config.protocol,
            port=service.config.port,
            verify=service.config.verify,
            timeout=service.config.timeout,
        )
        worker_thread = threading.Thread(
            target=_run_interface_blink_in_background,
            args=(worker_config, interface_name, duration),
            daemon=True,
            name=f"interface-blink-{interface_name}",
        )
        worker_thread.start()

        return InterfaceBlinkResponse(
            success=True,
            interface=interface_name,
            duration_seconds=queued_duration,
            method=f"{queued_method} (queued)",
            output="Blink request queued",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
