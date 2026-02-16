"""System task scheduler configuration router.

Exposes scoped read/batch operations for `system task-scheduler`.
"""

from routers._config_tree_wrapper import build_config_tree_router
from rbac_permissions import FeatureGroup


system_task_scheduler = build_config_tree_router(
    tree_path=["system", "task-scheduler"],
    endpoint_slug="system-task-scheduler",
    tag="system-task-scheduler",
    display_name="System task scheduler",
    feature_group=FeatureGroup.SYSTEM,
    response_key="task_scheduler",
)
