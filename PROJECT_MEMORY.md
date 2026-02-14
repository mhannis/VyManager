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
- Runtime smoke: `cd frontend && npm run -s smoke:runtime`
- Browser smoke (blocked by host deps): `cd frontend && npm run -s smoke:ui`
- Coverage crawl: `python3 scripts/generate_config_coverage_matrix.py`
- Phase1 backlog generation: `python3 scripts/generate_phase1_backlog.py`

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
- If tmux server disappears, recreate sessions explicitly; services are unavailable until both sessions are relaunched.

## Architecture Notes
- Frontend app: `frontend/src/app/*`
- Frontend API proxy: `frontend/src/app/api/vyos/[...path]/route.ts`
- Backend entry: `backend/app.py`
- Session/auth middleware: `backend/middleware/auth.py`, `backend/middleware/session.py`
- Session-scoped services:
  - `get_session_vyos_service(request)`
  - `get_session_vyos_driver(request)`
- Safe write path: `VyOSService.apply_operations(...)`
- Safe Apply implementation: `backend/safe_apply.py`
- Permissions:
  - route mapping: `backend/fastapi_permissions.py`
  - feature groups: `backend/rbac_permissions.py`

## Conventions
- Thin wrappers around existing backend services; preserve API contracts.
- Prefer additive edits; avoid destructive git operations.
- Small shippable increments with implementation + tests + docs + review notes.
- Frontend lint has significant warning debt; do not introduce errors.

## Current Objective
- Execute parity program Phase 1/2/3 from docs source:
  - `https://docs.vyos.io/en/latest/configuration/`
- Completed this cycle:
  - Phase 1 coverage classification + prioritized backlog
  - Phase 2 shared rule-editor abstractions for policy UI + backend capability helper
- Current next slice focus:
  - Phase 3 Policy domain hardening and remaining policy page parity gaps

## Current Feature Spec
Feature: **Parity Program Phase 1 + Phase 2 Foundations (Coverage Classification + Reusable Policy Patterns)**

Acceptance criteria:
- Coverage matrix is reclassified to `implemented|partial|not_started` with evidence file paths.
- Prioritized backlog exists using risk -> breadth -> reuse ordering.
- Shared policy reorder banner abstraction reduces duplicate UI logic.
- Shared prefix-list validation utilities are used by create/add/edit modals.
- Capability endpoint pattern is standardized with a shared helper.
- Route-map and local-route capability endpoints no longer crash due undefined request variable.
- Regression tests exist for route-map/local-route capability endpoints.

Assumptions:
- `DETECTED` from crawler still requires domain-level verification; Phase 1 status remains implementation-level, not full option parity.
- Builder capability payload schemas differ per domain; tests should assert stable keys (`version`, `features`) instead of assuming `operations`.

## Work In Progress
- Branch: `feature/containers-automation-v1`
- Working tree: dirty (includes pre-existing unrelated changes outside this cycle)
- Toolchain: node `v20.20.0`, npm `10.8.2`, python `3.12.3`

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_policy_capabilities.py tests/test_safe_apply.py tests/test_vyos_driver_wrapper.py tests/test_vyos_service_safe_apply.py tests/test_ethernet_vlan_batch_ops.py tests/test_system_services_ssh_dns.py tests/test_containers_automation_v1.py` -> pass (`26 passed`)
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_app.py` -> pass (`1 passed`)
- `cd frontend && npx tsc --noEmit --pretty false` -> pass
- `cd frontend && npm run -s build` -> pass
- `cd frontend && npm run -s lint` -> pass with warnings only (`0 errors`)
- `cd frontend && npm run -s smoke:runtime` -> pass
- `python3 scripts/generate_phase1_backlog.py` -> pass (generated 4 parity artifacts)

### Key Implementation Notes (This Cycle)
- Added backend capability helper:
  - `backend/utils/router_helpers.py`
- Refactored capabilities endpoints to shared helper:
  - `backend/routers/access_list/access_list.py`
  - `backend/routers/prefix_list/prefix_list.py`
  - `backend/routers/route/route.py`
  - `backend/routers/route_map/route_map.py`
  - `backend/routers/local_route/local_route.py`
- Fixed capability endpoint crash bugs:
  - `route-map` and `local-route` were referencing undefined `http_request`.
- Added regression tests:
  - `backend/tests/test_policy_capabilities.py`
- Added Phase 1 classifier/backlog generator:
  - `scripts/generate_phase1_backlog.py`
  - `CONFIG_COVERAGE_PHASE1.json`
  - `CONFIG_COVERAGE_PHASE1.md`
  - `PARITY_BACKLOG.json`
  - `PARITY_BACKLOG.md`
- Added Phase 2 frontend abstractions:
  - shared reorder banner: `frontend/src/components/policies/PolicyReorderBanner.tsx`
  - shared prefix-list validators: `frontend/src/components/policies/utils/prefixListValidators.ts`
- Migrated policy components to shared abstractions:
  - `frontend/src/components/policies/AccessListReorderBanner.tsx`
  - `frontend/src/components/policies/PrefixListReorderBanner.tsx`
  - `frontend/src/components/policies/RouteMapReorderBanner.tsx`
  - `frontend/src/components/policies/RouteReorderBanner.tsx`
  - `frontend/src/components/policies/LocalRouteReorderBanner.tsx`
  - `frontend/src/components/policies/AsPathListReorderBanner.tsx`
  - `frontend/src/components/policies/CommunityListReorderBanner.tsx`
  - `frontend/src/components/policies/ExtCommunityListReorderBanner.tsx`
  - `frontend/src/components/policies/LargeCommunityListReorderBanner.tsx`
  - `frontend/src/components/policies/CreatePrefixListModal.tsx`
  - `frontend/src/components/policies/AddPrefixListRuleModal.tsx`
  - `frontend/src/components/policies/EditPrefixListRuleModal.tsx`
- Runtime recovery:
  - recreated `vm-api` + `vm-ui` tmux sessions and verified listeners on ports `8000` and `3000`.

## Risks / Open Questions
- Phase1 classification remains heuristic for option-level parity.
- Playwright browser smoke is still blocked by missing host dependency (`libnspr4.so`).
- Existing frontend lint warning debt is large; only error-free gate is enforced currently.

## TODO Backlog (Short)
- Execute `PARITY_BACKLOG.md` domains in order (`policy` -> `protocols` -> `services` -> `vpn` ...).
- Expand policy domain from partial to implemented for all BGP list and examples/index pages.
- Add first protocols vertical slice (static + OSPF/BGP UI+backend parity scaffolding).
- Add domain-level verification sections (expected CLI, operational checks, GUI round-trip).

## Agent Handoff Notes
- Keep all router write paths on `service.apply_operations(...)`.
- Use `load_vyos_capabilities(...)` for capability endpoints to avoid repeated bugs.
- Reuse `PolicyReorderBanner` and `prefixListValidators` for new policy-like editors.
- Use generated artifacts as source for next slice planning:
  - `CONFIG_COVERAGE_PHASE1.json`
  - `PARITY_BACKLOG.md`
