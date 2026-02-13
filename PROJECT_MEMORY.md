# PROJECT_MEMORY.md

Last updated: 2026-02-13

## Repo Facts

### Stack
- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Prisma, better-auth
- Backend: FastAPI (Python), asyncpg, pytest/pytest-asyncio, httpx
- VyOS integration: VyOS REST API via vendored `pyvyos` (`backend/pyvyos/*`)

### Package Managers
- Frontend: `npm` (lockfiles present in repo root + `frontend/`)
- Backend: `pip` + venv (`backend/.venv`)

### Common Commands (Local)
- Backend dev:
  - `cd backend && python3 -m uvicorn app:app --reload --host 0.0.0.0 --port 8000 --proxy-headers`
- Frontend dev:
  - `cd frontend && npm run dev`
- Backend tests:
  - `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q`
- Frontend typecheck:
  - `cd frontend && npx tsc --noEmit --pretty false`
- Frontend lint:
  - `cd frontend && npm run -s lint` (warnings exist; currently tolerated)
- Frontend build:
  - `cd frontend && npm run -s build`

### Env Vars (Not Exhaustive)
- Frontend (`frontend/.env`):
  - `BETTER_AUTH_SECRET` (must be strong in production)
  - `BACKEND_URL` (server-side API base; browser uses `/api` proxy)
  - `TRUSTED_ORIGINS`
  - `DATABASE_URL` (Prisma/better-auth)
  - `NEXT_PUBLIC_API_GET_CACHE_TTL_MS` (short-lived GET cache for page-load dedupe)
- Backend (`backend/.env`):
  - `DATABASE_URL`
  - `FRONTEND_URL`
  - Session controls: `AUTH_SESSION_INACTIVITY_TIMEOUT`, `ACTIVE_INSTANCE_INACTIVITY_TIMEOUT`, `SESSION_CLEANUP_INTERVAL`

### Ports (Typical)
- Frontend: `3000`
- Backend: `8000`
- Postgres: `5432`

### Docker/Compose
- Compose templates live in:
  - `container/vymanager-dev/env-file-docker-compose.yml`
  - `container/vymanager-prod/env-file-docker-compose.yml`

## Architecture Notes
- Frontend lives in `frontend/` and calls `/api/*` route handlers that proxy to backend `/vyos/*`.
  - Proxy route: `frontend/src/app/api/vyos/[...path]/route.ts`
- Backend lives in `backend/` (FastAPI app: `backend/app.py`).
- Auth/session model:
  - `backend/middleware/auth.py` validates better-auth session cookies against Postgres.
  - `backend/middleware/session.py` resolves the active VyOS instance and sets `request.state.instance`.
  - Feature routers call `get_session_vyos_service(request)` to get a cached `VyOSService` bound to the active instance.
- RBAC:
  - Feature groups in `backend/rbac_permissions.py`
  - Gate endpoints with `require_read_permission` / `require_write_permission`.
- VyOS integration:
  - Uses `pyvyos` REST API; primary operations are `device.show(path=[...])` and `device.configure_multiple_op(...)`.
  - Full config is fetched via `service.get_full_config()` which calls `show configuration json pretty` and caches behind a lock.

## Conventions
- Prefer additive, small increments that include: implementation + tests + docs + review notes.
- Backend tests should be run with `PYTHONPATH=.` (repo currently assumes this).
- Frontend lint currently emits warnings across the codebase; do not introduce new errors.
- Keep endpoints best-effort for `show` parsing: return structured data + `warnings[]` rather than failing hard when output formats vary.

## Current Objective
- Produce a v1 spec and implementation for an **IPsec site-to-site VPN Wizard** that configures IPsec plus required firewall/NAT rules so the tunnel passes traffic (similar spirit to the existing setup wizards).

## Current Feature Spec (DRAFT, Pending Analyst/SME)
Feature: `ipsec-s2s-wizard-v1`

### Acceptance Criteria (Target)
- Wizard can create one site-to-site IPsec tunnel end-to-end from the UI with minimal inputs.
- Wizard configures:
  - IPsec (Phase 1 + Phase 2) on VyOS
  - required firewall rules to allow IKE/ESP (and NAT-T if used)
  - any required NAT exemptions/route rules so traffic flows
- Wizard is idempotent or clearly warns before overwriting existing objects it created.
- Wizard has clear validation errors and a safe rollback path on failure (no partial config without user awareness).
- Tests cover the builder/planner logic (backend) and basic happy-path apply.

### Assumptions (Must Be Confirmed)
- v1 focuses on IPv4, IKEv2, PSK auth, one tunnel.
- Default is policy-based S2S unless Mark requests VTI (route-based).
- The wizard will create objects with a recognizable description/prefix so it can detect/re-run safely.

### Open Questions for Mark
- Policy-based vs VTI default?
- Which firewall model should wizard use in VyOS: zones-based, interface-based rulesets, or both?
- Should wizard also add static routes, or assume routes already exist?
- Multi-WAN support in v1 (no/yes)?

## Work In Progress
- Branch: `dev` (tracking `origin/dev`)
- Worktree status: clean
- Most recently shipped increment:
  - Gateway dashboard card + endpoint: commit `bfb029d` (adds `GET /vyos/show/gateway-summary` and `GatewayStatusCard`)

## TODO Backlog (Short)
- Spec gate for IPsec wizard: produce SME packet (wizard steps, VyOS config semantics, firewall/NAT expectations).
- Decide naming/prefixing strategy for wizard-created config (for idempotency/cleanup).
- Implement wizard apply endpoint(s) (backend) and UI (frontend) after spec is accepted.

## Agent Handoff Notes
- Gateway card is best-effort: route parsing varies across VyOS/FRR versions; use `warnings[]` to surface gaps.
- Backend uses session-based active instance; most endpoints fail with `{error:\"No active instance\"}` until connected.
- For fast page loads, frontend `apiClient` dedupes in-flight GET requests and caches GET responses briefly (default 4s).

