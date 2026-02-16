"""System LCD configuration router.

Exposes scoped read/batch operations for `system lcd`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_lcd = build_config_tree_router(
    tree_path=["system", "lcd"],
    endpoint_slug="system-lcd",
    tag="system-lcd",
    display_name="System LCD",
    feature_group=FeatureGroup.SYSTEM,
    response_key="lcd",
)
