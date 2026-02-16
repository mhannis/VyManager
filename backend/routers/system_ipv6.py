"""System IPv6 options router.

Exposes scoped read/batch operations for `system ipv6`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_ipv6 = build_config_tree_router(
    tree_path=["system", "ipv6"],
    endpoint_slug="system-ipv6",
    tag="system-ipv6",
    display_name="System IPv6",
    feature_group=FeatureGroup.SYSTEM,
    response_key="ipv6",
)
