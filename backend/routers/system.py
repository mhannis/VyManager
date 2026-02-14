"""
System Information Endpoints

API endpoints for retrieving system information about the VyOS device.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Tuple, Literal
from datetime import datetime, timezone
import asyncio
import re

from session_vyos_service import get_session_vyos_service
from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup

# Router for system endpoints
router = APIRouter(prefix="/vyos/system", tags=["system"])


# Stub functions for backwards compatibility with app.py
def set_device_registry(registry):
    """Legacy function - no longer used."""
    pass


def set_configured_device_name(name):
    """Legacy function - no longer used."""
    pass


# ========================================================================
# Helpers
# ========================================================================


def _extract_show_output(result: Any) -> str:
    """Extract textual show output from pyvyos response payload."""
    if isinstance(result, dict):
        data = result.get("data", "")
        return data if isinstance(data, str) else str(data or "")
    if isinstance(result, str):
        return result
    return str(result or "")


def _parse_key_value_lines(output: str) -> Dict[str, str]:
    """Parse `key: value` lines into a dictionary."""
    values: Dict[str, str] = {}
    for line in output.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if key:
            values[key] = value
    return values


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _safe_int(value: Any) -> Optional[int]:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _parse_human_size_to_bytes(value: Optional[str]) -> Optional[int]:
    """
    Parse human-readable size strings (e.g. `31.2G`, `512M`, `1024`) to bytes.
    """
    if not value:
        return None

    cleaned = value.strip()
    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)\s*([KMGTPE]?)(?:i?B)?$", cleaned, re.IGNORECASE)
    if not match:
        return None

    number = float(match.group(1))
    unit = (match.group(2) or "").upper()
    multipliers = {
        "": 1,
        "K": 1024,
        "M": 1024 ** 2,
        "G": 1024 ** 3,
        "T": 1024 ** 4,
        "P": 1024 ** 5,
        "E": 1024 ** 6,
    }

    return int(number * multipliers.get(unit, 1))


def _parse_version_output(output: str) -> Dict[str, Optional[str]]:
    data = _parse_key_value_lines(output)
    return {
        "version": data.get("Version"),
        "build_by": data.get("Built by"),
        "built_on": data.get("Built on"),
        "build_commit_id": data.get("Build commit ID"),
        "architecture": data.get("Architecture"),
        "system_type": data.get("System type"),
        "hardware_model": data.get("Hardware model"),
        "hardware_serial": data.get("Hardware S/N"),
    }


def _parse_uptime_output(output: str) -> Dict[str, Optional[float | str]]:
    pairs = _parse_key_value_lines(output)

    def _load_avg(pattern: str) -> Optional[float]:
        match = re.search(pattern, output)
        if not match:
            return None
        try:
            return float(match.group(1))
        except ValueError:
            return None

    return {
        "uptime": pairs.get("Uptime"),
        "load_1m_percent": _load_avg(r"1\s+minute:\s*([0-9.]+)%"),
        "load_5m_percent": _load_avg(r"5\s+minutes:\s*([0-9.]+)%"),
        "load_15m_percent": _load_avg(r"15\s+minutes:\s*([0-9.]+)%"),
    }


def _parse_cpu_output(output: str) -> Dict[str, Any]:
    cpu_blocks: List[Dict[str, str]] = []
    current: Dict[str, str] = {}

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            if current:
                cpu_blocks.append(current)
                current = {}
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        current[key.strip()] = value.strip()

    if current:
        cpu_blocks.append(current)

    models = sorted(
        {
            block.get("Model")
            for block in cpu_blocks
            if block.get("Model")
        }
    )

    cores = 0
    has_core_data = False
    sockets = set()
    for block in cpu_blocks:
        if block.get("CPU socket"):
            sockets.add(block["CPU socket"])

        parsed_cores = _safe_int(block.get("Cores"))
        if parsed_cores is not None:
            has_core_data = True
            cores += parsed_cores

    if not has_core_data:
        summary_match = re.search(r"Physical CPU cores:\s*(\d+)", output)
        if summary_match:
            parsed = _safe_int(summary_match.group(1))
            if parsed is not None:
                cores = parsed
                has_core_data = True

    return {
        "cpu_models": models,
        "cpu_socket_count": len(sockets) if sockets else (len(cpu_blocks) if cpu_blocks else None),
        "cpu_cores": cores if has_core_data else None,
    }


def _parse_temperature_token_to_celsius(token: str) -> Optional[float]:
    match = re.search(r"(-?[0-9]+(?:\.[0-9]+)?)\s*°?\s*([CF])\b", token, re.IGNORECASE)
    if not match:
        return None

    try:
        value = float(match.group(1))
    except ValueError:
        return None

    unit = match.group(2).upper()
    if unit == "F":
        value = (value - 32.0) * (5.0 / 9.0)
    return round(value, 1)


def _parse_cpu_temperature_output(output: str) -> Dict[str, Optional[float]]:
    """
    Best-effort parser for CPU/package/core temperature from VyOS show output.
    Returns hottest CPU-related sensor in Celsius when available.
    """
    if not output:
        return {"cpu_temperature_celsius": None}

    cpu_related: List[float] = []
    fallback: List[float] = []

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        parsed = _parse_temperature_token_to_celsius(line)
        if parsed is None:
            continue

        fallback.append(parsed)
        lower = line.lower()
        if any(marker in lower for marker in ("cpu", "package", "core", "tdie", "tctl")):
            cpu_related.append(parsed)

    candidates = cpu_related or fallback
    if not candidates:
        return {"cpu_temperature_celsius": None}

    return {"cpu_temperature_celsius": max(candidates)}


def _parse_memory_output(output: str) -> Dict[str, Optional[float | int | str]]:
    data = _parse_key_value_lines(output)

    total_human = data.get("Total")
    free_human = data.get("Free")
    used_human = data.get("Used")

    total_bytes = _parse_human_size_to_bytes(total_human)
    free_bytes = _parse_human_size_to_bytes(free_human)
    used_bytes = _parse_human_size_to_bytes(used_human)

    used_percent: Optional[float] = None
    if total_bytes and used_bytes is not None and total_bytes > 0:
        used_percent = round((used_bytes / total_bytes) * 100, 2)

    return {
        "memory_total_human": total_human,
        "memory_free_human": free_human,
        "memory_used_human": used_human,
        "memory_total_bytes": total_bytes,
        "memory_free_bytes": free_bytes,
        "memory_used_bytes": used_bytes,
        "memory_used_percent": used_percent,
    }


def _parse_storage_output(output: str) -> Dict[str, Optional[int | str]]:
    data = _parse_key_value_lines(output)

    used_raw = data.get("Used")
    available_raw = data.get("Available")

    def _strip_percentage(value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        return re.sub(r"\s*\([^)]*\)", "", value).strip()

    used_percent = None
    available_percent = None
    if used_raw:
        used_match = re.search(r"\((\d+)%\)", used_raw)
        if used_match:
            used_percent = _safe_int(used_match.group(1))

    if available_raw:
        available_match = re.search(r"\((\d+)%\)", available_raw)
        if available_match:
            available_percent = _safe_int(available_match.group(1))

    if used_percent is not None and available_percent is None:
        available_percent = max(0, 100 - used_percent)

    return {
        "filesystem": data.get("Filesystem"),
        "size_human": data.get("Size"),
        "used_human": _strip_percentage(used_raw),
        "available_human": _strip_percentage(available_raw),
        "used_percent": used_percent,
        "available_percent": available_percent,
    }


def _parse_ntp_tracking_output(output: str) -> Dict[str, Optional[int | str]]:
    values = _parse_key_value_lines(output)

    ref_id = values.get("Reference ID")
    ref_name: Optional[str] = None
    if ref_id:
        ref_match = re.match(r"([^\s(]+)\s*\(([^)]+)\)", ref_id)
        if ref_match:
            ref_id = ref_match.group(1)
            ref_name = ref_match.group(2)

    return {
        "reference_id": ref_id,
        "reference_name": ref_name,
        "stratum": _safe_int(values.get("Stratum")),
        "system_time": values.get("System time"),
        "last_offset": values.get("Last offset"),
        "rms_offset": values.get("RMS offset"),
        "frequency": values.get("Frequency"),
        "root_delay": values.get("Root delay"),
        "root_dispersion": values.get("Root dispersion"),
        "update_interval": values.get("Update interval"),
        "leap_status": values.get("Leap status"),
    }


def _parse_ntp_activity_output(output: str) -> Dict[str, Optional[int]]:
    sources_online: Optional[int] = None
    sources_offline: Optional[int] = None
    sources_unknown: Optional[int] = None

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        count_match = re.match(r"^(\d+)\s+", line)
        if not count_match:
            continue

        count = _safe_int(count_match.group(1))
        if count is None:
            continue

        lowered = line.lower()
        if "sources online" in lowered and "burst" not in lowered:
            sources_online = count
        elif "sources offline" in lowered and "burst" not in lowered:
            sources_offline = count
        elif "sources with unknown address" in lowered:
            sources_unknown = count

    return {
        "sources_online": sources_online,
        "sources_offline": sources_offline,
        "sources_unknown": sources_unknown,
    }


def _parse_ntp_sources_output(output: str) -> List[Dict[str, Optional[int | str]]]:
    parsed_sources: List[Dict[str, Optional[int | str]]] = []

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        parts = line.split()
        if len(parts) < 7:
            continue

        token = parts[0]
        if len(token) < 1 or token[0] not in {"^", "=", "#", "?", "~"}:
            continue

        mode = token[0]
        state = token[1] if len(token) > 1 else None

        parsed_sources.append(
            {
                "mode": mode,
                "state": state,
                "source": parts[1],
                "stratum": _safe_int(parts[2]),
                "poll": _safe_int(parts[3]),
                "reach": _safe_int(parts[4]),
                "last_rx": parts[5],
                "last_sample": " ".join(parts[6:]),
            }
        )

    return parsed_sources


def _extract_tag_values(root: Dict[str, Any], path: List[str]) -> List[str]:
    current: Any = root
    for segment in path:
        if not isinstance(current, dict):
            return []
        current = current.get(segment)

    if isinstance(current, dict):
        return sorted([str(key).strip() for key in current.keys() if str(key).strip()])
    if isinstance(current, list):
        return sorted([str(item).strip() for item in current if str(item).strip()])
    if isinstance(current, str):
        stripped = current.strip()
        return [stripped] if stripped else []

    return []


def _normalize_unique_strings(values: List[str]) -> List[str]:
    seen = set()
    result = []
    for value in values:
        stripped = value.strip()
        if not stripped or stripped in seen:
            continue
        seen.add(stripped)
        result.append(stripped)
    return result


def _model_fields_set(model: BaseModel) -> set[str]:
    """Return explicitly provided fields for both pydantic v1/v2."""
    raw = getattr(model, "model_fields_set", None)
    if raw is None:
        raw = getattr(model, "__fields_set__", set())
    return set(raw or set())


RE_LOCAL_USERNAME = re.compile(r"^[A-Za-z_][A-Za-z0-9._-]{0,31}$")
RE_LOCAL_LEVEL = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
RE_HOSTNAME_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$")


# ========================================================================
# Pydantic Models
# ========================================================================


class SystemInfo(BaseModel):
    """System information response model."""
    instance_id: str
    instance_name: str
    site_name: str
    vyos_version: str
    connection_host: str
    connected: bool


class SystemConfig(BaseModel):
    """System configuration response model."""
    hostname: Optional[str] = None
    timezone: Optional[str] = None
    name_servers: list[str] = Field(default_factory=list)
    domain_name: Optional[str] = None
    raw_config: Dict[str, Any] = Field(default_factory=dict)


class SystemDashboardSummary(BaseModel):
    """Dashboard-friendly system summary metrics."""
    hostname: Optional[str] = None
    version: Optional[str] = None
    build_by: Optional[str] = None
    built_on: Optional[str] = None
    build_commit_id: Optional[str] = None
    architecture: Optional[str] = None
    system_type: Optional[str] = None
    hardware_model: Optional[str] = None
    hardware_serial: Optional[str] = None

    uptime: Optional[str] = None
    load_1m_percent: Optional[float] = None
    load_5m_percent: Optional[float] = None
    load_15m_percent: Optional[float] = None

    cpu_models: List[str] = Field(default_factory=list)
    cpu_socket_count: Optional[int] = None
    cpu_cores: Optional[int] = None
    cpu_temperature_celsius: Optional[float] = None

    memory_total_human: Optional[str] = None
    memory_free_human: Optional[str] = None
    memory_used_human: Optional[str] = None
    memory_total_bytes: Optional[int] = None
    memory_free_bytes: Optional[int] = None
    memory_used_bytes: Optional[int] = None
    memory_used_percent: Optional[float] = None


class DiskStatusResponse(BaseModel):
    """Persistent disk usage summary."""
    available: bool = False
    filesystem: Optional[str] = None
    size_human: Optional[str] = None
    used_human: Optional[str] = None
    available_human: Optional[str] = None
    used_percent: Optional[int] = None
    available_percent: Optional[int] = None
    raw_output: Optional[str] = None


class NtpSourceStatus(BaseModel):
    mode: Optional[str] = None
    state: Optional[str] = None
    source: Optional[str] = None
    stratum: Optional[int] = None
    poll: Optional[int] = None
    reach: Optional[int] = None
    last_rx: Optional[str] = None
    last_sample: Optional[str] = None


class NtpStatusResponse(BaseModel):
    enabled: bool
    synchronized: Optional[bool] = None
    leap_status: Optional[str] = None
    reference_id: Optional[str] = None
    reference_name: Optional[str] = None
    stratum: Optional[int] = None
    system_time: Optional[str] = None
    last_offset: Optional[str] = None
    rms_offset: Optional[str] = None
    frequency: Optional[str] = None
    root_delay: Optional[str] = None
    root_dispersion: Optional[str] = None
    update_interval: Optional[str] = None

    sources_online: Optional[int] = None
    sources_offline: Optional[int] = None
    sources_unknown: Optional[int] = None

    sources: List[NtpSourceStatus] = Field(default_factory=list)

    raw_tracking: Optional[str] = None
    raw_activity: Optional[str] = None
    raw_sources: Optional[str] = None


class NtpServerConfig(BaseModel):
    address: str
    prefer: bool = False
    pool: bool = False
    noselect: bool = False
    nts: bool = False
    interleave: bool = False
    ptp: bool = False


class NtpServiceConfigResponse(BaseModel):
    enabled: bool
    servers: List[NtpServerConfig] = Field(default_factory=list)
    allow_clients: List[str] = Field(default_factory=list)
    listen_addresses: List[str] = Field(default_factory=list)


class NtpServiceConfigRequest(BaseModel):
    enabled: bool = True
    servers: List[NtpServerConfig] = Field(default_factory=list)
    allow_clients: List[str] = Field(default_factory=list)
    listen_addresses: List[str] = Field(default_factory=list)


# ========================================================================
# SSH Service Models
# ========================================================================


class SshServiceConfigResponse(BaseModel):
    enabled: bool = False
    port: Optional[int] = None
    listen_addresses: List[str] = Field(default_factory=list)
    disable_password_authentication: bool = False


class SshServiceConfigRequest(BaseModel):
    enabled: bool = False
    port: Optional[int] = 22
    listen_addresses: List[str] = Field(default_factory=list)
    disable_password_authentication: bool = False


# ========================================================================
# DNS Service Models
# ========================================================================


class DnsForwardingDomainOverride(BaseModel):
    domain: str
    name_servers: List[str] = Field(default_factory=list)


class DnsHostOverride(BaseModel):
    hostname: str
    addresses: List[str] = Field(default_factory=list)
    aliases: List[str] = Field(default_factory=list)


class DnsServiceConfigResponse(BaseModel):
    enabled: bool = False
    local_domain_name: Optional[str] = None
    listen_addresses: List[str] = Field(default_factory=list)
    allow_from: List[str] = Field(default_factory=list)
    name_servers: List[str] = Field(default_factory=list)
    use_system_name_servers: bool = False
    cache_size: Optional[int] = None
    authoritative_domains: List[str] = Field(default_factory=list)
    domain_overrides: List[DnsForwardingDomainOverride] = Field(default_factory=list)
    host_overrides: List[DnsHostOverride] = Field(default_factory=list)


class DnsServiceConfigRequest(BaseModel):
    enabled: bool = False
    local_domain_name: Optional[str] = None
    listen_addresses: List[str] = Field(default_factory=list)
    allow_from: List[str] = Field(default_factory=list)
    name_servers: List[str] = Field(default_factory=list)
    use_system_name_servers: bool = False
    cache_size: Optional[int] = None
    authoritative_domains: List[str] = Field(default_factory=list)
    domain_overrides: List[DnsForwardingDomainOverride] = Field(default_factory=list)
    host_overrides: List[DnsHostOverride] = Field(default_factory=list)


# ========================================================================
# LLDP Service Models
# ========================================================================


LldpInterfaceMode = Literal["disable", "rx-tx", "rx", "tx"]


class LldpInterfaceConfig(BaseModel):
    interface: str
    mode: Optional[LldpInterfaceMode] = None


class LldpServiceConfigResponse(BaseModel):
    enabled: bool = False
    all_interfaces: bool = True
    interfaces: List[LldpInterfaceConfig] = Field(default_factory=list)
    management_addresses: List[str] = Field(default_factory=list)
    snmp: bool = False
    legacy_protocols: List[str] = Field(default_factory=list)


class LldpServiceConfigRequest(BaseModel):
    enabled: bool = False
    all_interfaces: bool = True
    interfaces: List[LldpInterfaceConfig] = Field(default_factory=list)
    management_addresses: List[str] = Field(default_factory=list)
    snmp: bool = False
    legacy_protocols: List[str] = Field(default_factory=list)


class LldpNeighbor(BaseModel):
    local_interface: Optional[str] = None
    chassis_id: Optional[str] = None
    port_id: Optional[str] = None
    port_description: Optional[str] = None
    system_name: Optional[str] = None
    system_description: Optional[str] = None
    platform: Optional[str] = None
    capabilities: Optional[str] = None
    raw: str


class LldpStatusResponse(BaseModel):
    enabled: bool
    neighbors: List[LldpNeighbor] = Field(default_factory=list)
    raw_neighbors: Optional[str] = None
    raw_neighbors_detail: Optional[str] = None
    error: Optional[str] = None


# ========================================================================
# mDNS Repeater (Avahi) Models
# ========================================================================


MdnsIpVersion = Literal["ipv4", "ipv6", "both"]


class MdnsRepeaterConfigResponse(BaseModel):
    configured: bool = False
    enabled: bool = False
    interfaces: List[str] = Field(default_factory=list)
    ip_version: MdnsIpVersion = "both"
    allow_services: List[str] = Field(default_factory=list)
    browse_domains: List[str] = Field(default_factory=list)
    cache_entries: Optional[int] = None


class MdnsRepeaterConfigRequest(BaseModel):
    enabled: bool = False
    interfaces: List[str] = Field(default_factory=list)
    ip_version: MdnsIpVersion = "both"
    allow_services: List[str] = Field(default_factory=list)
    browse_domains: List[str] = Field(default_factory=list)
    cache_entries: Optional[int] = None


class MdnsRepeaterStatusResponse(BaseModel):
    enabled: bool
    raw_log: Optional[str] = None
    error: Optional[str] = None


# ========================================================================
# Acceleration Models (QAT + VPP/DPDK)
# ========================================================================


class QatConfigResponse(BaseModel):
    enabled: bool = False


class QatConfigRequest(BaseModel):
    enabled: bool = False


class QatStatusResponse(BaseModel):
    available: bool = False
    raw_devices: Optional[str] = None
    raw_status: Optional[str] = None
    error: Optional[str] = None


VppInterfaceDriver = Literal["dpdk", "xdp"]


class VppInterfaceDriverConfig(BaseModel):
    interface: str
    driver: VppInterfaceDriver


class VppHostResourcesConfig(BaseModel):
    max_map_count: Optional[int] = None
    nr_hugepages: Optional[int] = None
    shmmax: Optional[str] = None


class VppMemoryConfig(BaseModel):
    main_heap_page_size: Optional[str] = None
    main_heap_size: Optional[str] = None


class VppStatsegConfig(BaseModel):
    page_size: Optional[str] = None
    size: Optional[str] = None


class VppLcpNetlinkConfig(BaseModel):
    rx_buffer_size: Optional[str] = None


class VppLcpConfig(BaseModel):
    ignore_kernel_routes: bool = False
    netlink: VppLcpNetlinkConfig = Field(default_factory=VppLcpNetlinkConfig)


class VppSettingsConfigResponse(BaseModel):
    enabled: bool = False
    interfaces: List[VppInterfaceDriverConfig] = Field(default_factory=list)
    lcp: VppLcpConfig = Field(default_factory=VppLcpConfig)
    host_resources: VppHostResourcesConfig = Field(default_factory=VppHostResourcesConfig)
    memory: VppMemoryConfig = Field(default_factory=VppMemoryConfig)
    statseg: VppStatsegConfig = Field(default_factory=VppStatsegConfig)


class VppSettingsConfigRequest(BaseModel):
    enabled: bool = False
    interfaces: List[VppInterfaceDriverConfig] = Field(default_factory=list)
    lcp: VppLcpConfig = Field(default_factory=VppLcpConfig)
    host_resources: VppHostResourcesConfig = Field(default_factory=VppHostResourcesConfig)
    memory: VppMemoryConfig = Field(default_factory=VppMemoryConfig)
    statseg: VppStatsegConfig = Field(default_factory=VppStatsegConfig)


class VppStatusResponse(BaseModel):
    available: bool = False
    raw_output: Optional[str] = None
    error: Optional[str] = None


class SystemLogEntry(BaseModel):
    raw: str
    timestamp: Optional[str] = None
    host: Optional[str] = None
    process: Optional[str] = None
    severity: Optional[str] = None
    message: Optional[str] = None


class SystemLogsResponse(BaseModel):
    available: bool = False
    source_command: Optional[str] = None
    total_lines: int = 0
    returned_lines: int = 0
    entries: List[SystemLogEntry] = Field(default_factory=list)
    raw_output: Optional[str] = None


class LocalUserAuthState(BaseModel):
    has_plaintext_password: bool = False
    has_encrypted_password: bool = False
    has_public_keys: bool = False


class LocalUserSummary(BaseModel):
    username: str
    full_name: Optional[str] = None
    level: Optional[str] = None
    disabled: bool = False
    auth: LocalUserAuthState = Field(default_factory=LocalUserAuthState)
    public_key_names: List[str] = Field(default_factory=list)
    public_keys: List[str] = Field(default_factory=list)


class LocalUsersResponse(BaseModel):
    users: List[LocalUserSummary] = Field(default_factory=list)
    total: int = 0


class LocalUserCreateRequest(BaseModel):
    username: str
    full_name: Optional[str] = None
    level: Optional[str] = None
    password: Optional[str] = None
    password_type: Literal["plaintext", "encrypted"] = "plaintext"
    ssh_public_keys: List[str] = Field(default_factory=list)
    disabled: bool = False


class LocalUserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    level: Optional[str] = None
    password: Optional[str] = None
    password_type: Literal["plaintext", "encrypted"] = "plaintext"
    ssh_public_keys: Optional[List[str]] = None
    disabled: Optional[bool] = None


class LocalUserOperationResponse(BaseModel):
    success: bool
    username: str
    message: str


def _parse_ntp_service_config(full_config: Dict[str, Any]) -> NtpServiceConfigResponse:
    service_config = full_config.get("service", {})
    ntp_config = service_config.get("ntp")

    if not isinstance(ntp_config, dict):
        return NtpServiceConfigResponse(enabled=False)

    raw_servers = ntp_config.get("server", {})
    servers: List[NtpServerConfig] = []

    if isinstance(raw_servers, dict):
        for address, options in raw_servers.items():
            option_data = options if isinstance(options, dict) else {}
            servers.append(
                NtpServerConfig(
                    address=str(address),
                    prefer="prefer" in option_data,
                    pool="pool" in option_data,
                    noselect="noselect" in option_data,
                    nts="nts" in option_data,
                    interleave="interleave" in option_data,
                    ptp="ptp" in option_data,
                )
            )

    allow_clients = _extract_tag_values(ntp_config, ["allow-client", "address"])
    listen_addresses = _extract_tag_values(ntp_config, ["listen-address"])

    return NtpServiceConfigResponse(
        enabled=True,
        servers=sorted(servers, key=lambda server: server.address),
        allow_clients=allow_clients,
        listen_addresses=listen_addresses,
    )


def _parse_ssh_service_config(full_config: Dict[str, Any]) -> SshServiceConfigResponse:
    service_root = _as_dict(full_config.get("service"))
    ssh_root = service_root.get("ssh")

    if not isinstance(ssh_root, dict):
        return SshServiceConfigResponse(enabled=False)

    port = _safe_int(ssh_root.get("port"))
    if port is not None and (port < 1 or port > 65535):
        port = None

    listen_addresses = _extract_tag_values(ssh_root, ["listen-address"])

    return SshServiceConfigResponse(
        enabled=True,
        port=port,
        listen_addresses=listen_addresses,
        disable_password_authentication=("disable-password-authentication" in ssh_root),
    )


def _normalize_hostname_or_400(value: str, field_name: str = "hostname") -> str:
    text = value.strip()
    if not text:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    if not RE_HOSTNAME_TOKEN.match(text):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}: {text}")
    return text


def _parse_dns_service_config(full_config: Dict[str, Any]) -> DnsServiceConfigResponse:
    service_root = _as_dict(full_config.get("service"))
    dns_root = _as_dict(service_root.get("dns"))
    forwarding_root = dns_root.get("forwarding")

    system_root = _as_dict(full_config.get("system"))
    local_domain_name = _string_or_none(system_root.get("domain-name"))

    host_mapping_root = _as_dict(_as_dict(system_root.get("static-host-mapping")).get("host-name"))
    host_overrides: List[DnsHostOverride] = []
    for host_name, host_data in sorted(host_mapping_root.items(), key=lambda item: str(item[0])):
        hostname = str(host_name).strip()
        if not hostname:
            continue
        data = _as_dict(host_data)
        host_overrides.append(
            DnsHostOverride(
                hostname=hostname,
                addresses=_extract_tag_values(data, ["inet"]),
                aliases=_extract_tag_values(data, ["alias"]),
            )
        )

    if not isinstance(forwarding_root, dict):
        return DnsServiceConfigResponse(
            enabled=False,
            local_domain_name=local_domain_name,
            host_overrides=host_overrides,
        )

    domain_overrides: List[DnsForwardingDomainOverride] = []
    raw_domain_overrides = _as_dict(forwarding_root.get("domain"))
    for domain_name, domain_data in sorted(raw_domain_overrides.items(), key=lambda item: str(item[0])):
        domain = str(domain_name).strip()
        if not domain:
            continue
        domain_overrides.append(
            DnsForwardingDomainOverride(
                domain=domain,
                name_servers=_extract_tag_values(_as_dict(domain_data), ["name-server"]),
            )
        )

    return DnsServiceConfigResponse(
        enabled=True,
        local_domain_name=local_domain_name,
        listen_addresses=_extract_tag_values(forwarding_root, ["listen-address"]),
        allow_from=_extract_tag_values(forwarding_root, ["allow-from"]),
        name_servers=_extract_tag_values(forwarding_root, ["name-server"]),
        use_system_name_servers=("system" in forwarding_root),
        cache_size=_safe_int(forwarding_root.get("cache-size")),
        authoritative_domains=_extract_tag_values(forwarding_root, ["authoritative-domain"]),
        domain_overrides=domain_overrides,
        host_overrides=host_overrides,
    )


RE_INTERFACE_NAME = re.compile(r"^[A-Za-z0-9._:-]+$")


def _normalize_interface_name_or_400(name: str, field_name: str = "interface") -> str:
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    if not RE_INTERFACE_NAME.match(cleaned):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}: {cleaned}")
    return cleaned


def _string_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value).strip() or None


def _parse_lldp_service_config(full_config: Dict[str, Any]) -> LldpServiceConfigResponse:
    service_root = _as_dict(full_config.get("service"))
    lldp_root = service_root.get("lldp")

    if not isinstance(lldp_root, dict):
        return LldpServiceConfigResponse(enabled=False)

    management_addresses = _extract_tag_values(lldp_root, ["management-address"])
    legacy_protocols = _extract_tag_values(lldp_root, ["legacy-protocols"])
    snmp = "snmp" in lldp_root

    all_interfaces = True
    interfaces: List[LldpInterfaceConfig] = []

    raw_interfaces = lldp_root.get("interface")
    if isinstance(raw_interfaces, dict):
        for iface_name, iface_value in sorted(raw_interfaces.items(), key=lambda item: str(item[0])):
            iface = str(iface_name).strip()
            if not iface:
                continue
            if iface.lower() == "all":
                all_interfaces = True
                continue

            all_interfaces = False
            iface_data = iface_value if isinstance(iface_value, dict) else {}
            mode_value = iface_data.get("mode")
            mode: Optional[LldpInterfaceMode] = None
            if isinstance(mode_value, str) and mode_value.strip():
                normalized = mode_value.strip().lower()
                if normalized in {"disable", "rx-tx", "rx", "tx"}:
                    mode = normalized  # type: ignore[assignment]

            interfaces.append(LldpInterfaceConfig(interface=iface, mode=mode))

    elif isinstance(raw_interfaces, list):
        cleaned = [str(item).strip() for item in raw_interfaces if str(item).strip()]
        if any(item.lower() == "all" for item in cleaned):
            all_interfaces = True
        else:
            all_interfaces = False
            for iface in sorted(set(cleaned)):
                interfaces.append(LldpInterfaceConfig(interface=iface))

    return LldpServiceConfigResponse(
        enabled=True,
        all_interfaces=all_interfaces,
        interfaces=interfaces,
        management_addresses=management_addresses,
        snmp=snmp,
        legacy_protocols=legacy_protocols,
    )


ANSI_ESCAPE_RE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def _strip_ansi(text: str) -> str:
    return ANSI_ESCAPE_RE.sub("", text or "")


def _split_table_columns(line: str) -> List[str]:
    return [segment.strip() for segment in re.split(r"\s{2,}", line.strip()) if segment.strip()]


def _parse_lldp_neighbors_output(output: str) -> List[LldpNeighbor]:
    cleaned = _strip_ansi(output or "")
    lines = [line.rstrip("\r") for line in cleaned.splitlines() if line.strip()]
    if not lines:
        return []

    header_index: Optional[int] = None
    for index, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r"(?i)^(interface|local\\s+port|local\\s+interface)\\b", stripped):
            header_index = index
            break

    if header_index is None:
        return []

    headers = _split_table_columns(lines[header_index])
    if not headers:
        return []

    def find_index(predicate) -> Optional[int]:
        for idx, header in enumerate(headers):
            if predicate(header.lower()):
                return idx
        return None

    idx_local = find_index(
        lambda h: h.startswith("interface")
        or ("local" in h and "port" in h)
        or ("local" in h and "interface" in h)
    )
    idx_chassis = find_index(lambda h: "chassis" in h)
    idx_port_id = find_index(lambda h: "port" in h and "id" in h)
    idx_port_descr = find_index(lambda h: "port" in h and ("descr" in h or "description" in h))
    idx_sys_name = find_index(lambda h: ("sys" in h and "name" in h) or ("system" in h and "name" in h))
    idx_sys_descr = find_index(
        lambda h: ("sys" in h and ("descr" in h or "description" in h))
        or ("system" in h and ("descr" in h or "description" in h))
    )
    idx_platform = find_index(lambda h: "platform" in h)
    idx_caps = find_index(lambda h: "cap" in h)

    neighbors: List[LldpNeighbor] = []

    for line in lines[header_index + 1:]:
        if re.match(r"^-{3,}$", line.strip()):
            continue

        parts = _split_table_columns(line)
        if len(parts) < 2:
            continue

        if len(parts) < len(headers):
            parts += [""] * (len(headers) - len(parts))

        def get(idx: Optional[int]) -> Optional[str]:
            if idx is None or idx >= len(parts):
                return None
            value = parts[idx].strip()
            return value or None

        neighbors.append(
            LldpNeighbor(
                local_interface=get(idx_local),
                chassis_id=get(idx_chassis),
                port_id=get(idx_port_id),
                port_description=get(idx_port_descr),
                system_name=get(idx_sys_name),
                system_description=get(idx_sys_descr),
                platform=get(idx_platform),
                capabilities=get(idx_caps),
                raw=line.strip(),
            )
        )

    return neighbors


def _parse_mdns_repeater_config(full_config: Dict[str, Any]) -> MdnsRepeaterConfigResponse:
    service_root = _as_dict(full_config.get("service"))
    mdns_root = _as_dict(service_root.get("mdns"))
    repeater_root = mdns_root.get("repeater")

    if not isinstance(repeater_root, dict):
        return MdnsRepeaterConfigResponse(configured=False, enabled=False)

    interfaces = _extract_tag_values(repeater_root, ["interface"])

    ip_version_value = repeater_root.get("ip-version")
    ip_version: MdnsIpVersion = "both"
    if isinstance(ip_version_value, str) and ip_version_value.strip():
        value = ip_version_value.strip().lower()
        if value in {"ipv4", "ipv6", "both"}:
            ip_version = value  # type: ignore[assignment]

    allow_services = _extract_tag_values(repeater_root, ["allow-service"])
    browse_domains = _extract_tag_values(repeater_root, ["browse-domain"])
    cache_entries = _safe_int(repeater_root.get("cache-entries"))

    enabled = "disable" not in repeater_root

    return MdnsRepeaterConfigResponse(
        configured=True,
        enabled=enabled,
        interfaces=interfaces,
        ip_version=ip_version,
        allow_services=allow_services,
        browse_domains=browse_domains,
        cache_entries=cache_entries,
    )


def _parse_qat_config(full_config: Dict[str, Any]) -> QatConfigResponse:
    system_root = _as_dict(full_config.get("system"))
    accel_root = _as_dict(system_root.get("acceleration"))
    return QatConfigResponse(enabled="qat" in accel_root)


def _parse_vpp_settings_config(full_config: Dict[str, Any]) -> VppSettingsConfigResponse:
    vpp_root = _as_dict(full_config.get("vpp"))
    settings_root = _as_dict(vpp_root.get("settings"))
    enabled = bool(settings_root)

    interfaces: List[VppInterfaceDriverConfig] = []
    interface_root = _as_dict(settings_root.get("interface"))
    for iface_name, iface_data in sorted(interface_root.items(), key=lambda item: str(item[0])):
        iface = str(iface_name).strip()
        if not iface:
            continue
        data = _as_dict(iface_data)
        driver_value = data.get("driver")
        driver = _string_or_none(driver_value)
        if driver:
            normalized = driver.lower()
            if normalized in {"dpdk", "xdp"}:
                interfaces.append(VppInterfaceDriverConfig(interface=iface, driver=normalized))  # type: ignore[arg-type]

    lcp_root = _as_dict(settings_root.get("lcp"))
    netlink_root = _as_dict(lcp_root.get("netlink"))
    lcp = VppLcpConfig(
        ignore_kernel_routes="ignore-kernel-routes" in lcp_root,
        netlink=VppLcpNetlinkConfig(rx_buffer_size=_string_or_none(netlink_root.get("rx-buffer-size"))),
    )

    host_resources_root = _as_dict(settings_root.get("host-resources"))
    host_resources = VppHostResourcesConfig(
        max_map_count=_safe_int(host_resources_root.get("max-map-count")),
        nr_hugepages=_safe_int(host_resources_root.get("nr-hugepages")),
        shmmax=_string_or_none(host_resources_root.get("shmmax")),
    )

    memory_root = _as_dict(settings_root.get("memory"))
    memory = VppMemoryConfig(
        main_heap_page_size=_string_or_none(memory_root.get("main-heap-page-size")),
        main_heap_size=_string_or_none(memory_root.get("main-heap-size")),
    )

    statseg_root = _as_dict(settings_root.get("statseg"))
    statseg = VppStatsegConfig(
        page_size=_string_or_none(statseg_root.get("page-size")),
        size=_string_or_none(statseg_root.get("size")),
    )

    return VppSettingsConfigResponse(
        enabled=enabled,
        interfaces=interfaces,
        lcp=lcp,
        host_resources=host_resources,
        memory=memory,
        statseg=statseg,
    )


def _normalize_local_username_or_400(username: str, field_name: str = "username") -> str:
    clean = username.strip()
    if not clean:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    if not RE_LOCAL_USERNAME.match(clean):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name} '{clean}'. Use letters, numbers, dot, underscore, dash.",
        )
    return clean


def _normalize_local_level_or_400(level: str) -> str:
    clean = level.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="level cannot be empty")
    if not RE_LOCAL_LEVEL.match(clean):
        raise HTTPException(status_code=400, detail=f"Invalid level '{clean}'")
    return clean


def _extract_local_users_raw(full_config: Dict[str, Any]) -> Dict[str, Any]:
    system_root = _as_dict(full_config.get("system"))
    login_root = _as_dict(system_root.get("login"))
    return _as_dict(login_root.get("user"))


def _parse_local_users(full_config: Dict[str, Any]) -> List[LocalUserSummary]:
    users_root = _extract_local_users_raw(full_config)
    parsed_users: List[LocalUserSummary] = []

    for username, user_data in sorted(users_root.items(), key=lambda item: str(item[0])):
        name = str(username).strip()
        if not name:
            continue

        data = _as_dict(user_data)
        auth = _as_dict(data.get("authentication"))
        public_keys = _as_dict(auth.get("public-keys"))
        parsed_public_keys: List[str] = []
        for key_entry in public_keys.values():
            key_data = _as_dict(key_entry)
            key_value = key_data.get("key")
            if isinstance(key_value, str) and key_value.strip():
                parsed_public_keys.append(key_value.strip())

        parsed_users.append(
            LocalUserSummary(
                username=name,
                full_name=data.get("full-name"),
                level=data.get("level"),
                disabled="disable" in data,
                auth=LocalUserAuthState(
                    has_plaintext_password=bool(_as_dict(auth).get("plaintext-password")),
                    has_encrypted_password=bool(_as_dict(auth).get("encrypted-password")),
                    has_public_keys=bool(public_keys),
                ),
                public_key_names=sorted(
                    [str(key).strip() for key in public_keys.keys() if str(key).strip()]
                ),
                public_keys=parsed_public_keys,
            )
        )

    return parsed_users


def _find_local_user(users: List[LocalUserSummary], username: str) -> Optional[LocalUserSummary]:
    for user in users:
        if user.username == username:
            return user
    return None


def _infer_log_severity(line: str) -> Optional[str]:
    lowered = line.lower()
    if "emerg" in lowered:
        return "emerg"
    if "alert" in lowered:
        return "alert"
    if "critical" in lowered or "crit" in lowered:
        return "crit"
    if "error" in lowered or " err " in lowered:
        return "err"
    if "warning" in lowered or " warn" in lowered:
        return "warning"
    if "notice" in lowered:
        return "notice"
    if "info" in lowered:
        return "info"
    if "debug" in lowered:
        return "debug"
    return None


def _parse_log_line(raw_line: str) -> SystemLogEntry:
    line = raw_line.rstrip()
    if not line:
        return SystemLogEntry(raw=raw_line)

    iso_match = re.match(r"^(\d{4}-\d{2}-\d{2}[T ][^\s]+)\s+(\S+)\s+([^:]+):\s*(.*)$", line)
    if iso_match:
        message = iso_match.group(4).strip()
        return SystemLogEntry(
            raw=raw_line,
            timestamp=iso_match.group(1),
            host=iso_match.group(2),
            process=iso_match.group(3).strip(),
            severity=_infer_log_severity(message or line),
            message=message or None,
        )

    syslog_match = re.match(
        r"^([A-Z][a-z]{2}\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+([^:]+):\s*(.*)$",
        line,
    )
    if syslog_match:
        message = syslog_match.group(4).strip()
        return SystemLogEntry(
            raw=raw_line,
            timestamp=syslog_match.group(1),
            host=syslog_match.group(2),
            process=syslog_match.group(3).strip(),
            severity=_infer_log_severity(message or line),
            message=message or None,
        )

    return SystemLogEntry(raw=raw_line, severity=_infer_log_severity(line), message=line)


def _build_log_command_sets(source: Literal["auto", "syslog", "tail", "system"], max_lines: int) -> List[Tuple[str, List[List[str]]]]:
    tail_commands: List[List[str]] = [
        ["log", "tail", str(max_lines)],
        ["log", "tail", "lines", str(max_lines)],
        ["log", "tail"],
    ]

    command_map: Dict[str, Tuple[str, List[List[str]]]] = {
        "syslog": ("show log (syslog)", [["log"]]),
        "tail": ("show log tail", tail_commands),
        "system": ("show system logs", [["system", "logs"]]),
    }

    if source == "syslog":
        return [command_map["syslog"]]
    if source == "tail":
        return [command_map["tail"]]
    if source == "system":
        return [command_map["system"]]

    # auto mode: prefer syslog output (usually richer), then tail/system fallback
    return [command_map["syslog"], command_map["tail"], command_map["system"]]


async def _collect_log_output(
    service: Any,
    source: Literal["auto", "syslog", "tail", "system"],
    max_lines: int,
) -> Tuple[Optional[str], str]:
    selected_command: Optional[str] = None
    best_output = ""
    best_line_count = 0

    for command_label, command_paths in _build_log_command_sets(source, max_lines):
        for command_path in command_paths:
            response = await run_in_threadpool(service.device.show, path=command_path)
            if response.status != 200:
                continue

            output = _extract_show_output(response.result).strip()
            if not output:
                continue

            selected_command = command_label
            line_count = len([line for line in output.splitlines() if line.strip()])

            if line_count > best_line_count:
                best_line_count = line_count
                best_output = output

            # If this command already provided enough rows, stop probing fallbacks.
            if line_count >= max_lines:
                return selected_command, output

        # In explicit source mode, don't cross over into another source family.
        if source != "auto" and best_output:
            return selected_command, best_output

    return selected_command, best_output


# ========================================================================
# Existing Endpoints
# ========================================================================


@router.get("/info", response_model=SystemInfo)
async def get_system_info(request: Request) -> SystemInfo:
    """
    Get system information about the active VyOS instance.

    Returns:
    - instance_id: The ID of the connected instance
    - instance_name: The name of the instance
    - site_name: The site the instance belongs to
    - vyos_version: VyOS version (e.g., "1.4", "1.5")
    - connection_host: The hostname/IP we're connected to
    - connected: Whether we can connect to the device
    """
    try:
        service = get_session_vyos_service(request)
        instance = request.state.instance

        version = service.get_version()
        hostname = service.config.hostname

        # Try to get config to verify connection
        try:
            await run_in_threadpool(service.get_full_config)
            connected = True
        except Exception:
            connected = False

        site = getattr(request.state, "site", None)

        return SystemInfo(
            instance_id=instance['id'],
            instance_name=instance['name'],
            site_name=site["name"] if site and site.get("name") else "Unknown",
            vyos_version=version,
            connection_host=hostname,
            connected=connected,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving system info: {str(e)}")


@router.get("/config", response_model=SystemConfig)
async def get_system_config(request: Request, refresh: bool = False) -> SystemConfig:
    """
    Get system configuration from VyOS (hostname, timezone, name servers, etc.).

    This endpoint retrieves system-level configuration that may differ between
    VyOS versions 1.4 and 1.5, and returns it in a generalized format.

    Args:
        request: FastAPI request object (contains user session)
        refresh: If True, force refresh from VyOS. If False, use cache.

    Returns:
        SystemConfig with generalized system settings
    """
    try:
        service = get_session_vyos_service(request)

        # Get full config (will use cache unless refresh=True)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)

        # Extract system configuration
        system_config = full_config.get("system", {})

        # Parse hostname
        hostname = system_config.get("host-name")

        # Parse timezone
        timezone = system_config.get("time-zone")

        # Parse name servers (can be string or list depending on version)
        name_servers = []
        ns_value = system_config.get("name-server")
        if ns_value:
            if isinstance(ns_value, list):
                name_servers = ns_value
            elif isinstance(ns_value, str):
                name_servers = [ns_value]

        # Parse domain name
        domain_name = system_config.get("domain-name")

        return SystemConfig(
            hostname=hostname,
            timezone=timezone,
            name_servers=name_servers,
            domain_name=domain_name,
            raw_config=system_config,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving system config: {str(e)}")


# ========================================================================
# New Dashboard/System Service Endpoints
# ========================================================================


@router.get("/dashboard-summary", response_model=SystemDashboardSummary)
async def get_dashboard_summary(request: Request, refresh: bool = False) -> SystemDashboardSummary:
    """Get pfsense-like system summary metrics for dashboard cards."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        config_result, version_response, uptime_response, cpu_response, memory_response = await asyncio.gather(
            run_in_threadpool(service.get_full_config, refresh=refresh),
            run_in_threadpool(service.device.show, path=["version"]),
            run_in_threadpool(service.device.show, path=["system", "uptime"]),
            run_in_threadpool(service.device.show, path=["system", "cpu"]),
            run_in_threadpool(service.device.show, path=["system", "memory"]),
            return_exceptions=True,
        )

        full_config = config_result if isinstance(config_result, dict) else {}
        hostname = full_config.get("system", {}).get("host-name")

        def _show_output(response: Any) -> str:
            if isinstance(response, Exception) or response is None:
                return ""
            if getattr(response, "status", None) == 200:
                return _extract_show_output(getattr(response, "result", "")) or ""
            return ""

        version_output = _show_output(version_response)
        uptime_output = _show_output(uptime_response)
        cpu_output = _show_output(cpu_response)
        memory_output = _show_output(memory_response)

        summary = SystemDashboardSummary(hostname=hostname)

        if version_output:
            summary = summary.model_copy(update=_parse_version_output(version_output))

        if uptime_output:
            summary = summary.model_copy(update=_parse_uptime_output(uptime_output))

        if cpu_output:
            summary = summary.model_copy(update=_parse_cpu_output(cpu_output))

        if memory_output:
            summary = summary.model_copy(update=_parse_memory_output(memory_output))

        temperature_output = ""
        for command_path in (
            ["hardware", "temperature"],
            ["system", "temperature"],
            ["hardware", "sensors"],
        ):
            try:
                response = await run_in_threadpool(service.device.show, path=command_path)
            except Exception:
                continue

            if getattr(response, "status", None) != 200:
                continue

            candidate = _extract_show_output(getattr(response, "result", ""))
            if candidate.strip():
                temperature_output = candidate
                break

        if temperature_output:
            summary = summary.model_copy(update=_parse_cpu_temperature_output(temperature_output))

        return summary
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving dashboard summary: {str(e)}")


