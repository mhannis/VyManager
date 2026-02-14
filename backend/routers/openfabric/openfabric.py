"""
OpenFabric Protocol Router

Thin API wrappers for VyOS OpenFabric protocol configuration.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


router = APIRouter(prefix="/vyos/openfabric", tags=["openfabric"])


class OpenFabricCapabilitiesResponse(BaseModel):
    protocol: str
    version: str
    config_path: List[str] = Field(default_factory=list)
    features: Dict[str, bool] = Field(default_factory=dict)
    instance_name: Optional[str] = None
    instance_id: Optional[str] = None


class OpenFabricConfigResponse(BaseModel):
    openfabric: Dict[str, Any] = Field(default_factory=dict)


class OpenFabricBatchRequest(BaseModel):
    operations: List[str] = Field(default_factory=list)


class VyOSResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


def _validate_operations(operations: List[str]) -> None:
    if len(operations) > 200:
        raise HTTPException(status_code=400, detail="Too many operations in a single request")

    allowed_prefixes = (
        "set protocols openfabric ",
        "delete protocols openfabric ",
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
                detail="OpenFabric batch only allows commands under 'protocols openfabric'",
            )


@router.get("/capabilities", response_model=OpenFabricCapabilitiesResponse)
async def get_openfabric_capabilities(request: Request):
    await require_read_permission(request, FeatureGroup.OPENFABRIC)

    try:
        service = get_session_vyos_service(request)
        capabilities = OpenFabricCapabilitiesResponse(
            protocol="openfabric",
            version=service.get_version(),
            config_path=["protocols", "openfabric"],
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


@router.get("/config", response_model=OpenFabricConfigResponse)
async def get_openfabric_config(request: Request, refresh: bool = False):
    await require_read_permission(request, FeatureGroup.OPENFABRIC)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        openfabric_config = full_config.get("protocols", {}).get("openfabric", {})
        return OpenFabricConfigResponse(openfabric=openfabric_config)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/batch", response_model=VyOSResponse)
async def openfabric_batch_configure(request: Request, body: OpenFabricBatchRequest):
    await require_write_permission(request, FeatureGroup.OPENFABRIC)

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
