"""SSTP client interface configuration router.

Exposes scoped read/batch operations for `interfaces sstpc`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "sstpc"],
    endpoint_slug="sstpc",
    tag="sstpc-interface",
    display_name="SSTP client interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="sstpc",
)
