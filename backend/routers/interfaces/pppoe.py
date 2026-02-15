"""PPPoE interface configuration router.

Exposes scoped read/batch operations for `interfaces pppoe`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "pppoe"],
    endpoint_slug="pppoe-interface",
    tag="pppoe-interface",
    display_name="PPPoE interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="pppoe",
)
