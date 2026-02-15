# PROJECT_MEMORY.md

Last updated: 2026-02-15
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
- Close remaining Phase1 parity domains with form-driven pages and thin backend wrappers.
- Completed this cycle: implemented `vrf`, `load-balancing`, `high-availability`, `traffic-policy`, `pki`, and a configuration index page.
- Completed this cycle: coverage matrix now reports full Phase1 implementation (`129 implemented / 0 partial / 0 not_started`).
- Next: deepen option-level parity inside these new domains and validate command semantics against live VyOS config guides.

## Current Feature Spec
Feature: **Non-routing parity closure batch (VRF + Load Balancing + HA + Traffic Policy + PKI + Config Index)**

Acceptance criteria:
- Backend exposes scoped batch/config endpoints for each missing docs domain without replacing existing service architecture.
- Frontend pages are form-driven and avoid free-form CLI command text entry.
- Navigation includes reachable pages for new domains.
- End-to-end validation passes: backend tests, `tsc`, frontend build, runtime smoke, UI smoke.
- Coverage artifacts regenerate and show no remaining Phase1 gaps.

Assumptions:
- New pages prioritize common/high-value configuration branches first; additional advanced knobs remain additive follow-ups.
- Existing unrelated dirty working-tree files remain untouched.

## Work In Progress
- Branch: `feature/containers-automation-v1`
- Status: non-routing parity closure batch implemented and validated; pending commit/push in this cycle.
- Working tree is dirty with unrelated pre-existing changes outside this slice.

