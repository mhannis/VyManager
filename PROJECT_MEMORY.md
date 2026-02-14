# PROJECT_MEMORY.md

Last updated: 2026-02-14
Repo: https://github.com/mhannis/VyManager/tree/dev

## Repo Facts

### Stack
- Frontend: Next.js App Router, React, TypeScript, Tailwind/shadcn, Prisma, better-auth
- Backend: FastAPI (Python), asyncpg, pytest/pytest-asyncio
- VyOS integration: vendored `pyvyos` via REST API in `backend/pyvyos/*`

### Package Managers
- Frontend: `npm` (`frontend/package-lock.json`)
- Backend: `pip` + venv (`backend/.venv`)

### Canonical Commands
- Backend dev: `cd backend && python3 -m uvicorn app:app --reload --host 0.0.0.0 --port 8000 --proxy-headers`
- Frontend dev: `cd frontend && npm run dev`
- Frontend prod start: `cd frontend && npm run -s start -- --hostname 0.0.0.0 --port 3000`
- Backend tests: `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q`
- Frontend typecheck: `cd frontend && npx tsc --noEmit --pretty false`
- Frontend lint: `cd frontend && npm run -s lint`
- Frontend build: `cd frontend && npm run -s build`
- Runtime smoke (live server): `cd frontend && npm run -s smoke:runtime`
- Browser smoke (Playwright): `cd frontend && npm run -s smoke:ui`

### Env Vars (high-signal)
- Frontend: `BACKEND_URL`, `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`, `DATABASE_URL`, `NEXT_PUBLIC_API_GET_CACHE_TTL_MS`
- Backend: `DATABASE_URL`, `FRONTEND_URL`, `AUTH_SESSION_INACTIVITY_TIMEOUT`, `ACTIVE_INSTANCE_INACTIVITY_TIMEOUT`, `SESSION_CLEANUP_INTERVAL`

### Ports
- Frontend: `3000`
- Backend: `8000`
- Postgres: `5432`

### Runtime Notes
- `vm-ui` tmux session runs Next server.
- `vm-api` tmux session runs FastAPI backend.
- Crash class seen in production runtime: stale/mismatched Next build artifacts caused client manifest invariant errors despite successful compile.

## Architecture Notes
- Frontend app under `frontend/src/app/*`
- Frontend API proxy route: `frontend/src/app/api/vyos/[...path]/route.ts`
- Backend entry: `backend/app.py`
- Session/auth middleware: `backend/middleware/auth.py`, `backend/middleware/session.py`
- Session-scoped VyOS service accessor: `get_session_vyos_service(request)`
- Permissions:
  - backend route mapping: `backend/fastapi_permissions.py`
  - feature groups: `backend/rbac_permissions.py`
- VyOS operations pattern:
  - read: `device.show(path=[...])`
  - write: `device.configure_multiple_op(op_path=[...])`

## Conventions
- Small, shippable increments with implementation + tests/docs + review pass
- Prefer additive changes; avoid destructive git history operations
- Keep endpoints best-effort when parsing VyOS `show` output; return structured data + warnings where applicable
- Frontend lint has warning-only legacy debt; avoid introducing lint errors

## Current Objective
- Execute the autonomous parity program against:
  - `https://docs.vyos.io/en/latest/configuration/`
- Complete Phase 0 foundation before domain expansion:
  - document current VyOS integration
  - implement unified thin driver abstraction around `vyos_service.py`
  - enforce Safe Apply for risky config trees (emulated commit-confirm + connectivity probe + rollback)
  - generate full coverage inventory from docs crawl

## Current Feature Spec
Feature: **Parity Program Phase 0 Foundation**

