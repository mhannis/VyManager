"""VPN PPTP wrapper router."""

from rbac_permissions import FeatureGroup
from routers._vpn_wrapper import build_vpn_router


router = build_vpn_router(
    vpn_name="pptp",
    endpoint_slug="vpn-pptp",
    tag="vpn-pptp",
    display_name="VPN PPTP",
    feature_group=FeatureGroup.VPN,
)

