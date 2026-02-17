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
import ipaddress
import json
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
    match = re.search(r"([+-]?[0-9]+(?:\.[0-9]+)?)\s*°?\s*([CF])\b", token, re.IGNORECASE)
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
RE_LOCAL_PUBLIC_KEY_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")
RE_LOCAL_PUBLIC_KEY_TYPE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9@._+-]{1,63}$")
RE_HOSTNAME_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$")
RE_TIMEZONE_TOKEN = re.compile(r"^[A-Za-z0-9._+-]+(?:/[A-Za-z0-9._+-]+)*$")


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


class SystemConfigRequest(BaseModel):
    """Mutable subset of system configuration exposed in GUI."""
    hostname: Optional[str] = None
    timezone: Optional[str] = None
    name_servers: Optional[list[str]] = None
    domain_name: Optional[str] = None


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
    cpu_temperature_supported: Optional[bool] = None

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
    system_name_servers: List[str] = Field(default_factory=list)
    system_domain_search: List[str] = Field(default_factory=list)
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
    system_name_servers: List[str] = Field(default_factory=list)
    system_domain_search: List[str] = Field(default_factory=list)
    cache_size: Optional[int] = None
    authoritative_domains: List[str] = Field(default_factory=list)
    domain_overrides: List[DnsForwardingDomainOverride] = Field(default_factory=list)
    host_overrides: List[DnsHostOverride] = Field(default_factory=list)


DEFAULT_DNS_ALLOW_FROM_NETWORKS: tuple[str, ...] = ("0.0.0.0/0",)


# ========================================================================
# Dynamic DNS Models
# ========================================================================


class DynamicDnsEntry(BaseModel):
    interface: str
    service: str
    host_name: Optional[str] = None
    login: Optional[str] = None
    password: Optional[str] = None
    server: Optional[str] = None


class DynamicDnsEntryResponse(BaseModel):
    interface: str
    service: str
    host_name: Optional[str] = None
    login: Optional[str] = None
    has_password: bool = False
    server: Optional[str] = None


class DynamicDnsConfigResponse(BaseModel):
    configured: bool = False
    enabled: bool = False
    entries: List[DynamicDnsEntryResponse] = Field(default_factory=list)


class DynamicDnsConfigRequest(BaseModel):
    enabled: bool = False
    entries: List[DynamicDnsEntry] = Field(default_factory=list)


# ========================================================================
# DHCP Relay Models
# ========================================================================


class DhcpRelayConfigResponse(BaseModel):
    configured: bool = False
    enabled: bool = False
    interfaces: List[str] = Field(default_factory=list)
    servers: List[str] = Field(default_factory=list)


class DhcpRelayConfigRequest(BaseModel):
    enabled: bool = False
    interfaces: List[str] = Field(default_factory=list)
    servers: List[str] = Field(default_factory=list)


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
    has_otp: bool = False
    has_principal: bool = False


class LocalUserPublicKeyEntry(BaseModel):
    identifier: str
    key: str
    key_type: Optional[str] = None
    options: Optional[str] = None


class LocalUserSummary(BaseModel):
    username: str
    full_name: Optional[str] = None
    level: Optional[str] = None
    disabled: bool = False
    principal: Optional[str] = None
    otp_key_configured: bool = False
    otp_rate_limit: Optional[int] = None
    otp_rate_time: Optional[int] = None
    otp_window_size: Optional[int] = None
    auth: LocalUserAuthState = Field(default_factory=LocalUserAuthState)
    public_key_names: List[str] = Field(default_factory=list)
    public_keys: List[str] = Field(default_factory=list)
    public_key_entries: List[LocalUserPublicKeyEntry] = Field(default_factory=list)


class LocalUserPublicKeyEntryRequest(BaseModel):
    identifier: Optional[str] = None
    key: str
    key_type: Optional[str] = None
    options: Optional[str] = None


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
    ssh_public_key_entries: Optional[List[LocalUserPublicKeyEntryRequest]] = None
    disabled: bool = False
    principal: Optional[str] = None
    otp_key: Optional[str] = None
    otp_rate_limit: Optional[int] = Field(default=None, ge=1, le=10)
    otp_rate_time: Optional[int] = Field(default=None, ge=1, le=600)
    otp_window_size: Optional[int] = Field(default=None, ge=1, le=21)


class LocalUserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    level: Optional[str] = None
    password: Optional[str] = None
    password_type: Literal["plaintext", "encrypted"] = "plaintext"
    ssh_public_keys: Optional[List[str]] = None
    ssh_public_key_entries: Optional[List[LocalUserPublicKeyEntryRequest]] = None
    disabled: Optional[bool] = None
    principal: Optional[str] = None
    otp_key: Optional[str] = None
    otp_rate_limit: Optional[int] = Field(default=None, ge=1, le=10)
    otp_rate_time: Optional[int] = Field(default=None, ge=1, le=600)
    otp_window_size: Optional[int] = Field(default=None, ge=1, le=21)


class LocalUserOperationResponse(BaseModel):
    success: bool
    username: str
    message: str


class LoginAuthServerConfig(BaseModel):
    address: str
    key: str
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    timeout: Optional[int] = Field(default=None, ge=1, le=65535)
    disabled: bool = False


class LoginConfigResponse(BaseModel):
    configured: bool = False
    banner_pre_login: Optional[str] = None
    banner_post_login: Optional[str] = None
    max_sessions_per_user: Optional[int] = Field(default=None, ge=1, le=65535)
    timeout: Optional[int] = Field(default=None, ge=1, le=65535)
    radius_source_address: Optional[str] = None
    radius_vrf: Optional[str] = None
    tacacs_source_address: Optional[str] = None
    tacacs_vrf: Optional[str] = None
    radius_servers: List[LoginAuthServerConfig] = Field(default_factory=list)
    tacacs_servers: List[LoginAuthServerConfig] = Field(default_factory=list)


class LoginConfigRequest(BaseModel):
    banner_pre_login: Optional[str] = None
    banner_post_login: Optional[str] = None
    max_sessions_per_user: Optional[int] = Field(default=None, ge=1, le=65535)
    timeout: Optional[int] = Field(default=None, ge=1, le=65535)
    radius_source_address: Optional[str] = None
    radius_vrf: Optional[str] = None
    tacacs_source_address: Optional[str] = None
    tacacs_vrf: Optional[str] = None
    radius_servers: List[LoginAuthServerConfig] = Field(default_factory=list)
    tacacs_servers: List[LoginAuthServerConfig] = Field(default_factory=list)


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


def _normalize_timezone_or_400(value: str) -> str:
    text = value.strip()
    if not text:
        raise HTTPException(status_code=400, detail="timezone is required")
    if not RE_TIMEZONE_TOKEN.match(text):
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {text}")
    return text


def _normalize_ip_address_or_400(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    try:
        parsed = ipaddress.ip_address(cleaned)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}: {cleaned}")
    return str(parsed)


def _normalize_cidr_or_400(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    try:
        parsed = ipaddress.ip_network(cleaned, strict=False)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}: {cleaned}")
    return str(parsed)


