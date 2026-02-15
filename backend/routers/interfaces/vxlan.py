"""VXLAN interface configuration router.

Exposes scoped read/batch operations for `interfaces vxlan`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "vxlan"],
    endpoint_slug="vxlan-interface",
    tag="vxlan-interface",
    display_name="VXLAN interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="vxlan",
)
