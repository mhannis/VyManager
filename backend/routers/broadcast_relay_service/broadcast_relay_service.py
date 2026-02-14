"""Broadcast relay service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="broadcast-relay",
    endpoint_slug="service-broadcast-relay",
    tag="service-broadcast-relay",
    display_name="Broadcast relay service",
    feature_group=FeatureGroup.SYSTEM,
)
