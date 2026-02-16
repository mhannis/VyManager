"""
Segment Routing Protocol Router

Thin API wrappers for VyOS Segment Routing configuration.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


router = APIRouter(prefix="/vyos/segment-routing", tags=["segment-routing"])


class SegmentRoutingCapabilitiesResponse(BaseModel):
    protocol: str
    version: str
    config_path: List[str] = Field(default_factory=list)
    features: Dict[str, bool] = Field(default_factory=dict)
    instance_name: Optional[str] = None
    instance_id: Optional[str] = None


class SegmentRoutingConfigResponse(BaseModel):
    segment_routing: Dict[str, Any] = Field(default_factory=dict)


class SegmentRoutingBatchRequest(BaseModel):
    operations: List[str] = Field(default_factory=list)


class VyOSResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


def _validate_operations(operations: List[str]) -> None:
    if len(operations) > 200:
        raise HTTPException(status_code=400, detail="Too many operations in a single request")

    allowed_roots = (
        "set protocols isis segment-routing",
        "delete protocols isis segment-routing",
        "set protocols ospf segment-routing",
        "delete protocols ospf segment-routing",
        "set protocols ospf parameters opaque-lsa",
        "delete protocols ospf parameters opaque-lsa",
    )

    for command in operations:
        cleaned = command.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Operations must not contain empty commands")
        if len(cleaned) > 512:
            raise HTTPException(status_code=400, detail="Operation command exceeds maximum length")

        if not any(cleaned == root or cleaned.startswith(f"{root} ") for root in allowed_roots):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Segment Routing batch only allows commands under "
                    "'protocols isis segment-routing', "
                    "'protocols ospf segment-routing', and "
                    "'protocols ospf parameters opaque-lsa'"
                ),
            )


@router.get("/capabilities", response_model=SegmentRoutingCapabilitiesResponse)
async def get_segment_routing_capabilities(request: Request):
    await require_read_permission(request, FeatureGroup.SEGMENT_ROUTING)

    try:
        service = get_session_vyos_service(request)
        capabilities = SegmentRoutingCapabilitiesResponse(
            protocol="segment-routing",
            version=service.get_version(),
            config_path=["protocols", "isis", "segment-routing"],
            features={
                "supports_batch": True,
                "supports_config_read": True,
                "supports_ospf_opaque_lsa": True,
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


@router.get("/config", response_model=SegmentRoutingConfigResponse)
async def get_segment_routing_config(request: Request, refresh: bool = False):
    await require_read_permission(request, FeatureGroup.SEGMENT_ROUTING)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        protocols = full_config.get("protocols", {})
        ospf = protocols.get("ospf", {})
        isis = protocols.get("isis", {})
        segment_routing = {
            "isis": {
                "segment-routing": isis.get("segment-routing", {}),
            },
            "ospf": {
                "segment-routing": ospf.get("segment-routing", {}),
                "parameters": ospf.get("parameters", {}),
            },
        }
        return SegmentRoutingConfigResponse(segment_routing=segment_routing)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/batch", response_model=VyOSResponse)
async def segment_routing_batch_configure(request: Request, body: SegmentRoutingBatchRequest):
    await require_write_permission(request, FeatureGroup.SEGMENT_ROUTING)

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

