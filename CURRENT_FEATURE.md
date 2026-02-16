feature_id: interface-ia-consolidation-v1-2026-02-16
status: in_progress
title: Interfaces IA consolidation v1 (unified manager + grouped navigation)
branch: feature/containers-automation-v1
commits:
  - ed63528 (system page-guide runtime hotfix)
  - pending (interfaces IA consolidation v1)
notes:
  - Replaced the large per-type Interfaces sidebar list with logical entries:
    - `Interface Manager` (`/network/interfaces`)
    - `Core & L2` (`/network/interfaces?group=core-l2`)
    - `Overlay & Secure` (`/network/interfaces?group=overlay-secure`)
    - `Access & WAN` (`/network/interfaces?group=access-wan`)
  - Refactored `Network -> Interfaces` into a unified hub:
    - Group filter buttons for families
    - Family cards with concise scope and common-field badges
    - Direct `Open` links to each detailed editor for advanced settings
    - Retained existing Ethernet/VLAN management in-place on the same hub page
  - Added consolidated route probes to smoke scripts:
    - `/network/interfaces?group=core-l2`
    - `/network/interfaces?group=overlay-secure`
    - `/network/interfaces?group=access-wan`
  - Build/runtime validation for this slice:
    - `cd frontend && npx tsc --noEmit --pretty false`
    - `cd frontend && npm run -s build`
    - `cd frontend && npm run -s smoke:runtime`
  - Browser smoke remains host-blocked on missing `libnspr4.so`.
  - Next queue:
    - Implement shared create/edit drawer modules so additional interface families can be edited inline from unified manager (without leaving page).
