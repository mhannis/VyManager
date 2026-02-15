"""Wireless interface configuration router.

Exposes scoped read/batch operations for:
- `interfaces wireless`
- `system wireless country-code` (required for AP mode)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


router = APIRouter(prefix="/vyos/wireless-interface", tags=["wireless-interface"])


class WirelessCapabilitiesResponse(BaseModel):
    tree: str
    version: str
    config_path: List[str] = Field(default_factory=list)
    features: Dict[str, bool] = Field(default_factory=dict)
    instance_name: Optional[str] = None
    instance_id: Optional[str] = None


class WirelessBatchRequest(BaseModel):
    operations: List[str] = Field(default_factory=list)


class WirelessConfigResponse(BaseModel):
    wireless: Dict[str, Any] = Field(default_factory=dict)
    country_code: Optional[str] = None


class VyOSResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


_ALLOWED_ROOTS = (
    "set interfaces wireless",
    "delete interfaces wireless",
    "set system wireless country-code",
    "delete system wireless country-code",
)


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _validate_operations(operations: List[str]) -> None:
    if len(operations) > 250:
        raise HTTPException(status_code=400, detail="Too many operations in a single request")

    for command in operations:
        cleaned = command.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Operations must not contain empty commands")
        if len(cleaned) > 768:
            raise HTTPException(status_code=400, detail="Operation command exceeds maximum length")
        if not any(cleaned == root or cleaned.startswith(f"{root} ") for root in _ALLOWED_ROOTS):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Wireless batch only allows commands under "
                    "'interfaces wireless' or 'system wireless country-code'"
                ),
            )


@router.get("/capabilities", response_model=WirelessCapabilitiesResponse)
async def get_capabilities(request: Request):
    await require_read_permission(request, FeatureGroup.INTERFACES)

    try:
        service = get_session_vyos_service(request)
        capabilities = WirelessCapabilitiesResponse(
            tree="interfaces wireless",
            version=service.get_version(),
            config_path=["interfaces", "wireless"],
            features={
                "supports_batch": True,
                "supports_config_read": True,
                "supports_system_country_code": True,
            },
        )

        if hasattr(request.state, "instance") and request.state.instance:
            capabilities.instance_name = request.state.instance.get("name")
            capabilities.instance_id = request.state.instance.get("id")

        return capabilities
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/config", response_model=WirelessConfigResponse)
async def get_config(request: Request, refresh: bool = False):
    await require_read_permission(request, FeatureGroup.INTERFACES)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)

        interfaces_root = _as_dict(_as_dict(full_config).get("interfaces"))
        wireless_config = _as_dict(interfaces_root.get("wireless"))

        system_root = _as_dict(_as_dict(full_config).get("system"))
        system_wireless = _as_dict(system_root.get("wireless"))
        country_code_value = system_wireless.get("country-code")
        country_code = str(country_code_value).strip() if country_code_value is not None else None
        if country_code == "":
            country_code = None

        return WirelessConfigResponse(
            wireless=wireless_config,
            country_code=country_code,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/batch", response_model=VyOSResponse)
async def batch_configure(request: Request, body: WirelessBatchRequest):
    await require_write_permission(request, FeatureGroup.INTERFACES)

    if not body.operations:
        raise HTTPException(status_code=400, detail="No operations provided")

    _validate_operations(body.operations)

    try:
        service = get_session_vyos_service(request)
        result = await run_in_threadpool(service.configure_batch, body.operations)
        return VyOSResponse(
            success=bool(result.get("success", False)),
            data=result.get("data"),
            error=result.get("error"),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
