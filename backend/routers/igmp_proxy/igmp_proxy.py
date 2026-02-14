"""
IGMP Proxy Protocol Router

Thin API wrappers for VyOS IGMP proxy protocol configuration.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


router = APIRouter(prefix="/vyos/igmp-proxy", tags=["igmp-proxy"])


class IgmpProxyCapabilitiesResponse(BaseModel):
    protocol: str
    version: str
    config_path: List[str] = Field(default_factory=list)
    features: Dict[str, bool] = Field(default_factory=dict)
    instance_name: Optional[str] = None
    instance_id: Optional[str] = None


class IgmpProxyConfigResponse(BaseModel):
    igmp_proxy: Dict[str, Any] = Field(default_factory=dict)


class IgmpProxyBatchRequest(BaseModel):
    operations: List[str] = Field(default_factory=list)


class VyOSResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


@router.get("/capabilities", response_model=IgmpProxyCapabilitiesResponse)
async def get_igmp_proxy_capabilities(request: Request):
    await require_read_permission(request, FeatureGroup.IGMP_PROXY)

    try:
        service = get_session_vyos_service(request)
        capabilities = IgmpProxyCapabilitiesResponse(
            protocol="igmp-proxy",
            version=service.get_version(),
            config_path=["protocols", "igmp-proxy"],
            features={
                "supports_batch": True,
                "supports_config_read": True,
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


@router.get("/config", response_model=IgmpProxyConfigResponse)
async def get_igmp_proxy_config(request: Request, refresh: bool = False):
    await require_read_permission(request, FeatureGroup.IGMP_PROXY)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        igmp_proxy_config = full_config.get("protocols", {}).get("igmp-proxy", {})
        return IgmpProxyConfigResponse(igmp_proxy=igmp_proxy_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/batch", response_model=VyOSResponse)
async def igmp_proxy_batch_configure(request: Request, body: IgmpProxyBatchRequest):
    await require_write_permission(request, FeatureGroup.IGMP_PROXY)

    if not body.operations:
        raise HTTPException(status_code=400, detail="No operations provided")

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
