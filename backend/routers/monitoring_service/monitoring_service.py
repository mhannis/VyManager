"""Monitoring service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="monitoring",
    endpoint_slug="service-monitoring",
    tag="service-monitoring",
    display_name="Monitoring service",
    feature_group=FeatureGroup.SYSTEM,
)
