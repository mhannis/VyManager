feature_id: interface-ia-consolidation-v1-2026-02-16
status: in_progress
title: Interfaces IA consolidation v2 (grouped manager + inline quick add)
branch: feature/containers-automation-v1
commits:
  - b3ea5d5 (interfaces IA grouped manager hub)
  - 199cac3 (interfaces inline quick add for dummy/loopback/pppoe + description-first PPPoE source selector)
  - d87861c (interfaces inline quick add for VTI/VXLAN)
  - daff875 (interfaces inline quick add for tunnel)
  - 55814ca (interfaces sidebar collapse to single nav item + setup wizard button polish)
  - f078934 (interfaces embedded layout mode for panel workspace)
  - 2c39ce4 (interfaces workspace panel full-width tuning)
  - 3afb5ba (interfaces family dual actions inline + open page)
  - pending (revert to dedicated separate interface family pages only)
notes:
  - Interfaces sidebar remains consolidated to:
    - `Interfaces`
  - Interfaces page keeps family grouping/filtering:
    - `All Families`
    - `Core & L2`
    - `Overlay & Secure`
    - `Access & WAN`
  - Unified manager (`/network/interfaces`) now includes inline quick-add for:
    - Dummy interfaces
    - Loopback interfaces
    - PPPoE interfaces
    - VTI interfaces
    - VXLAN interfaces
    - Tunnel interfaces
  - PPPoE quick-add uses a source-interface selector that displays interface descriptions first (`Description (ethX)`), then canonical interface names.
  - Quick-add uses existing API contracts:
    - `POST /vyos/dummy/batch`
    - `POST /vyos/loopback-interface/configure`
    - `POST /vyos/pppoe-interface/configure`
    - `POST /vyos/vti-interface/configure`
    - `POST /vyos/vxlan-interface/configure`
    - `POST /vyos/tunnel-interface/configure`
  - Family actions now use dedicated page navigation only (`Open`) for each interface type; inline workspace panel has been removed.
  - Interface family cards now show `Current` (disabled) when a card targets the exact view already open, so `Open` no longer appears broken on the current page.
  - Setup wizard remains available on the Interfaces page via `Open Setup Wizard`.
  - Validation for this increment:
    - `cd frontend && npx tsc --noEmit --pretty false`
    - `cd frontend && npx eslint src/app/network/interfaces/page.tsx src/components/layout/Sidebar.tsx scripts/smoke-ui.mjs --max-warnings=0`
    - `cd frontend && npm run -s build`
    - `cd frontend && npm run -s smoke:runtime`
  - Browser smoke (`npm run -s smoke:ui`) remains blocked by host dependency `libnspr4.so`.
  - Next queue:
    - Add inline quick-edit (prefill existing values) for quick-add-enabled families while keeping advanced pages as full editors.
