"""OpenVPN interface configuration router.

Exposes scoped read/batch operations for `interfaces openvpn`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "openvpn"],
    endpoint_slug="interface-openvpn",
    tag="openvpn-interface",
    display_name="OpenVPN interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="openvpn",
)