def _normalize_dns_server_or_400(value: str, field_name: str = "name server") -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    try:
        return str(ipaddress.ip_address(cleaned))
    except ValueError:
        return _normalize_hostname_or_400(cleaned, field_name=field_name)


def _parse_dns_service_config(full_config: Dict[str, Any]) -> DnsServiceConfigResponse:
    service_root = _as_dict(full_config.get("service"))
    dns_root = _as_dict(service_root.get("dns"))
    forwarding_root = dns_root.get("forwarding")

    system_root = _as_dict(full_config.get("system"))
    local_domain_name = _string_or_none(system_root.get("domain-name"))
    system_name_servers = _extract_tag_values(system_root, ["name-server"])
    system_domain_search = _extract_tag_values(system_root, ["domain-search"])

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
            system_name_servers=system_name_servers,
            system_domain_search=system_domain_search,
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
        system_name_servers=system_name_servers,
        system_domain_search=system_domain_search,
        cache_size=_safe_int(forwarding_root.get("cache-size")),
        authoritative_domains=_extract_tag_values(forwarding_root, ["authoritative-domain"]),
        domain_overrides=domain_overrides,
        host_overrides=host_overrides,
    )


def _parse_dynamic_dns_config(full_config: Dict[str, Any]) -> DynamicDnsConfigResponse:
    service_root = _as_dict(full_config.get("service"))
    dns_root = _as_dict(service_root.get("dns"))
    dynamic_root = _as_dict(dns_root.get("dynamic"))
    interface_root = dynamic_root.get("interface")

    if not isinstance(interface_root, dict):
        return DynamicDnsConfigResponse(configured=False, enabled=False, entries=[])

    entries: List[DynamicDnsEntryResponse] = []

    for interface_name, interface_data in sorted(interface_root.items(), key=lambda item: str(item[0])):
        iface = _string_or_none(interface_name)
        if not iface:
            continue

        iface_dict = _as_dict(interface_data)
        services = _as_dict(iface_dict.get("service"))
        for service_name, service_data in sorted(services.items(), key=lambda item: str(item[0])):
            provider = _string_or_none(service_name)
            if not provider:
                continue

            config = _as_dict(service_data)
            entries.append(
                DynamicDnsEntryResponse(
                    interface=iface,
                    service=provider,
                    host_name=_string_or_none(config.get("host-name")),
                    login=_string_or_none(config.get("login")),
                    has_password=("password" in config),
                    server=_string_or_none(config.get("server")),
                )
            )

    return DynamicDnsConfigResponse(
        configured=bool(interface_root),
        enabled=bool(entries),
        entries=entries,
    )


def _extract_dynamic_dns_passwords(full_config: Dict[str, Any]) -> Dict[Tuple[str, str], str]:
    """
    Extract existing dynamic DNS passwords keyed by (interface, provider).
    This allows PUT updates to preserve provider secrets when the client leaves password blank.
    """
    service_root = _as_dict(full_config.get("service"))
    dns_root = _as_dict(service_root.get("dns"))
    dynamic_root = _as_dict(dns_root.get("dynamic"))
    interface_root = _as_dict(dynamic_root.get("interface"))

    existing_passwords: Dict[Tuple[str, str], str] = {}
    for interface_name, interface_data in interface_root.items():
        iface = _string_or_none(interface_name)
        if not iface:
            continue

        services = _as_dict(_as_dict(interface_data).get("service"))
        for service_name, service_data in services.items():
            provider = _string_or_none(service_name)
            if not provider:
                continue

            config = _as_dict(service_data)
            password = _string_or_none(config.get("password"))
            if not password:
                continue

            existing_passwords[(iface, provider)] = password

    return existing_passwords


def _parse_dhcp_relay_config(full_config: Dict[str, Any]) -> DhcpRelayConfigResponse:
    service_root = _as_dict(full_config.get("service"))
    relay_root = service_root.get("dhcp-relay")
    if not isinstance(relay_root, dict):
        return DhcpRelayConfigResponse(configured=False, enabled=False, interfaces=[], servers=[])

    interfaces = _extract_tag_values(relay_root, ["interface"])
    servers = _extract_tag_values(relay_root, ["server"])

    enabled = bool(interfaces) and bool(servers)
    return DhcpRelayConfigResponse(
        configured=bool(relay_root),
        enabled=enabled,
        interfaces=interfaces,
        servers=servers,
    )


RE_INTERFACE_NAME = re.compile(r"^[A-Za-z0-9._:-]+$")


def _normalize_interface_name_or_400(name: str, field_name: str = "interface") -> str:
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    if not RE_INTERFACE_NAME.match(cleaned):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}: {cleaned}")
    return cleaned


def _normalize_token_or_400(value: str, field_name: str) -> str:
    cleaned = value.strip()
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


LLDP_INTERFACE_HINT_RE = re.compile(r"^[A-Za-z]+[0-9][A-Za-z0-9._:-]*$")


