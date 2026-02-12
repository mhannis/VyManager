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
from starlette.concurrency import run_in_threadpool

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


class InterfaceRuntimeAddress(BaseModel):
    """Runtime interface address details from operational show output."""
    interface: str
    ipv4_addresses: List[str]
    ipv6_addresses: List[str]


class InterfaceRuntimeAddressesResponse(BaseModel):
    """Response containing runtime interface addresses."""
    interfaces: List[InterfaceRuntimeAddress]
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


def _is_valid_ipv4_cidr(candidate: str) -> bool:
    try:
        ip, prefix_text = candidate.split("/", 1)
        octets = [int(part) for part in ip.split(".")]
        prefix = int(prefix_text)
        if len(octets) != 4:
            return False
        if any(octet < 0 or octet > 255 for octet in octets):
            return False
        if prefix < 0 or prefix > 32:
            return False
        return True
    except Exception:
        return False


def _is_valid_ipv6_cidr(candidate: str) -> bool:
    try:
        ip, prefix_text = candidate.split("/", 1)
        prefix = int(prefix_text)
        if ":" not in ip:
            return False
        if prefix < 0 or prefix > 128:
            return False
        return True
    except Exception:
        return False


def _append_unique(items: List[str], seen: set, value: str) -> None:
    if value not in seen:
        seen.add(value)
        items.append(value)


def _interface_has_dhcp_address_config(interface_config: Any) -> bool:
    if not isinstance(interface_config, dict):
        return False

    addresses = interface_config.get("address")
    if isinstance(addresses, str):
        return addresses.strip().lower() == "dhcp"
    if isinstance(addresses, list):
        return any(str(entry).strip().lower() == "dhcp" for entry in addresses)
    if isinstance(addresses, dict):
        return any(str(entry).strip().lower() == "dhcp" for entry in addresses.keys())
    return False


def _ipv4_with_netmask_to_cidr(ipv4: str, netmask: str) -> Optional[str]:
    try:
        octets = [int(part) for part in ipv4.split(".")]
        mask_octets = [int(part) for part in netmask.split(".")]
        if len(octets) != 4 or len(mask_octets) != 4:
            return None
        if any(part < 0 or part > 255 for part in octets):
            return None
        if any(part < 0 or part > 255 for part in mask_octets):
            return None

        bits = "".join(f"{part:08b}" for part in mask_octets)
        if "01" in bits:
            return None
        prefix = bits.count("1")
        return f"{ipv4}/{prefix}"
    except Exception:
        return None


def _parse_dhcp_lease_ipv4_addresses(output: str) -> List[str]:
    """
    Parse DHCP lease output and return best-effort IPv4 CIDRs.
    """
    if not output or not isinstance(output, str):
        return []

    cleaned_output = re.sub(r"\x1B\[[0-?]*[ -/]*[@-~]", "", output)
    found: List[str] = []
    seen = set()

    # Format: fixed-address 192.168.1.100; + option subnet-mask 255.255.255.0;
    fixed_addresses = re.findall(r"\bfixed-address\s+((?:\d{1,3}\.){3}\d{1,3})\s*;", cleaned_output, re.IGNORECASE)
    masks = re.findall(r"\bsubnet-mask\s+((?:\d{1,3}\.){3}\d{1,3})\s*;", cleaned_output, re.IGNORECASE)

    if fixed_addresses:
        if masks:
            default_mask = masks[0]
            for index, ip in enumerate(fixed_addresses):
                mask = masks[index] if index < len(masks) else default_mask
                cidr = _ipv4_with_netmask_to_cidr(ip, mask)
                if cidr and _is_valid_ipv4_cidr(cidr):
                    _append_unique(found, seen, cidr)
        else:
            for ip in fixed_addresses:
                fallback_cidr = f"{ip}/32"
                if _is_valid_ipv4_cidr(fallback_cidr):
                    _append_unique(found, seen, fallback_cidr)

    # Format: address/netmask from human-readable status text.
    line_matches = re.finditer(
        r"\baddress[:\s]+((?:\d{1,3}\.){3}\d{1,3})\b[^\n\r]*?\b(?:netmask|mask)[:\s]+((?:\d{1,3}\.){3}\d{1,3})\b",
        cleaned_output,
        re.IGNORECASE,
    )
    for match in line_matches:
        cidr = _ipv4_with_netmask_to_cidr(match.group(1), match.group(2))
        if cidr and _is_valid_ipv4_cidr(cidr):
            _append_unique(found, seen, cidr)

    # CIDR fallback in lease output.
    for ipv4 in re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}\b", cleaned_output):
        if _is_valid_ipv4_cidr(ipv4):
            _append_unique(found, seen, ipv4)

    # Multi-line formats, including:
    # interface  : eth0
    # ip address : 10.1.1.50
    # subnet mask: 255.255.255.0
    #
    # and also the common `show dhcp client lease` format:
    # Interface    eth0
    # IP address   192.168.10.242                [Active]
    # Subnet Mask  255.255.255.0
    pending_ip: Optional[str] = None
    for raw_line in cleaned_output.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        ip_match = re.search(
            r"\b(?:ip\s+address|address)\b\s*(?:[:=]\s*|\s+)((?:\d{1,3}\.){3}\d{1,3})\b",
            line,
            re.IGNORECASE,
        )
        if ip_match:
            pending_ip = ip_match.group(1)

        mask_match = re.search(
            r"\b(?:subnet\s+mask|subnet-mask|netmask|mask)\b\s*(?:[:=]\s*|\s+)((?:\d{1,3}\.){3}\d{1,3})\b",
            line,
            re.IGNORECASE,
        )
        if pending_ip and mask_match:
            cidr = _ipv4_with_netmask_to_cidr(pending_ip, mask_match.group(1))
            if cidr and _is_valid_ipv4_cidr(cidr):
                _append_unique(found, seen, cidr)
            pending_ip = None

    return found


