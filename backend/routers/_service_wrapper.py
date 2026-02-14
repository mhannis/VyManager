"""
Shared helper for service wrapper routers.

These wrappers expose command-batch oriented capabilities/config endpoints while
preserving the existing system service APIs.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


def build_service_router(
    *,
    service_name: str,
    endpoint_slug: str,
    tag: str,
    display_name: str,
    feature_group: FeatureGroup,
) -> APIRouter:
    router = APIRouter(prefix=f"/vyos/{endpoint_slug}", tags=[tag])

    class ServiceCapabilitiesResponse(BaseModel):
        service: str
        version: str
        config_path: List[str] = Field(default_factory=list)
        features: Dict[str, bool] = Field(default_factory=dict)
        instance_name: Optional[str] = None
        instance_id: Optional[str] = None

    class ServiceConfigResponse(BaseModel):
        service: Dict[str, Any] = Field(default_factory=dict)

    class ServiceBatchRequest(BaseModel):
        operations: List[str] = Field(default_factory=list)

    class VyOSResponse(BaseModel):
        success: bool
        data: Optional[Any] = None
        error: Optional[str] = None

    allowed_roots = (
        f"set service {service_name}",
        f"delete service {service_name}",
    )

    def validate_operations(operations: List[str]) -> None:
        if len(operations) > 200:
            raise HTTPException(status_code=400, detail="Too many operations in a single request")

        for command in operations:
            cleaned = command.strip()
            if not cleaned:
                raise HTTPException(status_code=400, detail="Operations must not contain empty commands")
            if len(cleaned) > 512:
                raise HTTPException(status_code=400, detail="Operation command exceeds maximum length")
            if not any(cleaned == root or cleaned.startswith(f"{root} ") for root in allowed_roots):
                raise HTTPException(
                    status_code=400,
                    detail=f"{display_name} batch only allows commands under 'service {service_name}'",
                )

    @router.get("/capabilities", response_model=ServiceCapabilitiesResponse)
    async def get_capabilities(request: Request):
        await require_read_permission(request, feature_group)

        try:
            service = get_session_vyos_service(request)
            capabilities = ServiceCapabilitiesResponse(
                service=service_name,
                version=service.get_version(),
                config_path=["service", service_name],
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

    @router.get("/config", response_model=ServiceConfigResponse)
    async def get_config(request: Request, refresh: bool = False):
        await require_read_permission(request, feature_group)

        try:
            service = get_session_vyos_service(request)
            full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
            service_config = full_config.get("service", {}).get(service_name, {})
            return ServiceConfigResponse(service=service_config)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @router.post("/batch", response_model=VyOSResponse)
    async def batch_configure(request: Request, body: ServiceBatchRequest):
        await require_write_permission(request, feature_group)

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

    return router
