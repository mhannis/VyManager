"""System syslog configuration router.

Exposes scoped read/batch operations for `system syslog`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_syslog = build_config_tree_router(
    tree_path=["system", "syslog"],
    endpoint_slug="system-syslog",
    tag="system-syslog",
    display_name="System syslog",
    feature_group=FeatureGroup.SYSTEM,
    response_key="syslog",
)

