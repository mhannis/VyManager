feature_id: segment-routing-and-vrf-l3vpn-v1-2026-02-16
title: Segment Routing page + VRF L3VPN workflow
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added backend Segment Routing router:
    - /vyos/segment-routing/capabilities
    - /vyos/segment-routing/config
    - /vyos/segment-routing/batch
  - Added form-first Segment Routing UI:
    - /routing/infrastructure/segment-routing
    - OSPF + IS-IS SRGB/SRLB/maximum-label-depth
    - Prefix-SID entry CRUD (index value + no-php/explicit-null/n-flag-clear)
    - OSPF opaque-LSA prerequisite toggle
  - Extended Routing Infrastructure selector to include Segment Routing.
  - Consolidated left nav: removed separate L3VPN item; keep one VRF item with in-page tabs.
  - Rebuilt /network/vrf into two tabs:
    - VRF Core (instances + static routes)
    - L3VPN VRFs (RD, RT import/export/both, label export/allocation, import/export vpn, import-vrf, route-maps, BGP MPLS forwarding interfaces)
  - Updated strict backlog statuses:
    - PR-03 => partial
    - VRF-02 => partial
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_protocol_capabilities.py tests/test_config_tree_wrapper_capabilities.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/app/network/vrf/page.tsx src/app/routing/infrastructure/page.tsx src/app/routing/infrastructure/segment-routing/page.tsx src/components/layout/Sidebar.tsx src/components/routing/SegmentRoutingContent.tsx src/lib/api/vrf.ts src/lib/api/segment-routing.ts src/lib/help/routingProtocolGuides.ts src/lib/sidebar-visibility.ts scripts/smoke-ui.mjs --max-warnings=0
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_protocol_capabilities.py
known_limitations:
  - Browser smoke (Playwright) still blocked by missing host dependency libnspr4.so.
next_queue:
  - X-01 option-level parity scorer
  - X-02 fixture save/apply/reload loops
  - X-03 config snapshot tests by domain
  - Continue partial-depth sweeps (protocols/services/firewall/interfaces/vpn/system)
