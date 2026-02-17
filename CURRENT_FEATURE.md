feature_id: backlog-partial-implementation-sweep-2026-02-17
title: Partial backlog implementation sweep (implementation first, verify deferred)
status: in_review
branch: feature/containers-automation-v1
completed_in_cycle:
  - SYS-17 Hotfix: fixed `System -> Update Check` save flow where enabling `auto-check` could fail with `URL is required` even when URL field was populated by default. URL operations are now materialized before `auto-check` and client validation enforces URL-required when `auto-check` is enabled.
  - Dashboard DnD Hotfix: improved card drag/drop collision detection to prioritize pointer-based droppable targets (column overlays) with `closestCorners` fallback, restoring reliable cross-column card moves.
  - PR-04: moved to `verify` after failover parity hardening (`check type` enum aligned to docs: `icmp|arp|tcp`; `check policy` enum aligned to docs: `any-available|all-available`; timeout/metric numeric guardrails added).
  - UX-Container-Layout: Container Management reorganized into a 2-column layout:
    - Column 1: `Containers`
    - Column 2: `Image Lifecycle`, `Container Registries`, `Container Networks` (collapsed by default), then `Create Container`
    - Added responsive ordering so `Containers` remains first in small and large layouts.
  - VRF-01: completed and moved to `verify` after implementing `ip/ipv6 nht no-resolve-via-default` and per-family `protocol <name> route-map <map>` controls in `/network/vrf`.
  - VRF-02: moved to `verify` after auditing existing L3VPN workflow coverage against current guide leaves.
  - SYS-01: completed and moved to `verify` after expanding conntrack UI/API for timeout defaults, custom timeout rules, ignore rules, and log controls.
  - SVC-03: moved to `verify` after DHCP parity audit (shared network/subnet/range/static workflows, template prefill, gateway DNS fallback, network move/edit).
  - SVC-04: moved to `verify` after DNS workflow audit (forwarder/resolver, authoritative domains including reverse zones, domain + host overrides).
  - SVC-05: moved to `verify` after services-tab coverage audit (SSH/NTP/LLDP/mDNS/SNMP/etc. form-driven pages).
  - PKI-01/PKI-02: moved to `verify` after PKI config-scope audit against current guide command tree.
  - X-02/X-03 depth: fixture/snapshot coverage expanded for advanced conntrack leaves.
  - SVC-04 UX depth: DNS Resolver `Listen Addresses` now supports interface-backed selection from detected runtime interface IPs (checkbox list), while preserving manual CSV entry for advanced use cases.
  - SVC-04 UX fix: DNS Resolver interface quick-pick now keeps selections reliably by normalizing addresses, loading ethernet descriptions for `Description (ethX)` labels, and allowing listen-address editing even when DNS service is disabled.
  - Dashboard UX fix: card drag/drop now preserves the user-selected destination column during compaction, preventing cards from snapping back after drop.
  - Dashboard Interface Overview fix: removed heuristic fallback that implicitly treated first interface (often `eth0`) as WAN; WAN badge is now inferred from gateway/default-route signals or unambiguous addressing heuristics only.
  - SVC-04 hotfix: DNS forwarding now auto-applies permissive `allow-from` defaults (`0.0.0.0/0`, `::/0`) when the UI submits an empty/omitted list, preventing VyOS commit failures and allowing "accept everything by default" behavior.
  - SVC-04 UX consolidation: merged `DNS Forwarder` + `DNS Resolver` into a single `DNS` service tab (with backwards-compatible old query parameter redirects).
  - SVC-04 UX enhancement: added `Populate Suggested Defaults` on DNS page to prefill from discovered interface/gateway data (enable DNS, listen-addresses, allow-from defaults, optional local-domain/system-resolver hints) before save.