@router.get("/disk-status", response_model=DiskStatusResponse)
async def get_disk_status(request: Request) -> DiskStatusResponse:
    """Get persistent storage usage for disk dashboard card."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        response = await run_in_threadpool(service.device.show, path=["system", "storage"])

        if response.status != 200:
            return DiskStatusResponse(available=False, raw_output=response.error or None)

        output = _extract_show_output(response.result)
        parsed = _parse_storage_output(output)

        return DiskStatusResponse(
            available=bool(parsed.get("filesystem")),
            filesystem=parsed.get("filesystem"),
            size_human=parsed.get("size_human"),
            used_human=parsed.get("used_human"),
            available_human=parsed.get("available_human"),
            used_percent=parsed.get("used_percent"),
            available_percent=parsed.get("available_percent"),
            raw_output=output or None,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving disk status: {str(e)}")


@router.get("/ntp-status", response_model=NtpStatusResponse)
async def get_ntp_status(request: Request, refresh: bool = False) -> NtpStatusResponse:
    """Get NTP runtime status for dashboard card and system services view."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        ntp_config = _parse_ntp_service_config(full_config)

        if not ntp_config.enabled:
            return NtpStatusResponse(enabled=False)

        tracking_output = ""
        activity_output = ""
        sources_output = ""

        tracking_response, activity_response, sources_response = await asyncio.gather(
            run_in_threadpool(service.device.show, path=["ntp", "system"]),
            run_in_threadpool(service.device.show, path=["ntp", "activity"]),
            run_in_threadpool(service.device.show, path=["ntp", "sources"]),
            return_exceptions=True,
        )

        if not isinstance(tracking_response, Exception) and tracking_response.status == 200:
            tracking_output = _extract_show_output(tracking_response.result)

        if not isinstance(activity_response, Exception) and activity_response.status == 200:
            activity_output = _extract_show_output(activity_response.result)

        if not isinstance(sources_response, Exception) and sources_response.status == 200:
            sources_output = _extract_show_output(sources_response.result)

        tracking = _parse_ntp_tracking_output(tracking_output) if tracking_output else {}
        activity = _parse_ntp_activity_output(activity_output) if activity_output else {}
        sources = _parse_ntp_sources_output(sources_output) if sources_output else []

        leap_status = tracking.get("leap_status")
        synchronized: Optional[bool] = None
        if isinstance(leap_status, str):
            lowered = leap_status.lower()
            if "normal" in lowered:
                synchronized = True
            elif "not synchronised" in lowered or "not synchronized" in lowered:
                synchronized = False

        return NtpStatusResponse(
            enabled=True,
            synchronized=synchronized,
            leap_status=tracking.get("leap_status"),
            reference_id=tracking.get("reference_id"),
            reference_name=tracking.get("reference_name"),
            stratum=tracking.get("stratum"),
            system_time=tracking.get("system_time"),
            last_offset=tracking.get("last_offset"),
            rms_offset=tracking.get("rms_offset"),
            frequency=tracking.get("frequency"),
            root_delay=tracking.get("root_delay"),
            root_dispersion=tracking.get("root_dispersion"),
            update_interval=tracking.get("update_interval"),
            sources_online=activity.get("sources_online"),
            sources_offline=activity.get("sources_offline"),
            sources_unknown=activity.get("sources_unknown"),
            sources=[NtpSourceStatus(**source) for source in sources],
            raw_tracking=tracking_output or None,
            raw_activity=activity_output or None,
            raw_sources=sources_output or None,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving NTP status: {str(e)}")


@router.get("/ntp-config", response_model=NtpServiceConfigResponse)
async def get_ntp_config(request: Request, refresh: bool = False) -> NtpServiceConfigResponse:
    """Get current NTP service configuration from VyOS config tree."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _parse_ntp_service_config(full_config)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving NTP configuration: {str(e)}")


@router.put("/ntp-config", response_model=NtpServiceConfigResponse)
async def update_ntp_config(request: Request, body: NtpServiceConfigRequest) -> NtpServiceConfigResponse:
    """Update NTP service configuration (servers + allow-client + listen-address)."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        normalized_servers: List[NtpServerConfig] = []
        seen_servers = set()
        for server in body.servers:
            address = server.address.strip()
            if not address:
                continue
            if address in seen_servers:
                raise HTTPException(status_code=400, detail=f"Duplicate NTP server: {address}")
            seen_servers.add(address)
            normalized_servers.append(
                NtpServerConfig(
                    address=address,
                    prefer=server.prefer,
                    pool=server.pool,
                    noselect=server.noselect,
                    nts=server.nts,
                    interleave=server.interleave,
                    ptp=server.ptp,
                )
            )

        allow_clients = _normalize_unique_strings(body.allow_clients)
        listen_addresses = _normalize_unique_strings(body.listen_addresses)

        if body.enabled and not normalized_servers:
            raise HTTPException(status_code=400, detail="At least one NTP server is required when NTP is enabled")

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current = _parse_ntp_service_config(full_config)

        operations: List[Dict[str, Any]] = []

        if not body.enabled:
            if current.enabled:
                operations.append({"op": "delete", "path": ["service", "ntp"]})
        else:
            current_servers = {server.address: server for server in current.servers}
            desired_servers = {server.address: server for server in normalized_servers}

            # Remove deleted servers
            for server_address in sorted(set(current_servers.keys()) - set(desired_servers.keys())):
                operations.append(
                    {
                        "op": "delete",
                        "path": ["service", "ntp", "server", server_address],
                    }
                )

            # Add/update desired servers and options
            option_fields = ["prefer", "pool", "noselect", "nts", "interleave", "ptp"]
            for server_address, desired in desired_servers.items():
                existing = current_servers.get(server_address)

                if existing is None:
                    operations.append(
                        {
                            "op": "set",
                            "path": ["service", "ntp", "server", server_address],
                        }
                    )

                for option in option_fields:
                    current_value = getattr(existing, option) if existing else False
                    desired_value = getattr(desired, option)

                    if desired_value and not current_value:
                        operations.append(
                            {
                                "op": "set",
                                "path": ["service", "ntp", "server", server_address, option],
                            }
                        )
                    elif current_value and not desired_value:
                        operations.append(
                            {
                                "op": "delete",
                                "path": ["service", "ntp", "server", server_address, option],
                            }
                        )

            # allow-client address list
            current_allow = set(current.allow_clients)
            desired_allow = set(allow_clients)

            for cidr in sorted(current_allow - desired_allow):
                operations.append(
                    {
                        "op": "delete",
                        "path": ["service", "ntp", "allow-client", "address", cidr],
                    }
                )

            for cidr in sorted(desired_allow - current_allow):
                operations.append(
                    {
                        "op": "set",
                        "path": ["service", "ntp", "allow-client", "address", cidr],
                    }
                )

            # listen-address list
            current_listen = set(current.listen_addresses)
            desired_listen = set(listen_addresses)

            for address in sorted(current_listen - desired_listen):
                operations.append(
                    {
                        "op": "delete",
                        "path": ["service", "ntp", "listen-address", address],
                    }
                )

            for address in sorted(desired_listen - current_listen):
                operations.append(
                    {
                        "op": "set",
                        "path": ["service", "ntp", "listen-address", address],
                    }
                )

        if operations:
            response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
            if response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update NTP configuration: {response.error or 'Unknown VyOS error'}",
                )

            await run_in_threadpool(service.get_full_config, refresh=True)

        updated_config = await run_in_threadpool(service.get_full_config, refresh=True)
        return _parse_ntp_service_config(updated_config)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating NTP configuration: {str(e)}")


