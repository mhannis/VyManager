"""Router advert service wrapper router."""

from rbac_permissions import FeatureGroup
from routers._service_wrapper import build_service_router


router = build_service_router(
    service_name="router-advert",
    endpoint_slug="service-router-advert",
    tag="service-router-advert",
    display_name="Router advert service",
    feature_group=FeatureGroup.SYSTEM,
)

