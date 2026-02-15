feature_id: interfaces-if-13-if-14-wireless-wwan-2026-02-15
status: in_progress
title: Interfaces parity slice: Wireless + WWAN editors
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added backend routers for `interfaces wireless` and `interfaces wwan` and wired them into `backend/app.py`.
  - Wireless backend endpoint now supports both interface subtree operations and `system wireless country-code` operations for AP-mode readiness.
  - Added form-first pages:
    - `/network/interfaces/wireless`
    - `/network/interfaces/wwan`
  - Added frontend API adapters:
    - `frontend/src/lib/api/wireless.ts`
    - `frontend/src/lib/api/wwan.ts`
  - Added interfaces nav links + sidebar entries and how-to guides for Wireless/WWAN.
  - Expanded runtime/browser smoke route sets to include both new pages.
  - Updated interface backlog statuses: `IF-13` and `IF-14` from `missing` to `partial` in backlog artifacts.
  - Validation complete:
    - `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_config_tree_wrapper_capabilities.py tests/test_service_wrapper_capabilities.py tests/test_containers_automation_v1.py` (`125 passed`)
    - `cd frontend && npx tsc --noEmit --pretty false`
    - `cd frontend && npx eslint ... --max-warnings=0` (targeted changed files)
    - `cd frontend && npm run -s build`
    - `cd frontend && npm run -s smoke:runtime`
  - Browser smoke (`npm run -s smoke:ui`) remains blocked by missing host dependency `libnspr4.so` and is recorded in `LAST_FAILURE.txt`.
  - Next queue: `IF-15` option-depth parity sweep for interface families and advanced wireless/wwan leaves.