@router.get("/ssh-config", response_model=SshServiceConfigResponse)
async def get_ssh_config(request: Request, refresh: bool = False) -> SshServiceConfigResponse:
    """Get SSH service configuration."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _parse_ssh_service_config(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving SSH configuration: {str(exc)}")


@router.put("/ssh-config", response_model=SshServiceConfigResponse)
async def update_ssh_config(request: Request, body: SshServiceConfigRequest) -> SshServiceConfigResponse:
    """Update SSH service configuration."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current = _parse_ssh_service_config(full_config)

        operations: List[Dict[str, Any]] = []

        if not body.enabled:
            if current.enabled:
                operations.append({"op": "delete", "path": ["service", "ssh"]})
        else:
            operations.append({"op": "set", "path": ["service", "ssh"]})

            port = body.port if body.port is not None else 22
            if port < 1 or port > 65535:
                raise HTTPException(status_code=400, detail="SSH port must be between 1 and 65535")
            if current.port != port:
                operations.append({"op": "set", "path": ["service", "ssh", "port", str(port)]})

            desired_listen = set(_normalize_unique_strings(body.listen_addresses))
            current_listen = set(current.listen_addresses)
            for addr in sorted(current_listen - desired_listen):
                operations.append({"op": "delete", "path": ["service", "ssh", "listen-address", addr]})
            for addr in sorted(desired_listen - current_listen):
                operations.append({"op": "set", "path": ["service", "ssh", "listen-address", addr]})

            if body.disable_password_authentication and not current.disable_password_authentication:
                operations.append({"op": "set", "path": ["service", "ssh", "disable-password-authentication"]})
            elif not body.disable_password_authentication and current.disable_password_authentication:
                operations.append({"op": "delete", "path": ["service", "ssh", "disable-password-authentication"]})

        if operations:
            response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
            if response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update SSH configuration: {response.error or 'Unknown VyOS error'}",
                )

            await run_in_threadpool(service.get_full_config, refresh=True)

        updated_config = await run_in_threadpool(service.get_full_config, refresh=True)
        return _parse_ssh_service_config(updated_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating SSH configuration: {str(exc)}")


@router.get("/dns-config", response_model=DnsServiceConfigResponse)
async def get_dns_config(request: Request, refresh: bool = False) -> DnsServiceConfigResponse:
    """Get DNS forwarding + local authoritative/static-host settings."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _parse_dns_service_config(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving DNS configuration: {str(exc)}")


@router.put("/dns-config", response_model=DnsServiceConfigResponse)
async def update_dns_config(request: Request, body: DnsServiceConfigRequest) -> DnsServiceConfigResponse:
    """Update DNS forwarding + local authoritative/static-host settings."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        fields_set = _model_fields_set(body)
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current = _parse_dns_service_config(full_config)
        raw_forwarding = _as_dict(_as_dict(_as_dict(full_config.get("service")).get("dns")).get("forwarding"))
        raw_system = _as_dict(full_config.get("system"))
        raw_hosts = _as_dict(_as_dict(raw_system.get("static-host-mapping")).get("host-name"))

        operations: List[Dict[str, Any]] = []
        forwarding_fields = {
            "listen_addresses",
            "allow_from",
            "name_servers",
            "use_system_name_servers",
            "cache_size",
            "domain_overrides",
            "authoritative_domains",
        }
        desired_forwarding_enabled = (
            body.enabled
            if "enabled" in fields_set
            else (current.enabled or bool(forwarding_fields & fields_set))
        )

        # Forwarding service subtree.
        if not desired_forwarding_enabled:
            if current.enabled and "enabled" in fields_set:
                operations.append({"op": "delete", "path": ["service", "dns", "forwarding"]})
        else:
            operations.append({"op": "set", "path": ["service", "dns", "forwarding"]})

            if "listen_addresses" in fields_set:
                desired_listen = set(_normalize_unique_strings(body.listen_addresses))
                current_listen = set(current.listen_addresses)
                for addr in sorted(current_listen - desired_listen):
                    operations.append({"op": "delete", "path": ["service", "dns", "forwarding", "listen-address", addr]})
                for addr in sorted(desired_listen - current_listen):
                    operations.append({"op": "set", "path": ["service", "dns", "forwarding", "listen-address", addr]})

            if "allow_from" in fields_set:
                desired_allow_from = set(_normalize_unique_strings(body.allow_from))
                current_allow_from = set(current.allow_from)
                for cidr in sorted(current_allow_from - desired_allow_from):
                    operations.append({"op": "delete", "path": ["service", "dns", "forwarding", "allow-from", cidr]})
                for cidr in sorted(desired_allow_from - current_allow_from):
                    operations.append({"op": "set", "path": ["service", "dns", "forwarding", "allow-from", cidr]})

            if "name_servers" in fields_set:
                desired_name_servers = set(_normalize_unique_strings(body.name_servers))
                current_name_servers = set(current.name_servers)
                for ns in sorted(current_name_servers - desired_name_servers):
                    operations.append({"op": "delete", "path": ["service", "dns", "forwarding", "name-server", ns]})
                for ns in sorted(desired_name_servers - current_name_servers):
                    operations.append({"op": "set", "path": ["service", "dns", "forwarding", "name-server", ns]})

            if "use_system_name_servers" in fields_set:
                if body.use_system_name_servers and not current.use_system_name_servers:
                    operations.append({"op": "set", "path": ["service", "dns", "forwarding", "system"]})
                elif not body.use_system_name_servers and current.use_system_name_servers:
                    operations.append({"op": "delete", "path": ["service", "dns", "forwarding", "system"]})

            if "cache_size" in fields_set:
                cache_size = body.cache_size
                if cache_size is not None and cache_size < 0:
                    raise HTTPException(status_code=400, detail="cache_size must be >= 0")
                current_cache = current.cache_size
                if cache_size is None:
                    if current_cache is not None:
                        operations.append({"op": "delete", "path": ["service", "dns", "forwarding", "cache-size"]})
                elif cache_size != current_cache:
                    operations.append({"op": "set", "path": ["service", "dns", "forwarding", "cache-size", str(cache_size)]})

            if "domain_overrides" in fields_set:
                # Replace domain overrides subtree.
                if isinstance(raw_forwarding.get("domain"), dict):
                    operations.append({"op": "delete", "path": ["service", "dns", "forwarding", "domain"]})
                for entry in body.domain_overrides:
                    domain = _normalize_hostname_or_400(entry.domain, field_name="domain override")
                    for ns in _normalize_unique_strings(entry.name_servers):
                        operations.append(
                            {"op": "set", "path": ["service", "dns", "forwarding", "domain", domain, "name-server", ns]}
                        )

            if "authoritative_domains" in fields_set:
                desired_auth_domains = set(_normalize_unique_strings(body.authoritative_domains))
                current_auth_domains = set(current.authoritative_domains)
                for domain in sorted(current_auth_domains - desired_auth_domains):
                    operations.append(
                        {"op": "delete", "path": ["service", "dns", "forwarding", "authoritative-domain", domain]}
                    )
                for domain in sorted(desired_auth_domains - current_auth_domains):
                    operations.append(
                        {"op": "set", "path": ["service", "dns", "forwarding", "authoritative-domain", domain]}
                    )

        # System domain-name.
        if "local_domain_name" in fields_set:
            local_domain_name = _string_or_none(body.local_domain_name)
            if local_domain_name:
                operations.append({"op": "set", "path": ["system", "domain-name", local_domain_name]})
            elif _string_or_none(raw_system.get("domain-name")):
                operations.append({"op": "delete", "path": ["system", "domain-name"]})

        if "host_overrides" in fields_set:
            # Replace static host mappings (best-effort authoritative overrides).
            if raw_hosts:
                operations.append({"op": "delete", "path": ["system", "static-host-mapping", "host-name"]})

            seen_hosts = set()
            for host in body.host_overrides:
                hostname = _normalize_hostname_or_400(host.hostname)
                if hostname in seen_hosts:
                    continue
                seen_hosts.add(hostname)

                addresses = _normalize_unique_strings(host.addresses)
                aliases = _normalize_unique_strings(host.aliases)
                if not addresses:
                    continue

                for address in addresses:
                    operations.append(
                        {"op": "set", "path": ["system", "static-host-mapping", "host-name", hostname, "inet", address]}
                    )
                for alias in aliases:
                    alias_clean = _normalize_hostname_or_400(alias, field_name=f"alias for {hostname}")
                    operations.append(
                        {"op": "set", "path": ["system", "static-host-mapping", "host-name", hostname, "alias", alias_clean]}
                    )

        if operations:
            response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
            if response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update DNS configuration: {response.error or 'Unknown VyOS error'}",
                )
            await run_in_threadpool(service.get_full_config, refresh=True)

        updated = await run_in_threadpool(service.get_full_config, refresh=True)
        return _parse_dns_service_config(updated)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating DNS configuration: {str(exc)}")


