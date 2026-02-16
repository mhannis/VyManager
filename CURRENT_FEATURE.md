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
  - 134fd11 (revert to dedicated separate interface family pages only)
  - 69a4987 (restore interface family entries in left sidebar)
  - 7868da2 (trim family-link duplication from Interface Manager + restore old sidebar label)
  - pending (unified create-interface wizard with all interface families)
notes:
  - Interfaces sidebar remains consolidated to:
    - `Interfaces`
  - `Create Interface` now drives a single wizard modal with a full interface-family selector.
  - PPPoE quick-add uses a source-interface selector that displays interface descriptions first (`Description (ethX)`), then canonical interface names.
  - Wizard create uses existing API contracts:
    - `POST /vyos/ethernet/batch` (via dedicated Ethernet modal)
    - `POST /vyos/ethernet/batch` for VLAN/QinQ (via dedicated VLAN modal)
    - `POST /vyos/dummy/batch`
    - `POST /vyos/bonding/configure`
    - `POST /vyos/bridge/configure`
    - `POST /vyos/geneve/configure`
    - `POST /vyos/l2tpv3/configure`
    - `POST /vyos/loopback-interface/configure`
    - `POST /vyos/macsec/configure`
    - `POST /vyos/interface-openvpn/configure`
    - `POST /vyos/pppoe-interface/configure`
    - `POST /vyos/pseudo-ethernet/configure`
    - `POST /vyos/sstpc/configure`
    - `POST /vyos/virtual-ethernet/configure`
    - `POST /vyos/vti-interface/configure`
    - `POST /vyos/vxlan-interface/configure`
    - `POST /vyos/tunnel-interface/configure`
    - `POST /vyos/wireless-interface/batch`
    - `POST /vyos/wwan-interface/configure`
  - Family actions now use dedicated page navigation only (`Open`) for each interface type; inline workspace panel has been removed.
  - Interface family entries are restored under the left sidebar `Interfaces` section for direct navigation.
  - Interface Manager no longer renders full family-link duplication; it now keeps quick-create cards only.
  - Sidebar child label for `/network/interfaces` is restored to `All Interfaces`.
  - `Create Interface` button now opens the unified wizard instead of directly opening only Ethernet create.
  - Setup wizard remains available on the Interfaces page via `Open Setup Wizard`.
  - Validation for this increment:
    - `cd frontend && npx tsc --noEmit --pretty false`
    - `cd frontend && npx eslint src/app/network/interfaces/page.tsx --max-warnings=0`
    - `cd frontend && npm run -s build`
    - `cd frontend && npm run -s smoke:runtime`
  - Browser smoke (`npm run -s smoke:ui`) remains blocked by host dependency `libnspr4.so`.
  - Next queue:
    - Add inline quick-edit (prefill existing values) for quick-add-enabled families while keeping advanced pages as full editors.
