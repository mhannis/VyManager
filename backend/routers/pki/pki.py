"""PKI configuration wrapper router."""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["pki"],
    endpoint_slug="pki",
    tag="pki",
    display_name="PKI",
    feature_group=FeatureGroup.SYSTEM,
    response_key="pki",
)
