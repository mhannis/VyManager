"""
Container Management Endpoints

VyOS container (Podman) configuration and runtime operations.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional, Tuple
import re

from session_vyos_service import get_session_vyos_service
from utils.ssh_exec import (
    SshCommandError,
    SSH_USERNAME_DEFAULT,
    ensure_ssh_keypair,
    ssh_mkdir_p,
    ssh_pull_container_image,
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
    network: Optional[str] = None
    network_address: Optional[str] = None
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
    network: Optional[str] = None
    network_address: Optional[str] = None
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


class ContainerBootstrapStatusResponse(BaseModel):
    ssh_enabled: bool = False
    ssh_key_installed: bool = False
    ssh_key_identifier: str = "vymanager"
    ssh_key_type: Optional[str] = None


class ContainerInstallResponse(BaseModel):
    success: bool
    container: ContainerSummary
    image_pulled: bool = False
    created_volume_paths: List[str] = Field(default_factory=list)
    pull_output: Optional[str] = None


# ========================================================================
# Helpers
# ========================================================================


RE_CONTAINER_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$")


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
    )

    # network
    network_data = data.get("network")
    if isinstance(network_data, dict) and network_data:
        network_name = sorted(str(key) for key in network_data.keys())[0]
        summary.network = network_name
        network_options = network_data.get(network_name)
        if isinstance(network_options, dict):
            summary.network_address = _string_or_none(network_options.get("address"))
    elif isinstance(network_data, str):
        summary.network = network_data.strip() or None

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

    return summary


def _infer_container_status(name: str, runtime_output: str, enabled: bool) -> str:
    if not enabled:
        return "disabled"

    for line in runtime_output.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if re.search(rf"\b{re.escape(name)}\b", stripped):
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

    return ContainerBootstrapStatusResponse(
        ssh_enabled=ssh_enabled,
        ssh_key_installed=ssh_key_installed,
        ssh_key_identifier=key_identifier,
        ssh_key_type=key_type,
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

    if body.network:
        operations.append({"op": "set", "path": ["container", "name", name, "network", body.network]})
        if body.network_address:
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "container",
                        "name",
                        name,
                        "network",
                        body.network,
                        "address",
                        body.network_address,
                    ],
                }
            )

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


@router.post("/bootstrap", response_model=ContainerBootstrapStatusResponse)
async def bootstrap_container_automation(request: Request) -> ContainerBootstrapStatusResponse:
    """
    Enable SSH service and install the VyManager automation public key (idempotent).

    This does NOT pull any images; it only configures prerequisites so the backend
    can run safe, restricted SSH commands for container operations.
    """
    await require_write_permission(request, FeatureGroup.SYSTEM)

    try:
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
            response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
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
        image = body.image.strip()
        if not image:
            raise HTTPException(status_code=400, detail="Container image is required")

        allow_host_networks = body.allow_host_networks
        network = body.network.strip() if body.network else None
        network_address = body.network_address.strip() if body.network_address else None
        description = body.description.strip() if body.description else None
        entrypoint = body.entrypoint.strip() if body.entrypoint else None
        command = body.command.strip() if body.command else None
        arguments = body.arguments.strip() if body.arguments else None
        host_name = body.host_name.strip() if body.host_name else None

        environment = _normalize_environment_or_400(body.environment)
        ports = _normalize_ports_or_400(body.ports)
        volumes = _normalize_volumes_or_400(body.volumes)

        if allow_host_networks and network:
            raise HTTPException(
                status_code=400,
                detail="allow_host_networks cannot be combined with network",
            )
        if network_address and not network:
            raise HTTPException(
                status_code=400,
                detail="network_address requires a network name",
            )

        normalized_body = ContainerUpsertRequest(
            image=image,
            description=description,
            entrypoint=entrypoint,
            command=command,
            arguments=arguments,
            host_name=host_name,
            restart=body.restart,
            enabled=body.enabled,
            allow_host_networks=allow_host_networks,
            network=network,
            network_address=network_address,
            environment=environment,
            ports=ports,
            volumes=volumes,
        )

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        existing = name in _extract_container_config(full_config)

        operations = _build_container_set_operations(
            name=name,
            body=normalized_body,
            replace_existing=existing,
        )
        response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
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
        response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
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
        image = body.image.strip()
        if not image:
            raise HTTPException(status_code=400, detail="Container image is required")

        allow_host_networks = body.allow_host_networks
        network = body.network.strip() if body.network else None
        network_address = body.network_address.strip() if body.network_address else None
        description = body.description.strip() if body.description else None
        entrypoint = body.entrypoint.strip() if body.entrypoint else None
        command = body.command.strip() if body.command else None
        arguments = body.arguments.strip() if body.arguments else None
        host_name = body.host_name.strip() if body.host_name else None

        environment = _normalize_environment_or_400(body.environment)
        ports = _normalize_ports_or_400(body.ports)
        volumes = _normalize_volumes_or_400(body.volumes)

        if allow_host_networks and network:
            raise HTTPException(
                status_code=400,
                detail="allow_host_networks cannot be combined with network",
            )
        if network_address and not network:
            raise HTTPException(
                status_code=400,
                detail="network_address requires a network name",
            )

        normalized_body = ContainerUpsertRequest(
            image=image,
            description=description,
            entrypoint=entrypoint,
            command=command,
            arguments=arguments,
            host_name=host_name,
            restart=body.restart,
            enabled=body.enabled,
            allow_host_networks=allow_host_networks,
            network=network,
            network_address=network_address,
            environment=environment,
            ports=ports,
            volumes=volumes,
        )

        # Ensure we can run op-mode `add` commands via SSH.
        await _ensure_container_automation_bootstrap(request)

        service = get_session_vyos_service(request)
        host = _string_or_none(getattr(service.config, "hostname", None))
        if not host:
            raise HTTPException(status_code=500, detail="Unable to resolve SSH host for active instance")

        # Ensure host volume directories exist (restricted to /config/containers/*).
        volume_paths = [vol.source for vol in volumes if vol.source.startswith("/config/containers/")]
        if volume_paths:
            await run_in_threadpool(ssh_mkdir_p, host, volume_paths, prefix="/config/containers/")

        # Pull image before committing; avoids a confusing 'image missing' warning + non-start.
        pull_result = await run_in_threadpool(ssh_pull_container_image, host, image)

        # Apply container config (same semantics as PUT upsert).
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        existing = name in _extract_container_config(full_config)
        operations = _build_container_set_operations(
            name=name,
            body=normalized_body,
            replace_existing=existing,
        )
        response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
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
            service.device.configure_multiple_op,
            op_path=[{"op": "delete", "path": ["container", "name", name]}],
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
                service.device.configure_multiple_op,
                op_path=[{"op": "delete", "path": ["container", "name", name, "disable"]}],
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
                service.device.configure_multiple_op,
                op_path=[{"op": "set", "path": ["container", "name", name, "disable"]}],
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
            service.device.configure_multiple_op,
            op_path=fallback_ops,
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
