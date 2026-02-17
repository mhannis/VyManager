feature_id: backlog-partial-implementation-sweep-2026-02-17
title: Partial backlog implementation sweep (implementation first, verify deferred)
status: in_progress
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
known_limitations:
  - Full live-device verify for newly promoted `verify` items is still pending.
  - Browser smoke can false-fail with `ChunkLoadError` when runtime serves stale chunk manifests; restart frontend runtime after rebuild before running full route smoke.
next_queue:
  - Continue remaining `partial` backlog in guide order, prioritizing firewall + interfaces + NAT + VPN depth.
  - Keep converting partial items to verify only when command-tree coverage and form workflows are demonstrably complete.
  - X-02 and X-03: moved to `verify` after adding command-delta assertions to fixture save/apply/reload loops and enriching conntrack snapshot payload coverage.
current_counts:
  - verify: 55
  - partial: 31
