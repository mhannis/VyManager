"""
Protocols Overview Router

Provides overview data for the routing protocols index page.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from fastapi_permissions import require_read_permission
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


router = APIRouter(prefix="/vyos/protocols", tags=["protocols"])


class ProtocolsCapabilitiesResponse(BaseModel):
    protocol: str
    version: str
    config_path: List[str] = Field(default_factory=list)
    features: Dict[str, bool] = Field(default_factory=dict)
    instance_name: Optional[str] = None
    instance_id: Optional[str] = None


class ProtocolsConfigResponse(BaseModel):
    protocols: Dict[str, Any] = Field(default_factory=dict)


@router.get("/capabilities", response_model=ProtocolsCapabilitiesResponse)
async def get_protocols_capabilities(request: Request):
    await require_read_permission(request, FeatureGroup.ROUTING)

    try:
        service = get_session_vyos_service(request)
        capabilities = ProtocolsCapabilitiesResponse(
            protocol="protocols",
            version=service.get_version(),
            config_path=["protocols"],
            features={
                "supports_config_read": True,
                "supports_unicast": True,
                "supports_infrastructure": True,
                "supports_multicast": True,
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


@router.get("/config", response_model=ProtocolsConfigResponse)
async def get_protocols_config(request: Request, refresh: bool = False):
    await require_read_permission(request, FeatureGroup.ROUTING)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        protocols_config = full_config.get("protocols", {})
        return ProtocolsConfigResponse(protocols=protocols_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
