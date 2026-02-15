"""MACsec interface configuration router.

Exposes scoped read/batch operations for `interfaces macsec`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "macsec"],
    endpoint_slug="macsec",
    tag="macsec-interface",
    display_name="MACsec interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="macsec",
)