def _normalize_lldp_key(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def _looks_like_interface_name(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return bool(LLDP_INTERFACE_HINT_RE.match(value.strip()))


def _first_nonempty_scalar(mapping: Dict[str, Any], aliases: List[str]) -> Optional[str]:
    for alias in aliases:
        if alias not in mapping:
            continue
        value = mapping[alias]
        if isinstance(value, (dict, list)):
            continue
        cleaned = str(value).strip()
        if cleaned:
            return cleaned
    return None


def _parse_lldp_neighbors_structured_output(payload: Any) -> List[LldpNeighbor]:
    """
    Parse structured LLDP payloads returned by some VyOS/pyvyos show paths.
    This complements table/text parsing and is only used as a fallback.
    """
    neighbors: List[LldpNeighbor] = []
    seen: set[Tuple[str, str, str, str, str]] = set()

    def append_candidate(candidate: Dict[str, Any], hinted_interface: Optional[str]) -> None:
        normalized = {_normalize_lldp_key(key): value for key, value in candidate.items()}
        if not normalized:
            return

        local_interface = _first_nonempty_scalar(
            normalized,
            [
                "local_interface",
                "interface",
                "local_port",
                "ifname",
                "name",
            ],
        ) or hinted_interface
        chassis_id = _first_nonempty_scalar(normalized, ["chassis_id", "chassisid"])
        port_id = _first_nonempty_scalar(normalized, ["port_id", "portid", "remote_port", "remote_port_id"])
        port_description = _first_nonempty_scalar(
            normalized,
            ["port_description", "port_descr", "portdescription", "portdescr"],
        )
        system_name = _first_nonempty_scalar(
            normalized,
            ["system_name", "systemname", "sys_name", "sysname", "system"],
        )
        system_description = _first_nonempty_scalar(
            normalized,
            ["system_description", "systemdescription", "sys_description", "sysdescr"],
        )
        platform = _first_nonempty_scalar(normalized, ["platform"])
        capabilities = _first_nonempty_scalar(normalized, ["capabilities", "capability"])

        if not any(
            (
                local_interface,
                chassis_id,
                port_id,
                port_description,
                system_name,
                system_description,
                platform,
                capabilities,
            )
        ):
            return

        try:
            raw = json.dumps(candidate, ensure_ascii=False, sort_keys=True)
        except TypeError:
            raw = str(candidate)

        dedupe_key = (
            local_interface or "",
            chassis_id or "",
            port_id or "",
            system_name or "",
            raw,
        )
        if dedupe_key in seen:
            return
        seen.add(dedupe_key)

        neighbors.append(
            LldpNeighbor(
                local_interface=local_interface,
                chassis_id=chassis_id,
                port_id=port_id,
                port_description=port_description,
                system_name=system_name,
                system_description=system_description,
                platform=platform,
                capabilities=capabilities,
                raw=raw,
            )
        )

    def walk(node: Any, hinted_interface: Optional[str] = None) -> None:
        if isinstance(node, str):
            stripped = node.strip()
            if stripped.startswith("{") or stripped.startswith("["):
                try:
                    parsed = json.loads(stripped)
                except json.JSONDecodeError:
                    return
                walk(parsed, hinted_interface)
            return

        if isinstance(node, dict):
            append_candidate(node, hinted_interface)
            for key, value in node.items():
                next_hint = hinted_interface
                if _looks_like_interface_name(key):
                    next_hint = str(key).strip()
                walk(value, next_hint)
            return

        if isinstance(node, list):
            for item in node:
                walk(item, hinted_interface)

    walk(payload)
    return neighbors


def _parse_lldp_neighbors_output(output: str) -> List[LldpNeighbor]:
    cleaned = _strip_ansi(output or "")
    lines = [line.rstrip("\r") for line in cleaned.splitlines() if line.strip()]
    if not lines:
        return []

    header_index: Optional[int] = None
    for index, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r"(?i)^(interface|local\s+port|local\s+interface)\b", stripped):
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


def _parse_lldp_neighbors_detail_output(output: str) -> List[LldpNeighbor]:
    """
    Parse block-style LLDP detail output (e.g., lldpd style) into neighbors.
    This is a fallback when summary-table parsing yields no neighbors.
    """
    cleaned = _strip_ansi(output or "")
    lines = [line.rstrip("\r") for line in cleaned.splitlines()]
    if not any(line.strip() for line in lines):
        return []

    neighbors: List[LldpNeighbor] = []
    current: Dict[str, str] = {}
    current_raw: List[str] = []

    def flush() -> None:
        nonlocal current, current_raw
        if not current:
            return

        local_interface = current.get("interface") or current.get("localport")
        if local_interface and "," in local_interface:
            local_interface = local_interface.split(",", 1)[0].strip()

        neighbor = LldpNeighbor(
            local_interface=local_interface or None,
            chassis_id=current.get("chassisid"),
            port_id=current.get("portid"),
            port_description=current.get("portdescr"),
            system_name=current.get("sysname") or current.get("systemname"),
            system_description=current.get("sysdescr") or current.get("systemdescription"),
            platform=current.get("platform"),
            capabilities=current.get("capability") or current.get("capabilities"),
            raw="\n".join(current_raw).strip() or "(detail block)",
        )

        if any(
            (
                neighbor.local_interface,
                neighbor.chassis_id,
                neighbor.port_id,
                neighbor.system_name,
                neighbor.system_description,
                neighbor.platform,
                neighbor.capabilities,
            )
        ):
            neighbors.append(neighbor)

        current = {}
        current_raw = []

    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped:
            continue

        if re.match(r"^-{3,}$", stripped):
            flush()
            continue

        match = re.match(r"^([A-Za-z][A-Za-z0-9 ]+):\s*(.+)$", stripped)
        if not match:
            continue

        key = match.group(1).strip().lower().replace(" ", "")
        value = match.group(2).strip()
        if not value:
            continue

        if key in current and current[key] != value:
            current[key] = f"{current[key]}, {value}"
        else:
            current[key] = value

        current_raw.append(stripped)

    flush()
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


def _normalize_local_principal_or_400(principal: str) -> str:
    clean = principal.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="principal cannot be empty")
    if len(clean) > 255:
        raise HTTPException(status_code=400, detail="principal must be 255 characters or fewer")
    return clean


def _normalize_local_otp_key_or_400(otp_key: str) -> str:
    clean = otp_key.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="otp_key cannot be empty")
    if len(clean) > 512:
        raise HTTPException(status_code=400, detail="otp_key must be 512 characters or fewer")
    return clean


def _normalize_local_public_key_identifier_or_400(identifier: str) -> str:
    clean = identifier.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="public key identifier is required")
    if not RE_LOCAL_PUBLIC_KEY_IDENTIFIER.match(clean):
        raise HTTPException(status_code=400, detail=f"Invalid public key identifier '{clean}'")
    return clean


def _normalize_local_public_key_type_or_400(key_type: str) -> str:
    clean = key_type.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="public key type cannot be empty")
    if not RE_LOCAL_PUBLIC_KEY_TYPE.match(clean):
        raise HTTPException(status_code=400, detail=f"Invalid public key type '{clean}'")
    return clean


def _derive_public_key_type(key_value: str) -> Optional[str]:
    first_token = key_value.strip().split(" ", 1)[0].strip()
    if first_token and RE_LOCAL_PUBLIC_KEY_TYPE.match(first_token):
        return first_token
    return None


