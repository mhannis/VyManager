"""NTP service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="ntp",
    endpoint_slug="service-ntp",
    tag="service-ntp",
    display_name="NTP service",
    feature_group=FeatureGroup.SYSTEM,
)
