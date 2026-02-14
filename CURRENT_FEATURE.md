feature_id: parity-phase1-phase2-policy-foundation
status: in_progress
title: Parity Program Phase 1/2 Foundations + Policy Domain Stabilization
branch: feature/containers-automation-v1
commits:
  - f41cbfc
notes:
  - Phase 1 completed: generated coverage classification and prioritized backlog artifacts (`CONFIG_COVERAGE_PHASE1.*`, `PARITY_BACKLOG.*`).
  - Phase 2 completed: standardized policy reorder banners and prefix-list validation utilities.
  - Backend capability endpoint flow standardized via `backend/utils/router_helpers.py` and applied to access-list/prefix-list/route/route-map/local-route routers.
  - Fixed route-map/local-route capability crash caused by undefined `http_request` variable.
  - Added regression tests in `backend/tests/test_policy_capabilities.py`.
  - Runtime sessions were recreated and verified (`vm-api` on :8000, `vm-ui` on :3000).
