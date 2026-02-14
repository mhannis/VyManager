"""VPN RSA keys wrapper router."""

from rbac_permissions import FeatureGroup
from routers._vpn_wrapper import build_vpn_router


router = build_vpn_router(
    vpn_name="rsa-keys",
    endpoint_slug="vpn-rsa-keys",
    tag="vpn-rsa-keys",
    display_name="VPN RSA keys",
    feature_group=FeatureGroup.VPN,
)