def _normalize_local_public_key_entries_or_400(
    explicit_entries: Optional[List[LocalUserPublicKeyEntryRequest]],
    fallback_keys: List[str],
) -> List[LocalUserPublicKeyEntry]:
    normalized: List[LocalUserPublicKeyEntry] = []

    if explicit_entries is not None:
        seen_identifiers: set[str] = set()
        for index, entry in enumerate(explicit_entries, start=1):
            key_value = (entry.key or "").strip()
            identifier_seed = (entry.identifier or "").strip() or f"key-{index}"
            key_options = (entry.options or "").strip() or None
            key_type = (entry.key_type or "").strip()

            if not key_value:
                if key_options or key_type or (entry.identifier and entry.identifier.strip()):
                    raise HTTPException(
                        status_code=400,
                        detail=f"public key entry {index} requires key when identifier/options/type are provided",
                    )
                continue

            identifier = _normalize_local_public_key_identifier_or_400(identifier_seed)
            if identifier in seen_identifiers:
                raise HTTPException(status_code=400, detail=f"Duplicate public key identifier '{identifier}'")
            seen_identifiers.add(identifier)

            if key_type:
                normalized_type = _normalize_local_public_key_type_or_400(key_type)
            else:
                normalized_type = _derive_public_key_type(key_value)

            if key_options and len(key_options) > 1024:
                raise HTTPException(status_code=400, detail="public key options must be 1024 characters or fewer")

            normalized.append(
                LocalUserPublicKeyEntry(
                    identifier=identifier,
                    key=key_value,
                    key_type=normalized_type,
                    options=key_options,
                )
            )

        return sorted(normalized, key=lambda item: item.identifier)

    seen_keys: set[str] = set()
    for index, key_value_raw in enumerate(fallback_keys, start=1):
        key_value = key_value_raw.strip()
        if not key_value or key_value in seen_keys:
            continue
        seen_keys.add(key_value)
        normalized.append(
            LocalUserPublicKeyEntry(
                identifier=f"key-{index}",
                key=key_value,
                key_type=_derive_public_key_type(key_value),
                options=None,
            )
        )

    return normalized


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
        otp_auth = _as_dict(auth.get("otp"))
        public_keys = _as_dict(auth.get("public-keys"))
        parsed_public_key_entries: List[LocalUserPublicKeyEntry] = []
        parsed_public_keys: List[str] = []
        for key_name, key_entry in sorted(public_keys.items(), key=lambda item: str(item[0])):
            key_identifier = str(key_name).strip()
            if not key_identifier:
                continue
            key_data = _as_dict(key_entry)
            key_value_raw = key_data.get("key")
            key_value = key_value_raw.strip() if isinstance(key_value_raw, str) else ""
            if not key_value:
                continue
            key_type_raw = key_data.get("type")
            key_options_raw = key_data.get("options")
            key_type = key_type_raw.strip() if isinstance(key_type_raw, str) and key_type_raw.strip() else None
            key_options = (
                key_options_raw.strip()
                if isinstance(key_options_raw, str) and key_options_raw.strip()
                else None
            )
            parsed_public_keys.append(key_value)
            parsed_public_key_entries.append(
                LocalUserPublicKeyEntry(
                    identifier=key_identifier,
                    key=key_value,
                    key_type=key_type,
                    options=key_options,
                )
            )

        principal_value = auth.get("principal")
        principal = principal_value.strip() if isinstance(principal_value, str) and principal_value.strip() else None
        otp_key_value = otp_auth.get("key")
        otp_key_configured = bool(isinstance(otp_key_value, str) and otp_key_value.strip())
        otp_rate_limit = _safe_int(otp_auth.get("rate-limit"))
        if otp_rate_limit is not None and (otp_rate_limit < 1 or otp_rate_limit > 10):
            otp_rate_limit = None
        otp_rate_time = _safe_int(otp_auth.get("rate-time"))
        if otp_rate_time is not None and (otp_rate_time < 1 or otp_rate_time > 600):
            otp_rate_time = None
        otp_window_size = _safe_int(otp_auth.get("window-size"))
        if otp_window_size is not None and (otp_window_size < 1 or otp_window_size > 21):
            otp_window_size = None
        has_otp = (
            otp_key_configured
            or otp_rate_limit is not None
            or otp_rate_time is not None
            or otp_window_size is not None
        )

        parsed_users.append(
            LocalUserSummary(
                username=name,
                full_name=data.get("full-name"),
                level=data.get("level"),
                disabled="disable" in data,
                principal=principal,
                otp_key_configured=otp_key_configured,
                otp_rate_limit=otp_rate_limit,
                otp_rate_time=otp_rate_time,
                otp_window_size=otp_window_size,
                auth=LocalUserAuthState(
                    has_plaintext_password=bool(_as_dict(auth).get("plaintext-password")),
                    has_encrypted_password=bool(_as_dict(auth).get("encrypted-password")),
                    has_public_keys=bool(public_keys),
                    has_otp=has_otp,
                    has_principal=bool(principal),
                ),
                public_key_names=sorted([entry.identifier for entry in parsed_public_key_entries]),
                public_keys=parsed_public_keys,
                public_key_entries=parsed_public_key_entries,
            )
        )

    return parsed_users


def _find_local_user(users: List[LocalUserSummary], username: str) -> Optional[LocalUserSummary]:
    for user in users:
        if user.username == username:
            return user
    return None


def _parse_login_auth_servers(raw_server_block: Any) -> List[LoginAuthServerConfig]:
    servers_root = _as_dict(raw_server_block)
    parsed: List[LoginAuthServerConfig] = []
    for address, server_data in sorted(servers_root.items(), key=lambda item: str(item[0])):
        server_address = str(address).strip()
        if not server_address:
            continue
        options = _as_dict(server_data)
        key = str(options.get("key") or "").strip()
        if not key:
            continue
        port = _safe_int(options.get("port"))
        if port is not None and (port < 1 or port > 65535):
            port = None
        timeout = _safe_int(options.get("timeout"))
        if timeout is not None and (timeout < 1 or timeout > 65535):
            timeout = None
        disabled = "disable" in options
        parsed.append(
            LoginAuthServerConfig(
                address=server_address,
                key=key,
                port=port,
                timeout=timeout,
                disabled=disabled,
            )
        )
    return parsed


def _normalize_login_auth_servers_or_400(
    entries: List[LoginAuthServerConfig],
    *,
    field_name: str,
) -> List[LoginAuthServerConfig]:
    dedupe: Dict[str, LoginAuthServerConfig] = {}
    for entry in entries:
        address = _normalize_dns_server_or_400(entry.address, field_name=f"{field_name} address")
        key = (entry.key or "").strip()
        if not key:
            raise HTTPException(status_code=400, detail=f"{field_name} server '{address}' requires key")
        dedupe[address] = LoginAuthServerConfig(
            address=address,
            key=key,
            port=entry.port,
            timeout=entry.timeout,
            disabled=bool(entry.disabled),
        )
    return [dedupe[address] for address in sorted(dedupe.keys())]


def _parse_login_config(full_config: Dict[str, Any]) -> LoginConfigResponse:
    system_root = _as_dict(full_config.get("system"))
    login_root = _as_dict(system_root.get("login"))
    if not login_root:
        return LoginConfigResponse(configured=False)

    banner_root = _as_dict(login_root.get("banner"))
    radius_root = _as_dict(login_root.get("radius"))
    tacacs_root = _as_dict(login_root.get("tacacs"))

    max_sessions_per_user = _safe_int(login_root.get("max-sessions-per-user"))
    if max_sessions_per_user is not None and (max_sessions_per_user < 1 or max_sessions_per_user > 65535):
        max_sessions_per_user = None

    timeout = _safe_int(login_root.get("timeout"))
    if timeout is not None and (timeout < 1 or timeout > 65535):
        timeout = None

    radius_source_address = radius_root.get("source-address")
    if isinstance(radius_source_address, str):
        radius_source_address = radius_source_address.strip() or None
    else:
        radius_source_address = None

    radius_vrf = radius_root.get("vrf")
    if isinstance(radius_vrf, str):
        radius_vrf = radius_vrf.strip() or None
    else:
        radius_vrf = None

    tacacs_source_address = tacacs_root.get("source-address")
    if isinstance(tacacs_source_address, str):
        tacacs_source_address = tacacs_source_address.strip() or None
    else:
        tacacs_source_address = None

    tacacs_vrf = tacacs_root.get("vrf")
    if isinstance(tacacs_vrf, str):
        tacacs_vrf = tacacs_vrf.strip() or None
    else:
        tacacs_vrf = None

    return LoginConfigResponse(
        configured=True,
        banner_pre_login=_string_or_none(banner_root.get("pre-login")),
        banner_post_login=_string_or_none(banner_root.get("post-login")),
        max_sessions_per_user=max_sessions_per_user,
        timeout=timeout,
        radius_source_address=radius_source_address,
        radius_vrf=radius_vrf,
        tacacs_source_address=tacacs_source_address,
        tacacs_vrf=tacacs_vrf,
        radius_servers=_parse_login_auth_servers(radius_root.get("server")),
        tacacs_servers=_parse_login_auth_servers(tacacs_root.get("server")),
    )


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


