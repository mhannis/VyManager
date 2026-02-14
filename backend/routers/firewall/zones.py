"""
Firewall Zones Router

API endpoints for viewing and managing VyOS zone-based firewall configuration.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
import re

from session_vyos_service import get_session_vyos_service
from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup


router = APIRouter(prefix="/vyos/firewall/zones", tags=["firewall-zones"])


# Stub functions for backwards compatibility with app.py
# These are no longer used since we use session-based services

def set_device_registry(registry):
    """Legacy function - no longer used."""
    pass



def set_configured_device_name(name):
    """Legacy function - no longer used."""
    pass


class ZoneFromPolicy(BaseModel):
    firewall: Dict[str, str] = Field(default_factory=dict)


class FirewallZone(BaseModel):
    name: str
    description: Optional[str] = None
    default_action: Optional[str] = Field(default=None, alias="default-action")
    interfaces: List[str] = Field(default_factory=list)
    from_policies: Dict[str, ZoneFromPolicy] = Field(default_factory=dict, alias="from")

    class Config:
        populate_by_name = True


class ZonesConfigResponse(BaseModel):
    zones: Dict[str, FirewallZone] = Field(default_factory=dict)


class ZonePolicyEntry(BaseModel):
    from_zone: str
    to_zone: str
    firewall_ruleset: str
    default_action: Optional[str] = None


class ZonePolicyUpdate(BaseModel):
    from_zone: str
    firewall_ruleset: str


class ZoneUpsertRequest(BaseModel):
    description: Optional[str] = None
    default_action: Optional[str] = None
    interfaces: List[str] = Field(default_factory=list)
    from_policies: List[ZonePolicyUpdate] = Field(default_factory=list)


class ZoneOperationResponse(BaseModel):
    success: bool
    zone: str
    message: str


RE_ZONE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$")
RE_INTERFACE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,62}$")
RE_FIREWALL_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$")


# ========================================================================
# Helpers
# ========================================================================


def _extract_show_output(result: Any) -> str:
    if isinstance(result, dict):
        data = result.get("data", "")
        return data if isinstance(data, str) else str(data or "")
    if isinstance(result, str):
        return result
    return str(result or "")



def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}



def _as_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None



def _extract_tag_values(value: Any) -> List[str]:
    if isinstance(value, dict):
        return sorted([str(key).strip() for key in value.keys() if str(key).strip()])
    if isinstance(value, list):
        return sorted([str(item).strip() for item in value if str(item).strip()])
    if isinstance(value, str):
        stripped = value.strip()
        return [stripped] if stripped else []
    return []



def _normalize_zone_name_or_400(name: str, label: str = "Zone name") -> str:
    clean = name.strip()
    if not clean:
        raise HTTPException(status_code=400, detail=f"{label} is required")
    if not RE_ZONE_NAME.match(clean):
        raise HTTPException(
            status_code=400,
            detail=f"{label} '{clean}' is invalid. Use letters, numbers, dash, underscore.",
        )
    return clean



def _normalize_interface_name_or_400(name: str) -> str:
    clean = name.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Interface name cannot be empty")
    if not RE_INTERFACE_NAME.match(clean):
        raise HTTPException(status_code=400, detail=f"Invalid interface name: {clean}")
    return clean



def _normalize_firewall_name_or_400(name: str) -> str:
    clean = name.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Firewall ruleset name cannot be empty")
    if not RE_FIREWALL_NAME.match(clean):
        raise HTTPException(status_code=400, detail=f"Invalid firewall ruleset name: {clean}")
    return clean



def _parse_zone(name: str, raw_zone_data: Any) -> FirewallZone:
    zone_data = _as_dict(raw_zone_data)
    from_root = _as_dict(zone_data.get("from"))

    parsed_from: Dict[str, ZoneFromPolicy] = {}
    for from_zone, policy_data in sorted(from_root.items(), key=lambda item: str(item[0])):
        policy = _as_dict(policy_data)
        firewall = _as_dict(policy.get("firewall"))
        firewall_name = _as_string(firewall.get("name"))
        if firewall_name:
            parsed_from[str(from_zone)] = ZoneFromPolicy(firewall={"name": firewall_name})

    return FirewallZone(
        name=name,
        description=_as_string(zone_data.get("description")),
        **{"default-action": _as_string(zone_data.get("default-action"))},
        interfaces=_extract_tag_values(zone_data.get("interface")),
        **{"from": parsed_from},
    )



def _extract_zones_config(full_config: Dict[str, Any]) -> Dict[str, FirewallZone]:
    firewall_root = _as_dict(full_config.get("firewall"))
    zones_root = _as_dict(firewall_root.get("zone"))

    parsed: Dict[str, FirewallZone] = {}
    for zone_name, zone_data in sorted(zones_root.items(), key=lambda item: str(item[0])):
        name_text = str(zone_name).strip()
        if not name_text:
            continue
        parsed[name_text] = _parse_zone(name_text, zone_data)

    return parsed


async def _run_configure_or_500(service: Any, operations: List[Dict[str, Any]]) -> None:
    if not operations:
        return

    response = await run_in_threadpool(service.apply_operations, operations)
    if response.status == 200:
        return

    error_message = response.error or _extract_show_output(response.result) or "Unknown error"
    raise HTTPException(status_code=500, detail=f"VyOS rejected zone configuration: {error_message}")


# ========================================================================
# Read Endpoints
# ========================================================================


@router.get("/config", response_model=ZonesConfigResponse)
async def get_zones_config(request: Request, refresh: bool = False) -> ZonesConfigResponse:
    """Get complete zone-based firewall configuration."""
    await require_read_permission(request, FeatureGroup.FIREWALL_ZONES)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return ZonesConfigResponse(zones=_extract_zones_config(full_config))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving firewall zones config: {str(exc)}")


@router.get("/policies", response_model=List[ZonePolicyEntry])
async def get_zone_policies(request: Request, refresh: bool = False) -> List[ZonePolicyEntry]:
    """Get flattened zone policy table (from-zone -> to-zone)."""
    config = await get_zones_config(request, refresh=refresh)

    policies: List[ZonePolicyEntry] = []
    for to_zone, zone in sorted(config.zones.items(), key=lambda item: item[0]):
        for from_zone, policy in sorted(zone.from_policies.items(), key=lambda item: item[0]):
            firewall_name = policy.firewall.get("name") if isinstance(policy.firewall, dict) else None
            if not firewall_name:
                continue
            policies.append(
                ZonePolicyEntry(
                    from_zone=from_zone,
                    to_zone=to_zone,
                    firewall_ruleset=firewall_name,
                    default_action=zone.default_action,
                )
            )

    return policies


# ========================================================================
# Write Endpoints
# ========================================================================


@router.put("/zone/{zone_name}", response_model=ZoneOperationResponse)
async def upsert_zone(request: Request, zone_name: str, body: ZoneUpsertRequest) -> ZoneOperationResponse:
    """
    Create or update a firewall zone and replace interface/from-policy assignments.

    This endpoint uses replace semantics for `interfaces` and `from_policies`.
    """
    await require_write_permission(request, FeatureGroup.FIREWALL_ZONES)

    zone = _normalize_zone_name_or_400(zone_name)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        existing_zones = _extract_zones_config(full_config)
        existing_zone = existing_zones.get(zone)

        operations: List[Dict[str, Any]] = []

        description = (body.description or "").strip()
        if description:
            operations.append(
                {
                    "op": "set",
                    "path": ["firewall", "zone", zone, "description", description],
                }
            )
        elif existing_zone and existing_zone.description:
            operations.append(
                {
                    "op": "delete",
                    "path": ["firewall", "zone", zone, "description"],
                }
            )

        default_action = (body.default_action or "").strip().lower()
        if default_action:
            if default_action not in {"accept", "drop", "reject"}:
                raise HTTPException(status_code=400, detail="default_action must be accept, drop, or reject")
            operations.append(
                {
                    "op": "set",
                    "path": ["firewall", "zone", zone, "default-action", default_action],
                }
            )
        elif existing_zone is None:
            # Keep behavior predictable for newly created zones.
            operations.append(
                {
                    "op": "set",
                    "path": ["firewall", "zone", zone, "default-action", "drop"],
                }
            )
        elif existing_zone.default_action:
            operations.append(
                {
                    "op": "delete",
                    "path": ["firewall", "zone", zone, "default-action"],
                }
            )

        # Replace interfaces
        if existing_zone and existing_zone.interfaces:
            operations.append(
                {
                    "op": "delete",
                    "path": ["firewall", "zone", zone, "interface"],
                }
            )

        normalized_interfaces: List[str] = []
        seen_interfaces = set()
        for iface in body.interfaces:
            iface_name = _normalize_interface_name_or_400(iface)
            if iface_name in seen_interfaces:
                continue
            seen_interfaces.add(iface_name)
            normalized_interfaces.append(iface_name)
            operations.append(
                {
                    "op": "set",
                    "path": ["firewall", "zone", zone, "interface", iface_name],
                }
            )

        # Replace from policies
        if existing_zone and existing_zone.from_policies:
            operations.append(
                {
                    "op": "delete",
                    "path": ["firewall", "zone", zone, "from"],
                }
            )

        seen_from_zones = set()
        for policy in body.from_policies:
            from_zone = _normalize_zone_name_or_400(policy.from_zone, label="From-zone name")
            if from_zone == zone:
                raise HTTPException(status_code=400, detail="from_zone cannot match to_zone")
            if from_zone in seen_from_zones:
                raise HTTPException(status_code=400, detail=f"Duplicate from policy for zone: {from_zone}")
            seen_from_zones.add(from_zone)

            firewall_name = _normalize_firewall_name_or_400(policy.firewall_ruleset)
            operations.append(
                {
                    "op": "set",
                    "path": [
                        "firewall",
                        "zone",
                        zone,
                        "from",
                        from_zone,
                        "firewall",
                        "name",
                        firewall_name,
                    ],
                }
            )

        # If no-op update, return success and skip configure call.
        if not operations:
            return ZoneOperationResponse(success=True, zone=zone, message="No changes requested")

        await _run_configure_or_500(service, operations)
        await run_in_threadpool(service.refresh_config)

        return ZoneOperationResponse(success=True, zone=zone, message="Zone configuration updated")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating firewall zone: {str(exc)}")


@router.delete("/zone/{zone_name}", response_model=ZoneOperationResponse)
async def delete_zone(request: Request, zone_name: str) -> ZoneOperationResponse:
    """Delete a firewall zone."""
    await require_write_permission(request, FeatureGroup.FIREWALL_ZONES)

    zone = _normalize_zone_name_or_400(zone_name)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        existing_zones = _extract_zones_config(full_config)

        if zone not in existing_zones:
            raise HTTPException(status_code=404, detail=f"Firewall zone '{zone}' not found")

        await _run_configure_or_500(
            service,
            [{"op": "delete", "path": ["firewall", "zone", zone]}],
        )
        await run_in_threadpool(service.refresh_config)

        return ZoneOperationResponse(success=True, zone=zone, message="Zone deleted")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error deleting firewall zone: {str(exc)}")


@router.delete("/zone/{zone_name}/from/{from_zone}", response_model=ZoneOperationResponse)
async def delete_zone_from_policy(request: Request, zone_name: str, from_zone: str) -> ZoneOperationResponse:
    """Delete one from-zone policy mapping from a zone."""
    await require_write_permission(request, FeatureGroup.FIREWALL_ZONES)

    zone = _normalize_zone_name_or_400(zone_name)
    source_zone = _normalize_zone_name_or_400(from_zone, label="From-zone name")

    try:
        service = get_session_vyos_service(request)
        await _run_configure_or_500(
            service,
            [
                {
                    "op": "delete",
                    "path": ["firewall", "zone", zone, "from", source_zone],
                }
            ],
        )
        await run_in_threadpool(service.refresh_config)

        return ZoneOperationResponse(
            success=True,
            zone=zone,
            message=f"Removed from-zone policy: {source_zone} -> {zone}",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error deleting zone policy mapping: {str(exc)}")