validation:
  - cd frontend && npx eslint src/app/system/update-check/page.tsx src/app/page.tsx src/components/routing/FailoverContent.tsx scripts/smoke-ui.mjs
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && SMOKE_ROUTES=/ npm run -s smoke:ui (passed on freshly restarted runtime)
  - cd frontend && npx eslint src/app/system/containers/page.tsx
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/app/network/vrf/page.tsx src/lib/api/vrf.ts
  - cd frontend && npx eslint src/app/system/conntrack/page.tsx src/lib/api/system-conntrack.ts src/lib/help/pageGuides.ts
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && timeout 180 npm run -s smoke:ui
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_fixture_save_apply_reload_loops.py tests/test_domain_config_snapshots.py
  - cd frontend && npx eslint src/components/system/DnsServiceTab.tsx
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && SMOKE_ROUTES=/system/services npm run -s smoke:ui
  - cd frontend && npx eslint src/app/system/services/page.tsx src/components/system/DnsServiceTab.tsx src/components/dashboard/ServicesStatusCard.tsx src/app/system/identification/page.tsx
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && SMOKE_ROUTES=/system/services npm run -s smoke:ui
  - cd frontend && npx eslint src/components/system/DnsServiceTab.tsx src/components/dashboard/InterfaceOverviewCard.tsx src/app/page.tsx
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && SMOKE_ROUTES=/,/system/services npm run -s smoke:ui
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_system_services_ssh_dns.py
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && SMOKE_ROUTES=/system/services npm run -s smoke:ui
known_limitations:
  - Full live-device verify for newly promoted `verify` items is still pending.
  - Browser smoke can false-fail with `ChunkLoadError` when runtime serves stale chunk manifests; restart frontend runtime after rebuild before running full route smoke.
  - Dashboard drag/drop still needs explicit UI-level automation coverage for reorder persistence (manual runtime behavior fixed in this slice).
  - Browser smoke still intermittently requires `vm-ui` restart after build due stale chunk manifests (`ChunkLoadError`), even when compile/build are clean.
next_queue:
  - Continue remaining `partial` backlog in guide order, prioritizing firewall + interfaces + NAT + VPN depth.
  - Keep converting partial items to verify only when command-tree coverage and form workflows are demonstrably complete.
  - X-02 and X-03: moved to `verify` after adding command-delta assertions to fixture save/apply/reload loops and enriching conntrack snapshot payload coverage.
current_counts:
  - verify: 86
  - partial: 0

## Cycle Update (2026-02-17 interfaces parity sweep)

### Completed in this cycle
- IF-09 moved to `verify`: tunnel editor now includes guide-covered IPv4 ARP/neighbor controls (`arp-cache-timeout`, ARP filter/accept/announce/ignore, directed-broadcast, proxy-arp, proxy-arp-pvlan) with parser/form/diff-save support.
- IF-10 moved to `verify`: virtual-ethernet now supports robust `vif` subinterface CRUD (VLAN ID, addresses, MTU, MAC, disable/disable-link-detect, `ip adjust-mss`, `ip arp-cache-timeout`, ARP/forwarding toggles).
- IF-12 moved to `verify`: VXLAN editor now supports guide-covered MAC/link controls, IPv4/IPv6 MSS, ARP/filter/forwarding toggles, source-validation, and IPv6 autoconf/eui64/no-default-link-local.
- IF-07 moved to `verify`: pseudo-ethernet editor now supports full guide-covered IP/IPv6/MAC/link controls and proxy-arp options.
- IF-04, IF-05, IF-11, and IF-15 moved to `verify` via command-scope audits against current docs coverage.

### Validation run this cycle
- `cd frontend && npx eslint src/lib/api/tunnel-interface.ts src/app/network/interfaces/tunnel/page.tsx`
- `cd frontend && npx eslint src/lib/api/virtual-ethernet.ts src/app/network/interfaces/virtual-ethernet/page.tsx`
- `cd frontend && npx eslint src/lib/api/vxlan.ts src/app/network/interfaces/vxlan/page.tsx`
- `cd frontend && npx eslint src/lib/api/pseudo-ethernet.ts src/app/network/interfaces/pseudo-ethernet/page.tsx`
- `cd frontend && npx tsc --noEmit --pretty false`
- `cd frontend && npm run -s build`
- `cd frontend && npm run -s smoke:runtime`
- `cd frontend && SMOKE_ROUTES=/network/interfaces/tunnel npm run -s smoke:ui`
- `cd frontend && SMOKE_ROUTES=/network/interfaces/virtual-ethernet npm run -s smoke:ui`
- `cd frontend && SMOKE_ROUTES=/network/interfaces/vxlan npm run -s smoke:ui`
- `cd frontend && SMOKE_ROUTES=/network/interfaces/pseudo-ethernet npm run -s smoke:ui`

### Commits pushed this cycle
- `6a91444` - interfaces: deepen tunnel and veth parity
- `8b7f130` - interfaces: complete vxlan option-depth parity
- `671b69f` - interfaces: deepen pseudo-ethernet parity

