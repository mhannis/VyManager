"""SSH service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="ssh",
    endpoint_slug="service-ssh",
    tag="service-ssh",
    display_name="SSH service",
    feature_group=FeatureGroup.SYSTEM,
)
