"""
Container Management Endpoints

VyOS container (Podman) configuration and runtime operations.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional, Tuple
import ipaddress
import re

from session_vyos_service import get_session_vyos_service
from utils.ssh_exec import (
    SshCommandError,
    SSH_USERNAME_DEFAULT,
    ssh_delete_container_image,
    ensure_ssh_keypair,
    ssh_mkdir_p,
    ssh_pull_container_image,
    ssh_update_container_image,
)
from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup


router = APIRouter(prefix="/vyos/containers", tags=["containers"])


# ========================================================================
# Models
# ========================================================================


class ContainerEnvironmentVar(BaseModel):
    key: str
    value: str


class ContainerPortMapping(BaseModel):
    name: str
    source: int
    destination: int
    protocol: Literal["tcp", "udp"] = "tcp"


class ContainerVolumeMapping(BaseModel):
    name: str
    source: str
    destination: str
    mode: Literal["rw", "ro"] = "rw"


class ContainerTmpfsMapping(BaseModel):
    name: str
    destination: str
    size_mb: Optional[int] = None


class ContainerDeviceMapping(BaseModel):
    name: str
    source: str
    destination: str


class ContainerKeyValue(BaseModel):
    key: str
    value: str


class ContainerNetworkAttachment(BaseModel):
    name: str
    address: Optional[str] = None


class ContainerWebLink(BaseModel):
    label: str
    url: str
    source_port: int
    destination_port: int
    protocol: str


class ContainerSummary(BaseModel):
    name: str
    image: Optional[str] = None
    description: Optional[str] = None
    entrypoint: Optional[str] = None
    command: Optional[str] = None
    arguments: Optional[str] = None
    host_name: Optional[str] = None
    restart: Optional[str] = None
    enabled: bool = True
    allow_host_networks: bool = False
    allow_host_pid: bool = False
    network: Optional[str] = None
    network_address: Optional[str] = None
    networks: List[ContainerNetworkAttachment] = Field(default_factory=list)
    name_servers: List[str] = Field(default_factory=list)
    uid: Optional[int] = None
    gid: Optional[int] = None
    cpu_quota: Optional[int] = None
    memory: Optional[int] = None
    capabilities: List[str] = Field(default_factory=list)
    tmpfs: List[ContainerTmpfsMapping] = Field(default_factory=list)
    devices: List[ContainerDeviceMapping] = Field(default_factory=list)
    sysctls: List[ContainerKeyValue] = Field(default_factory=list)
    labels: List[ContainerKeyValue] = Field(default_factory=list)
    health_check_enabled: bool = False
    health_check_command: Optional[str] = None
    health_check_interval: Optional[str] = None
    health_check_timeout: Optional[str] = None
    health_check_retries: Optional[int] = None
    log_driver: Optional[str] = None
    health_status: Optional[str] = None
    uptime: Optional[str] = None
    status: Optional[str] = None
    environment: List[ContainerEnvironmentVar] = Field(default_factory=list)
    ports: List[ContainerPortMapping] = Field(default_factory=list)
    volumes: List[ContainerVolumeMapping] = Field(default_factory=list)
    links: List[ContainerWebLink] = Field(default_factory=list)


class ContainersOverviewResponse(BaseModel):
    connection_host: Optional[str] = None
    configured_total: int = 0
    active_total: Optional[int] = None
    containers: List[ContainerSummary] = Field(default_factory=list)
    runtime_raw: Optional[str] = None
    images_raw: Optional[str] = None


class ContainerUpsertRequest(BaseModel):
    image: str
    description: Optional[str] = None
    entrypoint: Optional[str] = None
    command: Optional[str] = None
    arguments: Optional[str] = None
    host_name: Optional[str] = None
    restart: Optional[Literal["no", "on-failure", "always"]] = "on-failure"
    enabled: bool = True
    allow_host_networks: bool = False
    allow_host_pid: bool = False
    network: Optional[str] = None
    network_address: Optional[str] = None
    networks: List[ContainerNetworkAttachment] = Field(default_factory=list)
    name_servers: List[str] = Field(default_factory=list)
    uid: Optional[int] = None
    gid: Optional[int] = None
    cpu_quota: Optional[int] = None
    memory: Optional[int] = None
    capabilities: List[str] = Field(default_factory=list)
    tmpfs: List[ContainerTmpfsMapping] = Field(default_factory=list)
    devices: List[ContainerDeviceMapping] = Field(default_factory=list)
    sysctls: List[ContainerKeyValue] = Field(default_factory=list)
    labels: List[ContainerKeyValue] = Field(default_factory=list)
    health_check_enabled: bool = False
    health_check_command: Optional[str] = None
    health_check_interval: Optional[str] = None
    health_check_timeout: Optional[str] = None
    health_check_retries: Optional[int] = None
    log_driver: Optional[Literal["k8s-file", "journald", "none"]] = None
    environment: List[ContainerEnvironmentVar] = Field(default_factory=list)
    ports: List[ContainerPortMapping] = Field(default_factory=list)
    volumes: List[ContainerVolumeMapping] = Field(default_factory=list)


class ContainerActionRequest(BaseModel):
    action: Literal["start", "stop", "restart"]


class ContainerActionResponse(BaseModel):
    success: bool
    name: str
    action: str
    method: Optional[str] = None
    message: Optional[str] = None
    output: Optional[str] = None
    warning: Optional[str] = None


class ContainerDeleteResponse(BaseModel):
    success: bool
    name: str
    message: str


class ContainerLogsResponse(BaseModel):
    name: str
    logs: str
    total_lines: int
    returned_lines: int


class ContainerNetworkSummary(BaseModel):
    name: str
    description: Optional[str] = None
    prefixes: List[str] = Field(default_factory=list)
    mtu: Optional[int] = None
    vrf: Optional[str] = None
    dns_disabled: bool = False


class ContainerBootstrapStatusResponse(BaseModel):
    ssh_enabled: bool = False
    ssh_key_installed: bool = False
    ssh_key_identifier: str = "vymanager"
    ssh_key_type: Optional[str] = None
    automation_ready: bool = False
    network_count: int = 0
    networks: List[ContainerNetworkSummary] = Field(default_factory=list)


class ContainerInstallResponse(BaseModel):
    success: bool
    container: ContainerSummary
    image_pulled: bool = False
    created_volume_paths: List[str] = Field(default_factory=list)
    pull_output: Optional[str] = None


class ContainerInitialSetupRequest(BaseModel):
    enable_automation: bool = True
    create_default_network: bool = True
    network_name: str = "containers-lan"
    network_prefix: str = "172.20.20.0/24"
    network_description: Optional[str] = "VyManager default container network"
    network_mtu: Optional[int] = None
    network_vrf: Optional[str] = None
    disable_network_dns: bool = False


class ContainerNetworkUpsertRequest(BaseModel):
    description: Optional[str] = None
    prefixes: List[str] = Field(default_factory=list)
    mtu: Optional[int] = None
    vrf: Optional[str] = None
    dns_disabled: bool = False


class ContainerNetworkOperationResponse(BaseModel):
    success: bool
    network: str
    message: str


class ContainerImageSummary(BaseModel):
    reference: str
    source: Literal["runtime", "configured"] = "runtime"


class ContainerImagesResponse(BaseModel):
    automation_ready: bool = False
    ssh_enabled: bool = False
    ssh_key_installed: bool = False
    configured_images: List[str] = Field(default_factory=list)
    runtime_images: List[ContainerImageSummary] = Field(default_factory=list)
    raw_output: Optional[str] = None


class ContainerImageLifecycleRequest(BaseModel):
    image: str


class ContainerImageDeleteRequest(BaseModel):
    target: str
    force: bool = False


class ContainerImageLifecycleResponse(BaseModel):
    success: bool
    action: Literal["pull", "update", "delete"]
    target: str
    output: Optional[str] = None
    automation_ready: bool = True


class ContainerRegistryMirror(BaseModel):
    address: Optional[str] = None
    host_name: Optional[str] = None
    port: Optional[int] = None
    path: Optional[str] = None


class ContainerRegistrySummary(BaseModel):
    name: str
    enabled: bool = True
    insecure: bool = False
    username: Optional[str] = None
    password_set: bool = False
    mirror: Optional[ContainerRegistryMirror] = None


class ContainerRegistryUpsertRequest(BaseModel):
    enabled: bool = True
    insecure: bool = False
    username: Optional[str] = None
    password: Optional[str] = None
    mirror: Optional[ContainerRegistryMirror] = None


class ContainerRegistryOperationResponse(BaseModel):
    success: bool
    registry: str
    message: str


class ContainerInspectResponse(BaseModel):
    name: str
    method: Optional[str] = None
    output: str


# ========================================================================
# Helpers
# ========================================================================


RE_CONTAINER_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$")
RE_CONTAINER_REGISTRY_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$")


def _extract_show_output(result: Any) -> str:
    if isinstance(result, dict):
        data = result.get("data", "")
        return data if isinstance(data, str) else str(data or "")
    if isinstance(result, str):
        return result
    return str(result or "")


def _string_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _int_or_none(value: Any) -> Optional[int]:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _normalize_name_or_400(name: str, label: str = "Container name") -> str:
    clean = name.strip()
    if not clean:
        raise HTTPException(status_code=400, detail=f"{label} is required")
    if not RE_CONTAINER_NAME.match(clean):
        raise HTTPException(
            status_code=400,
            detail=f"{label} '{clean}' is invalid. Use letters, numbers, dot, dash, underscore.",
        )
    return clean


def _normalize_environment_or_400(
    values: List[ContainerEnvironmentVar],
) -> List[ContainerEnvironmentVar]:
    seen = set()
    result: List[ContainerEnvironmentVar] = []
    for item in values:
        key = item.key.strip()
        if not key:
            continue
        if key in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate environment key: {key}")
        seen.add(key)
        result.append(ContainerEnvironmentVar(key=key, value=item.value))
    return result


def _normalize_ports_or_400(values: List[ContainerPortMapping]) -> List[ContainerPortMapping]:
    seen_names = set()
    result: List[ContainerPortMapping] = []
    for item in values:
        name = item.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Container port name cannot be empty")
        if name in seen_names:
            raise HTTPException(status_code=400, detail=f"Duplicate container port name: {name}")
        seen_names.add(name)

        if not (1 <= item.source <= 65535):
            raise HTTPException(status_code=400, detail=f"Invalid source port for {name}")
        if not (1 <= item.destination <= 65535):
            raise HTTPException(status_code=400, detail=f"Invalid destination port for {name}")

        result.append(
            ContainerPortMapping(
                name=name,
                source=item.source,
                destination=item.destination,
                protocol=item.protocol,
            )
        )
    return result


def _normalize_volumes_or_400(values: List[ContainerVolumeMapping]) -> List[ContainerVolumeMapping]:
    seen_names = set()
    result: List[ContainerVolumeMapping] = []
    for item in values:
        name = item.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Container volume name cannot be empty")
        if name in seen_names:
            raise HTTPException(status_code=400, detail=f"Duplicate container volume name: {name}")
        seen_names.add(name)

        source = item.source.strip()
        destination = item.destination.strip()
        if not source or not destination:
            raise HTTPException(status_code=400, detail=f"Volume {name} source/destination is required")

        result.append(
            ContainerVolumeMapping(
                name=name,
                source=source,
                destination=destination,
                mode=item.mode,
            )
        )
    return result


def _normalize_tmpfs_or_400(values: List[ContainerTmpfsMapping]) -> List[ContainerTmpfsMapping]:
    seen_names = set()
    result: List[ContainerTmpfsMapping] = []
    for item in values:
        name = item.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Container tmpfs name cannot be empty")
        if name in seen_names:
            raise HTTPException(status_code=400, detail=f"Duplicate container tmpfs name: {name}")
        seen_names.add(name)

        destination = item.destination.strip()
        if not destination:
            raise HTTPException(status_code=400, detail=f"tmpfs {name} destination is required")

        size_mb = item.size_mb
        if size_mb is not None and size_mb <= 0:
            raise HTTPException(status_code=400, detail=f"tmpfs {name} size must be greater than zero")

        result.append(
            ContainerTmpfsMapping(
                name=name,
                destination=destination,
                size_mb=size_mb,
            )
        )
    return result


def _normalize_devices_or_400(values: List[ContainerDeviceMapping]) -> List[ContainerDeviceMapping]:
    seen_names = set()
    result: List[ContainerDeviceMapping] = []
    for item in values:
        name = item.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Container device name cannot be empty")
        if name in seen_names:
            raise HTTPException(status_code=400, detail=f"Duplicate container device name: {name}")
        seen_names.add(name)

        source = item.source.strip()
        destination = item.destination.strip()
        if not source or not destination:
            raise HTTPException(status_code=400, detail=f"Device {name} source/destination is required")

        result.append(
            ContainerDeviceMapping(
                name=name,
                source=source,
                destination=destination,
            )
        )
    return result


def _normalize_key_values_or_400(
    values: List[ContainerKeyValue],
    label: str,
) -> List[ContainerKeyValue]:
    seen_keys = set()
    result: List[ContainerKeyValue] = []
    for item in values:
        key = item.key.strip()
        value = item.value.strip()
        if not key:
            continue
        if key in seen_keys:
            raise HTTPException(status_code=400, detail=f"Duplicate {label} key: {key}")
        seen_keys.add(key)
        result.append(ContainerKeyValue(key=key, value=value))
    return result


def _normalize_name_servers_or_400(values: List[str]) -> List[str]:
    result: List[str] = []
    seen = set()
    for value in values:
        text = str(value).strip()
        if not text:
            continue
        try:
            address = str(ipaddress.ip_address(text))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid container name-server address: {text}")
        if address in seen:
            continue
        seen.add(address)
        result.append(address)
    return result


def _normalize_capabilities_or_400(values: List[str]) -> List[str]:
    result: List[str] = []
    seen = set()
    for value in values:
        capability = str(value).strip()
        if not capability:
            continue
        if capability in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate container capability: {capability}")
        seen.add(capability)
        result.append(capability)
    return result


def _normalize_network_attachments_or_400(
    values: List[ContainerNetworkAttachment],
) -> List[ContainerNetworkAttachment]:
    seen_names = set()
    result: List[ContainerNetworkAttachment] = []
    for item in values:
        name = item.name.strip()
        address = item.address.strip() if item.address else None
        if not name:
            if address:
                raise HTTPException(
                    status_code=400,
                    detail="Container network attachment address requires a network name",
                )
            continue
        if name in seen_names:
            raise HTTPException(status_code=400, detail=f"Duplicate container network: {name}")
        seen_names.add(name)
        result.append(ContainerNetworkAttachment(name=name, address=address))
    return result


def _normalize_optional_int_or_400(
    value: Optional[int],
    label: str,
    *,
    minimum: Optional[int] = None,
    maximum: Optional[int] = None,
) -> Optional[int]:
    if value is None:
        return None
    if minimum is not None and value < minimum:
        raise HTTPException(status_code=400, detail=f"{label} must be >= {minimum}")
    if maximum is not None and value > maximum:
        raise HTTPException(status_code=400, detail=f"{label} must be <= {maximum}")
    return value


def _extract_multivalue_leafs(raw: Any) -> List[str]:
    values: List[str] = []
    if isinstance(raw, dict):
        values.extend(str(key).strip() for key in raw.keys())
    elif isinstance(raw, list):
        values.extend(str(item).strip() for item in raw)
    elif isinstance(raw, str):
        value = raw.strip()
        if value:
            values.append(value)
    return sorted({value for value in values if value})


def _extract_key_value_list(raw: Any) -> List[ContainerKeyValue]:
    if not isinstance(raw, dict):
        return []
    pairs: List[ContainerKeyValue] = []
    for key, value_data in raw.items():
        key_text = str(key).strip()
        if not key_text:
            continue
        value_text = ""
        if isinstance(value_data, dict):
            value_text = _string_or_none(value_data.get("value")) or ""
        elif isinstance(value_data, str):
            value_text = value_data.strip()
        pairs.append(ContainerKeyValue(key=key_text, value=value_text))
    return sorted(pairs, key=lambda item: item.key.lower())


def _normalize_container_upsert_request_or_400(body: ContainerUpsertRequest) -> ContainerUpsertRequest:
    image = body.image.strip()
    if not image:
        raise HTTPException(status_code=400, detail="Container image is required")

    allow_host_networks = body.allow_host_networks
    network = body.network.strip() if body.network else None
    network_address = body.network_address.strip() if body.network_address else None
    explicit_networks = _normalize_network_attachments_or_400(body.networks)
    description = body.description.strip() if body.description else None
    entrypoint = body.entrypoint.strip() if body.entrypoint else None
    command = body.command.strip() if body.command else None
    arguments = body.arguments.strip() if body.arguments else None
    host_name = body.host_name.strip() if body.host_name else None
    health_check_command = body.health_check_command.strip() if body.health_check_command else None
    health_check_interval = body.health_check_interval.strip() if body.health_check_interval else None
    health_check_timeout = body.health_check_timeout.strip() if body.health_check_timeout else None
    log_driver = body.log_driver.strip() if body.log_driver else None

    merged_networks: List[ContainerNetworkAttachment] = list(explicit_networks)
    if network:
        legacy_present = next((entry for entry in merged_networks if entry.name == network), None)
        if legacy_present:
            if network_address:
                legacy_present.address = network_address
        else:
            merged_networks.insert(0, ContainerNetworkAttachment(name=network, address=network_address))
    if merged_networks and not network:
        network = merged_networks[0].name
        network_address = merged_networks[0].address

    if allow_host_networks and merged_networks:
        raise HTTPException(
            status_code=400,
            detail="allow_host_networks cannot be combined with container networks",
        )
    if network_address and not network:
        raise HTTPException(
            status_code=400,
            detail="network_address requires a network name",
        )

    environment = _normalize_environment_or_400(body.environment)
    ports = _normalize_ports_or_400(body.ports)
    volumes = _normalize_volumes_or_400(body.volumes)
    tmpfs = _normalize_tmpfs_or_400(body.tmpfs)
    devices = _normalize_devices_or_400(body.devices)
    sysctls = _normalize_key_values_or_400(body.sysctls, "sysctl")
    labels = _normalize_key_values_or_400(body.labels, "label")
    name_servers = _normalize_name_servers_or_400(body.name_servers)
    capabilities = _normalize_capabilities_or_400(body.capabilities)
    uid = _normalize_optional_int_or_400(body.uid, "uid", minimum=0, maximum=2147483647)
    gid = _normalize_optional_int_or_400(body.gid, "gid", minimum=0, maximum=2147483647)
    cpu_quota = _normalize_optional_int_or_400(body.cpu_quota, "cpu_quota", minimum=1)
    memory = _normalize_optional_int_or_400(body.memory, "memory", minimum=1)
    health_check_retries = _normalize_optional_int_or_400(
        body.health_check_retries,
        "health_check_retries",
        minimum=0,
    )
    health_check_enabled = body.health_check_enabled or any(
        [
            bool(health_check_command),
            bool(health_check_interval),
            bool(health_check_timeout),
            health_check_retries is not None,
        ]
    )

    return ContainerUpsertRequest(
        image=image,
        description=description,
        entrypoint=entrypoint,
        command=command,
        arguments=arguments,
        host_name=host_name,
        restart=body.restart,
        enabled=body.enabled,
        allow_host_networks=allow_host_networks,
        allow_host_pid=body.allow_host_pid,
        network=network,
        network_address=network_address,
        networks=merged_networks,
        name_servers=name_servers,
        uid=uid,
        gid=gid,
        cpu_quota=cpu_quota,
        memory=memory,
        capabilities=capabilities,
        tmpfs=tmpfs,
        devices=devices,
        sysctls=sysctls,
        labels=labels,
        health_check_enabled=health_check_enabled,
        health_check_command=health_check_command,
        health_check_interval=health_check_interval,
        health_check_timeout=health_check_timeout,
        health_check_retries=health_check_retries,
        log_driver=log_driver,
        environment=environment,
        ports=ports,
        volumes=volumes,
    )


def _extract_container_config(full_config: Dict[str, Any]) -> Dict[str, Any]:
    container_root = full_config.get("container", {})
    if not isinstance(container_root, dict):
        return {}
    names = container_root.get("name", {})
    if not isinstance(names, dict):
        return {}
    return names


def _parse_container_from_config(name: str, raw: Any) -> ContainerSummary:
    data = raw if isinstance(raw, dict) else {}

    summary = ContainerSummary(
        name=name,
        image=_string_or_none(data.get("image")),
        description=_string_or_none(data.get("description")),
        entrypoint=_string_or_none(data.get("entrypoint")),
        command=_string_or_none(data.get("command")),
        arguments=_string_or_none(data.get("arguments")),
        host_name=_string_or_none(data.get("host-name")),
        restart=_string_or_none(data.get("restart")),
        enabled="disable" not in data,
        allow_host_networks="allow-host-networks" in data,
        allow_host_pid="allow-host-pid" in data,
        name_servers=_extract_multivalue_leafs(data.get("name-server")),
        uid=_int_or_none(data.get("uid")),
        gid=_int_or_none(data.get("gid")),
        cpu_quota=_int_or_none(data.get("cpu-quota")),
        memory=_int_or_none(data.get("memory")),
        capabilities=_extract_multivalue_leafs(data.get("capability")),
        log_driver=_string_or_none(data.get("log-driver")),
    )

    # network
    network_data = data.get("network")
    if isinstance(network_data, dict) and network_data:
        parsed_networks: List[ContainerNetworkAttachment] = []
        for network_name in sorted(str(key) for key in network_data.keys()):
            network_options = network_data.get(network_name)
            address = None
            if isinstance(network_options, dict):
                address = _string_or_none(network_options.get("address"))
            parsed_networks.append(
                ContainerNetworkAttachment(
                    name=network_name,
                    address=address,
                )
            )
        summary.networks = parsed_networks
        if parsed_networks:
            summary.network = parsed_networks[0].name
            summary.network_address = parsed_networks[0].address
    elif isinstance(network_data, str):
        summary.network = network_data.strip() or None
        if summary.network:
            summary.networks = [ContainerNetworkAttachment(name=summary.network, address=None)]

    # environment
    env_data = data.get("environment")
    if isinstance(env_data, dict):
        env_items: List[ContainerEnvironmentVar] = []
        for key, value_data in env_data.items():
            key_text = str(key).strip()
            if not key_text:
                continue
            value_text = None
            if isinstance(value_data, dict):
                value_text = _string_or_none(value_data.get("value"))
            elif isinstance(value_data, str):
                value_text = value_data.strip() or None
            env_items.append(
                ContainerEnvironmentVar(key=key_text, value=value_text or "")
            )
        summary.environment = sorted(env_items, key=lambda item: item.key.lower())

    # ports
    port_data = data.get("port")
    if isinstance(port_data, dict):
        parsed_ports: List[ContainerPortMapping] = []
        for port_name, port_entry in port_data.items():
            name_text = str(port_name).strip()
            if not name_text:
                continue
            entry = port_entry if isinstance(port_entry, dict) else {}
            source = _int_or_none(entry.get("source"))
            destination = _int_or_none(entry.get("destination"))
            protocol = _string_or_none(entry.get("protocol")) or "tcp"
            if source is None or destination is None:
                continue
            parsed_ports.append(
                ContainerPortMapping(
                    name=name_text,
                    source=source,
                    destination=destination,
                    protocol="udp" if protocol.lower() == "udp" else "tcp",
                )
            )
        summary.ports = sorted(parsed_ports, key=lambda item: item.name.lower())

    # volumes
    volume_data = data.get("volume")
    if isinstance(volume_data, dict):
        parsed_volumes: List[ContainerVolumeMapping] = []
        for volume_name, volume_entry in volume_data.items():
            name_text = str(volume_name).strip()
            if not name_text:
                continue
            entry = volume_entry if isinstance(volume_entry, dict) else {}
            source = _string_or_none(entry.get("source"))
            destination = _string_or_none(entry.get("destination"))
            mode = _string_or_none(entry.get("mode")) or "rw"
            if not source or not destination:
                continue
            parsed_volumes.append(
                ContainerVolumeMapping(
                    name=name_text,
                    source=source,
                    destination=destination,
                    mode="ro" if mode.lower() == "ro" else "rw",
                )
            )
        summary.volumes = sorted(parsed_volumes, key=lambda item: item.name.lower())

    # tmpfs
    tmpfs_data = data.get("tmpfs")
    if isinstance(tmpfs_data, dict):
        parsed_tmpfs: List[ContainerTmpfsMapping] = []
        for tmpfs_name, tmpfs_entry in tmpfs_data.items():
            name_text = str(tmpfs_name).strip()
            if not name_text:
                continue
            entry = tmpfs_entry if isinstance(tmpfs_entry, dict) else {}
            destination = _string_or_none(entry.get("destination"))
            if not destination:
                continue
            parsed_tmpfs.append(
                ContainerTmpfsMapping(
                    name=name_text,
                    destination=destination,
                    size_mb=_int_or_none(entry.get("size")),
                )
            )
        summary.tmpfs = sorted(parsed_tmpfs, key=lambda item: item.name.lower())

    # devices
    device_data = data.get("device")
    if isinstance(device_data, dict):
        parsed_devices: List[ContainerDeviceMapping] = []
        for device_name, device_entry in device_data.items():
            name_text = str(device_name).strip()
            if not name_text:
                continue
            entry = device_entry if isinstance(device_entry, dict) else {}
            source = _string_or_none(entry.get("source"))
            destination = _string_or_none(entry.get("destination"))
            if not source or not destination:
                continue
            parsed_devices.append(
                ContainerDeviceMapping(
                    name=name_text,
                    source=source,
                    destination=destination,
                )
            )
        summary.devices = sorted(parsed_devices, key=lambda item: item.name.lower())

    # sysctl and labels
    sysctl_data = data.get("sysctl")
    if isinstance(sysctl_data, dict):
        summary.sysctls = _extract_key_value_list(sysctl_data.get("parameter"))

    summary.labels = _extract_key_value_list(data.get("label"))

    # health-check
    if "health-check" in data:
        summary.health_check_enabled = True
        health_data = data.get("health-check")
        if isinstance(health_data, dict):
            summary.health_check_command = _string_or_none(health_data.get("command"))
            summary.health_check_interval = _string_or_none(health_data.get("interval"))
            summary.health_check_timeout = _string_or_none(health_data.get("timeout"))
            summary.health_check_retries = _int_or_none(health_data.get("retries"))

    return summary


def _find_runtime_line_for_container(name: str, runtime_output: str) -> Optional[str]:
    for line in runtime_output.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if re.search(rf"\b{re.escape(name)}\b", stripped):
            return stripped
    return None


def _infer_container_status(name: str, runtime_output: str, enabled: bool) -> str:
    if not enabled:
        return "disabled"

    stripped = _find_runtime_line_for_container(name, runtime_output)
    if stripped:
        lowered = stripped.lower()
        if "up " in lowered or " running" in lowered or lowered.startswith("up"):
            return "running"
        if "exited" in lowered:
            return "exited"
        if "created" in lowered:
            return "created"
        if "paused" in lowered:
            return "paused"
        return "active"
    return "not-running"


def _infer_container_health(name: str, runtime_output: str) -> Optional[str]:
    stripped = _find_runtime_line_for_container(name, runtime_output)
    if not stripped:
        return None
    lowered = stripped.lower()
    if "unhealthy" in lowered:
        return "unhealthy"
    if "healthy" in lowered:
        return "healthy"
    if "starting" in lowered:
        return "starting"
    return None


def _infer_container_uptime(name: str, runtime_output: str) -> Optional[str]:
    stripped = _find_runtime_line_for_container(name, runtime_output)
    if not stripped:
        return None
    match = re.search(r"\bUp\s+([^,]+)", stripped, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


def _build_container_links(
    host: Optional[str],
    ports: List[ContainerPortMapping],
    allow_host_networks: bool,
    network_address: Optional[str],
) -> List[ContainerWebLink]:
    if not host:
        return []

    # Port publishing is always exposed on the VyOS host address. Even when a
    # container is attached to a user-defined network and assigned a static
    # address, the published port is reachable at the host IP/port.
    #
    # We still return `network_address` in the container summary so the UI can
    # expose it for advanced setups, but we don't use it for link generation.
    effective_host = host

    links: List[ContainerWebLink] = []
    for port in ports:
        if port.protocol.lower() != "tcp":
            continue

        # Port publishing is represented as source->destination. When using host
        # networking (`--net host`), podman ignores port publishing and the
        # container binds directly to its destination port on the host.
        host_port = port.destination if allow_host_networks else port.source
        destination = port.destination
        scheme = "https" if host_port == 443 or destination == 443 else "http"
        default_port = (scheme == "http" and host_port == 80) or (scheme == "https" and host_port == 443)
        if default_port:
            url = f"{scheme}://{effective_host}"
        else:
            url = f"{scheme}://{effective_host}:{host_port}"

        links.append(
            ContainerWebLink(
                label=f"{port.name} ({host_port}->{destination}/{port.protocol})",
                url=url,
                source_port=host_port,
                destination_port=destination,
                protocol=port.protocol,
            )
        )

    return links


def _parse_active_container_names(runtime_output: str) -> List[str]:
    names = set()
    for raw_line in runtime_output.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        lower = line.lower()
        if "container" in lower and "image" in lower and "name" in lower:
            continue
        if line.startswith("-"):
            continue

        tokens = line.split()
        if not tokens:
            continue
        candidate = tokens[-1].strip()
        if RE_CONTAINER_NAME.match(candidate):
            names.add(candidate)
    return sorted(names)


def _build_container_overview(
    full_config: Dict[str, Any],
    host: Optional[str],
    runtime_output: str,
    images_output: str,
) -> ContainersOverviewResponse:
    container_data = _extract_container_config(full_config)
    active_names = set(_parse_active_container_names(runtime_output))

    containers: List[ContainerSummary] = []
    for name, raw in sorted(container_data.items(), key=lambda pair: str(pair[0]).lower()):
        normalized_name = str(name).strip()
        if not normalized_name:
            continue

        summary = _parse_container_from_config(normalized_name, raw)
        if normalized_name in active_names and summary.enabled:
            summary.status = "running"
        else:
            summary.status = _infer_container_status(normalized_name, runtime_output, summary.enabled)
        summary.health_status = _infer_container_health(normalized_name, runtime_output)
        summary.uptime = _infer_container_uptime(normalized_name, runtime_output)
        summary.links = _build_container_links(
            host,
            summary.ports,
            summary.allow_host_networks,
            summary.network_address,
        )
        containers.append(summary)

    return ContainersOverviewResponse(
        connection_host=host,
        configured_total=len(containers),
        active_total=len(active_names),
        containers=containers,
        runtime_raw=runtime_output or None,
        images_raw=images_output or None,
    )


async def _load_container_overview(request: Request, refresh: bool = False) -> Tuple[Any, ContainersOverviewResponse]:
    service = get_session_vyos_service(request)
    full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)

    runtime_output = ""
    images_output = ""

    runtime_response = await run_in_threadpool(service.device.show, path=["container"])
    if runtime_response.status == 200:
        runtime_output = _extract_show_output(runtime_response.result)

    images_response = await run_in_threadpool(service.device.show, path=["container", "image"])
    if images_response.status == 200:
        images_output = _extract_show_output(images_response.result)

    host = _string_or_none(getattr(service.config, "hostname", None))
    return service, _build_container_overview(full_config, host, runtime_output, images_output)


def _extract_container_networks(full_config: Dict[str, Any]) -> List[ContainerNetworkSummary]:
    container_root = full_config.get("container", {}) if isinstance(full_config, dict) else {}
    network_root = container_root.get("network", {}) if isinstance(container_root, dict) else {}
    if not isinstance(network_root, dict):
        return []

    networks: List[ContainerNetworkSummary] = []
    for network_name, network_data in sorted(network_root.items(), key=lambda item: str(item[0]).lower()):
        name = str(network_name).strip()
        if not name:
            continue

        entry = network_data if isinstance(network_data, dict) else {}

        raw_prefix = entry.get("prefix")
        prefixes: List[str] = []
        if isinstance(raw_prefix, str):
            value = raw_prefix.strip()
            if value:
                prefixes.append(value)
        elif isinstance(raw_prefix, list):
            prefixes.extend(str(item).strip() for item in raw_prefix if str(item).strip())
        elif isinstance(raw_prefix, dict):
            prefixes.extend(str(key).strip() for key in raw_prefix.keys() if str(key).strip())

        networks.append(
            ContainerNetworkSummary(
                name=name,
                description=_string_or_none(entry.get("description")),
                prefixes=sorted(set(prefixes)),
                mtu=_int_or_none(entry.get("mtu")),
                vrf=_string_or_none(entry.get("vrf")),
                dns_disabled=("no-name-server" in entry),
            )
        )

    return networks


def _parse_container_network_or_400(prefix: str, *, context: str) -> ipaddress._BaseNetwork:
    try:
        return ipaddress.ip_network(prefix, strict=False)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid container network prefix in {context}: {prefix}")


def _build_container_network_prefix_map(
    networks: List[ContainerNetworkSummary],
) -> Dict[str, List[ipaddress._BaseNetwork]]:
    prefix_map: Dict[str, List[ipaddress._BaseNetwork]] = {}
    for network in networks:
        parsed_prefixes: List[ipaddress._BaseNetwork] = []
        for prefix in network.prefixes:
            try:
                parsed_prefixes.append(ipaddress.ip_network(prefix, strict=False))
            except ValueError:
                continue
        prefix_map[network.name] = parsed_prefixes
    return prefix_map


def _validate_container_network_prefixes_or_400(
    network_name: str,
    desired_prefixes: List[str],
    existing_networks: Dict[str, ContainerNetworkSummary],
) -> None:
    parsed_desired: List[ipaddress._BaseNetwork] = [
        _parse_container_network_or_400(prefix, context=f"network '{network_name}'")
        for prefix in desired_prefixes
    ]

    for index, left in enumerate(parsed_desired):
        for right in parsed_desired[index + 1 :]:
            if left.version == right.version and left.overlaps(right):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Container network '{network_name}' has overlapping prefixes "
                        f"('{left}' overlaps '{right}')."
                    ),
                )

    for existing_name, existing in existing_networks.items():
        if existing_name == network_name:
            continue
        for existing_prefix in existing.prefixes:
            existing_network = _parse_container_network_or_400(
                existing_prefix,
                context=f"network '{existing_name}'",
            )
            for desired in parsed_desired:
                if desired.version != existing_network.version:
                    continue
                if desired.overlaps(existing_network):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Container network '{network_name}' prefix '{desired}' overlaps "
                            f"'{existing_name}' prefix '{existing_network}'."
                        ),
                    )


def _validate_container_network_attachments_or_400(
    attachments: List[ContainerNetworkAttachment],
    prefix_map: Dict[str, List[ipaddress._BaseNetwork]],
) -> None:
    for attachment in attachments:
        if not attachment.address:
            continue

        address_text = attachment.address.strip()
        try:
            address = ipaddress.ip_address(address_text)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Container network '{attachment.name}' has an invalid address '{address_text}'."
                ),
            )

        network_prefixes = prefix_map.get(attachment.name)
        if network_prefixes is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Container network '{attachment.name}' is not configured. "
                    "Create the network before assigning a static address."
                ),
            )
        if not network_prefixes:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Container network '{attachment.name}' has no valid prefixes configured."
                ),
            )

        matching_network = next(
            (
                network
                for network in network_prefixes
                if network.version == address.version and address in network
            ),
            None,
        )
        if matching_network is None:
            valid_prefixes = ", ".join(str(network) for network in network_prefixes)
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Address '{address_text}' is outside container network '{attachment.name}' "
                    f"prefixes ({valid_prefixes})."
                ),
            )

        if isinstance(matching_network, ipaddress.IPv4Network):
            if matching_network.prefixlen <= 30:
                if address == matching_network.network_address:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Address '{address_text}' cannot be the network address for "
                            f"'{matching_network}'."
                        ),
                    )
                if address == matching_network.broadcast_address:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Address '{address_text}' cannot be the broadcast address for "
                            f"'{matching_network}'."
                        ),
                    )


def _normalize_container_network_name_or_400(name: str) -> str:
    clean = name.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Container network name is required")
    if not RE_CONTAINER_NAME.match(clean):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Container network name '{clean}' is invalid. "
                "Use letters, numbers, dot, dash, underscore."
            ),
        )
    return clean


def _normalize_container_network_prefix_or_400(prefix: str) -> str:
    value = prefix.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Container network prefix is required")
    try:
        network = ipaddress.ip_network(value, strict=False)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid container network prefix: {value}")
    return str(network)


def _normalize_container_network_mtu_or_400(value: Optional[int]) -> Optional[int]:
    if value is None:
        return None
    if value < 576 or value > 9216:
        raise HTTPException(status_code=400, detail="Container network MTU must be between 576 and 9216")
    return value


def _bootstrap_status_from_config(full_config: Dict[str, Any], key_identifier: str = "vymanager") -> ContainerBootstrapStatusResponse:
    service_cfg = full_config.get("service", {}) if isinstance(full_config, dict) else {}
    ssh_cfg = service_cfg.get("ssh") if isinstance(service_cfg, dict) else None
    ssh_enabled = isinstance(ssh_cfg, dict)

    key_type = None
    ssh_key_installed = False
    system_cfg = full_config.get("system", {}) if isinstance(full_config, dict) else {}
    login_cfg = system_cfg.get("login", {}) if isinstance(system_cfg, dict) else {}
    users_cfg = login_cfg.get("user", {}) if isinstance(login_cfg, dict) else {}
    vyos_user = users_cfg.get("vyos", {}) if isinstance(users_cfg, dict) else {}
    auth_cfg = vyos_user.get("authentication", {}) if isinstance(vyos_user, dict) else {}
    pub_cfg = auth_cfg.get("public-keys", {}) if isinstance(auth_cfg, dict) else {}
    if isinstance(pub_cfg, dict) and key_identifier in pub_cfg:
        entry = pub_cfg.get(key_identifier, {})
        if isinstance(entry, dict) and entry.get("key"):
            ssh_key_installed = True
            key_type = _string_or_none(entry.get("type"))

    networks = _extract_container_networks(full_config)
    automation_ready = ssh_enabled and ssh_key_installed

    return ContainerBootstrapStatusResponse(
        ssh_enabled=ssh_enabled,
        ssh_key_installed=ssh_key_installed,
        ssh_key_identifier=key_identifier,
        ssh_key_type=key_type,
        automation_ready=automation_ready,
        network_count=len(networks),
        networks=networks,
    )


def _extract_runtime_images(runtime_output: str) -> List[ContainerImageSummary]:
    images: List[ContainerImageSummary] = []
    seen = set()
    for raw_line in runtime_output.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        lowered = line.lower()
        if "repository" in lowered and "image" in lowered:
            continue
        tokens = line.split()
        if not tokens:
            continue
        # `show container image` commonly starts rows with the image reference.
        # Keep parser permissive and expose source + reference only.
        reference = tokens[0].strip()
        if reference in {"-", "image", "images"}:
            continue
        if reference in seen:
            continue
        seen.add(reference)
        images.append(ContainerImageSummary(reference=reference, source="runtime"))
    return images


def _extract_configured_images(full_config: Dict[str, Any]) -> List[str]:
    names = _extract_container_config(full_config)
    images = set()
    for raw in names.values():
        if not isinstance(raw, dict):
            continue
        image = _string_or_none(raw.get("image"))
        if image:
            images.add(image)
    return sorted(images)


def _extract_container_registries(full_config: Dict[str, Any]) -> List[ContainerRegistrySummary]:
    container_root = full_config.get("container", {}) if isinstance(full_config, dict) else {}
    registry_root = container_root.get("registry", {}) if isinstance(container_root, dict) else {}
    if not isinstance(registry_root, dict):
        return []

    registries: List[ContainerRegistrySummary] = []
    for registry_name, raw_entry in sorted(registry_root.items(), key=lambda item: str(item[0]).lower()):
        name = str(registry_name).strip()
        if not name:
            continue
        entry = raw_entry if isinstance(raw_entry, dict) else {}
        auth = entry.get("authentication", {}) if isinstance(entry.get("authentication"), dict) else {}
        mirror_data = entry.get("mirror", {}) if isinstance(entry.get("mirror"), dict) else {}
        mirror = None
        if mirror_data:
            mirror = ContainerRegistryMirror(
                address=_string_or_none(mirror_data.get("address")),
                host_name=_string_or_none(mirror_data.get("host-name")),
                port=_int_or_none(mirror_data.get("port")),
                path=_string_or_none(mirror_data.get("path")),
            )
        registries.append(
            ContainerRegistrySummary(
                name=name,
                enabled=("disable" not in entry),
                insecure=("insecure" in entry),
                username=_string_or_none(auth.get("username")),
                password_set=bool(_string_or_none(auth.get("password"))),
                mirror=mirror,
            )
        )
    return registries


def _normalize_registry_name_or_400(name: str) -> str:
    clean = name.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Container registry name is required")
    if not RE_CONTAINER_REGISTRY_NAME.match(clean):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Container registry name '{clean}' is invalid. "
                "Use letters, numbers, dot, dash, underscore, or colon."
            ),
        )
    return clean


def _normalize_registry_port_or_400(value: Optional[int]) -> Optional[int]:
    if value is None:
        return None
    if value < 1 or value > 65535:
        raise HTTPException(status_code=400, detail="Container registry mirror port must be 1-65535")
    return value


def _load_container_images_snapshot(
    service: Any,
    full_config: Dict[str, Any],
) -> ContainerImagesResponse:
    runtime_output = ""
    runtime_response = service.device.show(path=["container", "image"])
    if runtime_response.status == 200:
        runtime_output = _extract_show_output(runtime_response.result)

    bootstrap = _bootstrap_status_from_config(full_config)
    configured_images = _extract_configured_images(full_config)
    runtime_images = _extract_runtime_images(runtime_output)

    for image in configured_images:
        if not any(entry.reference == image for entry in runtime_images):
            runtime_images.append(ContainerImageSummary(reference=image, source="configured"))

    runtime_images = sorted(runtime_images, key=lambda item: item.reference.lower())
    return ContainerImagesResponse(
        automation_ready=bootstrap.automation_ready,
        ssh_enabled=bootstrap.ssh_enabled,
        ssh_key_installed=bootstrap.ssh_key_installed,
        configured_images=configured_images,
        runtime_images=runtime_images,
        raw_output=runtime_output or None,
    )


def _build_container_set_operations(
    name: str,
    body: ContainerUpsertRequest,
    replace_existing: bool,
) -> List[Dict[str, Any]]:
    operations: List[Dict[str, Any]] = []

    if replace_existing:
        operations.append({"op": "delete", "path": ["container", "name", name]})

    operations.append({"op": "set", "path": ["container", "name", name, "image", body.image]})

    if body.description:
        operations.append(
            {"op": "set", "path": ["container", "name", name, "description", body.description]}
        )
    if body.entrypoint:
        operations.append(
            {"op": "set", "path": ["container", "name", name, "entrypoint", body.entrypoint]}
        )
    if body.command:
        operations.append(
            {"op": "set", "path": ["container", "name", name, "command", body.command]}
        )
    if body.arguments:
        operations.append(
            {"op": "set", "path": ["container", "name", name, "arguments", body.arguments]}
        )
    if body.host_name:
        operations.append(
            {"op": "set", "path": ["container", "name", name, "host-name", body.host_name]}
        )
    if body.restart:
        operations.append(
            {"op": "set", "path": ["container", "name", name, "restart", body.restart]}
        )

    if body.allow_host_networks:
        operations.append({"op": "set", "path": ["container", "name", name, "allow-host-networks"]})
    if body.allow_host_pid:
        operations.append({"op": "set", "path": ["container", "name", name, "allow-host-pid"]})

    networks = body.networks
    if not networks and body.network:
        networks = [ContainerNetworkAttachment(name=body.network, address=body.network_address)]
    for network in networks:
        operations.append(
            {"op": "set", "path": ["container", "name", name, "network", network.name]}
        )
        if network.address:
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "container",
                        "name",
                        name,
                        "network",
                        network.name,
                        "address",
                        network.address,
                    ],
                }
            )

    for name_server in body.name_servers:
        operations.append(
            {
                "op": "set",
                "path": ["container", "name", name, "name-server", name_server],
            }
        )

    if body.uid is not None:
        operations.append({"op": "set", "path": ["container", "name", name, "uid", str(body.uid)]})
    if body.gid is not None:
        operations.append({"op": "set", "path": ["container", "name", name, "gid", str(body.gid)]})
    if body.cpu_quota is not None:
        operations.append(
            {"op": "set", "path": ["container", "name", name, "cpu-quota", str(body.cpu_quota)]}
        )
    if body.memory is not None:
        operations.append(
            {"op": "set", "path": ["container", "name", name, "memory", str(body.memory)]}
        )

    for capability in body.capabilities:
        operations.append({"op": "set", "path": ["container", "name", name, "capability", capability]})

    for env in body.environment:
        operations.append(
            {
                "op": "set",
                "path": ["container", "name", name, "environment", env.key, "value", env.value],
            }
        )

    for port in body.ports:
        operations.extend(
            [
                {
                    "op": "set",
                    "path": ["container", "name", name, "port", port.name, "source", str(port.source)],
                },
                {
                    "op": "set",
                    "path": [
                        "container",
                        "name",
                        name,
                        "port",
                        port.name,
                        "destination",
                        str(port.destination),
                    ],
                },
                {
                    "op": "set",
                    "path": [
                        "container",
                        "name",
                        name,
                        "port",
                        port.name,
                        "protocol",
                        port.protocol,
                    ],
                },
            ]
        )

    for volume in body.volumes:
        operations.extend(
            [
                {
                    "op": "set",
                    "path": ["container", "name", name, "volume", volume.name, "source", volume.source],
                },
                {
                    "op": "set",
                    "path": [
                        "container",
                        "name",
                        name,
                        "volume",
                        volume.name,
                        "destination",
                        volume.destination,
                    ],
                },
                {
                    "op": "set",
                    "path": ["container", "name", name, "volume", volume.name, "mode", volume.mode],
                },
            ]
        )

    for tmpfs in body.tmpfs:
        operations.append(
            {
                "op": "set",
                "path": ["container", "name", name, "tmpfs", tmpfs.name, "destination", tmpfs.destination],
            }
        )
        if tmpfs.size_mb is not None:
            operations.append(
                {
                    "op": "set",
                    "path": ["container", "name", name, "tmpfs", tmpfs.name, "size", str(tmpfs.size_mb)],
                }
            )

    for device in body.devices:
        operations.extend(
            [
                {
                    "op": "set",
                    "path": ["container", "name", name, "device", device.name, "source", device.source],
                },
                {
                    "op": "set",
                    "path": [
                        "container",
                        "name",
                        name,
                        "device",
                        device.name,
                        "destination",
                        device.destination,
                    ],
                },
            ]
        )

    for parameter in body.sysctls:
        operations.append(
            {
                "op": "set",
                "path": [
                    "container",
                    "name",
                    name,
                    "sysctl",
                    "parameter",
                    parameter.key,
                    "value",
                    parameter.value,
                ],
            }
        )

    for label in body.labels:
        operations.append(
            {
                "op": "set",
                "path": ["container", "name", name, "label", label.key, "value", label.value],
            }
        )

    if body.health_check_enabled:
        operations.append({"op": "set", "path": ["container", "name", name, "health-check"]})
        if body.health_check_command:
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "container",
                        "name",
                        name,
                        "health-check",
                        "command",
                        body.health_check_command,
                    ],
                }
            )
        if body.health_check_interval:
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "container",
                        "name",
                        name,
                        "health-check",
                        "interval",
                        body.health_check_interval,
                    ],
                }
            )
        if body.health_check_timeout:
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "container",
                        "name",
                        name,
                        "health-check",
                        "timeout",
                        body.health_check_timeout,
                    ],
                }
            )
        if body.health_check_retries is not None:
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "container",
                        "name",
                        name,
                        "health-check",
                        "retries",
                        str(body.health_check_retries),
                    ],
                }
            )

    if body.log_driver:
        operations.append(
            {"op": "set", "path": ["container", "name", name, "log-driver", body.log_driver]}
        )

    if not body.enabled:
        operations.append({"op": "set", "path": ["container", "name", name, "disable"]})

    return operations


# ========================================================================
# Endpoints
# ========================================================================


@router.get("/overview", response_model=ContainersOverviewResponse)
async def get_containers_overview(request: Request, refresh: bool = False) -> ContainersOverviewResponse:
    """Get configured containers, runtime summary, and suggested service links."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        _, overview = await _load_container_overview(request, refresh=refresh)
        return overview
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load containers overview: {exc}")


