feature_id: parity-phase0-foundation
status: in_progress
title: Parity Program Phase 0 Foundation (Driver + Safe Apply + Coverage Matrix)
branch: feature/containers-automation-v1
commits:
  - working-tree-not-committed
notes:
  - Added `safe_apply.py` with emulated commit-confirm (snapshot/apply/probe/rollback) for risky config paths.
  - Added `VyOSService.apply_operations(...)` and routed batch/config write flows through it.
  - Added `vyos_driver.py` thin wrapper around `VyOSService` to preserve contracts while unifying integration surface.
  - Added `get_session_vyos_driver(request)` with per-instance driver cache in `session_vyos_service.py`.
  - Replaced direct router writes to `device.configure_multiple_op` with `service.apply_operations` in system/containers/ipsec/zones routers.
  - Generated docs-driven inventory:
    - `CONFIG_COVERAGE_MATRIX.md`
    - `CONFIG_COVERAGE_MATRIX.json`
  - Added `VYOS_INTEGRATION_DISCOVERY.md` documenting current integration and Phase 0 architecture.
  - Added/updated backend tests; targeted suite currently passes.
