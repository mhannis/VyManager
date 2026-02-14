"""Suricata service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="suricata",
    endpoint_slug="service-suricata",
    tag="service-suricata",
    display_name="Suricata service",
    feature_group=FeatureGroup.SYSTEM,
)
