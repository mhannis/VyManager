"""
Firewall Flowtables Router

API endpoints for managing VyOS firewall flowtables.
Flowtables enable fast-path packet processing by offloading established connections.
"""

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from session_vyos_service import get_session_vyos_service
from vyos_builders.firewall import FlowtablesBatchBuilder
from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup
import re

router = APIRouter(prefix="/vyos/firewall/flowtables", tags=["firewall-flowtables"])


# ============================================================================
# Request/Response Models
# ============================================================================


class FlowtableBatchOperation(BaseModel):
    """Single operation in a batch request."""
    op: str = Field(..., description="Operation name")
    value: Optional[str] = Field(None, description="Operation value")


class FlowtableBatchRequest(BaseModel):
    """Model for batch flowtable configuration."""
    flowtable_name: str = Field(..., description="Flowtable name")
    operations: List[FlowtableBatchOperation] = Field(
        ..., description="List of operations to perform"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "flowtable_name": "FT_LAN",
                "operations": [
                    {"op": "set_flowtable"},
                    {"op": "set_flowtable_description", "value": "LAN flowtable"},
                    {"op": "set_flowtable_interface", "value": "eth0"},
                    {"op": "set_flowtable_interface", "value": "eth1"},
                    {"op": "set_flowtable_offload", "value": "software"},
                ]
            }
        }


class VyOSResponse(BaseModel):
    """Standard response from VyOS operations."""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class Flowtable(BaseModel):
    """Flowtable configuration."""
    name: str
    description: Optional[str] = None
    interfaces: List[str] = []
    offload: Optional[str] = None  # "hardware" or "software"


class FlowtablesConfigResponse(BaseModel):
    """Response containing all flowtables."""
    flowtables: List[Flowtable] = []
    total: int = 0


RE_FLOWTABLE_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,62}$")
RE_INTERFACE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,62}$")
ALLOWED_OFFLOAD_TYPES = {"hardware", "software"}
ALLOWED_BATCH_OPERATIONS = {
    "set_flowtable",
    "delete_flowtable",
    "set_flowtable_description",
    "delete_flowtable_description",
    "set_flowtable_interface",
    "delete_flowtable_interface",
    "set_flowtable_offload",
    "delete_flowtable_offload",
}
OPS_REQUIRING_VALUE = {
    "set_flowtable_description",
    "set_flowtable_interface",
    "delete_flowtable_interface",
    "set_flowtable_offload",
}


def _normalize_flowtable_name_or_400(name: str) -> str:
    clean = name.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Flowtable name is required")
    if not RE_FLOWTABLE_NAME.match(clean):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid flowtable name '{clean}'. Use letters, numbers, dash, underscore.",
        )
    return clean


def _normalize_interface_name_or_400(name: str) -> str:
    clean = name.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Interface name cannot be empty")
    if not RE_INTERFACE_NAME.match(clean):
        raise HTTPException(status_code=400, detail=f"Invalid interface name: {clean}")
    return clean


def _validate_operation_or_400(operation: FlowtableBatchOperation) -> None:
    if operation.op not in ALLOWED_BATCH_OPERATIONS:
        raise HTTPException(status_code=400, detail=f"Unknown operation: {operation.op}")

    if operation.op in OPS_REQUIRING_VALUE:
        if operation.value is None or not operation.value.strip():
            raise HTTPException(status_code=400, detail=f"Operation {operation.op} requires a value")

    if operation.op == "set_flowtable_offload" and operation.value is not None:
        offload = operation.value.strip().lower()
        if offload not in ALLOWED_OFFLOAD_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid offload type '{operation.value}'. Allowed values: hardware, software",
            )

    if operation.op in {"set_flowtable_interface", "delete_flowtable_interface"} and operation.value is not None:
        _normalize_interface_name_or_400(operation.value)