### Updated backlog counts
- verify: 63
- partial: 23
- IF-06 moved to `verify` (OpenVPN interface command-scope audit against current guide leaves).
- Updated backlog counts: `verify: 64`, `partial: 22`.

## Cycle Update (2026-02-17 nat/load-balancing partial closure)

### Completed in this cycle
- `NAT-04` moved to `verify`.
  - Added dedicated CGNAT page: `/network/nat/cgnat`.
  - Added form-driven CRUD for global settings (`enable`, `log-allocation`), external/internal pools, and source->translation pool rules.
  - Added NAT page shortcut to CGNAT workspace.
- `LB-02` moved to `verify`.
  - Expanded HAProxy model to guide-aligned global/service/backend workflows.
  - Added service/listener controls, service rules, backend SSL/logging/timeout/http-check/health-check options, and per-server check/proxy controls.

### Commits
- `6e8ed03` - nat: add form-driven cgnat editor and promote NAT-04
- `b5b0b4b` - load-balancing: complete haproxy parity workflows (LB-02)

### Validation
- `cd frontend && npx eslint src/app/network/nat/cgnat/page.tsx src/lib/api/nat-cgnat.ts src/app/network/nat/page.tsx`
- `cd frontend && npx tsc --noEmit --pretty false`
- `cd frontend && npm run -s build`
- `cd frontend && npm run -s smoke:runtime`
- `cd frontend && SMOKE_ROUTES=/network/nat,/network/nat/cgnat npm run -s smoke:ui`
- `cd frontend && npx eslint src/app/network/load-balancing/page.tsx src/lib/api/load-balancing.ts`
- `cd frontend && npx tsc --noEmit --pretty false`
- `cd frontend && npm run -s build`
- `cd frontend && npm run -s smoke:runtime`
- `cd frontend && SMOKE_ROUTES=/network/load-balancing npm run -s smoke:ui`

### Updated implementation counts
- verify: 86
- partial: 0

## Cycle Update (2026-02-17 protocol verification depth pass)

### Completed in this cycle
- Added protocol save/apply/reload loop fixtures for:
  - `OpenFabric` (`/vyos/openfabric/*`)
  - `RPKI` (`/vyos/rpki/*`)
  - `IGMP Proxy` (`/vyos/igmp-proxy/*`)
  - `PIM` (`/vyos/pim/*`)
  - `PIM6` (`/vyos/pim6/*`)
- Added protocol snapshot coverage for:
  - `PIM` (`/vyos/pim/config`)
  - `PIM6` (`/vyos/pim6/config`)
- Added static/failover protocol verification depth:
  - `Failover` loop fixture + snapshot (`/vyos/failover/*`)
  - `Static protocol` loop fixture + snapshot (`/vyos/static-protocol/*`)

### Validation run this cycle
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_fixture_save_apply_reload_loops.py tests/test_domain_config_snapshots.py`
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_protocol_capabilities.py tests/test_fixture_save_apply_reload_loops.py tests/test_domain_config_snapshots.py`

### Result
- Protocol verification stack is green (`121 passed`).
- This closes 6 additional protocol verification slices in automated regression depth (OpenFabric, RPKI, IGMP Proxy, PIM, PIM6, Failover) plus static-protocol coverage.

### Incremental Update (BGP verification depth)
- Added `backend/tests/test_bgp_save_apply_reload_loop.py` to cover BGP's builder-based batch contract (`op/value` operations) with save/apply/reload behavior assertions.
- This closes the prior gap where BGP could not be represented by the generic command-string loop harness.
- Validation: `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_bgp_save_apply_reload_loop.py tests/test_protocol_capabilities.py tests/test_fixture_save_apply_reload_loops.py tests/test_domain_config_snapshots.py` (`122 passed`).

### Incremental Update (static-routes batch verification)
- Added `backend/tests/test_static_routes_save_apply_reload_loop.py` to cover the full `static-routes` batch endpoint contract (`destination` + `route_type` + operation objects) and round-trip config assertions.
- Validation: `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_static_routes_save_apply_reload_loop.py tests/test_bgp_save_apply_reload_loop.py tests/test_protocol_capabilities.py tests/test_fixture_save_apply_reload_loops.py tests/test_domain_config_snapshots.py` (`123 passed`).
