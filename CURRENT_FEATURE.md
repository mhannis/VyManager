feature_id: interfaces-if-06-through-if-12-openvpn-peth-sstpc-veth-tunnel-vti-vxlan-2026-02-15
status: in_progress
title: Interfaces parity slice: OpenVPN + Pseudo-Ethernet + SSTP Client + Virtual-Ethernet + Tunnel + VTI + VXLAN editors
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added backend scoped config-tree wrappers for:
    - `interfaces openvpn`
    - `interfaces pseudo-ethernet`
    - `interfaces sstpc`
    - `interfaces virtual-ethernet`
    - `interfaces tunnel`
    - `interfaces vti`
    - `interfaces vxlan`
  - Added form-first pages:
    - `/network/interfaces/openvpn`
    - `/network/interfaces/pseudo-ethernet`
    - `/network/interfaces/sstp-client`
    - `/network/interfaces/virtual-ethernet`
    - `/network/interfaces/tunnel`
    - `/network/interfaces/vti`
    - `/network/interfaces/vxlan`
  - Updated sidebar and Network Interfaces quick links to expose all seven new interface-family pages.
  - Added page guides for OpenVPN, Pseudo-Ethernet, SSTP Client, Virtual-Ethernet, Tunnel, VTI, and VXLAN under shared `pageGuides` registry.
  - Expanded backend wrapper tests and runtime/browser smoke route lists to include all added interface pages.
  - Validation complete: backend tests (`51` + combined `118`), frontend typecheck, targeted eslint for changed files, frontend build, runtime smoke.
  - Browser smoke (`npm run -s smoke:ui`) still blocked by missing host Playwright lib `libnspr4.so` (tracked in `LAST_FAILURE.txt`).
  - Next queue: `IF-13` (wireless strategy/capability gating), then `IF-14` (wwan strategy/capability gating).
