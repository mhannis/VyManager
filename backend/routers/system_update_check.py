"""System update-check configuration router.

Exposes scoped read/batch operations for `system update-check`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_update_check = build_config_tree_router(
    tree_path=["system", "update-check"],
    endpoint_slug="system-update-check",
    tag="system-update-check",
    display_name="System update-check",
    feature_group=FeatureGroup.SYSTEM,
    response_key="update_check",
)

