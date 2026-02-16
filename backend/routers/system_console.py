"""System console configuration router.

Exposes scoped read/batch operations for `system console`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_console = build_config_tree_router(
    tree_path=["system", "console"],
    endpoint_slug="system-console",
    tag="system-console",
    display_name="System console",
    feature_group=FeatureGroup.SYSTEM,
    response_key="console",
)

