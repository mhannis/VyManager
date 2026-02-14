"""VPN overview router."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from fastapi_permissions import require_read_permission
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


router = APIRouter(prefix="/vyos/vpn", tags=["vpn"])


class VpnCapabilitiesResponse(BaseModel):
    protocol: str
    version: str
    config_path: List[str] = Field(default_factory=list)
    features: Dict[str, bool] = Field(default_factory=dict)
    instance_name: Optional[str] = None
    instance_id: Optional[str] = None


class VpnOverviewResponse(BaseModel):
    vpn: Dict[str, Any] = Field(default_factory=dict)
    protocols: List[str] = Field(default_factory=list)


@router.get("/capabilities", response_model=VpnCapabilitiesResponse)
async def get_capabilities(request: Request):
    await require_read_permission(request, FeatureGroup.VPN)

    try:
        service = get_session_vyos_service(request)
        capabilities = VpnCapabilitiesResponse(
            protocol="vpn",
            version=service.get_version(),
            config_path=["vpn"],
            features={
                "supports_overview": True,
                "supports_form_pages": True,
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


@router.get("/overview", response_model=VpnOverviewResponse)
async def get_overview(request: Request, refresh: bool = False):
    await require_read_permission(request, FeatureGroup.VPN)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        vpn_cfg = full_config.get("vpn", {}) or {}
        protocols = sorted(vpn_cfg.keys())
        return VpnOverviewResponse(vpn=vpn_cfg, protocols=protocols)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

