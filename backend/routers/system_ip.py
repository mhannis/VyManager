"""System IPv4 options router.

Exposes scoped read/batch operations for `system ip`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_ip = build_config_tree_router(
    tree_path=["system", "ip"],
    endpoint_slug="system-ip",
    tag="system-ip",
    display_name="System IP",
    feature_group=FeatureGroup.SYSTEM,
    response_key="ip",
)
