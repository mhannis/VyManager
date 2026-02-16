# PROJECT_MEMORY.md

Last updated: 2026-02-16
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
- Backend dev (stable): `cd backend && .venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000 --proxy-headers`
- Backend dev (hot reload): `cd backend && .venv/bin/uvicorn app:app --reload --host 0.0.0.0 --port 8000 --proxy-headers`
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
- Execute backlog slices in guide order with full GUI-first coverage and validation.
- Keep each slice additive and robust: backend schema + frontend UX + validation + tests/checks.
- Continue reducing strict backlog by implementing partial domains in robust form-first UX.
- Continue container option-depth parity (image lifecycle + network model validation + operational UX details).
- Maintain thin-wrapper backend contracts while expanding reproducible verification.

## Current Feature Spec
Feature: **Container parity depth sweep (`C-02`, `C-03`, `C-04`)**

Acceptance criteria:
- Reject overlapping `container network <name> prefix` definitions in backend network upsert.
- Validate static container network attachment addresses against configured prefixes before upsert/install apply.
- Reject invalid IPv4 network/broadcast static assignments in container attachments.
- Improve image lifecycle UX with direct row-level actions from image catalogs.
- Improve inspect UX with parsed summary fields while retaining raw output.
- Add firewall-group member validation by type in create/edit flows, with strict remote-group URL constraints.
- Pass backend container tests and frontend build/runtime checks.

Assumptions:
- Unknown network names without explicit static addresses remain allowed for pre-stage/template flows.
- Browser smoke still depends on host Playwright system libraries (`libnspr4.so` currently missing).

## Work In Progress
- Branch: `feature/containers-automation-v1`
- Status: container parity slice in review after backend validation hardening and UI workflow upgrades.
- Backlog audit (2026-02-16, strict option-level tracker): container `C-02`, `C-03`, and `C-04` moved from `partial` to `verify` (pending live-instance verification).
- Working tree is dirty with unrelated pre-existing changes outside this slice.

### Files Touched This Cycle
- `backend/routers/containers.py`
- `backend/tests/test_containers_automation_v1.py`
- `frontend/src/app/system/containers/page.tsx`
- `frontend/src/components/firewall/CreateGroupModal.tsx`
- `frontend/src/components/firewall/EditGroupModal.tsx`
- `frontend/src/lib/validation/firewall-groups.ts`
- `CONFIG_GUIDE_IMPLEMENTATION_BACKLOG.json`
- `CONFIG_GUIDE_IMPLEMENTATION_BACKLOG.md`
- `CURRENT_FEATURE.md`
- `FEATURE_STATE.json`
- `PROJECT_MEMORY.md`
- `DECISIONS.md`

### Validation This Cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_containers_automation_v1.py` passed.
- `cd frontend && npx tsc --noEmit --pretty false` passed.
- `cd frontend && npm run -s build` passed.
- `cd frontend && npm run -s smoke:runtime` passed.
- `cd frontend && npm run -s smoke:ui` still blocked on host dependency (`libnspr4.so` missing).

## Risks / Open Questions
- Frontend lint warning debt remains high outside this slice.
- Browser smoke depends on host-specific Playwright shared libs path.
- Sidebar visibility preferences are currently browser-local (localStorage) rather than profile-synced.
- Services sidebar consolidation keeps the tabbed services UI as the primary workflow; only a minimal shortcut set is exposed in sidebar navigation.
- DHCP remains critical: the dedicated `/network/dhcp` editor remains authoritative, and Services now includes a DHCP tab that embeds the same management workspace.
- `uvicorn --reload` showed intermittent local connect hangs on `:8000` after restart; stable session should run non-reload mode for operator testing.
- Some command semantics in HA/Traffic Policy/PKI still need live VyOS operational validation across more versions/hardware.
- Reviewer sub-agent dispatch can fail when thread cap is saturated; manual review fallback is required in that case.
- Next.js app-router pages that use `useSearchParams` can trigger prerender errors if not wrapped in Suspense; for top-level pages prefer window-query parsing in `useEffect` when practical.