@router.get("/logs", response_model=SystemLogsResponse)
async def get_system_logs(
    request: Request,
    lines: int = 200,
    contains: Optional[str] = None,
    source: Literal["auto", "syslog", "tail", "system"] = "auto",
) -> SystemLogsResponse:
    """Get recent system log entries from the active VyOS instance."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        max_lines = max(1, min(lines, 2000))
        filter_text = (contains or "").strip().lower()
        service = get_session_vyos_service(request)

        selected_command, raw_output = await _collect_log_output(
            service=service,
            source=source,
            max_lines=max_lines,
        )

        if not raw_output:
            return SystemLogsResponse(
                available=False,
                source_command=selected_command,
                total_lines=0,
                returned_lines=0,
                entries=[],
                raw_output=None,
            )

        raw_lines = [line for line in raw_output.splitlines() if line.strip()]

        if filter_text:
            raw_lines = [line for line in raw_lines if filter_text in line.lower()]

        if len(raw_lines) > max_lines:
            raw_lines = raw_lines[-max_lines:]

        entries = [_parse_log_line(line) for line in raw_lines]

        return SystemLogsResponse(
            available=True,
            source_command=selected_command,
            total_lines=len(raw_output.splitlines()),
            returned_lines=len(entries),
            entries=entries,
            raw_output="\n".join(raw_lines) if raw_lines else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving system logs: {str(exc)}")


@router.get("/logs/download", response_class=PlainTextResponse)
async def download_system_logs(
    request: Request,
    lines: int = 200,
    contains: Optional[str] = None,
    source: Literal["auto", "syslog", "tail", "system"] = "auto",
) -> PlainTextResponse:
    """Download recent system log output as a text file."""
    logs = await get_system_logs(
        request=request,
        lines=lines,
        contains=contains,
        source=source,
    )

    if not logs.available or not logs.raw_output:
        raise HTTPException(status_code=404, detail="No log output available to download")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
    filename = f"vyos-{source}-logs-{timestamp}.log"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }
    if logs.source_command:
        headers["X-Log-Source-Command"] = logs.source_command

    content = logs.raw_output
    if not content.endswith("\n"):
        content = f"{content}\n"

    return PlainTextResponse(content=content, headers=headers)


@router.get("/local-users", response_model=LocalUsersResponse)
async def get_local_users(request: Request, refresh: bool = False) -> LocalUsersResponse:
    """Get local VyOS login users from config (`system login user`)."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        users = _parse_local_users(full_config)
        return LocalUsersResponse(users=users, total=len(users))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving local users: {str(exc)}")


