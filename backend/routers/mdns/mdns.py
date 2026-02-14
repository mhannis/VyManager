"""mDNS service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="mdns",
    endpoint_slug="service-mdns",
    tag="service-mdns",
    display_name="mDNS repeater service",
    feature_group=FeatureGroup.SYSTEM,
)