## TODO Backlog (next queue)
- Continue option-depth parity sweep for high-impact partial domains (Firewall, Interfaces, Protocols, Services, VPN, System).
- Continue container live verification pass on clean instance (`C-02/03/04` -> done).
- Improve option-level parity scorer precision and add CI thresholds (`X-01` hardening).
- Keep runtime gate sequence for every slice (`build -> restart vm-ui -> smoke:runtime -> smoke:ui`).

## Agent Handoff Notes
- Container network safety validation now enforces prefix overlap checks (`upsert /networks`) and static-address/subnet checks (`upsert/install /{container_name}`) in backend before apply.
- Containers UI now supports row-level image lifecycle actions directly from catalog lists and provides inspect summary parsing (JSON-first, key-value fallback) above raw output.
- Container backlog statuses were advanced: `C-02`, `C-03`, `C-04` moved to `verify` pending live-instance verification.
- Firewall groups create/edit flows now use typed member validators; remote groups are constrained to exactly one HTTP/HTTPS URL in the GUI.
- Firewall interface-group member inputs now provide description-first interface suggestions via datalist (`Description (ethX)`), while still storing canonical interface names.
- Added dedicated firewall/NAT regression suites: `test_firewall_nat_save_apply_reload_loops.py` and `test_firewall_nat_config_snapshots.py`, with `firewall_nat_config_snapshots.json` as baseline snapshot artifact.
- Robustness runner now executes firewall/NAT regression tests by default in the backend suite.
- Expanded cross-cutting regression gates in this cycle: fixture loops increased from 12 to 35 and snapshots from 15 to 38 endpoints across protocols/system/services/vpn/pki/qos/DMVPN plus baseline firewall/NAT.
- Tracking convention adjusted per operator direction: save/apply/reload fixture loop is treated as one cross-cutting backlog item; breadth is tracked as loop count, not separate backlog items.
- Local command policy can reject destructive cleanup commands (`rm -rf`) even for transient artifacts; this is non-blocking for feature/test work but leaves temporary untracked folders unless removed manually.
- Added thin system wrappers `system_lcd`, `system_sflow`, and `system_task_scheduler` via `build_config_tree_router(...)`, preserving existing service/session architecture and API contract style.
- Added dedicated form-first pages `/system/lcd`, `/system/sflow`, and `/system/task-scheduler` with diff-based set/delete batch operations and in-page help dialogs.
- Added `System` sidebar entries and smoke coverage for the new routes so runtime regressions are caught by default.
- Updated strict option-level backlog artifacts: `SYS-08`, `SYS-12`, and `SYS-15` moved from `missing` to `partial`.
- Added thin system wrappers `system_frr`, `system_ip`, and `system_ipv6` via `build_config_tree_router(...)`, preserving existing service/session architecture and API contract style.
- Added dedicated form-first pages `/system/frr`, `/system/ip`, and `/system/ipv6` with diff-based set/delete batch operations and in-page help dialogs.
- Added `System` sidebar entries and smoke coverage for the new routes so runtime regressions are caught by default.
- Updated strict option-level backlog artifacts: `SYS-05`, `SYS-06`, and `SYS-07` moved from `missing` to `partial`.
- Added thin system wrappers `system_conntrack`, `system_console`, and `system_default_route` via `build_config_tree_router(...)`, preserving existing service/session architecture and API contract style.
- Added dedicated form-first pages `/system/conntrack`, `/system/serial-console`, and `/system/default-route` with diff-based set/delete batch operations and in-page help dialogs.
- Added `System` sidebar entries and smoke coverage for the new routes so runtime regressions are caught by default.
- Updated strict option-level backlog artifacts: `SYS-01`, `SYS-02`, and `SYS-03` moved from `missing` to `partial`.
- System IA update applied: `System Identification` now lives at `/system/identification`, and `/system/options` is a dedicated Guided Setup launcher for the three baseline setup actions.
- Services sidebar IA update applied: reduced to `All Services`, with detailed per-service navigation handled inside `/system/services`.
- Services landing behavior update applied: `/system/services` now opens the first ordered tab by default instead of starting at NTP.
- Services coverage update applied: added `DHCP Server` tab inside `/system/services` (including single-view query support), corrected dashboard links to use `tab=` query keys, and embedded the full DHCP workspace component in-tab.
- Navigation preferences IA update applied: controls moved to `/settings/navigation`, expanded to full tree, and hard-locked for `Settings` + `Navigation`.
- Removed `Configuration Guide` from left navigation and added `Settings -> Sidebar Visibility` with persistent per-browser hide/show toggles for top-level nav items.
- Generated new authoritative planning artifacts:
  - `CONFIG_GUIDE_IMPLEMENTATION_BACKLOG.md`
  - `CONFIG_GUIDE_IMPLEMENTATION_BACKLOG.json`
