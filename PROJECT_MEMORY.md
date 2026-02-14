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
- Deliver IA polish requested by Mark:
  - keep SSH/NTP/LLDP/mDNS under `System`
  - avoid DHCP Server appearing under `Services` (prevent dual-open with `Network`)
  - expose additional system-level controls in `System` via a dedicated options page
  - keep zone guided setup as a top-right, one-time wizard entry point
  - keep clear onboarding path for WAN/LAN setup using wizards

## Current Feature Spec
Feature: **System IA + Guided Setup Cohesion (v2)**

Acceptance criteria:
- Sidebar `Services` no longer includes DHCP Server to avoid opening `Network` and `Services` at once.
- Sidebar keeps SSH under `System`.
- `System -> Options & Coverage` exists and is functional.
- System options page allows editing:
  - `system host-name`
  - `system time-zone`
  - `system domain-name`
  - `system name-server` list
- System options page links users to setup flow (Network Wizard -> Zone Wizard -> Policies).
- Firewall Zones guided setup is a top-right button and runs as modal one-time wizard (re-runnable).
- Firewall Policies page provides direct links to setup wizards.

Assumptions:
- Existing `network/setup-wizard` remains the primary base bootstrap workflow.
- `system name-server` tokens can be validated with the existing safe token validator in this codebase.

## Work In Progress
- Branch: `feature/containers-automation-v1`
- Working tree: dirty (includes pre-existing unrelated changes)
- Host toolchain: node `v20.20.0`, npm `10.8.2`, python `3.12.3`

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q` -> `27 passed`
- `cd frontend && npx tsc --noEmit --pretty false` -> pass
- `cd frontend && npm run -s lint` -> pass with existing warning debt (0 errors)
- `cd frontend && npm run -s build` -> pass
- `cd frontend && npm run -s smoke:runtime` -> pass
- `cd frontend && npm run -s smoke:ui` -> fail (missing host lib `libnspr4.so`; tracked in `LAST_FAILURE.txt`)
- Runtime redeploy completed:
  - restarted `vm-ui` on `0.0.0.0:3000`
  - restarted `vm-api` with `.env` sourced on `0.0.0.0:8000`
  - health checks: `/docs` -> `200`, frontend root -> `307` (expected redirect), `/session/sites` -> `401` (expected unauthenticated)

### Key Implementation Notes
- Added `PUT /vyos/system/config` in `backend/routers/system.py`.
- Added backend validation for timezone tokens and system config update operations.
- Added backend tests:
  - `test_update_system_config_emits_expected_operations`
  - `test_update_system_config_rejects_invalid_timezone`
- Added frontend API method `systemService.updateConfig`.
- Added new page `frontend/src/app/system/options/page.tsx`:
  - editable system identity form
  - setup wizard launch card
  - system coverage/navigation card
- Sidebar IA updates:
  - moved SSH/NTP/LLDP/mDNS to `System`
  - removed DHCP Server from `Services`
  - added `System -> Options & Coverage`
- Firewall Zones now includes top-right guided wizard flow and one-time localStorage marker.
- Firewall Policies includes direct links to Network/Zone wizards.

## Risks / Open Questions
- Playwright browser smoke is blocked by missing system dependencies on this host (`libnspr4.so`), so end-to-end UI automation is not currently a reliable gate.
- Frontend lint remains warning-heavy from legacy code; this cycle introduced no lint errors.

## TODO Backlog (Short)
- DHCP server UX: complete pfSense-like interface-first flow and verify lease behavior on live interfaces.
- Firewall zones education page: add dedicated “How zones work” reference page and link from zones.
- Continue DNS scope (resolver/authoritative/reverse lookup polish).

## Agent Handoff Notes
- Start `vm-api` only with backend environment loaded (`source backend/.env`) or session/site APIs can fail with `503`.
- `System -> Options` is now a real page and depends on `PUT /vyos/system/config`.
- Keep using `formatInterfaceDisplayName` helper for consistent `Description (ethX)` naming in non-edit description contexts.
