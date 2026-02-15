"""System flow-accounting configuration router.

Exposes scoped read/batch operations for `system flow-accounting`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_flow_accounting = build_config_tree_router(
    tree_path=["system", "flow-accounting"],
    endpoint_slug="system-flow-accounting",
    tag="system-flow-accounting",
    display_name="System flow accounting",
    feature_group=FeatureGroup.SYSTEM,
    response_key="flow_accounting",
)

