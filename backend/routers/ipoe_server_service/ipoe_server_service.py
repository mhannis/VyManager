"""IPoE server service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="ipoe-server",
    endpoint_slug="service-ipoe-server",
    tag="service-ipoe-server",
    display_name="IPoE server service",
    feature_group=FeatureGroup.SYSTEM,
)