### Files Touched This Cycle (hotfix-owned)
- `backend/routers/_config_tree_wrapper.py`
- `backend/routers/vrf/__init__.py`
- `backend/routers/vrf/vrf.py`
- `backend/routers/load_balancing/__init__.py`
- `backend/routers/load_balancing/load_balancing.py`
- `backend/routers/high_availability/__init__.py`
- `backend/routers/high_availability/high_availability.py`
- `backend/routers/traffic_policy/__init__.py`
- `backend/routers/traffic_policy/traffic_policy.py`
- `backend/routers/pki/__init__.py`
- `backend/routers/pki/pki.py`
- `backend/app.py`
- `backend/tests/test_config_tree_wrapper_capabilities.py`
- `frontend/src/lib/api/config-tree.ts`
- `frontend/src/lib/api/vrf.ts`
- `frontend/src/lib/api/load-balancing.ts`
- `frontend/src/lib/api/high-availability.ts`
- `frontend/src/lib/api/traffic-policy.ts`
- `frontend/src/lib/api/pki.ts`
- `frontend/src/app/network/vrf/page.tsx`
- `frontend/src/app/network/load-balancing/page.tsx`
- `frontend/src/app/network/high-availability/page.tsx`
- `frontend/src/app/network/traffic-policy/page.tsx`
- `frontend/src/app/system/pki/page.tsx`
- `frontend/src/app/configuration/page.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/scripts/check-runtime.sh`
- `frontend/scripts/smoke-ui.mjs`
- `scripts/generate_config_coverage_matrix.py`
- `scripts/generate_phase1_backlog.py`
- `CONFIG_COVERAGE_MATRIX.json`
- `CONFIG_COVERAGE_MATRIX.md`
- `CONFIG_COVERAGE_PHASE1.json`
- `CONFIG_COVERAGE_PHASE1.md`
- `PARITY_BACKLOG.json`
- `PARITY_BACKLOG.md`

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_config_tree_wrapper_capabilities.py tests/test_protocol_capabilities.py tests/test_service_wrapper_capabilities.py tests/test_vpn_wrapper_capabilities.py tests/test_app.py` -> pass (`128 passed`)
- `cd frontend && npx tsc --noEmit --pretty false` -> pass
- `cd frontend && npm run -s build` -> pass
- `cd frontend && npm run -s lint` -> pass (`0 errors`, warnings only)
- Restarted runtime sessions and verified listeners:
  - `tmux new-session -d -s vm-api 'cd /home/redhot/VyOS/VyManager/backend && set -a && source .env && set +a && PYTHONPATH=. ./.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000 --proxy-headers'`
  - `tmux new-session -d -s vm-ui 'cd /home/redhot/VyOS/VyManager/frontend && npm run -s start -- --hostname 0.0.0.0 --port 3000'`
  - `ss -ltnp | rg ':(8000|3000)'` -> listening
- `cd frontend && SMOKE_BASE_URL='http://localhost:3000' npm run -s smoke:runtime` -> pass
- `cd frontend && LD_LIBRARY_PATH=/home/redhot/VyOS/.local-playwright-libs/extracted/usr/lib/x86_64-linux-gnu SMOKE_BASE_URL='http://localhost:3000' npm run -s smoke:ui` -> pass
- `python3 scripts/generate_config_coverage_matrix.py && python3 scripts/generate_phase1_backlog.py` -> pass

## Risks / Open Questions
- Frontend lint warning debt remains high outside this slice.
- Browser smoke depends on host-specific Playwright shared libs path.
- Some command semantics in newly added HA/Traffic Policy/PKI sections need live VyOS operational validation on more hardware/versions.

## TODO Backlog (next queue)
- Deepen option-level coverage for `high-availability`, `traffic-policy`, and `pki` beyond initial form sets.
- Add live fixture-seeding and CLI alignment checks (`show configuration commands`) for the new domains.
- Continue runtime gate sequence for every slice (`build -> restart vm-ui -> smoke:runtime -> smoke:ui`).

## Agent Handoff Notes
- Added shared backend `build_config_tree_router(...)` wrapper for non-service, non-VPN top-level config trees while preserving existing session/VyOS service contracts.
- Added scoped backend routers for `vrf`, `load-balancing`, `high-availability`, `traffic-policy`, and `pki`; each router exposes `capabilities`, `config`, and `batch` endpoints with strict subtree command validation.
- Implemented form-first GUI pages for `/network/vrf`, `/network/load-balancing`, `/network/high-availability`, `/network/traffic-policy`, and `/system/pki` (no free-form CLI text boxes).
- Added `/configuration` index page to represent docs-root coverage and provide a single navigation entry point across all major config domains.
- Updated smoke gates to include new routes; runtime/browser smoke now checks these domains by default.
- Coverage scripts were extended with alias handling (`highavailability`, `trafficpolicy`) and docs-root token handling so matrix generation can accurately classify these domains.
- Phase1 artifacts now show full implementation (`implemented: 129`, `partial: 0`, `not_started: 0`).
- PIM/PIM6 batch validators now allow exact subtree delete (`delete protocols pim`, `delete protocols pim6`) while preserving prefix boundary checks.
- Added protocols overview API + `/routing/protocols` page for docs index parity and quick navigation.
- Added dedicated `/routing/unicast-protocols/bgp` and `/routing/infrastructure/bfd` pages to eliminate token-detection false partials.
- Protocols domain is now fully marked implemented in parity artifacts.
- Routing IA cleanup applied: removed redundant Static entry from unicast selector and redirected legacy static URL to `/routing/static-failover/static-routes`.
- Main sidebar now links `Static & Failover` directly to static routes and uses normalized path matching to keep parent/child active for nested or trailing-slash URLs.
- Infrastructure and multicast selectors no longer fall back to generic `In Progress`; they now show selection prompts when nothing is selected.
- `ProtocolSimpleListEditor` now includes a `Current Coverage` card with supported settings while keeping the UI form-driven (no CLI text entry).
- Interface field keys (default `["interface"]`) now render as live dropdowns sourced from `/network/interfaces/config`, with labels formatted as `Description (ethX)`.
- Flashing fix: `ProtocolSimpleListEditor` initial load now runs once per page key and no longer re-enters full loading state after initial render, preventing quick refresh flicker when parent components rerender.
- OSPF moved off the generic protocol list editor and now has a dedicated, robust, form-first screen with multi-section CRUD and diff-based batch save behavior.
- Interface selectors now pull from multiple sources (`ethernet config`, `show interface physical`, and `show all interfaces`) to avoid empty selector lists when one endpoint returns limited data.
- Safe Apply snapshot-save now retries to `/config/<snapshot-file>` when configured backup directory is missing/unwritable to prevent HTTP 400 pre-check failures.
- Validation direction from Mark: each feature should include populate/save/load verification and CLI alignment checks (`show configuration commands`) against the corresponding VyOS guide section.
- Added live seeding utility `scripts/seed_ospf_fixture.py` to populate active-instance OSPF config for QA without manual CLI.
- VyOS rejected mixed OSPF styles (`area network` plus `interface area`); fixture now uses interface-only area assignment to stay valid.
- OSPF Areas list now infers areas from interface assignments, so interface-style deployments still show area context even without explicit `area-type` nodes.
- OSPF fixture now seeds `redistribute connected` to keep Redistribution panel populated during validation.
- RIP now has a dedicated full-form UX covering major command-tree sections from the VyOS RIP guide (`default-*`, timers, network/interface/neighbor/route, passive-interface, network-distance, distribute-list, redistribute).
- RIP passive-interface syntax on this target is `set protocols rip passive-interface <name>` and `set protocols rip passive-interface default` (not `... interface ...`).
- Reviewer-agent spawn was temporarily unavailable due thread cap; this cycle used manual reviewer pass and recorded the agent-limit failure in `LAST_FAILURE.txt`.
- Frontend smoke defaults now cover the exact high-risk routes that recently regressed (`routing/*`, `services/dhcp-server`, and related infrastructure pages), so route-level runtime crashes are no longer missed by default.
- Runtime/browser smoke defaults now use `http://localhost:3000`; this avoids invalid-origin/cookie edge cases seen with `127.0.0.1`.
- Added service-wrapper routers for `https`, `snmp`, and `tftp-server`; wrappers enforce command scope under their exact `service <name>` trees.
- Added form-driven service tabs for HTTP API, SNMP, and TFTP under `System -> Services`; these pages do not expose free-form CLI input.
- Coverage crawler now recognizes service-wrapper naming conventions (`<service>_service` and `service_<service>`) so matrix status reflects backend support for service pages.
- Added service-wrapper routers and form tabs for `broadcast-relay`, `conntrack-sync`, `console-server`, `salt-minion`, and `suricata`.
- Services sidebar and tab-strip now include these new service pages while preserving A-Z ordering.
- Smoke route defaults were expanded again to directly probe each newly added service tab route in single-service mode.
- Added service-wrapper router and form tab for `event-handler`, including nested environment variable editing per event.
- Coverage crawler aliases now bridge `eventhandler` <-> `event_handler`, and service-wrapper signal generation now uses alias-expanded tails; this fixed `eventhandler` false `FRONTEND_ONLY` classification.
- Phase1 backlog classifier now treats `service/index.html` as doc-only UI coverage, so the Service docs index is counted implemented when the Services UI exists.
- Added service-wrapper routers and form-first tabs for `monitoring`, `webproxy`, `pppoe-server`, and `ipoe-server` under `System -> Services`.
- Service tabs now include common CRUD coverage for listen interfaces, pools, authentication, and server lists without free-form command text fields.
- Coverage/backlog generation must run sequentially (`generate_config_coverage_matrix.py` then `generate_phase1_backlog.py`); running them in parallel can produce stale phase1 raw statuses.
- Added scoped VPN routers for `openconnect`, `pptp`, and `sstp` using the shared `_vpn_wrapper` abstraction.
- Added DMVPN router/page with constrained command support for `interfaces tunnel`, `protocols nhrp`, and `vpn ipsec profile` workflows.
- Added VPN overview API/page (`/vyos/vpn`, `/vpn`) to complete docs index parity and expose protocol cards.
- VPN smoke coverage now includes `/vpn`, `/vpn/dmvpn`, `/vpn/openconnect`, `/vpn/pptp`, and `/vpn/sstp`.
- VPN domain parity now reports complete (`12 implemented / 0 partial / 0 not_started`) in `CONFIG_COVERAGE_PHASE1.json`.
