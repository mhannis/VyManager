"""Load balancing configuration wrapper router."""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["load-balancing"],
    endpoint_slug="load-balancing",
    tag="load-balancing",
    display_name="Load Balancing",
    feature_group=FeatureGroup.LOAD_BALANCING,
    response_key="load_balancing",
)
