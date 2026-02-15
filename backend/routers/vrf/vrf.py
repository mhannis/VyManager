"""VRF configuration wrapper router."""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["vrf"],
    endpoint_slug="vrf",
    tag="vrf",
    display_name="VRF",
    feature_group=FeatureGroup.VRF,
    response_key="vrf",
)
