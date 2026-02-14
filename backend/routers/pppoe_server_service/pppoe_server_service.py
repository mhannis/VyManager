"""PPPoE server service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="pppoe-server",
    endpoint_slug="service-pppoe-server",
    tag="service-pppoe-server",
    display_name="PPPoE server service",
    feature_group=FeatureGroup.SYSTEM,
)