@router.put("/config", response_model=SystemConfig)
async def update_system_config(request: Request, body: SystemConfigRequest) -> SystemConfig:
    """
    Update mutable system identity settings.

    Supports:
    - system host-name
    - system time-zone
    - system name-server (list, only when explicitly provided)
    - system domain-name
    """
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        desired_hostname = _string_or_none(body.hostname)
        desired_timezone = _string_or_none(body.timezone)
        desired_domain = _string_or_none(body.domain_name)
        desired_name_servers = (
            _normalize_unique_strings(body.name_servers)
            if body.name_servers is not None
            else None
        )

        if desired_hostname:
            desired_hostname = _normalize_hostname_or_400(desired_hostname, field_name="hostname")
        if desired_timezone:
            desired_timezone = _normalize_timezone_or_400(desired_timezone)
        if desired_domain:
            desired_domain = _normalize_hostname_or_400(desired_domain, field_name="domain name")

        if desired_name_servers is not None:
            for name_server in desired_name_servers:
                _normalize_token_or_400(name_server, field_name="name server")

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current_config = full_config.get("system", {})
        current_name_servers = _extract_tag_values(current_config, ["name-server"])

        operations: List[Dict[str, Any]] = []

        current_hostname = _string_or_none(current_config.get("host-name"))
        if desired_hostname != current_hostname:
            if desired_hostname:
                operations.append({"op": "set", "path": ["system", "host-name", desired_hostname]})
            elif current_hostname:
                operations.append({"op": "delete", "path": ["system", "host-name"]})

        current_timezone = _string_or_none(current_config.get("time-zone"))
        if desired_timezone != current_timezone:
            if desired_timezone:
                operations.append({"op": "set", "path": ["system", "time-zone", desired_timezone]})
            elif current_timezone:
                operations.append({"op": "delete", "path": ["system", "time-zone"]})

        current_domain = _string_or_none(current_config.get("domain-name"))
        if desired_domain != current_domain:
            if desired_domain:
                operations.append({"op": "set", "path": ["system", "domain-name", desired_domain]})
            elif current_domain:
                operations.append({"op": "delete", "path": ["system", "domain-name"]})

        if desired_name_servers is not None:
            current_name_server_set = set(current_name_servers)
            desired_name_server_set = set(desired_name_servers)
            for name_server in sorted(current_name_server_set - desired_name_server_set):
                operations.append({"op": "delete", "path": ["system", "name-server", name_server]})
            for name_server in sorted(desired_name_server_set - current_name_server_set):
                operations.append({"op": "set", "path": ["system", "name-server", name_server]})

        if operations:
            response = await run_in_threadpool(service.apply_operations, operations)
            if response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update system configuration: {response.error or 'Unknown VyOS error'}",
                )

        updated_config = await run_in_threadpool(service.get_full_config, refresh=True)
        updated_system = updated_config.get("system", {})
        updated_name_servers = _extract_tag_values(updated_system, ["name-server"])

        return SystemConfig(
            hostname=_string_or_none(updated_system.get("host-name")),
            timezone=_string_or_none(updated_system.get("time-zone")),
            name_servers=updated_name_servers,
            domain_name=_string_or_none(updated_system.get("domain-name")),
            raw_config=updated_system if isinstance(updated_system, dict) else {},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating system config: {str(e)}")


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
        temperature_supported = False
        for command_path in (
            ["hardware", "temperature"],
            ["system", "temperature"],
            ["hardware", "sensors"],
            ["system", "sensors"],
            ["sensors"],
        ):
            response = None
            try:
                response = await run_in_threadpool(service.device.show, path=command_path)
            except Exception:
                response = None

            if response is None or getattr(response, "status", None) != 200:
                try:
                    response = await run_in_threadpool(service.device.generate, path=command_path)
                except Exception:
                    response = None

            if response is None or getattr(response, "status", None) != 200:
                continue
            temperature_supported = True

            candidate = _extract_show_output(getattr(response, "result", ""))
            if candidate.strip():
                temperature_output = candidate
                break

        summary = summary.model_copy(update={"cpu_temperature_supported": temperature_supported})

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
            response = await run_in_threadpool(service.apply_operations, operations)
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
            response = await run_in_threadpool(service.apply_operations, operations)
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
                desired_listen = set(
                    _normalize_ip_address_or_400(address, field_name="listen address")
                    for address in _normalize_unique_strings(body.listen_addresses)
                )
                current_listen = set(current.listen_addresses)
                for addr in sorted(current_listen - desired_listen):
                    operations.append({"op": "delete", "path": ["service", "dns", "forwarding", "listen-address", addr]})
                for addr in sorted(desired_listen - current_listen):
                    operations.append({"op": "set", "path": ["service", "dns", "forwarding", "listen-address", addr]})

            if "allow_from" in fields_set:
                desired_allow_from = set(
                    _normalize_cidr_or_400(cidr, field_name="allow-from network")
                    for cidr in _normalize_unique_strings(body.allow_from)
                )
            else:
                desired_allow_from = set(current.allow_from)

            # VyOS DNS forwarding requires at least one allow-from network.
            # Default to permissive dual-stack when empty so first-time setup works.
            if not desired_allow_from:
                desired_allow_from = set(DEFAULT_DNS_ALLOW_FROM_NETWORKS)

            current_allow_from = set(current.allow_from)
            for cidr in sorted(current_allow_from - desired_allow_from):
                operations.append({"op": "delete", "path": ["service", "dns", "forwarding", "allow-from", cidr]})
            for cidr in sorted(desired_allow_from - current_allow_from):
                operations.append({"op": "set", "path": ["service", "dns", "forwarding", "allow-from", cidr]})

            if "name_servers" in fields_set:
                desired_name_servers = set(
                    _normalize_dns_server_or_400(name_server, field_name="DNS name server")
                    for name_server in _normalize_unique_strings(body.name_servers)
                )
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
                desired_auth_domains = set(
                    _normalize_hostname_or_400(domain, field_name="authoritative domain")
                    for domain in _normalize_unique_strings(body.authoritative_domains)
                )
                current_auth_domains = set(current.authoritative_domains)
                for domain in sorted(current_auth_domains - desired_auth_domains):
                    operations.append(
                        {"op": "delete", "path": ["service", "dns", "forwarding", "authoritative-domain", domain]}
                    )
                for domain in sorted(desired_auth_domains - current_auth_domains):
                    operations.append(
                        {"op": "set", "path": ["service", "dns", "forwarding", "authoritative-domain", domain]}
                    )

        # System resolver defaults (`system name-server` and `system domain-search`).
        if "system_name_servers" in fields_set:
            desired_system_name_servers = set(
                _normalize_dns_server_or_400(name_server, field_name="system DNS name server")
                for name_server in _normalize_unique_strings(body.system_name_servers)
            )
            current_system_name_servers = set(_extract_tag_values(raw_system, ["name-server"]))
            for ns in sorted(current_system_name_servers - desired_system_name_servers):
                operations.append({"op": "delete", "path": ["system", "name-server", ns]})
            for ns in sorted(desired_system_name_servers - current_system_name_servers):
                operations.append({"op": "set", "path": ["system", "name-server", ns]})

        if "system_domain_search" in fields_set:
            desired_domain_search = set(
                _normalize_hostname_or_400(domain, field_name="system domain-search")
                for domain in _normalize_unique_strings(body.system_domain_search)
            )
            current_domain_search = set(_extract_tag_values(raw_system, ["domain-search"]))
            for domain in sorted(current_domain_search - desired_domain_search):
                operations.append({"op": "delete", "path": ["system", "domain-search", domain]})
            for domain in sorted(desired_domain_search - current_domain_search):
                operations.append({"op": "set", "path": ["system", "domain-search", domain]})

        # System domain-name.
        if "local_domain_name" in fields_set:
            local_domain_name = _string_or_none(body.local_domain_name)
            if local_domain_name:
                local_domain_name = _normalize_hostname_or_400(local_domain_name, field_name="local domain name")
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
            response = await run_in_threadpool(service.apply_operations, operations)
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


@router.get("/dynamic-dns-config", response_model=DynamicDnsConfigResponse)
async def get_dynamic_dns_config(request: Request, refresh: bool = False) -> DynamicDnsConfigResponse:
    """Get Dynamic DNS service configuration."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _parse_dynamic_dns_config(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving Dynamic DNS configuration: {str(exc)}")


@router.put("/dynamic-dns-config", response_model=DynamicDnsConfigResponse)
async def update_dynamic_dns_config(request: Request, body: DynamicDnsConfigRequest) -> DynamicDnsConfigResponse:
    """Update Dynamic DNS service configuration."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current = _parse_dynamic_dns_config(full_config)
        existing_passwords = _extract_dynamic_dns_passwords(full_config)

        operations: List[Dict[str, Any]] = []
        if not body.enabled:
            if current.configured:
                operations.append({"op": "delete", "path": ["service", "dns", "dynamic"]})
        else:
            entries: List[DynamicDnsEntry] = []
            seen_keys: set[tuple[str, str]] = set()
            for entry in body.entries:
                interface_name = _normalize_interface_name_or_400(entry.interface, field_name="dynamic DNS interface")
                provider = _normalize_token_or_400(entry.service, field_name="dynamic DNS service")
                host_name = _string_or_none(entry.host_name)
                login = _string_or_none(entry.login)
                dedupe_key = (interface_name, provider)
                password = _string_or_none(entry.password) or existing_passwords.get(dedupe_key)
                server = _string_or_none(entry.server)
                if dedupe_key in seen_keys:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Duplicate Dynamic DNS entry for interface '{interface_name}' and service '{provider}'.",
                    )
                seen_keys.add(dedupe_key)

                entries.append(
                    DynamicDnsEntry(
                        interface=interface_name,
                        service=provider,
                        host_name=host_name,
                        login=login,
                        password=password,
                        server=server,
                    )
                )

            if not entries:
                raise HTTPException(
                    status_code=400,
                    detail="At least one Dynamic DNS entry is required when Dynamic DNS is enabled.",
                )

            operations.append({"op": "set", "path": ["service", "dns", "dynamic"]})
            if current.configured:
                operations.append({"op": "delete", "path": ["service", "dns", "dynamic", "interface"]})

            for entry in entries:
                base_path = [
                    "service",
                    "dns",
                    "dynamic",
                    "interface",
                    entry.interface,
                    "service",
                    entry.service,
                ]
                operations.append({"op": "set", "path": base_path})
                if entry.host_name:
                    operations.append({"op": "set", "path": [*base_path, "host-name", entry.host_name]})
                if entry.login:
                    operations.append({"op": "set", "path": [*base_path, "login", entry.login]})
                if entry.password:
                    operations.append({"op": "set", "path": [*base_path, "password", entry.password]})
                if entry.server:
                    operations.append({"op": "set", "path": [*base_path, "server", entry.server]})

        if operations:
            response = await run_in_threadpool(service.apply_operations, operations)
            if response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update Dynamic DNS configuration: {response.error or 'Unknown VyOS error'}",
                )
            await run_in_threadpool(service.get_full_config, refresh=True)

        updated = await run_in_threadpool(service.get_full_config, refresh=True)
        return _parse_dynamic_dns_config(updated)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating Dynamic DNS configuration: {str(exc)}")


