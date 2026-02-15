"""System proxy configuration router.

Exposes scoped read/batch operations for `system proxy`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_proxy = build_config_tree_router(
    tree_path=["system", "proxy"],
    endpoint_slug="system-proxy",
    tag="system-proxy",
    display_name="System proxy",
    feature_group=FeatureGroup.SYSTEM,
    response_key="proxy",
)

