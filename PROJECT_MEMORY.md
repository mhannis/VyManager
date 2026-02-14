# PROJECT_MEMORY.md

Last updated: 2026-02-14
Repo: https://github.com/mhannis/VyManager/tree/dev

## Repo Facts

### Stack
- Frontend: Next.js App Router, React, TypeScript, Tailwind/shadcn, Prisma, better-auth
- Backend: FastAPI (Python), asyncpg, pytest/pytest-asyncio
- VyOS integration: `backend/pyvyos/*` via `VyOSService`/`VyOSDriver`

### Package Managers
- Frontend: `npm` (`frontend/package-lock.json`)
- Backend: `pip` + venv (`backend/.venv`)

### Build / Test / Lint Commands
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

## Architecture Notes
- Frontend app routes: `frontend/src/app/*`
- Frontend API proxy: `frontend/src/app/api/vyos/[...path]/route.ts`
- Backend entry: `backend/app.py`
- Session/auth middleware: `backend/middleware/auth.py`, `backend/middleware/session.py`
- Session service accessors:
  - `get_session_vyos_service(request)`
  - `get_session_vyos_driver(request)`
- Safe write path: `VyOSService.apply_operations(...)`
- Safe Apply workflow: `backend/safe_apply.py`

## Conventions
- Thin wrappers around existing backend services; preserve current API contracts.
- Prefer additive edits; avoid broad refactors unless needed for parity velocity.
- Keep command APIs protocol-scoped and size-bounded.
- Frontend lint warning debt exists; quality gate is `0 errors`.
- Protocol execution policy from Mark: complete 3-5 protocol items per run before reporting.

## Current Objective
- Protocols domain parity is complete.
- Move to next priority domain (`services`) and execute 3-5 partial service items per slice.

## Current Feature Spec
Feature: **Protocols batch slice (PIM + PIM6 + Protocols index + BGP page + BFD page)**

Acceptance criteria:
- Add backend routers for `pim` and `pim6` with `capabilities/config/batch` endpoints.
- Add backend protocols overview endpoint (`/vyos/protocols/capabilities`, `/vyos/protocols/config`).
- Add frontend protocol pages/components for PIM/PIM6 and protocols overview.
- Add dedicated BGP/BFD routes to close protocol coverage detection gaps.
- Regenerate coverage/backlog, pass tests/checks, and secure reviewer APPROVED.

Assumptions:
- Command-driven editors remain valid MVP surfaces for fast parity execution.
- Existing dirty working tree files outside this slice remain untouched.

## Work In Progress
- Branch: `feature/containers-automation-v1`
- Working tree is dirty with unrelated pre-existing changes outside this slice.

### Files Touched This Cycle (slice-owned)
- Backend:
  - `backend/routers/pim/__init__.py`
  - `backend/routers/pim/pim.py`
  - `backend/routers/pim6/__init__.py`
  - `backend/routers/pim6/pim6.py`
  - `backend/routers/protocols/__init__.py`
  - `backend/routers/protocols/protocols.py`
  - `backend/app.py`
  - `backend/tests/test_protocol_capabilities.py`
- Frontend:
  - `frontend/src/lib/api/pim.ts`
  - `frontend/src/lib/api/pim6.ts`
  - `frontend/src/lib/api/protocols.ts`
  - `frontend/src/components/routing/PimContent.tsx`
  - `frontend/src/components/routing/Pim6Content.tsx`
  - `frontend/src/app/routing/multicast/page.tsx`
  - `frontend/src/app/routing/multicast/pim/page.tsx`
  - `frontend/src/app/routing/multicast/pim6/page.tsx`
  - `frontend/src/app/routing/protocols/page.tsx`
  - `frontend/src/app/routing/unicast-protocols/bgp/page.tsx`
  - `frontend/src/app/routing/infrastructure/bfd/page.tsx`
  - `frontend/src/components/layout/Sidebar.tsx`
- Generated artifacts:
  - `CONFIG_COVERAGE_MATRIX.md/.json`
  - `CONFIG_COVERAGE_PHASE1.md/.json`
  - `PARITY_BACKLOG.md/.json`

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_protocol_capabilities.py` -> pass (`38 passed`)
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_policy_capabilities.py tests/test_safe_apply.py tests/test_vyos_driver_wrapper.py tests/test_vyos_service_safe_apply.py tests/test_ethernet_vlan_batch_ops.py tests/test_system_services_ssh_dns.py tests/test_containers_automation_v1.py tests/test_app.py` -> pass (`31 passed`)
- `cd frontend && npx tsc --noEmit --pretty false` -> pass
- `cd frontend && npm run -s lint` -> pass (`0 errors`, warnings only)
- `cd frontend && npm run -s build` -> pass
- `cd frontend && npm run -s smoke:runtime` -> pass
- `python3 scripts/generate_config_coverage_matrix.py && python3 scripts/generate_phase1_backlog.py` -> pass
- Reviewer pass: `APPROVED` (after one fix to allow `delete protocols pim` / `delete protocols pim6` root operations)

### Backlog Delta
- `protocols` domain moved from:
  - implemented `10`, partial `5`, not_started `3`
- to:
  - implemented `18`, partial `0`, not_started `0` (domain complete)

## Risks / Open Questions
- Frontend lint warning debt remains high outside this slice.
- Services domain has 19 partial pages; prioritization within services still needed per risk/use.

## TODO Backlog (next queue)
- Next domain: `services`
- Initial target candidates (partial): `service dns`, `service ssh`, `service ntp`, `service lldp`, `service mdns`

## Agent Handoff Notes
- PIM/PIM6 batch validators now allow exact subtree delete (`delete protocols pim`, `delete protocols pim6`) while preserving prefix boundary checks.
- Added protocols overview API + `/routing/protocols` page for docs index parity and quick navigation.
- Added dedicated `/routing/unicast-protocols/bgp` and `/routing/infrastructure/bfd` pages to eliminate token-detection false partials.
- Protocols domain is now fully marked implemented in parity artifacts.
