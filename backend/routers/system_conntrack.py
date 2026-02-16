"""System conntrack configuration router.

Exposes scoped read/batch operations for `system conntrack`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_conntrack = build_config_tree_router(
    tree_path=["system", "conntrack"],
    endpoint_slug="system-conntrack",
    tag="system-conntrack",
    display_name="System conntrack",
    feature_group=FeatureGroup.SYSTEM,
    response_key="conntrack",
)

