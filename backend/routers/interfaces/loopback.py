"""Loopback interface configuration router.

Exposes scoped read/batch operations for `interfaces loopback`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "loopback"],
    endpoint_slug="loopback-interface",
    tag="loopback-interface",
    display_name="Loopback interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="loopback",
)
