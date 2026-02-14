"""VPN SSTP wrapper router."""

from rbac_permissions import FeatureGroup
from routers._vpn_wrapper import build_vpn_router


router = build_vpn_router(
    vpn_name="sstp",
    endpoint_slug="vpn-sstp",
    tag="vpn-sstp",
    display_name="VPN SSTP",
    feature_group=FeatureGroup.VPN,
)

