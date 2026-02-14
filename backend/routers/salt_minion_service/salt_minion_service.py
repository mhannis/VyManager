"""Salt minion service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="salt-minion",
    endpoint_slug="service-salt-minion",
    tag="service-salt-minion",
    display_name="Salt minion service",
    feature_group=FeatureGroup.SYSTEM,
)