@router.get("/bootstrap-status", response_model=ContainerBootstrapStatusResponse)
async def get_container_bootstrap_status(request: Request) -> ContainerBootstrapStatusResponse:
    """
    Report whether this VyOS instance is ready for container automation.

    Notes:
    - Pulling container images is an op-mode `add` command which is not exposed
      by the VyOS HTTPS API. VyManager uses SSH automation for those steps.
    - This endpoint is best-effort and reads only configuration state.
    """
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=False)
        return _bootstrap_status_from_config(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load container bootstrap status: {exc}")


@router.get("/networks", response_model=List[ContainerNetworkSummary])
async def get_container_networks(request: Request, refresh: bool = False) -> List[ContainerNetworkSummary]:
    """List configured container networks."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _extract_container_networks(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load container networks: {exc}")


@router.put("/networks/{network_name}", response_model=ContainerNetworkSummary)
async def upsert_container_network(
    request: Request,
    network_name: str,
    body: ContainerNetworkUpsertRequest,
) -> ContainerNetworkSummary:
    """Create or update a container network."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        name = _normalize_container_network_name_or_400(network_name)
        description = _string_or_none(body.description)
        vrf = _string_or_none(body.vrf)
        mtu = _normalize_container_network_mtu_or_400(body.mtu)
        desired_prefixes = sorted(
            {
                _normalize_container_network_prefix_or_400(prefix)
                for prefix in body.prefixes
                if str(prefix).strip()
            }
        )
        if not desired_prefixes:
            raise HTTPException(status_code=400, detail="At least one container network prefix is required")

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        existing_networks = {entry.name: entry for entry in _extract_container_networks(full_config)}
        _validate_container_network_prefixes_or_400(name, desired_prefixes, existing_networks)
        existing = existing_networks.get(name)

        operations: List[Dict[str, Any]] = []

        existing_prefixes = set(existing.prefixes if existing else [])
        desired_prefix_set = set(desired_prefixes)
        for prefix in sorted(existing_prefixes - desired_prefix_set):
            operations.append(
                {
                    "op": "delete",
                    "path": ["container", "network", name, "prefix", prefix],
                }
            )
        for prefix in sorted(desired_prefix_set - existing_prefixes):
            operations.append(
                {
                    "op": "set",
                    "path": ["container", "network", name, "prefix", prefix],
                }
            )

        if description:
            operations.append(
                {
                    "op": "set",
                    "path": ["container", "network", name, "description", description],
                }
            )
        elif existing and existing.description:
            operations.append(
                {
                    "op": "delete",
                    "path": ["container", "network", name, "description"],
                }
            )

        if mtu is not None:
            operations.append(
                {
                    "op": "set",
                    "path": ["container", "network", name, "mtu", str(mtu)],
                }
            )
        elif existing and existing.mtu is not None:
            operations.append(
                {
                    "op": "delete",
                    "path": ["container", "network", name, "mtu"],
                }
            )

        if vrf:
            operations.append(
                {
                    "op": "set",
                    "path": ["container", "network", name, "vrf", vrf],
                }
            )
        elif existing and existing.vrf:
            operations.append(
                {
                    "op": "delete",
                    "path": ["container", "network", name, "vrf"],
                }
            )

        if body.dns_disabled:
            operations.append(
                {
                    "op": "set",
                    "path": ["container", "network", name, "no-name-server"],
                }
            )
        elif existing and existing.dns_disabled:
            operations.append(
                {
                    "op": "delete",
                    "path": ["container", "network", name, "no-name-server"],
                }
            )

        if operations:
            response = await run_in_threadpool(service.apply_operations, operations)
            if response.status != 200:
                status_code = 400 if response.status == 400 else 500
                raise HTTPException(
                    status_code=status_code,
                    detail=f"Failed to update container network '{name}': {response.error or 'Unknown VyOS error'}",
                )

        refreshed = await run_in_threadpool(service.get_full_config, refresh=True)
        refreshed_networks = {entry.name: entry for entry in _extract_container_networks(refreshed)}
        updated = refreshed_networks.get(name)
        if not updated:
            raise HTTPException(status_code=500, detail=f"Container network '{name}' was not found after update")
        return updated
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update container network: {exc}")


@router.delete("/networks/{network_name}", response_model=ContainerNetworkOperationResponse)
async def delete_container_network(request: Request, network_name: str) -> ContainerNetworkOperationResponse:
    """Delete a container network."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        name = _normalize_container_network_name_or_400(network_name)
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        existing_networks = {entry.name: entry for entry in _extract_container_networks(full_config)}
        if name not in existing_networks:
            raise HTTPException(status_code=404, detail=f"Container network '{name}' not found")

        response = await run_in_threadpool(
            service.apply_operations,
            [{"op": "delete", "path": ["container", "network", name]}],
        )
        if response.status != 200:
            status_code = 400 if response.status == 400 else 500
            raise HTTPException(
                status_code=status_code,
                detail=f"Failed to delete container network '{name}': {response.error or 'Unknown VyOS error'}",
            )

        await run_in_threadpool(service.get_full_config, refresh=True)
        return ContainerNetworkOperationResponse(
            success=True,
            network=name,
            message=f"Container network '{name}' deleted",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete container network: {exc}")


@router.get("/images", response_model=ContainerImagesResponse)
async def get_container_images(request: Request, refresh: bool = False) -> ContainerImagesResponse:
    """Return configured/runtime image references and automation readiness."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return await run_in_threadpool(_load_container_images_snapshot, service, full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load container images: {exc}")


