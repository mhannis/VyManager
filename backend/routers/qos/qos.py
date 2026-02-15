"""QoS configuration wrapper router."""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["qos"],
    endpoint_slug="qos",
    tag="qos",
    display_name="QoS",
    feature_group=FeatureGroup.NETWORK,
    response_key="qos",
)

