"""Virtual Ethernet (veth) interface configuration router.

Exposes scoped read/batch operations for `interfaces virtual-ethernet`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "virtual-ethernet"],
    endpoint_slug="virtual-ethernet",
    tag="virtual-ethernet-interface",
    display_name="Virtual Ethernet interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="virtual_ethernet",
)
