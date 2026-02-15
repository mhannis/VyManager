"""L2TPv3 interface configuration router.

Exposes scoped read/batch operations for `interfaces l2tpv3`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "l2tpv3"],
    endpoint_slug="l2tpv3",
    tag="l2tpv3-interface",
    display_name="L2TPv3 interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="l2tpv3",
)

