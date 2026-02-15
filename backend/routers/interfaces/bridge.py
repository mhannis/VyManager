"""Bridge interface configuration router.

Exposes scoped read/batch operations for `interfaces bridge`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "bridge"],
    endpoint_slug="bridge",
    tag="bridge-interface",
    display_name="Bridge interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="bridge",
)

