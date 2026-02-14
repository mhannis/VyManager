"""Event handler service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="event-handler",
    endpoint_slug="service-event-handler",
    tag="service-event-handler",
    display_name="Event handler service",
    feature_group=FeatureGroup.SYSTEM,
)
