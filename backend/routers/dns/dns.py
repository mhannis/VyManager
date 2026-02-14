"""DNS service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="dns",
    endpoint_slug="service-dns",
    tag="service-dns",
    display_name="DNS forwarding",
    feature_group=FeatureGroup.SYSTEM,
)
