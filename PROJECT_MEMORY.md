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
- Complete System Services follow-through for the promoted Services IA:
  - replace Dynamic DNS and DHCP Relay placeholders with working configuration tabs
  - map DNS Resolver tab to real DNS service configuration (same VyOS backend surface)
  - remove Power Mgmt placeholder tab per Mark request
  - keep interface selectors labeled as `Description (ethX)` where descriptions are known

## Current Feature Spec
Feature: **Service IA + System Telemetry Polish (v1)**

Acceptance criteria:
- Interface options/cards show `Description (ethX)` wherever description data exists (excluding interface-description editing UI).
- Site-to-site IPsec wizard dialog is wide enough and proposal fields are readable.
- System Services can be deep-linked by service via URL tab parameter.
- Sidebar exposes services at higher level (NTP/LLDP/mDNS/SSH/DNS forwarder/resolver/DDNS/DHCP server/DHCP relay).
- System dashboard summary includes best-effort CPU temperature and card displays it when present.
- Dynamic DNS and DHCP Relay tabs are fully configurable from GUI (read/update via backend routes).
- Dynamic DNS preserves existing secrets when password is left blank and rejects duplicate interface/provider mappings.
- Disabling Dynamic DNS or DHCP Relay succeeds without validating stale entry payload fields.
- Power management placeholder tab is removed.

Assumptions:
- VyOS does not expose a FreeBSD-style `powerd` service configuration endpoint in current API surface.
- DNS Resolver uses the same underlying VyOS DNS service (`service dns forwarding`) in this build.
- CPU temperature availability depends on hardware + command support (`show hardware temperature` / fallback probes).

## Work In Progress
- Branch: `feature/containers-automation-v1`
- Working tree: dirty (multiple feature files + new smoke scripts)
- Host toolchain: node `v20.20.0`, npm `10.8.2`, python `3.12.3`

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q` -> `25 passed`
- `cd frontend && npx tsc --noEmit --pretty false` -> pass
- `cd frontend && npm run -s build` -> pass
- `cd frontend && npm run -s lint` -> pass with existing warning debt (no new errors)
- code review pass: `APPROVED` (`AGENT_REPORTS/review_services_ddns_dhcprelay_20260214.md`)

### Key Implementation Notes
- Added best-effort CPU temperature parsing in `backend/routers/system.py` and exposed `cpu_temperature_celsius` on dashboard summary API.
- Added backend unit tests for temperature parser in `backend/tests/test_system_dashboard_temperature.py`.
- Updated `SystemInformationCard` to display CPU temperature badge when available.
- Extended `System Services` page with URL-driven tab deep linking (`?tab=`), wrapped query handling in `Suspense` for Next.js prerender safety.
- Added higher-level `Services` navigation group in sidebar and removed duplicate nested System->Services entry.
- Replaced Dynamic DNS and DHCP Relay placeholders with fully functional tabs and API wiring.
- DNS Resolver tab now uses the real DNS service form in resolver-focused mode text instead of placeholder content.
- Removed Power Mgmt placeholder tab from System Services.
- Applied interface label formatter across DHCP/setup wizard, dashboard interface cards, flowtable/bridge/policy selectors, containers, and IPsec wizard.
- Enlarged IPsec site-to-site wizard modal and added explicit labels for proposal fields.
- Added Dynamic DNS backend safeguards:
  - preserve existing provider password when UI submits blank password
  - reject duplicate `(interface, provider)` entries
  - allow disable operations without validating entry payload
- Added DHCP relay disable-path behavior to skip entry validation and cleanly delete service subtree.
- Added backend tests for Dynamic DNS + DHCP Relay get/update and disable edge cases.

## Risks / Open Questions
- Browser smoke gate cannot execute on this machine until OS dependencies are installed (`sudo npx playwright install-deps`).
- CPU temperature parsing is best-effort and may return null on platforms/virtualized targets without exposed sensors.
- Frontend lint baseline remains warning-heavy (legacy debt), though no new lint errors were introduced.

## TODO Backlog (Short)
- Continue DNS scope requested by Mark:
  - evaluate dedicated resolver mode controls if VyOS surface differs from forwarding model
  - confirm reverse lookup UX defaults and guardrails
- Continue network/firewall UX scope:
  - DHCP page behavior aligned to pfSense-style interface-first flow
  - firewall zones education/help page + guided mode link separation
- Continue service rollout requested by Mark (dynamic DNS complete; remaining service pages pending).

## Agent Handoff Notes
- Next.js build can fail when `useSearchParams` is used at page scope without `Suspense`; keep query consumers inside suspense-wrapped client boundaries.
- Keep using `formatInterfaceDisplayName` from `frontend/src/lib/utils.ts` for interface labels to enforce consistency.
- `powerd` expectation should be treated as unsupported for current VyOS API surface unless docs/API evidence emerges.
- For Dynamic DNS updates, backend treats `(interface, provider)` as unique and preserves existing password secrets when password input is blank.
- For Dynamic DNS and DHCP Relay disable operations, backend now deletes the service subtree without validating payload entry fields.
