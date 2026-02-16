"""System watchdog configuration router.

Exposes scoped read/batch operations for `system watchdog`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_watchdog = build_config_tree_router(
    tree_path=["system", "watchdog"],
    endpoint_slug="system-watchdog",
    tag="system-watchdog",
    display_name="System watchdog",
    feature_group=FeatureGroup.SYSTEM,
    response_key="watchdog",
)

