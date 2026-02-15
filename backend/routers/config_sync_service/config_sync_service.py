"""Config sync service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="config-sync",
    endpoint_slug="service-config-sync",
    tag="service-config-sync",
    display_name="Config sync service",
    feature_group=FeatureGroup.SYSTEM,
)

