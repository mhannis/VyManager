"""Tunnel interface configuration router.

Exposes scoped read/batch operations for `interfaces tunnel`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "tunnel"],
    endpoint_slug="tunnel-interface",
    tag="tunnel-interface",
    display_name="Tunnel interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="tunnel",
)
