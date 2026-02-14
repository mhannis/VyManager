"""Conntrack sync service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="conntrack-sync",
    endpoint_slug="service-conntrack-sync",
    tag="service-conntrack-sync",
    display_name="Conntrack sync service",
    feature_group=FeatureGroup.SYSTEM,
)