@router.post("/images/pull", response_model=ContainerImageLifecycleResponse)
async def pull_container_image(
    request: Request,
    body: ContainerImageLifecycleRequest,
) -> ContainerImageLifecycleResponse:
    """Pull an image reference using VyOS op-mode command."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        await _ensure_container_automation_bootstrap(request)
        service = get_session_vyos_service(request)
        host = _string_or_none(getattr(service.config, "hostname", None))
        if not host:
            raise HTTPException(status_code=500, detail="Unable to resolve SSH host for active instance")
        result = await run_in_threadpool(ssh_pull_container_image, host, body.image)
        return ContainerImageLifecycleResponse(
            success=True,
            action="pull",
            target=body.image.strip(),
            output=result.output or None,
            automation_ready=True,
        )
    except SshCommandError as ssh_exc:
        raise HTTPException(status_code=500, detail=f"SSH operation failed: {ssh_exc}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to pull container image: {exc}")


@router.post("/images/update", response_model=ContainerImageLifecycleResponse)
async def update_container_image(
    request: Request,
    body: ContainerImageLifecycleRequest,
) -> ContainerImageLifecycleResponse:
    """Update an image reference using VyOS op-mode command."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        await _ensure_container_automation_bootstrap(request)
        service = get_session_vyos_service(request)
        host = _string_or_none(getattr(service.config, "hostname", None))
        if not host:
            raise HTTPException(status_code=500, detail="Unable to resolve SSH host for active instance")
        result = await run_in_threadpool(ssh_update_container_image, host, body.image)
        return ContainerImageLifecycleResponse(
            success=True,
            action="update",
            target=body.image.strip(),
            output=result.output or None,
            automation_ready=True,
        )
    except SshCommandError as ssh_exc:
        raise HTTPException(status_code=500, detail=f"SSH operation failed: {ssh_exc}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update container image: {exc}")