@router.get("/dhcp-relay-config", response_model=DhcpRelayConfigResponse)
async def get_dhcp_relay_config(request: Request, refresh: bool = False) -> DhcpRelayConfigResponse:
    """Get DHCP relay service configuration."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _parse_dhcp_relay_config(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving DHCP relay configuration: {str(exc)}")


@router.put("/dhcp-relay-config", response_model=DhcpRelayConfigResponse)
async def update_dhcp_relay_config(request: Request, body: DhcpRelayConfigRequest) -> DhcpRelayConfigResponse:
    """Update DHCP relay service configuration."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current = _parse_dhcp_relay_config(full_config)

        operations: List[Dict[str, Any]] = []
        if not body.enabled:
            if current.configured:
                operations.append({"op": "delete", "path": ["service", "dhcp-relay"]})
        else:
            desired_interfaces = sorted(
                {
                    _normalize_interface_name_or_400(interface_name, field_name="DHCP relay interface")
                    for interface_name in body.interfaces
                    if _string_or_none(interface_name)
                }
            )
            desired_servers = sorted(
                {
                    _normalize_token_or_400(server, field_name="DHCP relay server")
                    for server in body.servers
                    if _string_or_none(server)
                }
            )

            if not desired_interfaces:
                raise HTTPException(
                    status_code=400,
                    detail="At least one interface is required when DHCP relay is enabled.",
                )
            if not desired_servers:
                raise HTTPException(
                    status_code=400,
                    detail="At least one server is required when DHCP relay is enabled.",
                )

            operations.append({"op": "set", "path": ["service", "dhcp-relay"]})

            current_interfaces = set(current.interfaces)
            current_servers = set(current.servers)

            for interface_name in sorted(current_interfaces - set(desired_interfaces)):
                operations.append({"op": "delete", "path": ["service", "dhcp-relay", "interface", interface_name]})
            for interface_name in sorted(set(desired_interfaces) - current_interfaces):
                operations.append({"op": "set", "path": ["service", "dhcp-relay", "interface", interface_name]})

            for server in sorted(current_servers - set(desired_servers)):
                operations.append({"op": "delete", "path": ["service", "dhcp-relay", "server", server]})
            for server in sorted(set(desired_servers) - current_servers):
                operations.append({"op": "set", "path": ["service", "dhcp-relay", "server", server]})

        if operations:
            response = await run_in_threadpool(service.apply_operations, operations)
            if response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update DHCP relay configuration: {response.error or 'Unknown VyOS error'}",
                )
            await run_in_threadpool(service.get_full_config, refresh=True)

        updated = await run_in_threadpool(service.get_full_config, refresh=True)
        return _parse_dhcp_relay_config(updated)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating DHCP relay configuration: {str(exc)}")


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
    principal = (body.principal or "").strip()
    otp_key = (body.otp_key or "").strip()
    public_keys = [entry.strip() for entry in body.ssh_public_keys if entry and entry.strip()]
    public_key_entries = _normalize_local_public_key_entries_or_400(body.ssh_public_key_entries, public_keys)
    otp_rate_limit = body.otp_rate_limit
    otp_rate_time = body.otp_rate_time
    otp_window_size = body.otp_window_size

    if level:
        level = _normalize_local_level_or_400(level)
    if principal:
        principal = _normalize_local_principal_or_400(principal)
    if otp_key:
        otp_key = _normalize_local_otp_key_or_400(otp_key)

    if not password and not public_key_entries:
        raise HTTPException(status_code=400, detail="Provide at least a password or one SSH public key")
    if (otp_rate_limit is not None or otp_rate_time is not None or otp_window_size is not None) and not otp_key:
        raise HTTPException(
            status_code=400,
            detail="otp_key is required when otp_rate_limit, otp_rate_time, or otp_window_size is provided",
        )

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

        if principal:
            operations.append(
                {
                    "op": "set",
                    "path": ["system", "login", "user", username, "authentication", "principal", principal],
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

        for key_entry in public_key_entries:
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
                        key_entry.identifier,
                        "key",
                        key_entry.key,
                    ],
                }
            )
            if key_entry.key_type:
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
                            key_entry.identifier,
                            "type",
                            key_entry.key_type,
                        ],
                    }
                )
            if key_entry.options:
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
                            key_entry.identifier,
                            "options",
                            key_entry.options,
                        ],
                    }
                )

        if otp_key:
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "system",
                        "login",
                        "user",
                        username,
                        "authentication",
                        "otp",
                        "key",
                        otp_key,
                    ],
                }
            )
        if otp_rate_limit is not None:
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "system",
                        "login",
                        "user",
                        username,
                        "authentication",
                        "otp",
                        "rate-limit",
                        str(otp_rate_limit),
                    ],
                }
            )
        if otp_rate_time is not None:
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "system",
                        "login",
                        "user",
                        username,
                        "authentication",
                        "otp",
                        "rate-time",
                        str(otp_rate_time),
                    ],
                }
            )
        if otp_window_size is not None:
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "system",
                        "login",
                        "user",
                        username,
                        "authentication",
                        "otp",
                        "window-size",
                        str(otp_window_size),
                    ],
                }
            )

        if body.disabled:
            operations.append(
                {"op": "set", "path": ["system", "login", "user", username, "disable"]}
            )

        response = await run_in_threadpool(service.apply_operations, operations)
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
        fields_set = body.model_fields_set

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

        if body.ssh_public_keys is not None or body.ssh_public_key_entries is not None:
            keys = [entry.strip() for entry in (body.ssh_public_keys or []) if entry and entry.strip()]
            key_entries = _normalize_local_public_key_entries_or_400(body.ssh_public_key_entries, keys)

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

            for key_entry in key_entries:
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
                            key_entry.identifier,
                            "key",
                            key_entry.key,
                        ],
                    }
                )
                if key_entry.key_type:
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
                                key_entry.identifier,
                                "type",
                                key_entry.key_type,
                            ],
                        }
                    )
                if key_entry.options:
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
                                key_entry.identifier,
                                "options",
                                key_entry.options,
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

        if "principal" in fields_set:
            principal = (body.principal or "").strip()
            if principal:
                principal = _normalize_local_principal_or_400(principal)
                operations.append(
                    {
                        "op": "set",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            "principal",
                            principal,
                        ],
                    }
                )
            else:
                operations.append(
                    {
                        "op": "delete",
                        "path": ["system", "login", "user", user_name, "authentication", "principal"],
                    }
                )

        if "otp_key" in fields_set:
            otp_key = (body.otp_key or "").strip()
            if otp_key:
                otp_key = _normalize_local_otp_key_or_400(otp_key)
                operations.append(
                    {
                        "op": "set",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            "otp",
                            "key",
                            otp_key,
                        ],
                    }
                )
            else:
                operations.append(
                    {
                        "op": "delete",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            "otp",
                            "key",
                        ],
                    }
                )

        if "otp_rate_limit" in fields_set:
            if body.otp_rate_limit is None:
                operations.append(
                    {
                        "op": "delete",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            "otp",
                            "rate-limit",
                        ],
                    }
                )
            else:
                operations.append(
                    {
                        "op": "set",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            "otp",
                            "rate-limit",
                            str(body.otp_rate_limit),
                        ],
                    }
                )

        if "otp_rate_time" in fields_set:
            if body.otp_rate_time is None:
                operations.append(
                    {
                        "op": "delete",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            "otp",
                            "rate-time",
                        ],
                    }
                )
            else:
                operations.append(
                    {
                        "op": "set",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            "otp",
                            "rate-time",
                            str(body.otp_rate_time),
                        ],
                    }
                )

        if "otp_window_size" in fields_set:
            if body.otp_window_size is None:
                operations.append(
                    {
                        "op": "delete",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            "otp",
                            "window-size",
                        ],
                    }
                )
            else:
                operations.append(
                    {
                        "op": "set",
                        "path": [
                            "system",
                            "login",
                            "user",
                            user_name,
                            "authentication",
                            "otp",
                            "window-size",
                            str(body.otp_window_size),
                        ],
                    }
                )

        if operations:
            response = await run_in_threadpool(service.apply_operations, operations)
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
            service.apply_operations, [{"op": "delete", "path": ["system", "login", "user", user_name]}],
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


