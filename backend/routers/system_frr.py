"""System FRR configuration router.

Exposes scoped read/batch operations for `system frr`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_frr = build_config_tree_router(
    tree_path=["system", "frr"],
    endpoint_slug="system-frr",
    tag="system-frr",
    display_name="System FRR",
    feature_group=FeatureGroup.SYSTEM,
    response_key="frr",
)