def _parse_dhcp_client_leases_by_interface(output: str) -> Dict[str, List[str]]:
    """
    Parse `show dhcp client lease(s)` output and return interface -> IPv4 CIDRs mapping.

    The CLI output commonly looks like:
      Interface    eth0
      IP address   192.168.10.242                [Active]
      Subnet Mask  255.255.255.0

    It can also include multiple interface blocks in a single response.
    """
    mapping: Dict[str, List[str]] = {}
    if not output or not isinstance(output, str):
        return mapping

    cleaned_output = re.sub(r"\x1B\[[0-?]*[ -/]*[@-~]", "", output)

    blocks: Dict[str, List[str]] = {}
    current_iface: Optional[str] = None
    current_lines: List[str] = []

    for raw_line in cleaned_output.splitlines():
        line = raw_line.rstrip("\r")
        stripped = line.strip()
        if not stripped:
            continue

        iface_match = re.match(
            r"(?i)^\s*interface\s*(?:[:=]\s*|\s+)\s*([A-Za-z0-9._:-]+)\b",
            stripped,
        )
        if iface_match:
            if current_iface and current_lines:
                blocks[current_iface] = current_lines
            current_iface = iface_match.group(1)
            current_lines = [line]
            continue

        if current_iface is not None:
            current_lines.append(line)

    if current_iface and current_lines:
        blocks[current_iface] = current_lines

    for iface, lines in blocks.items():
        addresses = _parse_dhcp_lease_ipv4_addresses("\n".join(lines))
        if addresses:
            mapping[iface] = addresses

    return mapping


def _collect_dhcp_lease_output_for_interface(service: Any, interface_name: str) -> str:
    """
    Try several command variants for DHCP lease details for an interface.
    """
    candidates = [
        ("show", ["dhcp", "client", "leases", "interface", interface_name]),
        ("show", ["dhcp", "client", "leases", interface_name]),
        ("show", ["dhcp", "client", "lease", interface_name]),
        ("show", ["dhcp", "client", "lease"]),
        ("show", ["dhcp", "client", "leases"]),
        ("show", ["interfaces", "ethernet", interface_name, "dhcp"]),
        ("generate", ["dhcp", "client", "leases", "interface", interface_name]),
        ("generate", ["dhcp", "client", "leases", interface_name]),
        ("generate", ["dhcp", "client", "lease"]),
        ("generate", ["dhcp", "client", "leases"]),
    ]

    best_output = ""
    best_score = 0

    for method, path in candidates:
        response = service.device.generate(path=path) if method == "generate" else service.device.show(path=path)
        if response.status != 200:
            continue

        output = extract_show_output(response.result)
        if not output:
            continue

        score = len(
            re.findall(
                r"fixed-address|subnet-mask|subnet\s+mask|\bip\s+address\b|\b(?:\d{1,3}\.){3}\d{1,3}(?:/\d{1,2})?\b",
                output,
                re.IGNORECASE,
            )
        )
        if score >= best_score:
            best_score = score
            best_output = output

    return best_output


