"""
System Information Endpoints

API endpoints for retrieving system information about the VyOS device.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Tuple
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
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        hostname = full_config.get("system", {}).get("host-name")

        version_output = ""
        uptime_output = ""
        cpu_output = ""
        memory_output = ""

        version_response = await run_in_threadpool(service.device.show, path=["version"])
        if version_response.status == 200:
            version_output = _extract_show_output(version_response.result)

        uptime_response = await run_in_threadpool(service.device.show, path=["system", "uptime"])
        if uptime_response.status == 200:
            uptime_output = _extract_show_output(uptime_response.result)

        cpu_response = await run_in_threadpool(service.device.show, path=["system", "cpu"])
        if cpu_response.status == 200:
            cpu_output = _extract_show_output(cpu_response.result)

        memory_response = await run_in_threadpool(service.device.show, path=["system", "memory"])
        if memory_response.status == 200:
            memory_output = _extract_show_output(memory_response.result)

        summary = SystemDashboardSummary(hostname=hostname)

        if version_output:
            summary = summary.model_copy(update=_parse_version_output(version_output))

        if uptime_output:
            summary = summary.model_copy(update=_parse_uptime_output(uptime_output))

        if cpu_output:
            summary = summary.model_copy(update=_parse_cpu_output(cpu_output))

        if memory_output:
            summary = summary.model_copy(update=_parse_memory_output(memory_output))

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

        tracking_response = await run_in_threadpool(service.device.show, path=["ntp", "system"])
        if tracking_response.status == 200:
            tracking_output = _extract_show_output(tracking_response.result)

        activity_response = await run_in_threadpool(service.device.show, path=["ntp", "activity"])
        if activity_response.status == 200:
            activity_output = _extract_show_output(activity_response.result)

        sources_response = await run_in_threadpool(service.device.show, path=["ntp", "sources"])
        if sources_response.status == 200:
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
