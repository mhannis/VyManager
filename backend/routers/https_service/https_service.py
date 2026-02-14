"""HTTPS service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="https",
    endpoint_slug="service-https",
    tag="service-https",
    display_name="HTTPS service",
    feature_group=FeatureGroup.SYSTEM,
)
