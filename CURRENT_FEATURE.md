feature_id: interface-ia-consolidation-v1-2026-02-16
status: in_progress
title: Interfaces IA consolidation v2 (grouped manager + inline quick add)
branch: feature/containers-automation-v1
commits:
  - b3ea5d5 (interfaces IA grouped manager hub)
  - 199cac3 (interfaces inline quick add for dummy/loopback/pppoe + description-first PPPoE source selector)
  - d87861c (interfaces inline quick add for VTI/VXLAN)
  - pending (interfaces inline quick add for tunnel)
notes:
  - Interfaces sidebar remains consolidated to:
    - `Interface Manager`
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
  - Family cards still link to dedicated advanced pages for full feature depth.
  - Validation for this increment:
    - `cd frontend && npx tsc --noEmit --pretty false`
    - `cd frontend && npx eslint src/app/network/interfaces/page.tsx src/components/layout/Sidebar.tsx scripts/smoke-ui.mjs --max-warnings=0`
    - `cd frontend && npm run -s build`
    - `cd frontend && npm run -s smoke:runtime`
  - Browser smoke (`npm run -s smoke:ui`) remains blocked by host dependency `libnspr4.so`.
  - Next queue:
    - Add inline quick-edit (prefill existing values) for quick-add-enabled families while keeping advanced pages as full editors.
