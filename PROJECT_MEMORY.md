# PROJECT_MEMORY.md

Last updated: 2026-02-13

Repo: https://github.com/mhannis/VyManager/tree/dev

## Repo Facts

### Stack
- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Prisma, better-auth
- Backend: FastAPI (Python), asyncpg, pytest/pytest-asyncio, httpx
- VyOS integration: VyOS REST API via vendored `pyvyos` (`backend/pyvyos/*`)

### Package Managers
- Frontend: `npm` (lockfiles present in repo root + `frontend/`)
- Backend: `pip` + venv (`backend/.venv`)

### Common Commands (Local)
- Monorepo scripts (repo root):
  - `npm run dev:backend`
  - `npm run dev:frontend`
  - `npm run lint:frontend`
  - `npm run type-check:frontend`
  - `npm run build`
- Backend dev:
  - `cd backend && python3 -m uvicorn app:app --reload --host 0.0.0.0 --port 8000 --proxy-headers`
- Frontend dev:
  - `cd frontend && npm run dev`
- Frontend start (bind to LAN):
  - `cd frontend && npm run -s build`
  - `cd frontend && npm run -s start -- --hostname 0.0.0.0 --port 3000`
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
- `vymanager-prod` uses pre-compiled `ghcr.io/...:beta` images and will **not** include local fork changes (e.g., new dashboard cards) unless you build/publish custom images.
  - For local development/testing of fork changes, use `vymanager-dev` (builds from source + bind mounts) or run the frontend/backend dev servers directly.

## Architecture Notes
- Frontend lives in `frontend/` and calls `/api/*` route handlers that proxy to backend `/vyos/*`.
  - Proxy route: `frontend/src/app/api/vyos/[...path]/route.ts`
  - Rationale: runtime-configurable `BACKEND_URL` (no Next.js rewrites; see `frontend/next.config.ts`).
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
 - Key backend layout:
   - Feature endpoints: `backend/routers/**`
   - Version-aware config generation: `backend/vyos_builders/**` + `backend/vyos_mappers/**`

## Conventions
- Prefer additive, small increments that include: implementation + tests + docs + review notes.
- Orchestration flow includes a HEAVY `Build/Execution` pass (smoke install/build/lint/test) before review/release; record command outcomes and toolchain versions when running on-host validations.
- Use feature branches for work; avoid committing directly to `main`.
- Backend tests should be run with `PYTHONPATH=.` (repo currently assumes this).
- Frontend lint currently emits warnings across the codebase; do not introduce new errors.
  - ESLint rules are intentionally warning-only for legacy patterns (see `frontend/eslint.config.mjs`).
- Keep endpoints best-effort for `show` parsing: return structured data + `warnings[]` rather than failing hard when output formats vary.

## Current Objective
- Next: overhaul Network -> DHCP UI (pfSense-style) after finishing the gateway card polish.

## Current Feature Spec
- DHCP UI overhaul is next (spec pending).

## Work In Progress
- Branch: `dev` (tracking `origin/dev`)
- Worktree status: clean
- Host toolchain (dev box): node `v20.20.0`, npm `10.8.2`, python `3.12.3`.
- Dev services are typically run in `tmux`:
  - `vm-api`: backend (`uvicorn` on `0.0.0.0:8000`)
  - `vm-ui`: frontend (`next start` on `0.0.0.0:3000`)
- Current UI access (LAN): `http://192.168.10.249:3000`
- Most recently shipped increment:
  - Gateway dashboard card + endpoint: commit `bfb029d` (adds `GET /vyos/show/gateway-summary` and `GatewayStatusCard`)
  - Gateway card polish: commit `a273676` (removes redundant Link State and Speed/Duplex display)
  - Orchestrator memory files: commits `ccbe26e`, `0e2cf5a` (adds `ORCHESTRATOR.md`, `PROJECT_MEMORY.md`, `CURRENT_FEATURE.md`, `DECISIONS.md`)

## TODO Backlog (Short)
- DHCP UI overhaul (pfSense-style enablement, interface-aware defaults)
- DNS UI (forwarding + authoritative reverse) (spec pending)
- Firewall zones UX + wizards/help (spec pending)
- IPsec site-to-site wizard (spec started in `FEATURE_STATE.json`)
- Gateway monitoring metrics (RTT/RTTsd/Loss) deferred (needs probe approach)

## Agent Handoff Notes
- Gateway card is best-effort: route parsing varies across VyOS/FRR versions; use `warnings[]` to surface gaps.
- Gateway monitoring metrics (RTT/RTTsd/Loss) are deferred because VyOS REST `show` does not support `ping`/monitor; would require a new integration approach (external probe/agent).
- Backend uses session-based active instance; most endpoints fail with `{error:\"No active instance\"}` until connected.
- For fast page loads, frontend `apiClient` dedupes in-flight GET requests and caches GET responses briefly (default 4s).
- If a newly-added dashboard card doesn’t appear in the “Add Card” list, verify you’re not running `vymanager-prod` beta images; switch to `container/vymanager-dev/env-file-docker-compose.yml` or rebuild your own images.
