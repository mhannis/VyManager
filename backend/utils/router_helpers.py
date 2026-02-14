"""
Router helper utilities shared across multiple policy/config routers.
"""

from fastapi import HTTPException, Request

from fastapi_permissions import require_read_permission
from rbac_permissions import FeatureGroup
from session_vyos_service import get_session_vyos_service


async def load_vyos_capabilities(
    request: Request,
    feature_group: FeatureGroup,
    builder_cls,
):
    """
    Load version-aware feature capabilities for a router endpoint.

    This standardizes the common capabilities flow:
      permission check -> service lookup -> builder init -> response enrichment.
    """
    await require_read_permission(request, feature_group)

    try:
        service = get_session_vyos_service(request)
        version = service.get_version()
        builder = builder_cls(version=version)
        capabilities = builder.get_capabilities()

        if hasattr(request.state, "instance") and request.state.instance:
            capabilities["instance_name"] = request.state.instance.get("name")
            capabilities["instance_id"] = request.state.instance.get("id")
        return capabilities
    except HTTPException:
      raise
    except Exception as exc:
      raise HTTPException(status_code=500, detail=str(exc))
