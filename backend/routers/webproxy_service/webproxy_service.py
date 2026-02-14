"""Webproxy service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="webproxy",
    endpoint_slug="service-webproxy",
    tag="service-webproxy",
    display_name="Webproxy service",
    feature_group=FeatureGroup.SYSTEM,
)