@router.post("/local-users", response_model=LocalUserSummary)
async def create_local_user(request: Request, body: LocalUserCreateRequest) -> LocalUserSummary:
    """Create a local VyOS login user."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    username = _normalize_local_username_or_400(body.username)
    full_name = (body.full_name or "").strip()
    level = (body.level or "").strip()
    password = (body.password or "").strip()
    public_keys = [entry.strip() for entry in body.ssh_public_keys if entry and entry.strip()]

    if level:
        level = _normalize_local_level_or_400(level)

    if not password and not public_keys:
        raise HTTPException(status_code=400, detail="Provide at least a password or one SSH public key")

    # De-duplicate SSH keys while preserving order.
    deduped_keys: List[str] = []
    seen_keys = set()
    for key in public_keys:
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped_keys.append(key)

    try:
        service = get_session_vyos_service(request)
        current_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current_users = _extract_local_users_raw(current_config)
        if username in current_users:
            raise HTTPException(status_code=409, detail=f"Local user '{username}' already exists")

        operations: List[Dict[str, Any]] = [
            {"op": "set", "path": ["system", "login", "user", username]},
        ]

        if full_name:
            operations.append(
                {
                    "op": "set",
                    "path": ["system", "login", "user", username, "full-name", full_name],
                }
            )

        if level:
            operations.append(
                {
                    "op": "set",
                    "path": ["system", "login", "user", username, "level", level],
                }
            )

        if password:
            password_key = "plaintext-password" if body.password_type == "plaintext" else "encrypted-password"
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "system",
                        "login",
                        "user",
                        username,
                        "authentication",
                        password_key,
                        password,
                    ],
                }
            )

        for index, ssh_key in enumerate(deduped_keys, start=1):
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "system",
                        "login",
                        "user",
                        username,
                        "authentication",
                        "public-keys",
                        f"key-{index}",
                        "key",
                        ssh_key,
                    ],
                }
            )

        if body.disabled:
            operations.append(
                {"op": "set", "path": ["system", "login", "user", username, "disable"]}
            )

        response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
        if response.status != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create user: {response.error or 'Unknown VyOS error'}",
            )

        updated_config = await run_in_threadpool(service.get_full_config, refresh=True)
        parsed_users = _parse_local_users(updated_config)
        created_user = _find_local_user(parsed_users, username)
        if not created_user:
            raise HTTPException(status_code=500, detail="User creation completed but user could not be read back")
        return created_user
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error creating local user: {str(exc)}")


@router.put("/local-users/{username}", response_model=LocalUserSummary)
async def update_local_user(
    request: Request,
    username: str,
    body: LocalUserUpdateRequest,
) -> LocalUserSummary:
    """Update an existing local VyOS login user."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    user_name = _normalize_local_username_or_400(username, field_name="username")

    try:
        service = get_session_vyos_service(request)
        current_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current_users = _extract_local_users_raw(current_config)
        current_user = _as_dict(current_users.get(user_name))
        if not current_user:
            raise HTTPException(status_code=404, detail=f"Local user '{user_name}' not found")

        current_auth = _as_dict(current_user.get("authentication"))
        operations: List[Dict[str, Any]] = []

        if body.full_name is not None:
            full_name = body.full_name.strip()
            if full_name:
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", "user", user_name, "full-name", full_name],
                    }
                )
            else:
                operations.append(
                    {
                        "op": "delete",
                        "path": ["system", "login", "user", user_name, "full-name"],
                    }
                )

        if body.level is not None:
            level = body.level.strip()
            if level:
                level = _normalize_local_level_or_400(level)
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", "user", user_name, "level", level],
                    }
                )
            else:
                operations.append(
                    {"op": "delete", "path": ["system", "login", "user", user_name, "level"]}
                )

        if body.password is not None:
            password_value = body.password.strip()
            if password_value:
                selected_key = "plaintext-password" if body.password_type == "plaintext" else "encrypted-password"
                other_key = "encrypted-password" if selected_key == "plaintext-password" else "plaintext-password"

                operations.append(
                    {
                        "op": "set",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            selected_key,
                            password_value,
                        ],
                    }
                )

                if current_auth.get(other_key):
                    operations.append(
                        {
                            "op": "delete",
                            "path": [
                                "system",
                                "login",
                                "user",
                                user_name,
                                "authentication",
                                other_key,
                            ],
                        }
                    )
            else:
                operations.extend(
                    [
                        {
                            "op": "delete",
                            "path": [
                                "system",
                                "login",
                                "user",
                                user_name,
                                "authentication",
                                "plaintext-password",
                            ],
                        },
                        {
                            "op": "delete",
                            "path": [
                                "system",
                                "login",
                                "user",
                                user_name,
                                "authentication",
                                "encrypted-password",
                            ],
                        },
                    ]
                )

        if body.ssh_public_keys is not None:
            keys = [entry.strip() for entry in body.ssh_public_keys if entry and entry.strip()]
            deduped_keys: List[str] = []
            seen_keys = set()
            for key in keys:
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                deduped_keys.append(key)

            operations.append(
                {
                    "op": "delete",
                    "path": [
                        "system",
                        "login",
                        "user",
                        user_name,
                        "authentication",
                        "public-keys",
                    ],
                }
            )

            for index, ssh_key in enumerate(deduped_keys, start=1):
                operations.append(
                    {
                        "op": "set",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            "public-keys",
                            f"key-{index}",
                            "key",
                            ssh_key,
                        ],
                    }
                )

        if body.disabled is not None:
            if body.disabled:
                operations.append(
                    {"op": "set", "path": ["system", "login", "user", user_name, "disable"]}
                )
            else:
                operations.append(
                    {"op": "delete", "path": ["system", "login", "user", user_name, "disable"]}
                )

        if operations:
            response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
            if response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update local user: {response.error or 'Unknown VyOS error'}",
                )

        updated_config = await run_in_threadpool(service.get_full_config, refresh=True)
        parsed_users = _parse_local_users(updated_config)
        updated_user = _find_local_user(parsed_users, user_name)
        if not updated_user:
            raise HTTPException(status_code=500, detail="User update completed but user could not be read back")
        return updated_user
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating local user: {str(exc)}")


