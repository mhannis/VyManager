"""System sFlow configuration router.

Exposes scoped read/batch operations for `system sflow`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_sflow = build_config_tree_router(
    tree_path=["system", "sflow"],
    endpoint_slug="system-sflow",
    tag="system-sflow",
    display_name="System sFlow",
    feature_group=FeatureGroup.SYSTEM,
    response_key="sflow",
)