def parse_interface_runtime_addresses(interface_name: str, output: str) -> InterfaceRuntimeAddress:
    """
    Parse `show interfaces ethernet <iface>` output and extract runtime addresses.
    """
    ipv4_addresses: List[str] = []
    ipv6_addresses: List[str] = []
    seen_ipv4 = set()
    seen_ipv6 = set()

    if output and isinstance(output, str):
        # Strip ANSI escape sequences if present in CLI output.
        cleaned_output = re.sub(r"\x1B\[[0-?]*[ -/]*[@-~]", "", output)

        # First pass: capture CIDRs in any common format (summary/detail views).
        for ipv4 in re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}\b", cleaned_output):
            if _is_valid_ipv4_cidr(ipv4):
                _append_unique(ipv4_addresses, seen_ipv4, ipv4)

        # Also parse `IP + netmask` formats and convert them to CIDR.
        for match in re.finditer(
            r"\b((?:\d{1,3}\.){3}\d{1,3})\b[^\\n\\r]*?\bnetmask\s+((?:\d{1,3}\.){3}\d{1,3})\b",
            cleaned_output,
            re.IGNORECASE,
        ):
            cidr = _ipv4_with_netmask_to_cidr(match.group(1), match.group(2))
            if cidr and _is_valid_ipv4_cidr(cidr):
                _append_unique(ipv4_addresses, seen_ipv4, cidr)

        for ipv6 in re.findall(r"\b[0-9A-Fa-f:]+/\d{1,3}\b", cleaned_output):
            if _is_valid_ipv6_cidr(ipv6):
                _append_unique(ipv6_addresses, seen_ipv6, ipv6)

        # Second pass: preserve existing inet/inet6 parsing for edge formatting.
        for raw_line in output.splitlines():
            line = raw_line.strip()
            if not line:
                continue

            for ipv4 in re.findall(r"\binet\s+(\d{1,3}(?:\.\d{1,3}){3}/\d{1,2})\b", line):
                if _is_valid_ipv4_cidr(ipv4):
                    _append_unique(ipv4_addresses, seen_ipv4, ipv4)

            for ipv6 in re.findall(r"\binet6\s+([0-9a-fA-F:]+/\d{1,3})\b", line):
                if _is_valid_ipv6_cidr(ipv6):
                    _append_unique(ipv6_addresses, seen_ipv6, ipv6)

    return InterfaceRuntimeAddress(
        interface=interface_name,
        ipv4_addresses=ipv4_addresses,
        ipv6_addresses=ipv6_addresses,
    )