@router.post("/images/delete", response_model=ContainerImageLifecycleResponse)
async def delete_container_image(
    request: Request,
    body: ContainerImageDeleteRequest,
) -> ContainerImageLifecycleResponse:
    """Delete a container image reference (or all) using VyOS op-mode command."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        await _ensure_container_automation_bootstrap(request)
        service = get_session_vyos_service(request)
        host = _string_or_none(getattr(service.config, "hostname", None))
        if not host:
            raise HTTPException(status_code=500, detail="Unable to resolve SSH host for active instance")
        result = await run_in_threadpool(
            ssh_delete_container_image,
            host,
            body.target,
            force=body.force,
        )
        return ContainerImageLifecycleResponse(
            success=True,
            action="delete",
            target=body.target.strip(),
            output=result.output or None,
            automation_ready=True,
        )
    except SshCommandError as ssh_exc:
        raise HTTPException(status_code=500, detail=f"SSH operation failed: {ssh_exc}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete container image: {exc}")


@router.get("/registries", response_model=List[ContainerRegistrySummary])
async def get_container_registries(request: Request, refresh: bool = False) -> List[ContainerRegistrySummary]:
    """List configured container registries."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return _extract_container_registries(full_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load container registries: {exc}")


@router.put("/registries/{registry_name}", response_model=ContainerRegistrySummary)
async def upsert_container_registry(
    request: Request,
    registry_name: str,
    body: ContainerRegistryUpsertRequest,
) -> ContainerRegistrySummary:
    """Create or update container registry settings."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        name = _normalize_registry_name_or_400(registry_name)
        username = _string_or_none(body.username)
        password = _string_or_none(body.password)
        mirror = body.mirror
        mirror_address = _string_or_none(mirror.address) if mirror else None
        mirror_host_name = _string_or_none(mirror.host_name) if mirror else None
        mirror_path = _string_or_none(mirror.path) if mirror else None
        mirror_port = _normalize_registry_port_or_400(mirror.port if mirror else None)

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        existing_map = {entry.name: entry for entry in _extract_container_registries(full_config)}
        existing = existing_map.get(name)

        operations: List[Dict[str, Any]] = []
        if not body.enabled:
            operations.append({"op": "set", "path": ["container", "registry", name, "disable"]})
        elif existing and not existing.enabled:
            operations.append({"op": "delete", "path": ["container", "registry", name, "disable"]})

        if body.insecure:
            operations.append({"op": "set", "path": ["container", "registry", name, "insecure"]})
        elif existing and existing.insecure:
            operations.append({"op": "delete", "path": ["container", "registry", name, "insecure"]})

        if username:
            operations.append(
                {
                    "op": "set",
                    "path": ["container", "registry", name, "authentication", "username", username],
                }
            )
        elif existing and existing.username:
            operations.append(
                {"op": "delete", "path": ["container", "registry", name, "authentication", "username"]}
            )

        if password:
            operations.append(
                {
                    "op": "set",
                    "path": ["container", "registry", name, "authentication", "password", password],
                }
            )

        if mirror_address:
            operations.append(
                {"op": "set", "path": ["container", "registry", name, "mirror", "address", mirror_address]}
            )
        elif existing and existing.mirror and existing.mirror.address:
            operations.append(
                {"op": "delete", "path": ["container", "registry", name, "mirror", "address"]}
            )

        if mirror_host_name:
            operations.append(
                {
                    "op": "set",
                    "path": ["container", "registry", name, "mirror", "host-name", mirror_host_name],
                }
            )
        elif existing and existing.mirror and existing.mirror.host_name:
            operations.append(
                {"op": "delete", "path": ["container", "registry", name, "mirror", "host-name"]}
            )

        if mirror_port is not None:
            operations.append(
                {"op": "set", "path": ["container", "registry", name, "mirror", "port", str(mirror_port)]}
            )
        elif existing and existing.mirror and existing.mirror.port is not None:
            operations.append({"op": "delete", "path": ["container", "registry", name, "mirror", "port"]})

        if mirror_path:
            operations.append(
                {"op": "set", "path": ["container", "registry", name, "mirror", "path", mirror_path]}
            )
        elif existing and existing.mirror and existing.mirror.path:
            operations.append({"op": "delete", "path": ["container", "registry", name, "mirror", "path"]})

        if operations:
            response = await run_in_threadpool(service.apply_operations, operations)
            if response.status != 200:
                status_code = 400 if response.status == 400 else 500
                raise HTTPException(
                    status_code=status_code,
                    detail=f"Failed to update container registry '{name}': {response.error or 'Unknown VyOS error'}",
                )

        refreshed = await run_in_threadpool(service.get_full_config, refresh=True)
        refreshed_map = {entry.name: entry for entry in _extract_container_registries(refreshed)}
        updated = refreshed_map.get(name)
        if not updated:
            raise HTTPException(status_code=500, detail=f"Container registry '{name}' was not found after update")
        return updated
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update container registry: {exc}")


@router.delete("/registries/{registry_name}", response_model=ContainerRegistryOperationResponse)
async def delete_container_registry(
    request: Request,
    registry_name: str,
) -> ContainerRegistryOperationResponse:
    """Delete a configured container registry."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        name = _normalize_registry_name_or_400(registry_name)
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        existing_map = {entry.name: entry for entry in _extract_container_registries(full_config)}
        if name not in existing_map:
            raise HTTPException(status_code=404, detail=f"Container registry '{name}' not found")

        response = await run_in_threadpool(
            service.apply_operations,
            [{"op": "delete", "path": ["container", "registry", name]}],
        )
        if response.status != 200:
            status_code = 400 if response.status == 400 else 500
            raise HTTPException(
                status_code=status_code,
                detail=f"Failed to delete container registry '{name}': {response.error or 'Unknown VyOS error'}",
            )

        await run_in_threadpool(service.get_full_config, refresh=True)
        return ContainerRegistryOperationResponse(
            success=True,
            registry=name,
            message=f"Container registry '{name}' deleted",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete container registry: {exc}")


@router.post("/bootstrap", response_model=ContainerBootstrapStatusResponse)
async def bootstrap_container_automation(
    request: Request,
    body: Optional[ContainerInitialSetupRequest] = None,
) -> ContainerBootstrapStatusResponse:
    """
    Enable SSH service and install the VyManager automation public key (idempotent).

    This does NOT pull any images; it only configures prerequisites so the backend
    can run safe, restricted SSH commands for container operations.
    """
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        setup = body or ContainerInitialSetupRequest()

        pub_type = None
        pub_key = None
        if setup.enable_automation:
            _private_key_path, pub_type, pub_key = await run_in_threadpool(
                ensure_ssh_keypair, comment="vymanager"
            )

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        status = _bootstrap_status_from_config(full_config)

        operations: List[Dict[str, Any]] = []
        if setup.enable_automation:
            if not status.ssh_enabled:
                operations.append({"op": "set", "path": ["service", "ssh"]})

            ident = status.ssh_key_identifier
            if not status.ssh_key_installed or status.ssh_key_type != pub_type:
                operations.extend(
                    [
                        {
                            "op": "set",
                            "path": [
                                "system",
                                "login",
                                "user",
                                SSH_USERNAME_DEFAULT,
                                "authentication",
                                "public-keys",
                                ident,
                                "key",
                                pub_key,
                            ],
                        },
                        {
                            "op": "set",
                            "path": [
                                "system",
                                "login",
                                "user",
                                SSH_USERNAME_DEFAULT,
                                "authentication",
                                "public-keys",
                                ident,
                                "type",
                                pub_type,
                            ],
                        },
                    ]
                )

        if setup.create_default_network:
            network_name = _normalize_container_network_name_or_400(setup.network_name)
            network_prefix = _normalize_container_network_prefix_or_400(setup.network_prefix)
            network_mtu = _normalize_container_network_mtu_or_400(setup.network_mtu)
            network_description = _string_or_none(setup.network_description)
            network_vrf = _string_or_none(setup.network_vrf)

            operations.append(
                {
                    "op": "set",
                    "path": ["container", "network", network_name, "prefix", network_prefix],
                }
            )
            if network_description:
                operations.append(
                    {
                        "op": "set",
                        "path": ["container", "network", network_name, "description", network_description],
                    }
                )
            if network_mtu is not None:
                operations.append(
                    {
                        "op": "set",
                        "path": ["container", "network", network_name, "mtu", str(network_mtu)],
                    }
                )
            if network_vrf:
                operations.append(
                    {
                        "op": "set",
                        "path": ["container", "network", network_name, "vrf", network_vrf],
                    }
                )
            if setup.disable_network_dns:
                operations.append(
                    {
                        "op": "set",
                        "path": ["container", "network", network_name, "no-name-server"],
                    }
                )

        if operations:
            response = await run_in_threadpool(service.apply_operations, operations)
            if response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to bootstrap container automation: {response.error or 'Unknown VyOS error'}",
                )

        # Refresh and return updated status
        refreshed = await run_in_threadpool(service.get_full_config, refresh=True)
        return _bootstrap_status_from_config(refreshed)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to bootstrap container automation: {exc}")