@router.get("/login-config", response_model=LoginConfigResponse)
async def get_login_config(request: Request, refresh: bool = False) -> LoginConfigResponse:
    """Get global system login configuration (`system login ...`)."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _parse_login_config(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving login configuration: {str(exc)}")


@router.put("/login-config", response_model=LoginConfigResponse)
async def update_login_config(request: Request, body: LoginConfigRequest) -> LoginConfigResponse:
    """Update global system login configuration (`system login ...`)."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        desired_radius_servers = _normalize_login_auth_servers_or_400(
            body.radius_servers, field_name="radius"
        )
        desired_tacacs_servers = _normalize_login_auth_servers_or_400(
            body.tacacs_servers, field_name="tacacs"
        )

        desired_pre_banner = (body.banner_pre_login or "").strip()
        desired_post_banner = (body.banner_post_login or "").strip()
        desired_max_sessions = body.max_sessions_per_user
        desired_timeout = body.timeout
        desired_radius_source = (body.radius_source_address or "").strip()
        desired_radius_vrf = (body.radius_vrf or "").strip()
        desired_tacacs_source = (body.tacacs_source_address or "").strip()
        desired_tacacs_vrf = (body.tacacs_vrf or "").strip()
        if desired_radius_source:
            desired_radius_source = _normalize_ip_address_or_400(
                desired_radius_source, field_name="radius_source_address"
            )
        else:
            desired_radius_source = ""
        if desired_radius_vrf:
            desired_radius_vrf = _normalize_token_or_400(
                desired_radius_vrf, field_name="radius_vrf"
            )
        else:
            desired_radius_vrf = ""
        if desired_tacacs_source:
            desired_tacacs_source = _normalize_ip_address_or_400(
                desired_tacacs_source, field_name="tacacs_source_address"
            )
        else:
            desired_tacacs_source = ""
        if desired_tacacs_vrf:
            desired_tacacs_vrf = _normalize_token_or_400(
                desired_tacacs_vrf, field_name="tacacs_vrf"
            )
        else:
            desired_tacacs_vrf = ""

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        current = _parse_login_config(full_config)

        operations: List[Dict[str, Any]] = []

        current_pre_banner = (current.banner_pre_login or "").strip()
        if desired_pre_banner != current_pre_banner:
            if desired_pre_banner:
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", "banner", "pre-login", desired_pre_banner],
                    }
                )
            else:
                operations.append(
                    {"op": "delete", "path": ["system", "login", "banner", "pre-login"]}
                )

        current_post_banner = (current.banner_post_login or "").strip()
        if desired_post_banner != current_post_banner:
            if desired_post_banner:
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", "banner", "post-login", desired_post_banner],
                    }
                )
            else:
                operations.append(
                    {"op": "delete", "path": ["system", "login", "banner", "post-login"]}
                )

        if desired_max_sessions != current.max_sessions_per_user:
            if desired_max_sessions is None:
                operations.append(
                    {"op": "delete", "path": ["system", "login", "max-sessions-per-user"]}
                )
            else:
                operations.append(
                    {
                        "op": "set",
                        "path": [
                            "system",
                            "login",
                            "max-sessions-per-user",
                            str(desired_max_sessions),
                        ],
                    }
                )

        if desired_timeout != current.timeout:
            if desired_timeout is None:
                operations.append({"op": "delete", "path": ["system", "login", "timeout"]})
            else:
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", "timeout", str(desired_timeout)],
                    }
                )

        current_radius_source = (current.radius_source_address or "").strip()
        if desired_radius_source != current_radius_source:
            if desired_radius_source:
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", "radius", "source-address", desired_radius_source],
                    }
                )
            else:
                operations.append(
                    {"op": "delete", "path": ["system", "login", "radius", "source-address"]}
                )

        current_radius_vrf = (current.radius_vrf or "").strip()
        if desired_radius_vrf != current_radius_vrf:
            if desired_radius_vrf:
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", "radius", "vrf", desired_radius_vrf],
                    }
                )
            else:
                operations.append({"op": "delete", "path": ["system", "login", "radius", "vrf"]})

        current_tacacs_source = (current.tacacs_source_address or "").strip()
        if desired_tacacs_source != current_tacacs_source:
            if desired_tacacs_source:
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", "tacacs", "source-address", desired_tacacs_source],
                    }
                )
            else:
                operations.append(
                    {"op": "delete", "path": ["system", "login", "tacacs", "source-address"]}
                )

        current_tacacs_vrf = (current.tacacs_vrf or "").strip()
        if desired_tacacs_vrf != current_tacacs_vrf:
            if desired_tacacs_vrf:
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", "tacacs", "vrf", desired_tacacs_vrf],
                    }
                )
            else:
                operations.append({"op": "delete", "path": ["system", "login", "tacacs", "vrf"]})

        def _server_signature(server: LoginAuthServerConfig) -> tuple[str, Optional[int], Optional[int], bool]:
            return (server.key, server.port, server.timeout, bool(server.disabled))

        def _sync_auth_servers(
            subtree: str,
            current_servers: List[LoginAuthServerConfig],
            desired_servers: List[LoginAuthServerConfig],
        ) -> None:
            current_map = {server.address: server for server in current_servers}
            desired_map = {server.address: server for server in desired_servers}

            for address, current_server in current_map.items():
                desired_server = desired_map.get(address)
                if desired_server is None or _server_signature(desired_server) != _server_signature(current_server):
                    operations.append(
                        {
                            "op": "delete",
                            "path": ["system", "login", subtree, "server", address],
                        }
                    )

            for address, desired_server in desired_map.items():
                current_server = current_map.get(address)
                if current_server is not None and _server_signature(desired_server) == _server_signature(current_server):
                    continue
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", subtree, "server", address],
                    }
                )
                operations.append(
                    {
                        "op": "set",
                        "path": ["system", "login", subtree, "server", address, "key", desired_server.key],
                    }
                )
                if desired_server.port is not None:
                    operations.append(
                        {
                            "op": "set",
                            "path": [
                                "system",
                                "login",
                                subtree,
                                "server",
                                address,
                                "port",
                                str(desired_server.port),
                            ],
                        }
                    )
                if desired_server.timeout is not None:
                    operations.append(
                        {
                            "op": "set",
                            "path": [
                                "system",
                                "login",
                                subtree,
                                "server",
                                address,
                                "timeout",
                                str(desired_server.timeout),
                            ],
                        }
                    )
                if desired_server.disabled:
                    operations.append(
                        {
                            "op": "set",
                            "path": [
                                "system",
                                "login",
                                subtree,
                                "server",
                                address,
                                "disable",
                            ],
                        }
                    )

        _sync_auth_servers("radius", current.radius_servers, desired_radius_servers)
        _sync_auth_servers("tacacs", current.tacacs_servers, desired_tacacs_servers)

        if operations:
            response = await run_in_threadpool(service.apply_operations, operations)
            if response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update login configuration: {response.error or 'Unknown VyOS error'}",
                )

        updated_config = await run_in_threadpool(service.get_full_config, refresh=True)
        return _parse_login_config(updated_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating login configuration: {str(exc)}")


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
            response = await run_in_threadpool(service.apply_operations, operations)
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
        if not neighbors and not isinstance(neighbors_response, Exception):
            neighbors = _parse_lldp_neighbors_structured_output(getattr(neighbors_response, "result", None))

        if not neighbors and detail_output:
            neighbors = _parse_lldp_neighbors_detail_output(detail_output)
            if neighbors:
                error = None
        if not neighbors and not isinstance(detail_response, Exception):
            neighbors = _parse_lldp_neighbors_structured_output(getattr(detail_response, "result", None))
            if neighbors:
                error = None

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
            response = await run_in_threadpool(service.apply_operations, operations)
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
            response = await run_in_threadpool(service.apply_operations, operations)
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
            response = await run_in_threadpool(service.apply_operations, operations)
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