def parse_interface_summary_addresses(output: str) -> Dict[str, InterfaceRuntimeAddress]:
    """
    Parse `show interfaces`/`show interfaces summary` style output for runtime addresses.
    """
    mapping: Dict[str, InterfaceRuntimeAddress] = {}
    if not output or not isinstance(output, str):
        return mapping

    cleaned_output = re.sub(r"\x1B\[[0-?]*[ -/]*[@-~]", "", output)

    for raw_line in cleaned_output.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        match = re.match(r"^([A-Za-z][A-Za-z0-9._:-]*)\b", line)
        if not match:
            continue

        interface_name = match.group(1)
        lowered_name = interface_name.lower()
        if lowered_name in {"interface", "interfaces"} or interface_name.startswith("-"):
            continue

        entry = mapping.get(interface_name)
        if entry is None:
            entry = InterfaceRuntimeAddress(interface=interface_name, ipv4_addresses=[], ipv6_addresses=[])
            mapping[interface_name] = entry

        seen_ipv4 = set(entry.ipv4_addresses)
        seen_ipv6 = set(entry.ipv6_addresses)

        for ipv4 in re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}\b", line):
            if _is_valid_ipv4_cidr(ipv4):
                _append_unique(entry.ipv4_addresses, seen_ipv4, ipv4)

        netmask_match = re.search(
            r"\b((?:\d{1,3}\.){3}\d{1,3})\b[^\\n\\r]*?\bnetmask\s+((?:\d{1,3}\.){3}\d{1,3})\b",
            line,
            re.IGNORECASE,
        )
        if netmask_match:
            cidr = _ipv4_with_netmask_to_cidr(netmask_match.group(1), netmask_match.group(2))
            if cidr and _is_valid_ipv4_cidr(cidr):
                _append_unique(entry.ipv4_addresses, seen_ipv4, cidr)

        for ipv6 in re.findall(r"\b[0-9A-Fa-f:]+/\d{1,3}\b", line):
            if _is_valid_ipv6_cidr(ipv6):
                _append_unique(entry.ipv6_addresses, seen_ipv6, ipv6)

    return mapping


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
        response = await run_in_threadpool(service.device.show, path=["interfaces", "counters"])

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

        full_config = await run_in_threadpool(service.get_full_config, refresh=False)
        ethernet_config = full_config.get("interfaces", {}).get("ethernet", {})

        if not isinstance(ethernet_config, dict):
            return InterfacePhysicalResponse(interfaces=[], total=0)

        interface_names = sorted(ethernet_config.keys())

        # Build a PCI bus-id -> model map (best effort)
        nic_models_by_bus: Dict[str, str] = {}
        for hardware_path in (["hardware", "pci"], ["hardware"]):
            hardware_response = await run_in_threadpool(service.device.show, path=hardware_path)
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
                response = await run_in_threadpool(service.device.show, path=show_path)
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
        full_config = await run_in_threadpool(service.get_full_config, refresh=False)
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


@router.get("/interface-runtime-addresses", response_model=InterfaceRuntimeAddressesResponse)
async def get_interface_runtime_addresses(request: Request):
    """
    Get runtime interface addresses (including DHCP-assigned addresses).
    """
    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=False)
        ethernet_config = full_config.get("interfaces", {}).get("ethernet", {})

        if not isinstance(ethernet_config, dict):
            return InterfaceRuntimeAddressesResponse(interfaces=[], total=0)

        interface_names = sorted(ethernet_config.keys())
        dhcp_enabled_interfaces = {
            name for name, cfg in ethernet_config.items() if _interface_has_dhcp_address_config(cfg)
        }

        # Prefer a single summary call (fastest), then fall back if needed.
        summary_output = ""
        summary_response = await run_in_threadpool(service.device.show, path=["interfaces"])
        if summary_response.status == 200:
            summary_output = extract_show_output(summary_response.result)
        if not summary_output:
            fallback_response = await run_in_threadpool(service.device.show, path=["interfaces", "summary"])
            if fallback_response.status == 200:
                summary_output = extract_show_output(fallback_response.result)

        summary_by_name = parse_interface_summary_addresses(summary_output) if summary_output else {}

        runtime_interfaces: List[InterfaceRuntimeAddress] = []
        missing_dhcp: List[str] = []

        for interface_name in interface_names:
            summary_entry = summary_by_name.get(interface_name)
            ipv4_addresses = list(summary_entry.ipv4_addresses) if summary_entry else []
            ipv6_addresses = list(summary_entry.ipv6_addresses) if summary_entry else []

            if interface_name in dhcp_enabled_interfaces and not ipv4_addresses:
                missing_dhcp.append(interface_name)

            runtime_interfaces.append(
                InterfaceRuntimeAddress(
                    interface=interface_name,
                    ipv4_addresses=ipv4_addresses,
                    ipv6_addresses=ipv6_addresses,
                )
            )

        # Fallback: DHCP client lease output (single call) for DHCP interfaces still missing runtime IPv4.
        if missing_dhcp:
            lease_response = await run_in_threadpool(service.device.show, path=["dhcp", "client", "leases"])
            if lease_response.status == 200:
                lease_output = extract_show_output(lease_response.result)
                leases_by_iface = _parse_dhcp_client_leases_by_interface(lease_output)

                for entry in runtime_interfaces:
                    if entry.interface not in missing_dhcp or entry.ipv4_addresses:
                        continue
                    seen_ipv4 = set(entry.ipv4_addresses)
                    for lease_address in leases_by_iface.get(entry.interface, []):
                        _append_unique(entry.ipv4_addresses, seen_ipv4, lease_address)

        return InterfaceRuntimeAddressesResponse(
            interfaces=runtime_interfaces,
            total=len(runtime_interfaces),
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
