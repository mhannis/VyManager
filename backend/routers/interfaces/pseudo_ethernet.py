"""Pseudo-Ethernet (MACVLAN) interface configuration router.

Exposes scoped read/batch operations for `interfaces pseudo-ethernet`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "pseudo-ethernet"],
    endpoint_slug="pseudo-ethernet",
    tag="pseudo-ethernet-interface",
    display_name="Pseudo-Ethernet interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="pseudo_ethernet",
)
