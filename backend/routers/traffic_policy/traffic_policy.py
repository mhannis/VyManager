"""Traffic policy configuration wrapper router."""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["traffic-policy"],
    endpoint_slug="traffic-policy",
    tag="traffic-policy",
    display_name="Traffic Policy",
    feature_group=FeatureGroup.NETWORK,
    response_key="traffic_policy",
)
