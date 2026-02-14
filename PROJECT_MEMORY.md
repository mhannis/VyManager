# PROJECT_MEMORY.md

Last updated: 2026-02-14
Repo: https://github.com/mhannis/VyManager/tree/dev

## Repo Facts

### Stack
- Frontend: Next.js App Router, React, TypeScript, Tailwind/shadcn, Prisma, better-auth
- Backend: FastAPI (Python), asyncpg, pytest/pytest-asyncio
- VyOS integration: vendored `pyvyos` in `backend/pyvyos/*`

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
- Coverage crawl: `python3 scripts/generate_config_coverage_matrix.py`
- Phase1 classifier/backlog: `python3 scripts/generate_phase1_backlog.py`

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
- tmux server can disappear in this environment; recreate both sessions before runtime verification.

## Architecture Notes
- Frontend app: `frontend/src/app/*`
- Frontend proxy: `frontend/src/app/api/vyos/[...path]/route.ts`
- Backend entry: `backend/app.py`
- Session/auth middleware: `backend/middleware/auth.py`, `backend/middleware/session.py`
- Session service accessors:
  - `get_session_vyos_service(request)`
  - `get_session_vyos_driver(request)`
- Safe write path: `VyOSService.apply_operations(...)`
- Safe Apply workflow: `backend/safe_apply.py`

## Conventions
- Thin wrappers around existing backend services; preserve API contracts.
- Prefer additive edits; do not rewrite working backend layers.
- Ship in small slices with tests and memory updates.
- Frontend lint has warning debt; `0 errors` is enforced.
- Protocols execution cadence: complete **3-5 protocol backlog items per run** before the next report.

## Current Objective
- Continue autonomous parity execution against `https://docs.vyos.io/en/latest/configuration/`.
- Phase 1 + Phase 2 infra is complete.
- Policy domain is now marked complete in the parity backlog.
- Next active implementation domain: `protocols`.

## Current Feature Spec
Feature: **Policy Domain Completion + Capability Endpoint Standardization**

Acceptance criteria:
- Remaining policy capability endpoints use shared loader abstraction.
- Policy docs index/examples are represented in GUI.
- Policy domain has no uncovered items in `PARITY_BACKLOG.md`.
- Regression tests cover all policy BGP list capability endpoints.

Assumptions:
- Policy index/examples are documentation-oriented and considered complete with frontend representation.
- Existing policy CRUD pages remain authoritative for configuration operations.

## Work In Progress
- Branch: `feature/containers-automation-v1`
- Working tree: dirty (contains unrelated pre-existing edits not touched this cycle)

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_policy_capabilities.py tests/test_safe_apply.py tests/test_vyos_driver_wrapper.py tests/test_vyos_service_safe_apply.py tests/test_ethernet_vlan_batch_ops.py tests/test_system_services_ssh_dns.py tests/test_containers_automation_v1.py` -> pass (`30 passed`)
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_app.py` -> pass (`1 passed`)
- `cd frontend && npx tsc --noEmit --pretty false` -> pass
- `cd frontend && npm run -s build` -> pass
- `cd frontend && npm run -s lint` -> pass (`0 errors`, warnings only)
- `cd frontend && npm run -s smoke:runtime` -> pass
- `python3 scripts/generate_config_coverage_matrix.py` -> pass
- `python3 scripts/generate_phase1_backlog.py` -> pass

### Key Implementation Notes (Latest)
- Standardized remaining policy BGP capability endpoints to shared helper:
  - `backend/routers/as_path_list/as_path_list.py`
  - `backend/routers/community_list/community_list.py`
  - `backend/routers/extcommunity_list/extcommunity_list.py`
  - `backend/routers/large_community_list/large_community_list.py`
- Expanded capability regression tests:
  - `backend/tests/test_policy_capabilities.py`
- Added policy docs representation pages:
  - `frontend/src/app/policies/page.tsx`
  - `frontend/src/app/policies/examples/page.tsx`
  - `frontend/src/components/layout/Sidebar.tsx` (Overview + Examples links)
- Improved docs crawler alias handling for irregular pluralization:
  - `scripts/generate_config_coverage_matrix.py` (`policy <-> policies`, `service <-> services`)
- Updated generated parity artifacts:
  - `CONFIG_COVERAGE_MATRIX.md/.json`
  - `CONFIG_COVERAGE_PHASE1.md/.json`
  - `PARITY_BACKLOG.md/.json`
- Current backlog state: policy moved to completed; protocols is top-priority remaining domain.

## Risks / Open Questions
- Playwright browser smoke remains blocked on host dependency (`libnspr4.so`).
- Large existing lint warning debt still present outside this slice.

## TODO Backlog (Short)
- Execute next vertical slice: protocols (`protocols` domain has highest risk+breadth now).
- Start with foundational protocol pages: static, OSPF, BGP, IGMP proxy scaffolding + backend contracts.
- Add domain-level parity verification notes (GUI action -> expected CLI -> operational check).

## Agent Handoff Notes
- Use `backend/utils/router_helpers.py::load_vyos_capabilities` for all capability endpoints.
- Keep policy docs pages as conceptual coverage for docs index/examples.
- Use `PARITY_BACKLOG.md` as active execution queue.
- Always re-establish `vm-api` and `vm-ui` sessions before runtime verification if tmux server resets.
