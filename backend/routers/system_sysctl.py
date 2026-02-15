"""System sysctl configuration router.

Exposes scoped read/batch operations for `system sysctl`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_sysctl = build_config_tree_router(
    tree_path=["system", "sysctl"],
    endpoint_slug="system-sysctl",
    tag="system-sysctl",
    display_name="System sysctl",
    feature_group=FeatureGroup.SYSTEM,
    response_key="sysctl",
)