def _validate_batch_consistency_or_400(batch_request: FlowtableBatchRequest) -> None:
    if not batch_request.operations:
        raise HTTPException(status_code=400, detail="At least one operation is required")

    seen_set_interfaces = set()
    offload_values = set()

    for operation in batch_request.operations:
        _validate_operation_or_400(operation)
        normalized_value = operation.value.strip() if operation.value is not None else ""

        if operation.op == "set_flowtable_description" and normalized_value and len(normalized_value) > 512:
            raise HTTPException(status_code=400, detail="Description must be <= 512 characters")

        if operation.op == "set_flowtable_interface" and normalized_value:
            interface_name = _normalize_interface_name_or_400(normalized_value).lower()
            if interface_name in seen_set_interfaces:
                raise HTTPException(
                    status_code=400,
                    detail=f"Duplicate interface in batch: {normalized_value}",
                )
            seen_set_interfaces.add(interface_name)

        if operation.op == "set_flowtable_offload" and normalized_value:
            offload_values.add(normalized_value.lower())

    if len(offload_values) > 1:
        raise HTTPException(
            status_code=400,
            detail="Conflicting offload values in one batch request",
        )


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/capabilities")
async def get_flowtables_capabilities(request: Request):
    """
    Get flowtables capabilities based on device VyOS version.

    Returns feature flags indicating supported operations.

    Requires READ permission on FIREWALL_FLOWTABLES feature.
    """
    await require_read_permission(request, FeatureGroup.FIREWALL_FLOWTABLES)

    try:
        service = get_session_vyos_service(request)
        version = service.get_version()
        builder = FlowtablesBatchBuilder(version=version)
        capabilities = builder.get_capabilities()

        # Add instance info
        if hasattr(request.state, "instance") and request.state.instance:
            capabilities["instance_name"] = request.state.instance.get("name")
            capabilities["instance_id"] = request.state.instance.get("id")

        return capabilities
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config", response_model=FlowtablesConfigResponse)
async def get_flowtables_config(request: Request, refresh: bool = False):
    """
    Get all flowtable configurations from VyOS.

    Args:
        request: FastAPI request object (contains active session)
        refresh: If True, force refresh from VyOS. If False, use cache if available.

    Returns:
        Configuration details for all flowtables

    Requires READ permission on FIREWALL_FLOWTABLES feature.
    """
    await require_read_permission(request, FeatureGroup.FIREWALL_FLOWTABLES)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)

        if not full_config:
            return FlowtablesConfigResponse(flowtables=[], total=0)

        # Parse flowtables from firewall config
        firewall_config = full_config.get("firewall", {})
        flowtable_config = firewall_config.get("flowtable", {})

        flowtables = []
        if flowtable_config and isinstance(flowtable_config, dict):
            for name, data in flowtable_config.items():
                if not isinstance(data, dict):
                    continue

                # Parse interfaces
                interfaces = []
                if "interface" in data:
                    interface_data = data["interface"]
                    if isinstance(interface_data, dict):
                        interfaces = list(interface_data.keys())
                    elif isinstance(interface_data, list):
                        interfaces = interface_data
                    elif isinstance(interface_data, str):
                        interfaces = [interface_data]

                # Parse offload type
                offload = None
                if "offload" in data:
                    offload_data = data["offload"]
                    if isinstance(offload_data, str):
                        offload = offload_data
                    elif isinstance(offload_data, dict):
                        # Could be {"software": {}} or {"hardware": {}}
                        offload = list(offload_data.keys())[0] if offload_data else None

                flowtables.append(Flowtable(
                    name=name,
                    description=data.get("description"),
                    interfaces=interfaces,
                    offload=offload,
                ))

        return FlowtablesConfigResponse(
            flowtables=flowtables,
            total=len(flowtables),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch", response_model=VyOSResponse)
async def batch_configure_flowtable(request: Request, batch_request: FlowtableBatchRequest):
    """
    Execute batch flowtable operations.

    This endpoint allows configuring flowtables through a series of operations.
    All operations are executed in a single transaction.

    Args:
        request: FastAPI request object
        batch_request: Batch request containing flowtable name and operations

    Returns:
        VyOSResponse with success/failure information

    Requires WRITE permission on FIREWALL_FLOWTABLES feature.
    """
    await require_write_permission(request, FeatureGroup.FIREWALL_FLOWTABLES)

    try:
        import inspect
        import logging

        logger = logging.getLogger(__name__)

        service = get_session_vyos_service(request)
        version = service.get_version()
        flowtable_name = _normalize_flowtable_name_or_400(batch_request.flowtable_name)
        _validate_batch_consistency_or_400(batch_request)

        # Create flowtables batch builder
        batch = FlowtablesBatchBuilder(version=version)

        # Map operations to batch builder methods
        for operation in batch_request.operations:
            op_name = operation.op
            op_value = operation.value
            if op_value is not None:
                op_value = op_value.strip()
                if op_name == "set_flowtable_offload":
                    op_value = op_value.lower()

            logger.info(f"Processing operation: {op_name} with value: {op_value}")

            # Get the method from batch builder
            if not hasattr(batch, op_name):
                raise HTTPException(status_code=400, detail=f"Unknown operation: {op_name}")
            method = getattr(batch, op_name)

            # Inspect method signature to determine parameters
            sig = inspect.signature(method)
            params = list(sig.parameters.keys())

            # Remove 'self' from params list
            if 'self' in params:
                params.remove('self')

            # Call the method with appropriate parameters
            try:
                if len(params) == 0:
                    method()
                elif len(params) == 1:
                    # Method takes one parameter (flowtable name)
                    method(flowtable_name)
                elif len(params) == 2:
                    # Method takes two parameters (flowtable name, value)
                    if op_value is None:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Operation {op_name} requires a value"
                        )
                    method(flowtable_name, op_value)
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unsupported operation signature for {op_name}"
                    )
            except TypeError as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Error calling operation {op_name}: {str(e)}"
                )

        # Execute the batch
        if batch.is_empty():
            return VyOSResponse(success=True, data={"message": "No operations to execute"})

        response = await run_in_threadpool(service.execute_batch, batch)

        if response.status != 200:
            return VyOSResponse(
                success=False,
                error=response.error or "Batch operation failed"
            )

        # Handle empty string or non-dict results from VyOS API
        result_data = response.result if isinstance(response.result, dict) else None
        return VyOSResponse(success=True, data=result_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{flowtable_name}", response_model=VyOSResponse)
async def delete_flowtable(request: Request, flowtable_name: str):
    """
    Delete a flowtable.

    Args:
        request: FastAPI request object
        flowtable_name: Name of the flowtable to delete

    Returns:
        VyOSResponse with success/failure information

    Requires WRITE permission on FIREWALL_FLOWTABLES feature.
    """
    await require_write_permission(request, FeatureGroup.FIREWALL_FLOWTABLES)

    try:
        flowtable = _normalize_flowtable_name_or_400(flowtable_name)
        service = get_session_vyos_service(request)
        version = service.get_version()

        batch = FlowtablesBatchBuilder(version=version)
        batch.delete_flowtable(flowtable)

        response = await run_in_threadpool(service.execute_batch, batch)

        if response.status != 200:
            return VyOSResponse(
                success=False,
                error=response.error or "Failed to delete flowtable"
            )

        return VyOSResponse(success=True)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