@router.put("/{container_name}", response_model=ContainerSummary)
async def upsert_container(
    request: Request,
    container_name: str,
    body: ContainerUpsertRequest,
) -> ContainerSummary:
    """Create or update a container configuration."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        name = _normalize_name_or_400(container_name)
        normalized_body = _normalize_container_upsert_request_or_400(body)

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        _validate_container_network_attachments_or_400(
            normalized_body.networks,
            _build_container_network_prefix_map(_extract_container_networks(full_config)),
        )
        existing = name in _extract_container_config(full_config)

        operations = _build_container_set_operations(
            name=name,
            body=normalized_body,
            replace_existing=existing,
        )
        response = await run_in_threadpool(service.apply_operations, operations)
        if response.status != 200:
            status_code = 400 if response.status == 400 else 500
            raise HTTPException(
                status_code=status_code,
                detail=f"Failed to update container '{name}': {response.error or 'Unknown VyOS error'}",
            )

        _, overview = await _load_container_overview(request, refresh=True)
        for container in overview.containers:
            if container.name == name:
                return container

        raise HTTPException(status_code=500, detail="Container saved but not found in refreshed configuration")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update container: {exc}")


async def _ensure_container_automation_bootstrap(request: Request) -> ContainerBootstrapStatusResponse:
    """
    Ensure SSH is enabled and the VyManager automation public key is installed.

    This is used by install flows that need to run op-mode commands not supported
    by the VyOS HTTPS API (e.g. `add container image`).
    """
    _private_key_path, pub_type, pub_key = await run_in_threadpool(
        ensure_ssh_keypair, comment="vymanager"
    )
    service = get_session_vyos_service(request)
    full_config = await run_in_threadpool(service.get_full_config, refresh=True)
    status = _bootstrap_status_from_config(full_config)

    operations: List[Dict[str, Any]] = []
    if not status.ssh_enabled:
        operations.append({"op": "set", "path": ["service", "ssh"]})

    ident = status.ssh_key_identifier
    if not status.ssh_key_installed or status.ssh_key_type != pub_type:
        operations.extend(
            [
                {
                    "op": "set",
                    "path": [
                        "system",
                        "login",
                        "user",
                        SSH_USERNAME_DEFAULT,
                        "authentication",
                        "public-keys",
                        ident,
                        "key",
                        pub_key,
                    ],
                },
                {
                    "op": "set",
                    "path": [
                        "system",
                        "login",
                        "user",
                        SSH_USERNAME_DEFAULT,
                        "authentication",
                        "public-keys",
                        ident,
                        "type",
                        pub_type,
                    ],
                },
            ]
        )

    if operations:
        response = await run_in_threadpool(service.apply_operations, operations)
        if response.status != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to bootstrap container automation: {response.error or 'Unknown VyOS error'}",
            )

        refreshed = await run_in_threadpool(service.get_full_config, refresh=True)
        return _bootstrap_status_from_config(refreshed)

    return status


@router.post("/{container_name}/install", response_model=ContainerInstallResponse)
async def install_container(
    request: Request,
    container_name: str,
    body: ContainerUpsertRequest,
) -> ContainerInstallResponse:
    """
    Install a container:
    - Ensure SSH automation prerequisites are configured
    - Pull the image via op-mode (`add container image ...`)
    - Create missing /config/containers/* volume directories
    - Apply the VyOS container configuration
    """
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        name = _normalize_name_or_400(container_name)
        normalized_body = _normalize_container_upsert_request_or_400(body)
        image = normalized_body.image

        # Ensure we can run op-mode `add` commands via SSH.
        await _ensure_container_automation_bootstrap(request)

        service = get_session_vyos_service(request)
        host = _string_or_none(getattr(service.config, "hostname", None))
        if not host:
            raise HTTPException(status_code=500, detail="Unable to resolve SSH host for active instance")

        # Ensure host volume directories exist (restricted to /config/containers/*).
        volume_paths = [
            vol.source for vol in normalized_body.volumes if vol.source.startswith("/config/containers/")
        ]
        if volume_paths:
            await run_in_threadpool(ssh_mkdir_p, host, volume_paths, prefix="/config/containers/")

        # Pull image before committing; avoids a confusing 'image missing' warning + non-start.
        pull_result = await run_in_threadpool(ssh_pull_container_image, host, image)

        # Apply container config (same semantics as PUT upsert).
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        _validate_container_network_attachments_or_400(
            normalized_body.networks,
            _build_container_network_prefix_map(_extract_container_networks(full_config)),
        )
        existing = name in _extract_container_config(full_config)
        operations = _build_container_set_operations(
            name=name,
            body=normalized_body,
            replace_existing=existing,
        )
        response = await run_in_threadpool(service.apply_operations, operations)
        if response.status != 200:
            if response.status == 400:
                raise HTTPException(
                    status_code=400,
                    detail=f"VyOS rejected container config: {response.error or 'Unknown VyOS error'}",
                )
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update container '{name}': {response.error or 'Unknown VyOS error'}",
            )

        _, overview = await _load_container_overview(request, refresh=True)
        for container in overview.containers:
            if container.name == name:
                return ContainerInstallResponse(
                    success=True,
                    container=container,
                    image_pulled=True,
                    created_volume_paths=sorted(set(volume_paths)),
                    pull_output=(pull_result.output or None),
                )

        raise HTTPException(status_code=500, detail="Container saved but not found in refreshed configuration")
    except SshCommandError as ssh_exc:
        # Keep message short; the UI can show full output if needed later.
        raise HTTPException(status_code=500, detail=f"SSH operation failed: {ssh_exc}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to install container: {exc}")


@router.delete("/{container_name}", response_model=ContainerDeleteResponse)
async def delete_container(request: Request, container_name: str) -> ContainerDeleteResponse:
    """Delete a container configuration."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        name = _normalize_name_or_400(container_name)
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        configured = _extract_container_config(full_config)
        if name not in configured:
            raise HTTPException(status_code=404, detail=f"Container '{name}' not found")

        response = await run_in_threadpool(
            service.apply_operations, [{"op": "delete", "path": ["container", "name", name]}],
        )
        if response.status != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete container '{name}': {response.error or 'Unknown VyOS error'}",
            )

        await run_in_threadpool(service.get_full_config, refresh=True)
        return ContainerDeleteResponse(success=True, name=name, message=f"Container '{name}' deleted")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete container: {exc}")


@router.post("/{container_name}/action", response_model=ContainerActionResponse)
async def container_action(
    request: Request,
    container_name: str,
    body: ContainerActionRequest,
) -> ContainerActionResponse:
    """Start, stop, or restart a configured container."""
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
        name = _normalize_name_or_400(container_name)
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        configured = _extract_container_config(full_config)
        raw_entry = configured.get(name)
        if raw_entry is None:
            raise HTTPException(status_code=404, detail=f"Container '{name}' not found")

        summary = _parse_container_from_config(name, raw_entry)

        if body.action == "start":
            if summary.enabled:
                return ContainerActionResponse(
                    success=True,
                    name=name,
                    action="start",
                    method="config-delete-disable",
                    message="Container is already enabled",
                )
            start_response = await run_in_threadpool(
                service.apply_operations, [{"op": "delete", "path": ["container", "name", name, "disable"]}],
            )
            if start_response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to start container '{name}': {start_response.error or 'Unknown VyOS error'}",
                )
            await run_in_threadpool(service.get_full_config, refresh=True)
            return ContainerActionResponse(
                success=True,
                name=name,
                action="start",
                method="config-delete-disable",
                message=f"Container '{name}' enabled",
            )

        if body.action == "stop":
            if not summary.enabled:
                return ContainerActionResponse(
                    success=True,
                    name=name,
                    action="stop",
                    method="config-set-disable",
                    message="Container is already disabled",
                )
            stop_response = await run_in_threadpool(
                service.apply_operations, [{"op": "set", "path": ["container", "name", name, "disable"]}],
            )
            if stop_response.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to stop container '{name}': {stop_response.error or 'Unknown VyOS error'}",
                )
            await run_in_threadpool(service.get_full_config, refresh=True)
            return ContainerActionResponse(
                success=True,
                name=name,
                action="stop",
                method="config-set-disable",
                message=f"Container '{name}' disabled",
            )

        # restart
        runtime_attempts = [
            (
                "show container restart <name>",
                lambda: service.device.show(path=["container", "restart", name]),
            ),
            (
                "generate container restart <name>",
                lambda: service.device.generate(path=["container", "restart", name]),
            ),
            (
                "show container <name> restart",
                lambda: service.device.show(path=["container", name, "restart"]),
            ),
            (
                "generate container <name> restart",
                lambda: service.device.generate(path=["container", name, "restart"]),
            ),
        ]

        first_error = None
        for method_name, attempt in runtime_attempts:
            try:
                response = await run_in_threadpool(attempt)
            except Exception as exc:
                if first_error is None:
                    first_error = f"{method_name}: {exc}"
                continue

            if response.status == 200:
                output = _extract_show_output(response.result)
                return ContainerActionResponse(
                    success=True,
                    name=name,
                    action="restart",
                    method=method_name,
                    message=f"Restart requested for container '{name}'",
                    output=output or None,
                )

            if first_error is None:
                first_error = f"{method_name}: {response.error or f'status {response.status}'}"

        # Fallback if operation command is unavailable: toggle disable flag.
        fallback_ops: List[Dict[str, Any]]
        if summary.enabled:
            fallback_ops = [
                {"op": "set", "path": ["container", "name", name, "disable"]},
                {"op": "delete", "path": ["container", "name", name, "disable"]},
            ]
        else:
            fallback_ops = [{"op": "delete", "path": ["container", "name", name, "disable"]}]

        fallback_response = await run_in_threadpool(
            service.apply_operations, fallback_ops,
        )
        if fallback_response.status != 200:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Failed to restart container '{name}'. "
                    f"Operation command failed ({first_error or 'unknown'}); "
                    f"fallback failed ({fallback_response.error or 'unknown'})."
                ),
            )

        await run_in_threadpool(service.get_full_config, refresh=True)
        return ContainerActionResponse(
            success=True,
            name=name,
            action="restart",
            method="config-disable-toggle",
            message=f"Restart fallback applied for container '{name}'",
            warning=f"Operation command unavailable: {first_error}" if first_error else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to run container action: {exc}")


@router.get("/{container_name}/inspect", response_model=ContainerInspectResponse)
async def inspect_container(
    request: Request,
    container_name: str,
) -> ContainerInspectResponse:
    """Return raw operational details for a container."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        name = _normalize_name_or_400(container_name)
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=False)
        configured = _extract_container_config(full_config)
        if name not in configured:
            raise HTTPException(status_code=404, detail=f"Container '{name}' not found")

        attempts = [
            ("show container inspect <name>", lambda: service.device.show(path=["container", "inspect", name])),
            ("generate container inspect <name>", lambda: service.device.generate(path=["container", "inspect", name])),
            ("show container <name>", lambda: service.device.show(path=["container", name])),
            ("show container", lambda: service.device.show(path=["container"])),
        ]

        first_error = None
        output = ""
        selected_method = None
        for method_name, attempt in attempts:
            try:
                response = await run_in_threadpool(attempt)
            except Exception as exc:
                if first_error is None:
                    first_error = f"{method_name}: {exc}"
                continue
            if response.status == 200:
                payload = _extract_show_output(response.result)
                if payload.strip():
                    output = payload
                    selected_method = method_name
                    break
            if first_error is None:
                first_error = f"{method_name}: {response.error or f'status {response.status}'}"

        if not output:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to inspect container '{name}': {first_error or 'unknown command failure'}",
            )

        return ContainerInspectResponse(
            name=name,
            method=selected_method,
            output=output,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to inspect container: {exc}")


@router.get("/{container_name}/logs", response_model=ContainerLogsResponse)
async def get_container_logs(
    request: Request,
    container_name: str,
    lines: int = 300,
) -> ContainerLogsResponse:
    """Fetch operational logs from a container."""
    await require_read_permission(request, FeatureGroup.SYSTEM)

    try:
        name = _normalize_name_or_400(container_name)
        lines = max(1, min(lines, 2000))

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=False)
        configured = _extract_container_config(full_config)
        if name not in configured:
            raise HTTPException(status_code=404, detail=f"Container '{name}' not found")

        attempts = [
            ("show container log <name>", ["container", "log", name]),
            ("show container logs <name>", ["container", "logs", name]),
            ("show container <name> log", ["container", name, "log"]),
            ("show container <name> logs", ["container", name, "logs"]),
        ]

        first_error = None
        output = ""
        for method_name, path in attempts:
            response = await run_in_threadpool(service.device.show, path=path)
            if response.status == 200:
                output = _extract_show_output(response.result)
                break
            if first_error is None:
                first_error = f"{method_name}: {response.error or f'status {response.status}'}"

        if output == "":
            raise HTTPException(
                status_code=500,
                detail=f"Failed to retrieve logs for '{name}': {first_error or 'unknown command failure'}",
            )

        all_lines = output.splitlines()
        selected = all_lines[-lines:]
        return ContainerLogsResponse(
            name=name,
            logs="\n".join(selected),
            total_lines=len(all_lines),
            returned_lines=len(selected),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve container logs: {exc}")
