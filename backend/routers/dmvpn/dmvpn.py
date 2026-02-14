"""DMVPN configuration router."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


router = APIRouter(prefix="/vyos/vpn-dmvpn", tags=["vpn-dmvpn"])


class DmvpnCapabilitiesResponse(BaseModel):
    protocol: str
    version: str
    config_path: List[str] = Field(default_factory=list)
    features: Dict[str, bool] = Field(default_factory=dict)
    instance_name: Optional[str] = None
    instance_id: Optional[str] = None


class DmvpnConfigResponse(BaseModel):
    interfaces_tunnel: Dict[str, Any] = Field(default_factory=dict)
    nhrp_tunnel: Dict[str, Any] = Field(default_factory=dict)
    ipsec: Dict[str, Any] = Field(default_factory=dict)


class DmvpnBatchRequest(BaseModel):
    operations: List[str] = Field(default_factory=list)


class VyOSResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


ALLOWED_ROOTS = (
    "set interfaces tunnel",
    "delete interfaces tunnel",
    "set protocols nhrp",
    "delete protocols nhrp",
    "set vpn ipsec profile",
    "delete vpn ipsec profile",
    "set vpn ipsec ike-group",
    "delete vpn ipsec ike-group",
    "set vpn ipsec esp-group",
    "delete vpn ipsec esp-group",
    "set vpn ipsec interface",
    "delete vpn ipsec interface",
)


def validate_operations(operations: List[str]) -> None:
    if len(operations) > 300:
        raise HTTPException(status_code=400, detail="Too many operations in a single request")

    for command in operations:
        cleaned = command.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Operations must not contain empty commands")
        if len(cleaned) > 768:
            raise HTTPException(status_code=400, detail="Operation command exceeds maximum length")
        if not any(cleaned == root or cleaned.startswith(f"{root} ") for root in ALLOWED_ROOTS):
            raise HTTPException(
                status_code=400,
                detail="DMVPN batch only allows tunnel, NHRP, and related IPsec profile commands",
            )


@router.get("/capabilities", response_model=DmvpnCapabilitiesResponse)
async def get_capabilities(request: Request):
    await require_read_permission(request, FeatureGroup.VPN)

    try:
        service = get_session_vyos_service(request)
        capabilities = DmvpnCapabilitiesResponse(
            protocol="dmvpn",
            version=service.get_version(),
            config_path=["interfaces", "tunnel"],
            features={
                "supports_batch": True,
                "supports_tunnel_interface": True,
                "supports_nhrp": True,
                "supports_ipsec_profile_binding": True,
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


@router.get("/config", response_model=DmvpnConfigResponse)
async def get_config(request: Request, refresh: bool = False):
    await require_read_permission(request, FeatureGroup.VPN)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        return DmvpnConfigResponse(
            interfaces_tunnel=full_config.get("interfaces", {}).get("tunnel", {}) or {},
            nhrp_tunnel=full_config.get("protocols", {}).get("nhrp", {}).get("tunnel", {}) or {},
            ipsec=full_config.get("vpn", {}).get("ipsec", {}) or {},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/batch", response_model=VyOSResponse)
async def batch_configure(request: Request, body: DmvpnBatchRequest):
    await require_write_permission(request, FeatureGroup.VPN)

    if not body.operations:
        raise HTTPException(status_code=400, detail="No operations provided")
    validate_operations(body.operations)

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

