"""
RPKI Protocol Router

Thin API wrappers for VyOS RPKI protocol configuration.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


router = APIRouter(prefix="/vyos/rpki", tags=["rpki"])


class RPKICapabilitiesResponse(BaseModel):
    protocol: str
    version: str
    config_path: List[str] = Field(default_factory=list)
    features: Dict[str, bool] = Field(default_factory=dict)
    instance_name: Optional[str] = None
    instance_id: Optional[str] = None


class RPKIConfigResponse(BaseModel):
    rpki: Dict[str, Any] = Field(default_factory=dict)


class RPKIBatchRequest(BaseModel):
    operations: List[str] = Field(default_factory=list)


class VyOSResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


def _validate_operations(operations: List[str]) -> None:
    if len(operations) > 200:
        raise HTTPException(status_code=400, detail="Too many operations in a single request")

    allowed_prefixes = (
        "set protocols rpki ",
        "delete protocols rpki ",
    )

    for command in operations:
        cleaned = command.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Operations must not contain empty commands")
        if len(cleaned) > 512:
            raise HTTPException(status_code=400, detail="Operation command exceeds maximum length")
        if not cleaned.startswith(allowed_prefixes):
            raise HTTPException(
                status_code=400,
                detail="RPKI batch only allows commands under 'protocols rpki'",
            )


@router.get("/capabilities", response_model=RPKICapabilitiesResponse)
async def get_rpki_capabilities(request: Request):
    await require_read_permission(request, FeatureGroup.RPKI)

    try:
        service = get_session_vyos_service(request)
        capabilities = RPKICapabilitiesResponse(
            protocol="rpki",
            version=service.get_version(),
            config_path=["protocols", "rpki"],
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


@router.get("/config", response_model=RPKIConfigResponse)
async def get_rpki_config(request: Request, refresh: bool = False):
    await require_read_permission(request, FeatureGroup.RPKI)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        rpki_config = full_config.get("protocols", {}).get("rpki", {})
        return RPKIConfigResponse(rpki=rpki_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/batch", response_model=VyOSResponse)
async def rpki_batch_configure(request: Request, body: RPKIBatchRequest):
    await require_write_permission(request, FeatureGroup.RPKI)

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
