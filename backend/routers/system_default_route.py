"""System default-route configuration router.

Exposes scoped read/batch operations for `protocols static route 0.0.0.0/0`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_default_route = build_config_tree_router(
    tree_path=["protocols", "static", "route", "0.0.0.0/0"],
    endpoint_slug="system-default-route",
    tag="system-default-route",
    display_name="System default route",
    feature_group=FeatureGroup.SYSTEM,
    response_key="default_route",
)

