"""
Firewall Groups Router

API endpoints for managing VyOS firewall groups.
Supports version-aware configuration for VyOS 1.4 and 1.5.
"""

import ipaddress
import re
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from session_vyos_service import get_session_vyos_service
from vyos_builders import FirewallGroupsBatchBuilder
from fastapi_permissions import require_read_permission, require_write_permission, FeatureGroup

router = APIRouter(prefix="/vyos/firewall/groups", tags=["firewall-groups"])

RE_GROUP_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$")
RE_INTERFACE_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9._:-]{0,63}$")
RE_MAC = re.compile(r"^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$")
RE_DOMAIN = re.compile(
    r"^(?=.{1,253}$)(?:\*\.)?(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$"
)
RE_PORT_SERVICE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,31}$")

VALUE_REQUIRED_OP_SUFFIXES = (
    "_description",
    "_address",
    "_network",
    "_port",
    "_interface",
    "_mac",
    "_url",
    "_include",
)


def _normalize_group_name_or_400(group_name: str) -> str:
    name = str(group_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="group_name is required")
    if not RE_GROUP_NAME.match(name):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid group_name. Use letters/numbers and optional . _ - "
                "(max 63 chars, must start with alphanumeric)."
            ),
        )
    return name


def _is_valid_ip_or_range(value: str, version: int) -> bool:
    candidate = value.strip()
    if "-" in candidate:
        start, end = [part.strip() for part in candidate.split("-", 1)]
        try:
            left = ipaddress.ip_address(start)
            right = ipaddress.ip_address(end)
        except ValueError:
            return False
        if left.version != version or right.version != version:
            return False
        return int(left) <= int(right)

    try:
        ip = ipaddress.ip_address(candidate)
    except ValueError:
        return False
    return ip.version == version


def _is_valid_cidr(value: str, version: int) -> bool:
    try:
        network = ipaddress.ip_network(value.strip(), strict=False)
    except ValueError:
        return False
    return network.version == version


def _is_valid_port_or_range_or_service(value: str) -> bool:
    candidate = value.strip()
    if not candidate:
        return False

    if candidate.isdigit():
        port = int(candidate)
        return 1 <= port <= 65535

    if "-" in candidate:
        left, right = [part.strip() for part in candidate.split("-", 1)]
        if left.isdigit() and right.isdigit():
            start = int(left)
            end = int(right)
            return 1 <= start <= 65535 and 1 <= end <= 65535 and start <= end
        return False

    return bool(RE_PORT_SERVICE.match(candidate))