- New backlog intentionally classifies real gaps despite `CONFIG_COVERAGE_PHASE1.*` reporting complete parity.
- Confirmed major confirmed gaps to start with:
  - Container option-depth parity (resource/security/runtime/image workflows)
  - Services: missing Config Sync and Router Advertisements pages
  - Interfaces: many interface families from docs still missing robust dedicated editors
- Sidebar ordering correction applied per operator: `Policy` now appears before `PKI`, and `L3VPN VRFs` is listed directly after `VRF` (mapped to `/network/vrf?section=l3vpn`).
- LLDP Neighbors dashboard card now performs live-refresh fetches (`refresh=true`) on initial load and auto-refresh cycles to avoid stale enabled/neighbor state from cached config.
- System Information dashboard card now always renders CPU temperature status badge; when temperature is unavailable, badge shows `Unavailable` instead of disappearing.
- Added shared firewall how-to guides for Policies, Groups, Global Options, Bridge, and Flowtables, and integrated `PageGuideDialog` buttons into those page headers.
- Existing guide content (Interfaces, DHCP, Zones, Containers, IPsec) was updated so Validation sections are GUI-first and no longer depend on CLI command checks.
- `System -> Containers` create/edit form now uses progressive disclosure: LAN helper, runtime overrides, environment variables, port mappings, and volume mappings can be collapsed/expanded independently, with safe defaults and no payload contract changes.
- Template action text now says `Load Template` and clarifies that loading does not install, reducing install-flow confusion.
- LAN helper segment selector now uses `formatInterfaceDisplayName(...)` for consistent description-first labels.
- NAT Create/Edit modals (source, destination, static) now derive interface labels from config descriptions and render selectors as `Description (ethX)` while still submitting raw interface names.
- VLAN `vif` entries in NAT modals now also pick up per-subinterface descriptions from config where present and fall back to interface IDs otherwise.
- Firewall Create/Edit rule modals now enrich interface selectors using ethernet descriptions and render labels as `Description (ethX)` while preserving canonical interface names for actual rule values.
- Interface-label enrichment merges `show all interfaces` + `ethernet config` in-modal, so non-ethernet/non-described interfaces still appear and fall back to raw names.
- Dashboard layout now persists `settings.columns` (2-4) and `settings.gap_px` (8-24) alongside card positions; the dashboard renderer applies these settings to both masonry grid and drag-drop overlays.
- Added `LLDP Neighbors` dashboard card (`frontend/src/components/dashboard/LldpNeighborsCard.tsx`) with auto-refresh, summary badges, and top-neighbor preview rows.
- `Gateway Summary` backend/DTO now includes best-effort probe metrics (`rtt_ms`, `rttsd_ms`, `loss_percent`) parsed from ping output; gateway API remains non-fatal when probe command is unavailable.
- Gateway card now renders `RTT`, `RTTsd`, and `Loss` fields and shows `-` when probe metrics are unavailable.
- `System -> Containers` now supports inline editing of active instance host and refreshes session/overview after save; container-network CRUD controls are collapsed behind `Manage Networks` by default with summary badges visible.
- Removed obsolete routing helper components `ProtocolCommandContent` and `ProtocolSimpleListEditor`; all routing pages now use dedicated form-first content components.
- `/network/traffic-policy` QoS policy editor now includes CAKE `flow-isolation` selection and corresponding save/parse support (`set/delete qos policy cake <name> flow-isolation <value>`).
- `/network/traffic-policy` QoS policy editor now includes default subtree fields (`default bandwidth`, `default burst`, `default ceiling`, `default priority`, `default queue-type`) with parse/save coverage.
- `/network/traffic-policy` now includes a dedicated `QoS Traffic Match Groups` section that supports CRUD for `qos traffic-match-group <name> match ...` and `match-group ...`, with diff-based set/delete generation in save flow.
- Replaced `/routing/static-failover/failover` command-text workflow with a structured failover route editor that supports route/next-hop plus check target/timeout/type/policy, interface, and metric fields with diff-based set/delete saves.
- Replaced `/routing/multicast/pim` simple list editor with a full form-first implementation covering guide-aligned global controls, interface parameters, RP mappings, and IGMP static joins.
- Replaced `/routing/multicast/pim6` simple list editor with a full form-first implementation covering interface MLD controls and static MLD joins.
- Replaced `/routing/infrastructure/arp` simple list editor with a dedicated static ARP editor that validates MAC format and uses description-first interface selection.
- `/network/high-availability` now includes dedicated form-driven IPVS coverage for `virtual-server` and nested `real-server` CRUD; save uses diff-based set/delete generation under `high-availability virtual-server ...` and preserves existing VRRP/sync-group behavior.
- `/network/traffic-policy` now includes class-level QoS editing for class-capable policy types, with diff-based command generation under `qos policy <type> <name> class <id> ...`.
- Class editor policy picker is gated to class-capable types (`limiter`, `priority-queue`, `round-robin`, `shaper`) to avoid invalid class commands on unsupported QoS policy types.
- `/network/traffic-policy` now also supports QoS interface assignment (`qos interface <if> ingress|egress`) with interface selectors labeled as `Description (ethX)` and policy-name validation before save.
- Runtime smoke can fail with transient connection errors if startup and smoke probes run in parallel; run runtime smoke sequentially after listener checks on `:3000`.
- Added shared backend `build_config_tree_router(...)` wrapper for non-service, non-VPN top-level config trees while preserving existing session/VyOS service contracts.
- Incident hotfix (2026-02-16): frontend build failed and user saw "Application error" because `PageGuideDialog` keys were referenced for `systemConntrack`, `systemSerialConsole`, and `systemDefaultRoute` before those keys existed in `pageGuides`; added the missing guide entries and type keys in `frontend/src/lib/help/pageGuides.ts`.
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
- Interface overlap scan (2026-02-16) across `src/app/network/interfaces/*/page.tsx` shows repeated common fields (`Description`, `MTU`, `VRF`, address lists, source/remote endpoints, MSS/default-route controls), supporting consolidation into a shared base form plus type-specific advanced panels.
- Recommended IA model: one `Network -> Interfaces` route with category tabs (`Core & L2`, `Overlay & Secure`, `Access & WAN`) and a single create/edit drawer that conditionally renders type modules; retain legacy URLs as redirects to pre-filtered tabs.
- Added VPN overview API/page (`/vyos/vpn`, `/vpn`) to complete docs index parity and expose protocol cards.
- VPN smoke coverage now includes `/vpn`, `/vpn/dmvpn`, `/vpn/openconnect`, `/vpn/pptp`, and `/vpn/sstp`.
- VPN domain parity now reports complete (`12 implemented / 0 partial / 0 not_started`) in `CONFIG_COVERAGE_PHASE1.json`.
- HA page now supports VRRP global parameters (`startup_delay`, `version`, and global GARP settings) with diff-based set/delete command generation.
- HA group editor now supports additional guide-aligned fields: `disable`, `rfc3768-compatibility`, `excluded-address`, and per-group GARP controls.
- Correct HA CLI token for startup delay is `startup_delay` (underscore), not `startup-delay`; command generation was updated accordingly.
- `vm-ui` must be restarted after each `next build` to avoid stale chunk manifest mismatches before browser smoke.
- Reviewer-agent spawn can fail due thread cap (`max 6`); manual reviewer pass is the fallback and must be logged in `LAST_FAILURE.txt`.
- PKI CA editor now uses guide-aligned fields (`certificate`, `crl`, `description`, `private key`, `private password-protected`) and removed the prior non-standard passphrase text model.
- PKI certificate editor now includes `description`, `private password-protected`, `revoke`, and full ACME metadata (`domain-name`, `email`, `listen-address`, `rsa-key-size`, `url`) with diff-based set/delete commands.
- Containers setup flow now includes first-run default network fields (name/prefix/description/MTU/VRF/DNS toggle) and posts this payload to `/vyos/containers/bootstrap`.
- `/vyos/containers/bootstrap` now accepts optional setup payload while preserving no-body behavior for existing callers.
- Firewall zone create/edit now supports discovered interface checkbox selection while retaining manual interface override input for advanced names.
- Interface cards in `Network -> Interfaces` now prefer description-first headings with canonical names shown beneath.
- Added reusable `PageGuideDialog` component for inline operator help with docs link plus ordered setup/validation/troubleshooting sections.
- Added shared routing how-to content registry (`routingProtocolGuides`) and wired it into OSPF, IS-IS, OpenFabric, RIP, and MPLS pages.
- Removed effect-driven selector resets in unicast/infrastructure/multicast routing shells by deriving active selection from permissions + optional user selection, eliminating `react-hooks/set-state-in-effect` warnings and reducing selector flicker risk.
- Added dedicated backend interface-tree wrappers:
  - `/vyos/bonding/*` for `interfaces bonding`
  - `/vyos/bridge/*` for `interfaces bridge`
  with strict command-scope validation inherited from `build_config_tree_router(...)`.
