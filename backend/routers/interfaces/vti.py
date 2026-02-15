"""VTI interface configuration router.

Exposes scoped read/batch operations for `interfaces vti`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "vti"],
    endpoint_slug="vti-interface",
    tag="vti-interface",
    display_name="VTI interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="vti",
)
