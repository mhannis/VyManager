"""LLDP service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="lldp",
    endpoint_slug="service-lldp",
    tag="service-lldp",
    display_name="LLDP service",
    feature_group=FeatureGroup.SYSTEM,
)