- Added robust form-first pages:
  - `/network/interfaces/bonding` with members/mode/hash/LACP/min-links/primary and advanced system MAC settings.
  - `/network/interfaces/bridge` with member-port options (cost/priority), STP controls, VLAN toggle, and IGMP settings.
- Added dedicated backend wrapper and form-first page for Geneve:
  - `/vyos/geneve/*` for `interfaces geneve`
  - `/network/interfaces/geneve` with remote/source endpoint controls, VNI, MTU/port, and IPv4/IPv6 MSS adjustment behavior.
- Added dedicated backend wrapper and form-first page for L2TPv3:
  - `/vyos/l2tpv3/*` for `interfaces l2tpv3`
  - `/network/interfaces/l2tpv3` with session/tunnel IDs, source/remote endpoints, encapsulation, ports, and cookie fields.
- Added dedicated backend wrapper and form-first page for MACsec:
  - `/vyos/macsec/*` for `interfaces macsec`
  - `/network/interfaces/macsec` with source-interface, cipher/encrypt settings, replay/mka fields, and static peer CRUD.
- Added interface how-to guides for bonding, bridge, geneve, l2tpv3, and macsec and wired them into page headers through `PageGuideDialog`.
- Updated navigation/smoke coverage to include bonding, bridge, geneve, l2tpv3, and macsec pages in both sidebar IA and runtime/browser route lists.
- Recreated `vm-api` and `vm-ui` tmux sessions after finding no active tmux server socket in the current shell namespace.
- Expanded `routingProtocolGuides` to include BFD, RPKI, IGMP Proxy, PIM, and PIM6 and integrated guide dialogs into each corresponding page header.
- BFD now exposes in-page guidance without changing peer/profile CRUD contracts; infrastructure and multicast protocols now follow the same help-entry UX as unicast protocol pages.
- Redirect pages `/network/routes` and `/routing/unicast-protocols/static` now render inside `AppLayout` while auto-redirecting, preventing temporary left-nav disappearance during transitions.
- Added shared non-routing guide registry `pageGuides` and wired page-level help dialogs into Interfaces, DHCP Server, Firewall Zones, Container Management, and IPsec.
- Container Management now exposes the same guide entry in loading, bootstrap, and active-management states so first-run and steady-state operators get identical setup guidance.
- Network Interfaces page action row now keeps both `Create Interface` and `Create VLAN / QinQ` visible at all times, with VLAN action positioned below interface action to avoid filter-dependent button switching.
- `System -> Logs` now supports service-aware filtering (preset service buckets plus discovered process names) and applies that filter to the visible entries/returned count.
- When a service filter is active, log download now exports the currently filtered rows directly from the UI so operators can capture targeted troubleshooting bundles.
- Firewall Zones now supports `local-zone` read/write end-to-end (`backend/routers/firewall/zones.py`, `frontend/src/lib/api/zones.ts`, and `frontend/src/app/firewall/zones/page.tsx`).
- Container Management now includes container network CRUD (backend endpoints `/vyos/containers/networks*` and GUI editing/listing in `frontend/src/app/system/containers/page.tsx`).
- Added dedicated Dummy Interfaces management page at `/network/interfaces/dummy` with create/edit/delete via `/vyos/dummy/batch`; navigation now links this page under `Network`.
- Runtime smoke route sets now include `/network/interfaces/dummy` in both `check-runtime.sh` and `smoke-ui.mjs` so regressions on the new page are caught pre-handoff.
- Gateway probe parser now supports reduced ping summaries (`min/avg/max`) and per-echo time fallback to compute average/stddev when summary lines are absent.
- Gateway probe target now falls back to DHCP lease router extraction for DHCP default routes that only expose `default dev <iface>`.
- Gateway probe now tries interface-scoped and generic ping variants and falls back from `show` to `generate` on unsupported builds.
- 2026-02-15 cycle update: fixed live Containers-page `Method Not Allowed` by restarting stale `vm-api` (process was serving pre-route code and lacked `/vyos/containers/images|registries`).
- Containers UI now treats `404/405` from image/registry endpoints as non-fatal endpoint-unavailable states to avoid page-wide load errors during mixed-version runs.
- Added container lifecycle endpoint tests (`images`, `registries`) and expanded runtime smoke routes to include `/system/containers`.
- Added new service wrapper routers for `config-sync` and `router-advert` and registered both in `backend/app.py`.
- Added `Config Sync` and `Router Advertisements` tabs to `System -> Services`, including sidebar single-service links.
- Updated smoke route probes and backend wrapper tests to cover both new services.
- Added thin backend wrappers and form-first pages for:
  - `/vyos/interface-openvpn/*` + `/network/interfaces/openvpn`
  - `/vyos/pseudo-ethernet/*` + `/network/interfaces/pseudo-ethernet`
  - `/vyos/sstpc/*` + `/network/interfaces/sstp-client`
  - `/vyos/virtual-ethernet/*` + `/network/interfaces/virtual-ethernet`
