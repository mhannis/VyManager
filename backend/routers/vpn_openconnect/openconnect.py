"""VPN OpenConnect wrapper router."""

from rbac_permissions import FeatureGroup
from routers._vpn_wrapper import build_vpn_router


router = build_vpn_router(
    vpn_name="openconnect",
    endpoint_slug="vpn-openconnect",
    tag="vpn-openconnect",
    display_name="VPN OpenConnect",
    feature_group=FeatureGroup.VPN,
)