Acceptance criteria:
- `VyOSDriver` exists as a thin wrapper and preserves existing service contracts.
- Existing write paths route through a centralized safe write method.
- Safe Apply protects risky trees (`interfaces`, `firewall`, `nat`, `vrf`, `policy`, `route(s)`, `protocols`, `vpn/ipsec`, `vpn/wireguard`).
- On failed post-apply probe, rollback is automatically attempted from config snapshot.
- Full docs crawl is generated into `CONFIG_COVERAGE_MATRIX.md` and `CONFIG_COVERAGE_MATRIX.json`.
- Foundation tests pass for safe apply and wrapper behavior.

Assumptions:
- VyOS HTTPS API does not provide native commit-confirm workflow in this project surface.
- Safe Apply therefore uses emulated commit-confirm semantics via snapshot/apply/probe/rollback.
- Coverage matrix status is heuristic signal and must be refined per-domain during implementation slices.

## Work In Progress
- Branch: `feature/containers-automation-v1`
- Working tree: dirty (includes pre-existing unrelated changes)
- Host toolchain: node `v20.20.0`, npm `10.8.2`, python `3.12.3`

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_safe_apply.py tests/test_vyos_driver_wrapper.py tests/test_vyos_service_safe_apply.py tests/test_ethernet_vlan_batch_ops.py tests/test_system_services_ssh_dns.py tests/test_containers_automation_v1.py` -> pass (`24 passed`)
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_app.py` -> pass (`1 passed`)
- `cd frontend && npx tsc --noEmit --pretty false` -> pass
- `cd /home/redhot/VyOS/VyManager && python3 scripts/generate_config_coverage_matrix.py` -> pass (`129 pages discovered`)

### Key Implementation Notes
- Added `backend/safe_apply.py`:
  - centralized risk detection for config operations
  - emulated commit-confirm workflow (snapshot -> apply -> probe -> rollback on failure)
  - env-driven controls: `SAFE_APPLY_*`
- Extended `backend/vyos_service.py` with `apply_operations(...)`:
  - central safe write path
  - `execute_batch()` and `configure_batch()` now route through it
  - successful writes invalidate cached full config
- Added `backend/vyos_driver.py`:
  - unified thin wrapper around `VyOSService` (preserves existing contracts)
- Updated `backend/session_vyos_service.py`:
  - added `get_session_vyos_driver(request)`
  - added driver cache keyed by instance ID
  - clear-cache functions now clear service + driver caches
- Routed direct write calls through service safe path in:
  - `backend/routers/system.py`
  - `backend/routers/containers.py`
  - `backend/routers/ipsec.py`
  - `backend/routers/firewall/zones.py`
- Added discovery documentation:
  - `VYOS_INTEGRATION_DISCOVERY.md`
- Added docs coverage generator + outputs:
  - `scripts/generate_config_coverage_matrix.py`
  - `CONFIG_COVERAGE_MATRIX.md`
  - `CONFIG_COVERAGE_MATRIX.json`
- Added backend tests for Phase 0 abstractions:
  - `backend/tests/test_safe_apply.py`
  - `backend/tests/test_vyos_driver_wrapper.py`
  - `backend/tests/test_vyos_service_safe_apply.py`

## Risks / Open Questions
- Emulated commit-confirm is the best available method in current API surface; native commit-confirm capability should be rechecked against future VyOS API docs.
- Coverage matrix is heuristic and may over-detect coverage for similarly named domains; domain-level verification remains required.
- Playwright browser smoke is still blocked by missing host dependency (`libnspr4.so`).

## TODO Backlog (Short)
- Use `CONFIG_COVERAGE_MATRIX.md` to execute domain slices in documentation order.
- Add explicit domain-level verification notes for each completed matrix section.
- Add frontend/operator visibility for Safe Apply outcomes (show rollback + probe details in UI).
- Install Playwright dependencies and enable browser smoke as a quality gate.

## Agent Handoff Notes
- Prefer `service.apply_operations(...)` for all writes to ensure safety policy is enforced.
- For new parity endpoints, consume `get_session_vyos_driver(request)` when adding new integrations; keep existing service contracts intact.
- Regenerate coverage inventory with:
  - `python3 scripts/generate_config_coverage_matrix.py`
