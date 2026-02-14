"""Console server service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="console-server",
    endpoint_slug="service-console-server",
    tag="service-console-server",
    display_name="Console server service",
    feature_group=FeatureGroup.SYSTEM,
)
