"""Geneve interface configuration router.

Exposes scoped read/batch operations for `interfaces geneve`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


router = build_config_tree_router(
    tree_path=["interfaces", "geneve"],
    endpoint_slug="geneve",
    tag="geneve-interface",
    display_name="Geneve interface",
    feature_group=FeatureGroup.INTERFACES,
    response_key="geneve",
)

