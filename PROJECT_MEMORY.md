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
- Implement requested UX/IA updates:
  - global interface labels as `Description (ethX)` (except interface-description edit surfaces)
  - IPsec wizard readability improvements
  - service navigation at higher level with direct service links
  - add CPU temperature to dashboard system information card
  - document/handle power management (`powerd`) expectations on VyOS

## Current Feature Spec
Feature: **Service IA + System Telemetry Polish (v1)**

Acceptance criteria:
- Interface options/cards show `Description (ethX)` wherever description data exists (excluding interface-description editing UI).
- Site-to-site IPsec wizard dialog is wide enough and proposal fields are readable.
- System Services can be deep-linked by service via URL tab parameter.
- Sidebar exposes services at higher level (NTP/LLDP/mDNS/SSH/DNS forwarder/resolver/DDNS/DHCP server/DHCP relay).
- System dashboard summary includes best-effort CPU temperature and card displays it when present.

Assumptions:
- VyOS does not expose a FreeBSD-style `powerd` service configuration endpoint in current API surface.
- DNS Resolver/DDNS/DHCP Relay are introduced as navigable placeholders first, then full config pages in subsequent iterations.
- CPU temperature availability depends on hardware + command support (`show hardware temperature` / fallback probes).

## Work In Progress
- Branch: `feature/containers-automation-v1`
- Working tree: dirty (multiple feature files + new smoke scripts)
- Host toolchain: node `v20.20.0`, npm `10.8.2`, python `3.12.3`

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q` -> `19 passed`
- `cd frontend && npx tsc --noEmit --pretty false` -> pass
- `cd frontend && npm run -s build` -> pass
- `cd frontend && npm run -s lint` -> pass with existing warning debt (no new errors)

### Key Implementation Notes
- Added best-effort CPU temperature parsing in `backend/routers/system.py` and exposed `cpu_temperature_celsius` on dashboard summary API.
- Added backend unit tests for temperature parser in `backend/tests/test_system_dashboard_temperature.py`.
- Updated `SystemInformationCard` to display CPU temperature badge when available.
- Extended `System Services` page with URL-driven tab deep linking (`?tab=`), wrapped query handling in `Suspense` for Next.js prerender safety.
- Added higher-level `Services` navigation group in sidebar and removed duplicate nested System->Services entry.
- Added placeholder service views for DNS Resolver, Dynamic DNS, DHCP Relay, and Power Management to establish IA now and fill functionality next.
- Applied interface label formatter across DHCP/setup wizard, dashboard interface cards, flowtable/bridge/policy selectors, containers, and IPsec wizard.
- Enlarged IPsec site-to-site wizard modal and added explicit labels for proposal fields.

## Risks / Open Questions
- Browser smoke gate cannot execute on this machine until OS dependencies are installed (`sudo npx playwright install-deps`).
- CPU temperature parsing is best-effort and may return null on platforms/virtualized targets without exposed sensors.
- DNS Resolver/DDNS/DHCP Relay remain placeholders and still need full backend/API implementations.

## TODO Backlog (Short)
- Implement full Dynamic DNS configuration page + backend routes.
- Implement DHCP Relay configuration page + backend routes.
- Add dedicated DNS Resolver mode configuration if target VyOS build supports it.
- Evaluate/implement richer service-specific pages (breaking out from tab container) after IA validation.

## Agent Handoff Notes
- Next.js build can fail when `useSearchParams` is used at page scope without `Suspense`; keep query consumers inside suspense-wrapped client boundaries.
- Keep using `formatInterfaceDisplayName` from `frontend/src/lib/utils.ts` for interface labels to enforce consistency.
- `powerd` expectation should be treated as unsupported for current VyOS API surface unless docs/API evidence emerges.
