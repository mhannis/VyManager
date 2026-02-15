"""Bonding interface configuration router.

Exposes scoped read/batch operations for `interfaces bonding`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "bonding"],
    endpoint_slug="bonding",
    tag="bonding-interface",
    display_name="Bonding",
    feature_group=FeatureGroup.INTERFACES,
    response_key="bonding",
)

