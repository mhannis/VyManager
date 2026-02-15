"""WWAN interface configuration router.

Exposes scoped read/batch operations for `interfaces wwan`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "wwan"],
    endpoint_slug="wwan-interface",
    tag="wwan-interface",
    display_name="WWAN interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="wwan",
)
