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
- Frontend app: `frontend/src/app/*`
- Frontend API proxy: `frontend/src/app/api/vyos/[...path]/route.ts`
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
- Frontend lint has warning debt; `0 errors` is required.
- Protocol cadence: complete **3-5 protocol backlog items per run** before reporting.

## Current Objective
- Continue Phase 3 parity execution on `protocols` domain.
- Deliver protocol slices in batches while keeping runtime stable.

## Current Feature Spec
Feature: **Protocols batch slice (Static + Failover + MPLS + OpenFabric + RPKI)**

Acceptance criteria:
- Add backend routers for Static/Failover/MPLS/OpenFabric/RPKI with:
  - `GET /capabilities`
  - `GET /config`
  - `POST /batch`
- Expose frontend protocol editors/pages in Routing UI for same 5 protocols.
- Regenerate matrix/backlog and reduce protocols uncovered count by this batch.
- Run backend tests + frontend typecheck/build/lint/runtime checks.
- Reviewer sign-off.

Assumptions:
- Batch operations are command-string based (`operations: string[]`) and executed via `service.configure_batch(...)`.
- Command-driven protocol UIs are acceptable MVP for parity slicing speed.

## Work In Progress
- Branch: `feature/containers-automation-v1`
- New commits in this cycle:
  - `cc385d6` (previous protocols batch backend)
  - `c19143a` (previous protocols batch full slice)
- Working tree is dirty with unrelated pre-existing files outside this slice.

### Files Touched This Cycle (slice-owned)
- Backend:
  - `backend/routers/static/static.py`
  - `backend/routers/failover/failover.py`
  - `backend/routers/mpls/mpls.py`
  - `backend/routers/openfabric/openfabric.py`
  - `backend/routers/rpki/rpki.py`
  - `backend/app.py`
  - `backend/tests/test_protocol_capabilities.py`
- Frontend:
  - `frontend/src/components/routing/FailoverContent.tsx`
  - `frontend/src/components/routing/MplsContent.tsx`
  - `frontend/src/components/routing/OpenfabricContent.tsx`
  - `frontend/src/components/routing/RpkiContent.tsx`
  - `frontend/src/components/routing/StaticProtocolContent.tsx`
  - `frontend/src/app/routing/unicast-protocols/page.tsx`
  - `frontend/src/app/routing/unicast-protocols/openfabric/page.tsx`
  - `frontend/src/app/routing/unicast-protocols/static/page.tsx`
  - `frontend/src/app/routing/infrastructure/page.tsx`
  - `frontend/src/app/routing/infrastructure/mpls/page.tsx`
  - `frontend/src/app/routing/infrastructure/rpki/page.tsx`
  - `frontend/src/app/routing/static-failover/page.tsx`
  - `frontend/src/app/routing/static-failover/failover/page.tsx`
  - `frontend/src/lib/api/failover.ts`
  - `frontend/src/lib/api/mpls.ts`
  - `frontend/src/lib/api/openfabric.ts`
  - `frontend/src/lib/api/rpki.ts`
  - `frontend/src/lib/api/static-protocol.ts`
- Generated artifacts:
  - `CONFIG_COVERAGE_MATRIX.md/.json`
  - `CONFIG_COVERAGE_PHASE1.md/.json`
  - `PARITY_BACKLOG.md/.json`

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_protocol_capabilities.py` -> pass (`30 passed`)
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_policy_capabilities.py tests/test_safe_apply.py tests/test_vyos_driver_wrapper.py tests/test_vyos_service_safe_apply.py tests/test_ethernet_vlan_batch_ops.py tests/test_system_services_ssh_dns.py tests/test_containers_automation_v1.py tests/test_app.py` -> pass (`31 passed`)
- `cd frontend && npx tsc --noEmit --pretty false` -> pass
- `cd frontend && npm run -s lint` -> pass (`0 errors`, warnings only)
- `cd frontend && npm run -s build` -> pass
- `cd frontend && npm run -s smoke:runtime` -> pass
- `python3 scripts/generate_config_coverage_matrix.py && python3 scripts/generate_phase1_backlog.py` -> pass
- Reviewer pass: `APPROVED`.

### Backlog Delta
- `protocols` domain moved from:
  - implemented `5`, partial `5`, not_started `8`
- to:
  - implemented `10`, partial `5`, not_started `3`

## Risks / Open Questions
- Frontend lint warning debt remains high outside this slice.
- Protocol UIs are command-driven MVPs; richer form-based editors are still needed.

## TODO Backlog (next protocol queue)
- Remaining protocols not started: `protocols index`, `pim`, `pim6`.
- Remaining partial protocols: `babel`, `bfd`, `bgp`, `multicast`, `segment-routing`.

## Agent Handoff Notes
- Protocol batch endpoints use prefix validation + operation count/length guards.
- Frontend protocol cards use shared `ProtocolCommandContent` to reduce repeated page logic.
- `/routing/static-failover` now redirects based on permissions (Static Routes first, then Failover).
- Keep protocol batch cadence at 3-5 items per run until protocols breadth is 0.
