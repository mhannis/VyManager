"""High availability configuration wrapper router."""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["high-availability"],
    endpoint_slug="high-availability",
    tag="high-availability",
    display_name="High Availability",
    feature_group=FeatureGroup.NETWORK,
    response_key="high_availability",
)