- Interfaces navigation and runtime/browser smoke route sets now include OpenVPN, Pseudo-Ethernet, SSTP Client, and Virtual-Ethernet pages.
- Backlog status updated: `IF-06`, `IF-07`, `IF-08`, and `IF-10` moved from `missing` to `partial` (baseline pages implemented; depth verification pending).
- Added thin backend wrapper and form-first page for tunnel interfaces:
  - `/vyos/tunnel-interface/*` + `/network/interfaces/tunnel`
- Tunnel UI currently covers encapsulation/source/remote/addressing, GRE key, source-validation, MSS, and key forwarding flags; deeper protocol-specific parameter parity remains follow-up work.
- Backlog status updated: `IF-09` moved from `missing` to `partial` (baseline page implemented).
- Added thin backend wrapper and form-first page for VTI interfaces:
  - `/vyos/vti-interface/*` + `/network/interfaces/vti`
- VTI UI currently covers baseline interface fields (address/description/mtu/vrf/disable) and is designed to pair with deeper IPsec workflows managed on VPN pages.
- Backlog status updated: `IF-11` moved from `missing` to `partial` (baseline page implemented).
- Added thin backend wrapper and form-first page for VXLAN interfaces:
  - `/vyos/vxlan-interface/*` + `/network/interfaces/vxlan`