def _is_valid_remote_url(value: str) -> bool:
    parsed = urlparse(value.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _validate_group_operation_value_or_400(group_name: str, op_type: str, value: Optional[str]) -> str:
    cleaned_value = (value or "").strip()
    requires_value = any(op_type.endswith(suffix) for suffix in VALUE_REQUIRED_OP_SUFFIXES)
    if requires_value and not cleaned_value:
        raise HTTPException(status_code=400, detail=f"{op_type} requires a value")

    if not cleaned_value:
        return cleaned_value

    if op_type.endswith("_description"):
        if len(cleaned_value) > 512:
            raise HTTPException(status_code=400, detail="Description must be <= 512 characters")
        return cleaned_value

    if op_type.endswith("_include"):
        included_group = _normalize_group_name_or_400(cleaned_value)
        if included_group == group_name:
            raise HTTPException(status_code=400, detail="Group cannot include itself")
        return included_group

    if op_type.endswith("address_group_address"):
        if not _is_valid_ip_or_range(cleaned_value, version=4):
            raise HTTPException(status_code=400, detail="Invalid IPv4 address or range value")
        return cleaned_value

    if op_type.endswith("ipv6_address_group_address"):
        if not _is_valid_ip_or_range(cleaned_value, version=6):
            raise HTTPException(status_code=400, detail="Invalid IPv6 address or range value")
        return cleaned_value

    if op_type.endswith("network_group_network"):
        if not _is_valid_cidr(cleaned_value, version=4):
            raise HTTPException(status_code=400, detail="Invalid IPv4 CIDR network value")
        return cleaned_value

    if op_type.endswith("ipv6_network_group_network"):
        if not _is_valid_cidr(cleaned_value, version=6):
            raise HTTPException(status_code=400, detail="Invalid IPv6 CIDR network value")
        return cleaned_value

    if op_type.endswith("port_group_port"):
        if not _is_valid_port_or_range_or_service(cleaned_value):
            raise HTTPException(status_code=400, detail="Invalid port value")
        return cleaned_value

    if op_type.endswith("interface_group_interface"):
        if not RE_INTERFACE_NAME.match(cleaned_value):
            raise HTTPException(status_code=400, detail="Invalid interface name value")
        return cleaned_value

    if op_type.endswith("mac_group_mac"):
        if not RE_MAC.match(cleaned_value):
            raise HTTPException(status_code=400, detail="Invalid MAC address value")
        return cleaned_value

    if op_type.endswith("domain_group_address"):
        if not RE_DOMAIN.match(cleaned_value):
            raise HTTPException(status_code=400, detail="Invalid domain value")
        return cleaned_value

    if op_type.endswith("remote_group_url"):
        if not _is_valid_remote_url(cleaned_value):
            raise HTTPException(status_code=400, detail="Invalid remote-group URL (http/https required)")
        return cleaned_value

    return cleaned_value


def _validate_group_batch_consistency_or_400(
    group_name: str, operations: List["GroupBatchOperation"]
) -> None:
    if not operations:
        raise HTTPException(status_code=400, detail="At least one operation is required")

    seen_actions: Dict[tuple[str, str], str] = {}
    remote_urls: List[str] = []

    for operation in operations:
        op_type = (operation.op or "").strip()
        if not op_type:
            raise HTTPException(status_code=400, detail="Invalid operation: missing op value")

        value = (operation.value or "").strip()
        if op_type.endswith("_include") and value:
            included_group = _normalize_group_name_or_400(value)
            if included_group == group_name:
                raise HTTPException(status_code=400, detail="Group cannot include itself")

        action: Optional[str] = None
        member_scope: Optional[str] = None
        if op_type.startswith("set_"):
            action = "set"
            member_scope = op_type[len("set_") :]
        elif op_type.startswith("delete_"):
            action = "delete"
            member_scope = op_type[len("delete_") :]

        if action and member_scope and value:
            key = (member_scope, value)
            previous = seen_actions.get(key)
            if previous and previous != action:
                raise HTTPException(
                    status_code=400,
                    detail=f"Conflicting operations for '{value}': both set and delete requested",
                )
            if previous == action:
                raise HTTPException(
                    status_code=400,
                    detail=f"Duplicate {action} operation for '{value}'",
                )
            seen_actions[key] = action

        if op_type == "set_remote_group_url" and value:
            remote_urls.append(value)

    if remote_urls:
        normalized_urls = {url for url in remote_urls}
        if len(normalized_urls) > 1:
            raise HTTPException(
                status_code=400,
                detail="Remote groups support only one URL value per batch request",
            )


# Stub functions for backwards compatibility with app.py
# These are no longer used since we use session-based services
def set_device_registry(registry):
    """Legacy function - no longer used."""
    pass


def set_configured_device_name(name):
    """Legacy function - no longer used."""
    pass


# Request/Response Models
class GroupBatchOperation(BaseModel):
    """Single operation in a batch request."""
    op: str = Field(..., description="Operation name")
    value: Optional[str] = Field(None, description="Operation value")


class GroupBatchRequest(BaseModel):
    """Model for batch group configuration."""
    group_name: str = Field(..., description="Group name (e.g., INTERNAL_NETS)")
    operations: List[GroupBatchOperation] = Field(..., description="List of operations to perform")

    class Config:
        json_schema_extra = {
            "example": {
                "group_name": "INTERNAL_NETS",
                "operations": [
                    {"op": "set_address_group"},
                    {"op": "set_address_group_description", "value": "Internal networks"},
                    {"op": "set_address_group_address", "value": "10.0.0.0/8"},
                    {"op": "set_address_group_address", "value": "192.168.0.0/16"}
                ]
            }
        }


class VyOSResponse(BaseModel):
    """Standard response from VyOS operations."""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class FirewallGroup(BaseModel):
    """Firewall group configuration."""
    name: str
    type: str
    description: Optional[str] = None
    members: List[str] = []
    included_groups: List[str] = []


class GroupsConfigResponse(BaseModel):
    """Response containing all firewall groups."""
    address_groups: List[FirewallGroup] = []
    ipv6_address_groups: List[FirewallGroup] = []
    network_groups: List[FirewallGroup] = []
    ipv6_network_groups: List[FirewallGroup] = []
    port_groups: List[FirewallGroup] = []
    interface_groups: List[FirewallGroup] = []
    mac_groups: List[FirewallGroup] = []
    domain_groups: List[FirewallGroup] = []
    remote_groups: List[FirewallGroup] = []
    total: int = 0
    by_type: Dict[str, int] = {}


@router.get("/capabilities")
async def get_groups_capabilities(request: Request):
    """
    Get firewall groups capabilities based on device VyOS version.

    Returns feature flags indicating which group types and operations are supported.
    This allows frontends to conditionally enable/disable features based on version.

    Requires READ permission on FIREWALL_GROUPS feature.
    """
    # Check user has READ permission for firewall groups
    await require_read_permission(request, FeatureGroup.FIREWALL_GROUPS)

    try:
        service = get_session_vyos_service(request)
        version = service.get_version()
        builder = FirewallGroupsBatchBuilder(version=version)
        capabilities = builder.get_capabilities()

        # Add instance info
        if hasattr(request.state, "instance") and request.state.instance:
            capabilities["instance_name"] = request.state.instance.get("name")
            capabilities["instance_id"] = request.state.instance.get("id")

        return capabilities
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config", response_model=GroupsConfigResponse)
async def get_groups_config(request: Request, refresh: bool = False):
    """
    Get all firewall group configurations from VyOS.

    Args:
        request: FastAPI request object (contains active session)
        refresh: If True, force refresh from VyOS. If False, use cache if available.

    Returns:
        Configuration details for all firewall groups organized by type

    Requires READ permission on FIREWALL_GROUPS feature.
    """
    # Check user has READ permission for firewall groups
    await require_read_permission(request, FeatureGroup.FIREWALL_GROUPS)

    try:
        # Get service from active session
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)

        if not full_config or "firewall" not in full_config or "group" not in full_config["firewall"]:
            return GroupsConfigResponse(total=0)

        firewall_groups = full_config["firewall"]["group"]

        # Helper function to parse group members
        def parse_group(group_data: Dict, member_key: str) -> List[str]:
            """Extract members from group data."""
            if not group_data or member_key not in group_data:
                return []

            members_data = group_data[member_key]
            if isinstance(members_data, dict):
                return list(members_data.keys())
            elif isinstance(members_data, list):
                return members_data
            return []

        # Helper function to parse included groups
        def parse_included_groups(group_data: Dict) -> List[str]:
            """Extract included groups from group data."""
            if not group_data or "include" not in group_data:
                return []

            include_data = group_data["include"]
            # VyOS returns a string for single include, list for multiple
            if isinstance(include_data, str):
                return [include_data]
            elif isinstance(include_data, list):
                return include_data
            elif isinstance(include_data, dict):
                return list(include_data.keys())
            return []

        # Parse each group type
        address_groups = []
        if "address-group" in firewall_groups:
            for name, data in firewall_groups["address-group"].items():
                address_groups.append(FirewallGroup(
                    name=name,
                    type="address-group",
                    description=data.get("description"),
                    members=parse_group(data, "address"),
                    included_groups=parse_included_groups(data)
                ))

        ipv6_address_groups = []
        if "ipv6-address-group" in firewall_groups:
            for name, data in firewall_groups["ipv6-address-group"].items():
                ipv6_address_groups.append(FirewallGroup(
                    name=name,
                    type="ipv6-address-group",
                    description=data.get("description"),
                    members=parse_group(data, "address"),
                    included_groups=parse_included_groups(data)
                ))

        network_groups = []
        if "network-group" in firewall_groups:
            for name, data in firewall_groups["network-group"].items():
                network_groups.append(FirewallGroup(
                    name=name,
                    type="network-group",
                    description=data.get("description"),
                    members=parse_group(data, "network"),
                    included_groups=parse_included_groups(data)
                ))

        ipv6_network_groups = []
        if "ipv6-network-group" in firewall_groups:
            for name, data in firewall_groups["ipv6-network-group"].items():
                ipv6_network_groups.append(FirewallGroup(
                    name=name,
                    type="ipv6-network-group",
                    description=data.get("description"),
                    members=parse_group(data, "network"),
                    included_groups=parse_included_groups(data)
                ))

        port_groups = []
        if "port-group" in firewall_groups:
            for name, data in firewall_groups["port-group"].items():
                port_groups.append(FirewallGroup(
                    name=name,
                    type="port-group",
                    description=data.get("description"),
                    members=parse_group(data, "port"),
                    included_groups=parse_included_groups(data)
                ))

        interface_groups = []
        if "interface-group" in firewall_groups:
            for name, data in firewall_groups["interface-group"].items():
                interface_groups.append(FirewallGroup(
                    name=name,
                    type="interface-group",
                    description=data.get("description"),
                    members=parse_group(data, "interface"),
                    included_groups=parse_included_groups(data)
                ))

        mac_groups = []
        if "mac-group" in firewall_groups:
            for name, data in firewall_groups["mac-group"].items():
                mac_groups.append(FirewallGroup(
                    name=name,
                    type="mac-group",
                    description=data.get("description"),
                    members=parse_group(data, "mac-address"),
                    included_groups=parse_included_groups(data)
                ))

        domain_groups = []
        if "domain-group" in firewall_groups:
            for name, data in firewall_groups["domain-group"].items():
                domain_groups.append(FirewallGroup(
                    name=name,
                    type="domain-group",
                    description=data.get("description"),
                    members=parse_group(data, "address")
                ))

        remote_groups = []
        if "remote-group" in firewall_groups:
            for name, data in firewall_groups["remote-group"].items():
                # Remote groups have a single URL, not a list of members
                # Store the URL in members array for consistency
                url = data.get("url", "")
                members = [url] if url else []
                remote_groups.append(FirewallGroup(
                    name=name,
                    type="remote-group",
                    description=data.get("description"),
                    members=members
                ))

        # Calculate totals
        total = (
            len(address_groups) +
            len(ipv6_address_groups) +
            len(network_groups) +
            len(ipv6_network_groups) +
            len(port_groups) +
            len(interface_groups) +
            len(mac_groups) +
            len(domain_groups) +
            len(remote_groups)
        )

        by_type = {
            "address-group": len(address_groups),
            "ipv6-address-group": len(ipv6_address_groups),
            "network-group": len(network_groups),
            "ipv6-network-group": len(ipv6_network_groups),
            "port-group": len(port_groups),
            "interface-group": len(interface_groups),
            "mac-group": len(mac_groups),
            "domain-group": len(domain_groups),
            "remote-group": len(remote_groups)
        }

        return GroupsConfigResponse(
            address_groups=address_groups,
            ipv6_address_groups=ipv6_address_groups,
            network_groups=network_groups,
            ipv6_network_groups=ipv6_network_groups,
            port_groups=port_groups,
            interface_groups=interface_groups,
            mac_groups=mac_groups,
            domain_groups=domain_groups,
            remote_groups=remote_groups,
            total=total,
            by_type=by_type
        )

    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch", response_model=VyOSResponse)
