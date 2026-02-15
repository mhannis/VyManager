feature_id: system-sys-04-11-13-baseline-2026-02-15
status: in_progress
title: System parity slice: Flow Accounting + Proxy + Sysctl baseline pages
branch: feature/containers-automation-v1
commits:
  - 02b87ab (interfaces loopback + pppoe)
  - pending (system flow-accounting/proxy/sysctl baseline)
notes:
  - Added backend wrappers:
    - `/vyos/system-flow-accounting/*`
    - `/vyos/system-proxy/*`
    - `/vyos/system-sysctl/*`
  - Added form-first pages:
    - `/system/flow-accounting`
    - `/system/proxy`
    - `/system/sysctl`
  - Added frontend API adapters:
    - `frontend/src/lib/api/system-flow-accounting.ts`
    - `frontend/src/lib/api/system-proxy.ts`
    - `frontend/src/lib/api/system-sysctl.ts`
  - Updated System IA:
    - Sidebar now includes Flow Accounting, Proxy, and Sysctl under System.
    - `System -> Options & Coverage` now links to those pages.
  - Added page guides for these pages and smoke route coverage updates.
  - Updated backlog statuses:
    - `SYS-04` => `partial`
    - `SYS-11` => `partial`
    - `SYS-13` => `partial`
  - Validation complete for this slice:
    - `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_config_tree_wrapper_capabilities.py tests/test_service_wrapper_capabilities.py tests/test_containers_automation_v1.py` (`140 passed`)
    - `cd frontend && npx tsc --noEmit --pretty false`
    - `cd frontend && npx eslint ... --max-warnings=0` (targeted changed TS/JS files)
    - `cd frontend && npm run -s build`
    - `cd frontend && npm run -s smoke:runtime`
  - Browser smoke (`npm run -s smoke:ui`) remains blocked by missing host dependency `libnspr4.so`.
  - Next queue:
    - Continue System missing pages: `SYS-01`, `SYS-02`, `SYS-03`.