- VXLAN UI currently covers major guide options (VNI/port/source/remote-or-group/parameters flags) and includes VLAN-to-VNI mapping CRUD for SVD-oriented configurations.
- Backlog status updated: `IF-12` moved from `missing` to `partial` (baseline page implemented).
- Added dedicated interface routers/pages for `wireless` and `wwan` and integrated both into navigation + smoke routes.
- Wireless backend endpoint now supports `system wireless country-code` operations alongside `interfaces wireless` subtree updates so AP-mode prerequisites can be applied in-page.
- Added capability-gating UX for both pages: if no `wlan*`/`wwan*` interfaces are detected, the UI shows a non-blocking warning while still allowing pre-stage configuration.
- Backlog artifacts now mark `IF-13` and `IF-14` as `partial` (baseline complete, advanced depth pending under `IF-15`).
- Latest validation snapshot: backend tests `125 passed`, frontend typecheck passed, targeted eslint passed, frontend build passed, runtime smoke passed; browser smoke remains blocked on missing `libnspr4.so`.
- Added dedicated interface routers/pages for `loopback` and `pppoe`, with sidebar/interfaces-page links and smoke route coverage (`/network/interfaces/loopback`, `/network/interfaces/pppoe`).
- Added thin system wrappers and form-first pages for:
  - `/vyos/system-flow-accounting/*` + `/system/flow-accounting`
  - `/vyos/system-proxy/*` + `/system/proxy`
  - `/vyos/system-sysctl/*` + `/system/sysctl`
