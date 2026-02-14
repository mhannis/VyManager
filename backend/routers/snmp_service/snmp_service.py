"""SNMP service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="snmp",
    endpoint_slug="service-snmp",
    tag="service-snmp",
    display_name="SNMP service",
    feature_group=FeatureGroup.SYSTEM,
)
