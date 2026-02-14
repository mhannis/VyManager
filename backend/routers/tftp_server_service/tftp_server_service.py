"""TFTP server service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="tftp-server",
    endpoint_slug="service-tftp-server",
    tag="service-tftp-server",
    display_name="TFTP server service",
    feature_group=FeatureGroup.SYSTEM,
)