- Extended `System` IA and `System -> Options & Coverage` quick links to surface Flow Accounting, Proxy, and Sysctl workflows.
- Updated backlog artifacts so `SYS-04`, `SYS-11`, and `SYS-13` are tracked as `partial` (baseline implemented, option-depth validation pending).
- Latest validation snapshot: backend tests `140 passed`, frontend typecheck passed, targeted eslint passed, frontend build passed, runtime smoke passed; browser smoke remains blocked on missing `libnspr4.so`.
- Interface Manager quick-add now supports PPPoE creation inline using the existing `/vyos/pppoe-interface/configure` batch API (no backend contract changes).
- PPPoE quick-add source-interface input now uses a dropdown populated from discovered interfaces with description-first labels to keep selection consistent and reduce misconfiguration risk.
- Interface Manager quick-add now also supports VTI and VXLAN creation inline using existing `/vyos/vti-interface/configure` and `/vyos/vxlan-interface/configure` batch APIs.
- Interface Manager quick-add now also supports Tunnel creation inline using existing `/vyos/tunnel-interface/configure` batch API with required `source-address` and `remote` validation.
- Next IA target is inline quick-edit for these families so operators can patch common fields without navigating to full per-family editors.
- Sidebar `Interfaces` now includes direct family links again (Setup Wizard, Interface Manager, and family-specific pages) for quicker page-based navigation.
- Interface family cards now show `Current` when already on the target view, preventing perceived no-op behavior from `Open` on the active page.
- Interface family `Open` now launches an in-page advanced workspace (right-side sheet with embedded editor) so operators stay on `/network/interfaces`.
- Added embedded AppLayout mode (`?embedded=1`) so editors rendered inside the workspace sheet do not include nested sidebar chrome, fixing clipped/cut-off content.
- Workspace panel width is now full viewport (`w-screen max-w-none`) to remove remaining horizontal clipping after embedded-mode fix.
- Interface family cards now use dedicated-page `Open` navigation only; inline panel/embed workspace approach was removed.
- Interface Manager no longer shows full family-link navigation; it now surfaces only quick-create cards for common families to avoid redundant link lists.
- Sidebar child label for `/network/interfaces` was renamed from `Interface Manager` back to `All Interfaces`.
- `Create Interface` now uses one wizard modal with a full family selector (`Ethernet`, `VLAN/QinQ`, `Dummy`, `Bonding`, `Bridge`, `Geneve`, `L2TPv3`, `Loopback`, `MACsec`, `OpenVPN`, `PPPoE`, `Pseudo-Ethernet`, `SSTP`, `Tunnel`, `Virtual-Ethernet`, `VTI`, `VXLAN`, `Wireless`, `WWAN`).
- Generic family create path now applies minimal type-specific commands via existing API wrappers (no backend route changes); Ethernet/VLAN routes to existing dedicated create modals from the same wizard flow.
- `/network/interfaces` now aggregates non-Ethernet family instances (bonding/bridge/dummy/geneve/l2tpv3/loopback/macsec/openvpn/pppoe/pseudo-ethernet/sstp/tunnel/virtual-ethernet/vti/vxlan/wireless/wwan) into a single inventory section so created interfaces are visible on the main page.
- `Interfaces` sidebar now shows only `Setup Wizard` and `All Interfaces` (family deep links removed from side panel).
- `Common Interface Actions` panel was removed from the interfaces page because the same actions are now covered by the wizard type selector.
- Added dedicated Segment Routing backend router (`/vyos/segment-routing/*`) and form-first UI (`/routing/infrastructure/segment-routing`) with OSPF/IS-IS label block + Prefix SID management.
- VRF page now includes explicit `VRF Core` and `L3VPN` tabs in one place; L3VPN workflows are no longer a separate left-nav item.
- Added initial option-level parity scoring pipeline (`scripts/score_option_parity.py`) and generated `OPTION_PARITY_SCORECARD.json/.md`; backlog `X-01` moved from missing to partial.