async def configure_group_batch(http_request: Request, request: GroupBatchRequest):
    """
    Configure firewall group using batch operations.

    This is the main endpoint for configuring firewall groups. All operations
    are version-aware and sent to VyOS in a single batch for efficiency.

    **Address Group Operations (IPv4):**

    | Operation | Value Required | Description |
    |-----------|----------------|-------------|
    | `set_address_group` | No | Create address group |
    | `delete_address_group` | No | Delete address group |
    | `set_address_group_description` | Yes | Set group description |
    | `delete_address_group_description` | No | Delete group description |
    | `set_address_group_address` | Yes | Add IPv4 address or range (e.g., 10.0.0.1 or 10.0.0.1-10.0.0.10) |
    | `delete_address_group_address` | Yes | Remove IPv4 address or range |

    **IPv6 Address Group Operations:**

    | Operation | Value Required | Description |
    |-----------|----------------|-------------|
    | `set_ipv6_address_group` | No | Create IPv6 address group |
    | `delete_ipv6_address_group` | No | Delete IPv6 address group |
    | `set_ipv6_address_group_description` | Yes | Set group description |
    | `delete_ipv6_address_group_description` | No | Delete group description |
    | `set_ipv6_address_group_address` | Yes | Add IPv6 address or range |
    | `delete_ipv6_address_group_address` | Yes | Remove IPv6 address or range |

    **Network Group Operations (IPv4):**

    | Operation | Value Required | Description |
    |-----------|----------------|-------------|
    | `set_network_group` | No | Create network group |
    | `delete_network_group` | No | Delete network group |
    | `set_network_group_description` | Yes | Set group description |
    | `delete_network_group_description` | No | Delete group description |
    | `set_network_group_network` | Yes | Add IPv4 network in CIDR (e.g., 10.0.0.0/24) |
    | `delete_network_group_network` | Yes | Remove IPv4 network |

    **IPv6 Network Group Operations:**

    | Operation | Value Required | Description |
    |-----------|----------------|-------------|
    | `set_ipv6_network_group` | No | Create IPv6 network group |
    | `delete_ipv6_network_group` | No | Delete IPv6 network group |
    | `set_ipv6_network_group_description` | Yes | Set group description |
    | `delete_ipv6_network_group_description` | No | Delete group description |
    | `set_ipv6_network_group_network` | Yes | Add IPv6 network in CIDR |
    | `delete_ipv6_network_group_network` | Yes | Remove IPv6 network |

    **Port Group Operations:**

    | Operation | Value Required | Description |
    |-----------|----------------|-------------|
    | `set_port_group` | No | Create port group |
    | `delete_port_group` | No | Delete port group |
    | `set_port_group_description` | Yes | Set group description |
    | `delete_port_group_description` | No | Delete group description |
    | `set_port_group_port` | Yes | Add port (number, range, or name: 80, 8000-8100, http) |
    | `delete_port_group_port` | Yes | Remove port |

    **Interface Group Operations:**

    | Operation | Value Required | Description |
    |-----------|----------------|-------------|
    | `set_interface_group` | No | Create interface group |
    | `delete_interface_group` | No | Delete interface group |
    | `set_interface_group_description` | Yes | Set group description |
    | `delete_interface_group_description` | No | Delete group description |
    | `set_interface_group_interface` | Yes | Add interface name (e.g., eth0, eth1.100) |
    | `delete_interface_group_interface` | Yes | Remove interface name |

    **MAC Group Operations:**

    | Operation | Value Required | Description |
    |-----------|----------------|-------------|
    | `set_mac_group` | No | Create MAC address group |
    | `delete_mac_group` | No | Delete MAC address group |
    | `set_mac_group_description` | Yes | Set group description |
    | `delete_mac_group_description` | No | Delete group description |
    | `set_mac_group_mac` | Yes | Add MAC address (e.g., 00:11:22:33:44:55) |
    | `delete_mac_group_mac` | Yes | Remove MAC address |

    **Domain Group Operations (VyOS 1.5+ only):**

    | Operation | Value Required | Description |
    |-----------|----------------|-------------|
    | `set_domain_group` | No | Create domain name group |
    | `delete_domain_group` | No | Delete domain name group |
    | `set_domain_group_description` | Yes | Set group description |
    | `delete_domain_group_description` | No | Delete group description |
    | `set_domain_group_address` | Yes | Add domain name (e.g., example.com) |
    | `delete_domain_group_address` | Yes | Remove domain name |

    **Remote Group Operations (VyOS 1.5+ only):**

    | Operation | Value Required | Description |
    |-----------|----------------|-------------|
    | `set_remote_group` | No | Create remote address group |
    | `delete_remote_group` | No | Delete remote address group |
    | `set_remote_group_description` | Yes | Set group description |
    | `delete_remote_group_description` | No | Delete group description |
    | `set_remote_group_url` | Yes | Set URL for remote address list (http/https) |
    | `delete_remote_group_url` | No | Delete URL from remote group |

    **Example:**
    ```json
    {
        "group_name": "INTERNAL_NETS",
        "operations": [
            {"op": "set_network_group"},
            {"op": "set_network_group_description", "value": "Internal networks"},
            {"op": "set_network_group_network", "value": "10.0.0.0/8"},
            {"op": "set_network_group_network", "value": "192.168.0.0/16"}
        ]
    }
    ```
    """
    # Check user has WRITE permission for firewall groups (modifying configuration)
    await require_write_permission(http_request, FeatureGroup.FIREWALL_GROUPS)

    try:
        request.group_name = _normalize_group_name_or_400(request.group_name)
        _validate_group_batch_consistency_or_400(request.group_name, request.operations)
        service = get_session_vyos_service(http_request)
        batch = service.create_firewall_groups_batch()

        # Process each operation
        for operation in request.operations:
            op_type = operation.op
            value = _validate_group_operation_value_or_400(
                request.group_name,
                op_type,
                operation.value,
            )

            if not op_type:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid operation: {operation}. Must have 'op' key"
                )

            # Map operation to batch method - Address Group
            if op_type == "set_address_group":
                batch.set_address_group(request.group_name)
            elif op_type == "delete_address_group":
                batch.delete_address_group(request.group_name)
            elif op_type == "set_address_group_description":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_address_group_description(request.group_name, value)
            elif op_type == "delete_address_group_description":
                batch.delete_address_group_description(request.group_name)
            elif op_type == "set_address_group_address":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_address_group_address(request.group_name, value)
            elif op_type == "delete_address_group_address":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_address_group_address(request.group_name, value)
            elif op_type == "set_address_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_address_group_include(request.group_name, value)
            elif op_type == "delete_address_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_address_group_include(request.group_name, value)

            # IPv6 Address Group
            elif op_type == "set_ipv6_address_group":
                batch.set_ipv6_address_group(request.group_name)
            elif op_type == "delete_ipv6_address_group":
                batch.delete_ipv6_address_group(request.group_name)
            elif op_type == "set_ipv6_address_group_description":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_ipv6_address_group_description(request.group_name, value)
            elif op_type == "delete_ipv6_address_group_description":
                batch.delete_ipv6_address_group_description(request.group_name)
            elif op_type == "set_ipv6_address_group_address":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_ipv6_address_group_address(request.group_name, value)
            elif op_type == "delete_ipv6_address_group_address":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_ipv6_address_group_address(request.group_name, value)
            elif op_type == "set_ipv6_address_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_ipv6_address_group_include(request.group_name, value)
            elif op_type == "delete_ipv6_address_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_ipv6_address_group_include(request.group_name, value)

            # Network Group
            elif op_type == "set_network_group":
                batch.set_network_group(request.group_name)
            elif op_type == "delete_network_group":
                batch.delete_network_group(request.group_name)
            elif op_type == "set_network_group_description":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_network_group_description(request.group_name, value)
            elif op_type == "delete_network_group_description":
                batch.delete_network_group_description(request.group_name)
            elif op_type == "set_network_group_network":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_network_group_network(request.group_name, value)
            elif op_type == "delete_network_group_network":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_network_group_network(request.group_name, value)
            elif op_type == "set_network_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_network_group_include(request.group_name, value)
            elif op_type == "delete_network_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_network_group_include(request.group_name, value)

            # IPv6 Network Group
            elif op_type == "set_ipv6_network_group":
                batch.set_ipv6_network_group(request.group_name)
            elif op_type == "delete_ipv6_network_group":
                batch.delete_ipv6_network_group(request.group_name)
            elif op_type == "set_ipv6_network_group_description":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_ipv6_network_group_description(request.group_name, value)
            elif op_type == "delete_ipv6_network_group_description":
                batch.delete_ipv6_network_group_description(request.group_name)
            elif op_type == "set_ipv6_network_group_network":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_ipv6_network_group_network(request.group_name, value)
            elif op_type == "delete_ipv6_network_group_network":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_ipv6_network_group_network(request.group_name, value)
            elif op_type == "set_ipv6_network_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_ipv6_network_group_include(request.group_name, value)
            elif op_type == "delete_ipv6_network_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_ipv6_network_group_include(request.group_name, value)

            # Port Group
            elif op_type == "set_port_group":
                batch.set_port_group(request.group_name)
            elif op_type == "delete_port_group":
                batch.delete_port_group(request.group_name)
            elif op_type == "set_port_group_description":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_port_group_description(request.group_name, value)
            elif op_type == "delete_port_group_description":
                batch.delete_port_group_description(request.group_name)
            elif op_type == "set_port_group_port":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_port_group_port(request.group_name, value)
            elif op_type == "delete_port_group_port":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_port_group_port(request.group_name, value)
            elif op_type == "set_port_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_port_group_include(request.group_name, value)
            elif op_type == "delete_port_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_port_group_include(request.group_name, value)

            # Interface Group
            elif op_type == "set_interface_group":
                batch.set_interface_group(request.group_name)
            elif op_type == "delete_interface_group":
                batch.delete_interface_group(request.group_name)
            elif op_type == "set_interface_group_description":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_interface_group_description(request.group_name, value)
            elif op_type == "delete_interface_group_description":
                batch.delete_interface_group_description(request.group_name)
            elif op_type == "set_interface_group_interface":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_interface_group_interface(request.group_name, value)
            elif op_type == "delete_interface_group_interface":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_interface_group_interface(request.group_name, value)
            elif op_type == "set_interface_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_interface_group_include(request.group_name, value)
            elif op_type == "delete_interface_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_interface_group_include(request.group_name, value)

            # MAC Group
            elif op_type == "set_mac_group":
                batch.set_mac_group(request.group_name)
            elif op_type == "delete_mac_group":
                batch.delete_mac_group(request.group_name)
            elif op_type == "set_mac_group_description":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_mac_group_description(request.group_name, value)
            elif op_type == "delete_mac_group_description":
                batch.delete_mac_group_description(request.group_name)
            elif op_type == "set_mac_group_mac":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_mac_group_mac(request.group_name, value)
            elif op_type == "delete_mac_group_mac":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_mac_group_mac(request.group_name, value)
            elif op_type == "set_mac_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_mac_group_include(request.group_name, value)
            elif op_type == "delete_mac_group_include":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_mac_group_include(request.group_name, value)

            # Domain Group (VyOS 1.5+ only)
            elif op_type == "set_domain_group":
                batch.set_domain_group(request.group_name)
            elif op_type == "delete_domain_group":
                batch.delete_domain_group(request.group_name)
            elif op_type == "set_domain_group_description":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_domain_group_description(request.group_name, value)
            elif op_type == "delete_domain_group_description":
                batch.delete_domain_group_description(request.group_name)
            elif op_type == "set_domain_group_address":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_domain_group_address(request.group_name, value)
            elif op_type == "delete_domain_group_address":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_domain_group_address(request.group_name, value)

            # Remote Group
            elif op_type == "set_remote_group":
                batch.set_remote_group(request.group_name)
            elif op_type == "delete_remote_group":
                batch.delete_remote_group(request.group_name)
            elif op_type == "set_remote_group_description":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_remote_group_description(request.group_name, value)
            elif op_type == "delete_remote_group_description":
                batch.delete_remote_group_description(request.group_name)
            elif op_type == "set_remote_group_url":
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.set_remote_group_url(request.group_name, value)
            elif op_type == "delete_remote_group_url":
                # URL value is required for deletion
                if not value:
                    raise HTTPException(status_code=400, detail=f"{op_type} requires a value")
                batch.delete_remote_group_url(request.group_name, value)

            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported operation: {op_type}"
                )

        # Execute the batch
        response = service.execute_batch(batch)

        # Handle empty string result (convert to None for Pydantic validation)
        result_data = response.result
        if result_data == '' or result_data is None:
            result_data = None
        elif not isinstance(result_data, dict):
            # If it's not a dict and not empty, wrap it
            result_data = {"result": result_data}

        return VyOSResponse(
            success=response.status == 200,
            data=result_data,
            error=response.error if response.error else None
        )

    except HTTPException:
        raise
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
