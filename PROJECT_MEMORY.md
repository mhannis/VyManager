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
- Deliver robust VLAN handling across create/edit/delete flows:
  - support `802.1Q` (`vif`)
  - support QinQ service VLAN (`vif-s`)
  - support QinQ customer VLAN (`vif-c`)
  - expose delete actions in UI (VLAN cards) with correct backend operations
  - ensure invalid VLAN payloads return correct client errors (400, not 500)

## Current Feature Spec
Feature: **Robust VLAN Handling (v1)**

Acceptance criteria:
- VLAN create modal supports selecting VLAN type (`802.1Q`, `QinQ service`, `QinQ customer`).
- VLAN list includes `vif`, `vif-s`, and nested `vif-c` entries with clear labels.
- VLAN edit applies correct operation families for each type (`set_vif_*`, `set_vif_s_*`, `set_vif_c_*`).
- VLAN delete works from UI for all supported types.
- Backend supports `delete_vif_s` and `delete_vif_c` operations.
- Ethernet batch endpoint preserves explicit `HTTPException` status codes from validation failures.

Assumptions:
- `set_vif_c` may be used with optional auto-create of missing `vif-s` service VLAN.
- Current `vif`/`vif-s`/`vif-c` read models (description/address/mtu/mac/vrf/disable) remain the source of truth.

## Work In Progress
- Branch: `feature/containers-automation-v1`
- Working tree: dirty (includes pre-existing unrelated changes)
- Host toolchain: node `v20.20.0`, npm `10.8.2`, python `3.12.3`

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q backend/tests/test_ethernet_vlan_batch_ops.py backend/tests/test_system_services_ssh_dns.py` -> pass (`14 passed`)
- `cd frontend && npx tsc --noEmit --pretty false` -> pass
- `cd frontend && npm run -s build` -> pass
- `cd frontend && npm run -s smoke:runtime` -> pass
- `cd frontend && npm run -s lint` -> pass with existing warning debt (0 errors)
- Runtime redeploy completed for UI:
  - restarted `vm-ui` on `0.0.0.0:3000`
  - restarted `vm-api` on `0.0.0.0:8000`
  - health checks: frontend root -> `307` (expected redirect), backend `/docs` -> `200`

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
  - moved NTP/LLDP/mDNS into `Services`
  - moved DHCP Server into `Services` and removed duplicate from `Network`
  - kept `System -> Options & Coverage` as SSH entry point
- Added single-service view mode for `/system/services` (`view=single`) so sidebar service shortcuts do not show the tab strip.
- Ordered Services entries A-Z in sidebar and in the full `/system/services` tab strip:
  - `DHCP Relay`, `DHCP Server`, `DNS Forwarder`, `DNS Resolver`, `Dynamic DNS`, `LLDP`, `mDNS Repeater`, `NTP`
- Removed redundant shortcuts from `System -> Options & Coverage` (Logs/Users/Containers and other duplicated service links).
- Kept DNS server ownership in DNS Resolver flow; System Options now preserves existing name-servers during save.
- Firewall Zones now includes top-right guided wizard flow and one-time localStorage marker.
- Firewall Policies includes direct links to Network/Zone wizards.
- Added full VLAN/QinQ UI model in `network/interfaces`:
  - list now includes `vif`, `vif-s`, and nested `vif-c`
  - VLAN cards show type labels and service tag for QinQ customer subinterfaces
  - delete action is wired via new `DeleteVLANModal`
- Reworked `ComprehensiveVLANModal`:
  - create mode supports VLAN type selection (`802.1Q`, `QinQ service`, `QinQ customer`)
  - correct operation mapping per type for create/edit (`vif` vs `vif-s` vs `vif-c`)
  - duplicate detection and VLAN tag validation (`1..4094`)
  - optional auto-create for missing service VLAN during QinQ customer creation
- Added backend support for missing delete operations:
  - `delete_vif_s`
  - `delete_vif_c`
- Hardened ethernet batch endpoint error semantics:
  - now re-raises `HTTPException` instead of converting to generic 500
- Added backend tests for new VLAN batch behaviors:
  - `test_batch_delete_vif_s_operation`
  - `test_batch_delete_vif_c_operation`
  - `test_batch_delete_vif_c_rejects_invalid_payload`

## Risks / Open Questions
- Playwright browser smoke is blocked by missing system dependencies on this host (`libnspr4.so`), so end-to-end UI automation is not currently a reliable gate.
- Frontend lint remains warning-heavy from legacy code; this cycle introduced no lint errors.

## TODO Backlog (Short)
- DHCP server UX: complete pfSense-like interface-first flow and verify lease behavior on live interfaces.
- Firewall zones education page: add dedicated “How zones work” reference page and link from zones.
- Continue DNS scope (resolver/authoritative/reverse lookup polish).
- Extend VLAN modal to include dedicated delete/reset controls for DHCP/IPv6 subsettings (currently additive set only).
- Add frontend unit tests for VLAN modal operation mapping once test harness for component forms is in place.

## Agent Handoff Notes
- Start `vm-api` only with backend environment loaded (`source backend/.env`) or session/site APIs can fail with `503`.
- `System -> Options` is now a real page and depends on `PUT /vyos/system/config`.
- Keep using `formatInterfaceDisplayName` helper for consistent `Description (ethX)` naming in non-edit description contexts.
- For VLAN deletes:
  - use `delete_vif` for `vif`
  - use `delete_vif_s` for `vif-s`
  - use `delete_vif_c` with `s_vlan,c_vlan` for `vif-c`