@router.delete("/local-users/{username}", response_model=LocalUserOperationResponse)
async def delete_local_user(request: Request, username: str) -> LocalUserOperationResponse:
    """Delete a local VyOS login user."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    user_name = _normalize_local_username_or_400(username, field_name="username")

    try:
        service = get_session_vyos_service(request)
        response = await run_in_threadpool(
            service.device.configure_multiple_op,
            op_path=[{"op": "delete", "path": ["system", "login", "user", user_name]}],
        )
        if response.status != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete local user: {response.error or 'Unknown VyOS error'}",
            )

        await run_in_threadpool(service.get_full_config, refresh=True)
        return LocalUserOperationResponse(
            success=True,
            username=user_name,
            message=f"Local user '{user_name}' deleted",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error deleting local user: {str(exc)}")


# ========================================================================
# Additional System Service Endpoints (LLDP + mDNS + Acceleration)
# ========================================================================


@router.get("/lldp-config", response_model=LldpServiceConfigResponse)
async def get_lldp_config(request: Request, refresh: bool = False) -> LldpServiceConfigResponse:
    """Get current LLDP service configuration from VyOS config tree."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _parse_lldp_service_config(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving LLDP configuration: {str(exc)}")


@router.put("/lldp-config", response_model=LldpServiceConfigResponse)
async def update_lldp_config(request: Request, body: LldpServiceConfigRequest) -> LldpServiceConfigResponse:
    """Update LLDP service configuration."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        desired_management_addresses = _normalize_unique_strings(body.management_addresses)
        desired_legacy = _normalize_unique_strings(body.legacy_protocols)

        desired_interfaces: List[LldpInterfaceConfig] = []
        if body.enabled and not body.all_interfaces:
            if not body.interfaces:
                raise HTTPException(
                    status_code=400,
                    detail="At least one interface is required when LLDP is enabled and 'all interfaces' is disabled.",
                )

            seen = set()
            for iface in body.interfaces:
                name = _normalize_interface_name_or_400(iface.interface, field_name="interface")
                if name.lower() == "all":
                    continue
                if name in seen:
                    continue
                seen.add(name)
                desired_interfaces.append(LldpInterfaceConfig(interface=name, mode=iface.mode))

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current = _parse_lldp_service_config(full_config)
        raw_lldp = _as_dict(_as_dict(full_config.get("service")).get("lldp"))
        raw_lldp_interfaces = raw_lldp.get("interface")
        has_explicit_all = False
        if isinstance(raw_lldp_interfaces, dict):
            has_explicit_all = any(str(key).strip().lower() == "all" for key in raw_lldp_interfaces.keys())
        elif isinstance(raw_lldp_interfaces, list):
            has_explicit_all = any(str(item).strip().lower() == "all" for item in raw_lldp_interfaces)

        operations: List[Dict[str, Any]] = []

        if not body.enabled:
            if current.enabled:
                operations.append({"op": "delete", "path": ["service", "lldp"]})
        else:
            # Ensure root exists
            operations.append({"op": "set", "path": ["service", "lldp"]})

            # snmp flag
            if body.snmp and not current.snmp:
                operations.append({"op": "set", "path": ["service", "lldp", "snmp"]})
            elif current.snmp and not body.snmp:
                operations.append({"op": "delete", "path": ["service", "lldp", "snmp"]})

            # management-address list
            current_mgmt = set(current.management_addresses)
            desired_mgmt = set(desired_management_addresses)
            for addr in sorted(current_mgmt - desired_mgmt):
                operations.append({"op": "delete", "path": ["service", "lldp", "management-address", addr]})
            for addr in sorted(desired_mgmt - current_mgmt):
                operations.append({"op": "set", "path": ["service", "lldp", "management-address", addr]})

            # legacy-protocols list
            current_legacy = set(current.legacy_protocols)
            desired_legacy_set = set(desired_legacy)
            for proto in sorted(current_legacy - desired_legacy_set):
                operations.append({"op": "delete", "path": ["service", "lldp", "legacy-protocols", proto]})
            for proto in sorted(desired_legacy_set - current_legacy):
                operations.append({"op": "set", "path": ["service", "lldp", "legacy-protocols", proto]})

            # interfaces
            current_iface_modes: Dict[str, Optional[LldpInterfaceMode]] = {item.interface: item.mode for item in current.interfaces}
            desired_iface_modes: Dict[str, Optional[LldpInterfaceMode]] = {item.interface: item.mode for item in desired_interfaces}

            if body.all_interfaces:
                # Enable LLDP on all interfaces and remove any explicit per-interface config.
                operations.append({"op": "set", "path": ["service", "lldp", "interface", "all"]})

                for iface in sorted(current_iface_modes.keys()):
                    operations.append({"op": "delete", "path": ["service", "lldp", "interface", iface]})
            else:
                # Switch away from 'all' mode.
                if has_explicit_all:
                    operations.append({"op": "delete", "path": ["service", "lldp", "interface", "all"]})

                for iface in sorted(set(current_iface_modes.keys()) - set(desired_iface_modes.keys())):
                    operations.append({"op": "delete", "path": ["service", "lldp", "interface", iface]})

                for iface, desired_mode in desired_iface_modes.items():
                    operations.append({"op": "set", "path": ["service", "lldp", "interface", iface]})
                    current_mode = current_iface_modes.get(iface)

                    if desired_mode:
                        if current_mode != desired_mode:
                            operations.append(
                                {
                                    "op": "set",
                                    "path": ["service", "lldp", "interface", iface, "mode", desired_mode],
                                }
                            )
                    else:
                        if current_mode:
                            operations.append(
                                {"op": "delete", "path": ["service", "lldp", "interface", iface, "mode"]}
                            )

        if operations:
            response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
            if response.status != 200:
                raise HTTPException(status_code=500, detail=response.error or "Unknown VyOS error")

        updated_config = await run_in_threadpool(service.get_full_config, refresh=True)
        return _parse_lldp_service_config(updated_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating LLDP configuration: {str(exc)}")


@router.get("/lldp-status", response_model=LldpStatusResponse)
async def get_lldp_status(request: Request, refresh: bool = False) -> LldpStatusResponse:
    """Get LLDP neighbor status (best effort)."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        config = _parse_lldp_service_config(full_config)

        if not config.enabled:
            return LldpStatusResponse(enabled=False)

        neighbors_output = ""
        detail_output = ""
        error: Optional[str] = None

        neighbors_response, detail_response = await asyncio.gather(
            run_in_threadpool(service.device.show, path=["lldp", "neighbors"]),
            run_in_threadpool(service.device.show, path=["lldp", "neighbors", "detail"]),
            return_exceptions=True,
        )

        if isinstance(neighbors_response, Exception):
            error = str(neighbors_response)
        elif neighbors_response.status == 200:
            neighbors_output = _extract_show_output(neighbors_response.result)
        else:
            error = neighbors_response.error or "Failed to run 'show lldp neighbors'"

        if not isinstance(detail_response, Exception) and getattr(detail_response, "status", None) == 200:
            detail_output = _extract_show_output(detail_response.result)

        neighbors = _parse_lldp_neighbors_output(neighbors_output) if neighbors_output else []

        return LldpStatusResponse(
            enabled=True,
            neighbors=neighbors,
            raw_neighbors=neighbors_output or None,
            raw_neighbors_detail=detail_output or None,
            error=error,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving LLDP status: {str(exc)}")


@router.get("/mdns-config", response_model=MdnsRepeaterConfigResponse)
async def get_mdns_config(request: Request, refresh: bool = False) -> MdnsRepeaterConfigResponse:
    """Get current mDNS repeater (Avahi) configuration."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _parse_mdns_repeater_config(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving mDNS configuration: {str(exc)}")


@router.put("/mdns-config", response_model=MdnsRepeaterConfigResponse)
async def update_mdns_config(request: Request, body: MdnsRepeaterConfigRequest) -> MdnsRepeaterConfigResponse:
    """Update mDNS repeater configuration."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        desired_interfaces = _normalize_unique_strings(body.interfaces)
        desired_allow_services = _normalize_unique_strings(body.allow_services)
        desired_browse_domains = _normalize_unique_strings(body.browse_domains)

        if body.enabled and len(desired_interfaces) < 2:
            raise HTTPException(
                status_code=400,
                detail="mDNS repeater requires at least two interfaces when enabled.",
            )

        for iface in desired_interfaces:
            _normalize_interface_name_or_400(iface, field_name="interface")

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current = _parse_mdns_repeater_config(full_config)

        operations: List[Dict[str, Any]] = []

        # Ensure root exists when editing or enabling.
        if body.enabled or desired_interfaces or desired_allow_services or desired_browse_domains or body.cache_entries is not None:
            operations.append({"op": "set", "path": ["service", "mdns", "repeater"]})

        if body.enabled:
            # Only delete the disable flag when it's actually present.
            if current.configured and not current.enabled:
                operations.append({"op": "delete", "path": ["service", "mdns", "repeater", "disable"]})
        else:
            if current.configured:
                operations.append({"op": "set", "path": ["service", "mdns", "repeater", "disable"]})

        # Interfaces list
        current_ifaces = set(current.interfaces)
        desired_ifaces = set(desired_interfaces)
        for iface in sorted(current_ifaces - desired_ifaces):
            operations.append({"op": "delete", "path": ["service", "mdns", "repeater", "interface", iface]})
        for iface in sorted(desired_ifaces - current_ifaces):
            operations.append({"op": "set", "path": ["service", "mdns", "repeater", "interface", iface]})

        # ip-version leaf
        if body.ip_version != current.ip_version:
            operations.append({"op": "set", "path": ["service", "mdns", "repeater", "ip-version", body.ip_version]})

        # allow-service list
        current_allow = set(current.allow_services)
        desired_allow = set(desired_allow_services)
        for entry in sorted(current_allow - desired_allow):
            operations.append({"op": "delete", "path": ["service", "mdns", "repeater", "allow-service", entry]})
        for entry in sorted(desired_allow - current_allow):
            operations.append({"op": "set", "path": ["service", "mdns", "repeater", "allow-service", entry]})

        # browse-domain list
        current_domains = set(current.browse_domains)
        desired_domains = set(desired_browse_domains)
        for entry in sorted(current_domains - desired_domains):
            operations.append({"op": "delete", "path": ["service", "mdns", "repeater", "browse-domain", entry]})
        for entry in sorted(desired_domains - current_domains):
            operations.append({"op": "set", "path": ["service", "mdns", "repeater", "browse-domain", entry]})

        # cache-entries leaf
        if body.cache_entries is None:
            if current.cache_entries is not None:
                operations.append({"op": "delete", "path": ["service", "mdns", "repeater", "cache-entries"]})
        else:
            if body.cache_entries != current.cache_entries:
                operations.append(
                    {
                        "op": "set",
                        "path": ["service", "mdns", "repeater", "cache-entries", str(int(body.cache_entries))],
                    }
                )

        if operations:
            response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
            if response.status != 200:
                raise HTTPException(status_code=500, detail=response.error or "Unknown VyOS error")

        updated_config = await run_in_threadpool(service.get_full_config, refresh=True)
        return _parse_mdns_repeater_config(updated_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating mDNS configuration: {str(exc)}")


@router.get("/mdns-status", response_model=MdnsRepeaterStatusResponse)
async def get_mdns_status(request: Request, refresh: bool = False) -> MdnsRepeaterStatusResponse:
    """Get mDNS repeater status/logs (best effort)."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        config = _parse_mdns_repeater_config(full_config)

        if not config.configured:
            return MdnsRepeaterStatusResponse(enabled=False)

        log_output = ""
        error: Optional[str] = None

        for path in (["log", "mdns", "repeater"], ["log", "mdns", "repeater", "tail"]):
            response = await run_in_threadpool(service.device.show, path=path)
            if response.status == 200:
                log_output = _extract_show_output(response.result)
                break
            error = response.error or error

        return MdnsRepeaterStatusResponse(
            enabled=config.enabled,
            raw_log=log_output or None,
            error=error,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving mDNS status: {str(exc)}")


@router.get("/qat-config", response_model=QatConfigResponse)
async def get_qat_config(request: Request, refresh: bool = False) -> QatConfigResponse:
    """Get QAT acceleration configuration."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _parse_qat_config(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving QAT configuration: {str(exc)}")


@router.put("/qat-config", response_model=QatConfigResponse)
async def update_qat_config(request: Request, body: QatConfigRequest) -> QatConfigResponse:
    """Enable/disable Intel QAT acceleration."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current = _parse_qat_config(full_config)

        operations: List[Dict[str, Any]] = []
        if body.enabled and not current.enabled:
            operations.append({"op": "set", "path": ["system", "acceleration", "qat"]})
        elif current.enabled and not body.enabled:
            operations.append({"op": "delete", "path": ["system", "acceleration", "qat"]})

        if operations:
            response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
            if response.status != 200:
                raise HTTPException(status_code=500, detail=response.error or "Unknown VyOS error")

        updated_config = await run_in_threadpool(service.get_full_config, refresh=True)
        return _parse_qat_config(updated_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating QAT configuration: {str(exc)}")


@router.get("/qat-status", response_model=QatStatusResponse)
async def get_qat_status(request: Request) -> QatStatusResponse:
    """Get QAT device and status information (best effort)."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        devices_output = ""
        status_output = ""

        devices_response, status_response = await asyncio.gather(
            run_in_threadpool(service.device.show, path=["system", "acceleration", "qat"]),
            run_in_threadpool(service.device.show, path=["system", "acceleration", "qat", "status"]),
            return_exceptions=True,
        )

        error: Optional[str] = None

        if isinstance(devices_response, Exception):
            error = str(devices_response)
        elif devices_response.status == 200:
            devices_output = _extract_show_output(devices_response.result)
        else:
            error = devices_response.error or "Failed to run 'show system acceleration qat'"

        if isinstance(status_response, Exception):
            error = error or str(status_response)
        elif status_response.status == 200:
            status_output = _extract_show_output(status_response.result)

        available = bool(devices_output.strip() or status_output.strip())

        return QatStatusResponse(
            available=available,
            raw_devices=devices_output or None,
            raw_status=status_output or None,
            error=error,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving QAT status: {str(exc)}")


@router.get("/vpp-config", response_model=VppSettingsConfigResponse)
async def get_vpp_config(request: Request, refresh: bool = False) -> VppSettingsConfigResponse:
    """Get VPP settings configuration (includes DPDK/XDP interface driver selection)."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _parse_vpp_settings_config(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving VPP configuration: {str(exc)}")


@router.put("/vpp-config", response_model=VppSettingsConfigResponse)
async def update_vpp_config(request: Request, body: VppSettingsConfigRequest) -> VppSettingsConfigResponse:
    """Update VPP settings configuration (best effort)."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        desired_interfaces: List[VppInterfaceDriverConfig] = []
        seen = set()
        for iface in body.interfaces:
            name = _normalize_interface_name_or_400(iface.interface, field_name="interface")
            if name in seen:
                continue
            seen.add(name)
            desired_interfaces.append(VppInterfaceDriverConfig(interface=name, driver=iface.driver))

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current = _parse_vpp_settings_config(full_config)

        operations: List[Dict[str, Any]] = []

        if not body.enabled:
            if current.enabled:
                operations.append({"op": "delete", "path": ["vpp", "settings"]})
        else:
            if not current.enabled:
                operations.append({"op": "set", "path": ["vpp", "settings"]})

            current_driver = {entry.interface: entry.driver for entry in current.interfaces}
            desired_driver = {entry.interface: entry.driver for entry in desired_interfaces}

            for iface_name in sorted(set(current_driver.keys()) - set(desired_driver.keys())):
                operations.append({"op": "delete", "path": ["vpp", "settings", "interface", iface_name, "driver"]})

            for iface_name, driver in desired_driver.items():
                if current_driver.get(iface_name) != driver:
                    operations.append(
                        {
                            "op": "set",
                            "path": ["vpp", "settings", "interface", iface_name, "driver", driver],
                        }
                    )

            # LCP settings
            if body.lcp.ignore_kernel_routes and not current.lcp.ignore_kernel_routes:
                operations.append({"op": "set", "path": ["vpp", "settings", "lcp", "ignore-kernel-routes"]})
            elif current.lcp.ignore_kernel_routes and not body.lcp.ignore_kernel_routes:
                operations.append({"op": "delete", "path": ["vpp", "settings", "lcp", "ignore-kernel-routes"]})

            desired_rx_buffer = _string_or_none(body.lcp.netlink.rx_buffer_size)
            current_rx_buffer = _string_or_none(current.lcp.netlink.rx_buffer_size)
            if desired_rx_buffer:
                if desired_rx_buffer != current_rx_buffer:
                    operations.append(
                        {
                            "op": "set",
                            "path": ["vpp", "settings", "lcp", "netlink", "rx-buffer-size", desired_rx_buffer],
                        }
                    )
            else:
                if current_rx_buffer:
                    operations.append({"op": "delete", "path": ["vpp", "settings", "lcp", "netlink", "rx-buffer-size"]})

            # Host resources
            for key, desired_value, current_value in (
                ("max-map-count", body.host_resources.max_map_count, current.host_resources.max_map_count),
                ("nr-hugepages", body.host_resources.nr_hugepages, current.host_resources.nr_hugepages),
            ):
                if desired_value is None:
                    if current_value is not None:
                        operations.append({"op": "delete", "path": ["vpp", "settings", "host-resources", key]})
                else:
                    if desired_value != current_value:
                        operations.append(
                            {
                                "op": "set",
                                "path": ["vpp", "settings", "host-resources", key, str(int(desired_value))],
                            }
                        )

            desired_shmmax = _string_or_none(body.host_resources.shmmax)
            current_shmmax = _string_or_none(current.host_resources.shmmax)
            if desired_shmmax:
                if desired_shmmax != current_shmmax:
                    operations.append({"op": "set", "path": ["vpp", "settings", "host-resources", "shmmax", desired_shmmax]})
            else:
                if current_shmmax:
                    operations.append({"op": "delete", "path": ["vpp", "settings", "host-resources", "shmmax"]})

            # Memory
            for key, desired_value, current_value in (
                ("main-heap-page-size", _string_or_none(body.memory.main_heap_page_size), _string_or_none(current.memory.main_heap_page_size)),
                ("main-heap-size", _string_or_none(body.memory.main_heap_size), _string_or_none(current.memory.main_heap_size)),
            ):
                if desired_value:
                    if desired_value != current_value:
                        operations.append({"op": "set", "path": ["vpp", "settings", "memory", key, desired_value]})
                else:
                    if current_value:
                        operations.append({"op": "delete", "path": ["vpp", "settings", "memory", key]})

            # Statseg
            for key, desired_value, current_value in (
                ("page-size", _string_or_none(body.statseg.page_size), _string_or_none(current.statseg.page_size)),
                ("size", _string_or_none(body.statseg.size), _string_or_none(current.statseg.size)),
            ):
                if desired_value:
                    if desired_value != current_value:
                        operations.append({"op": "set", "path": ["vpp", "settings", "statseg", key, desired_value]})
                else:
                    if current_value:
                        operations.append({"op": "delete", "path": ["vpp", "settings", "statseg", key]})

        if operations:
            response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
            if response.status != 200:
                raise HTTPException(status_code=500, detail=response.error or "Unknown VyOS error")

        updated_config = await run_in_threadpool(service.get_full_config, refresh=True)
        return _parse_vpp_settings_config(updated_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating VPP configuration: {str(exc)}")


@router.get("/vpp-status", response_model=VppStatusResponse)
async def get_vpp_status(request: Request) -> VppStatusResponse:
    """Get best-effort VPP runtime status if supported on this image."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        error: Optional[str] = None

        for path in (["vpp"], ["vpp", "status"], ["vpp", "version"], ["vpp", "settings"]):
            response = await run_in_threadpool(service.device.show, path=path)
            if response.status == 200:
                output = _extract_show_output(response.result)
                return VppStatusResponse(available=True, raw_output=output or None)
            error = response.error or error

        return VppStatusResponse(available=False, error=error or "VPP status not available on this image")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving VPP status: {str(exc)}")
