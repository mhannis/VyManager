"""VPN L2TP wrapper router."""

from rbac_permissions import FeatureGroup
from routers._vpn_wrapper import build_vpn_router


router = build_vpn_router(
    vpn_name="l2tp",
    endpoint_slug="vpn-l2tp",
    tag="vpn-l2tp",
    display_name="VPN L2TP",
    feature_group=FeatureGroup.VPN,
)
