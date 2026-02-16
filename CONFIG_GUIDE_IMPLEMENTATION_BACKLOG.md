# CONFIG_GUIDE_IMPLEMENTATION_BACKLOG

Generated: 2026-02-15
Source: https://docs.vyos.io/en/latest/configuration/index.html

## Purpose
This backlog tracks **real implementation gaps** against the VyOS Configuration Guide.
Unlike `CONFIG_COVERAGE_MATRIX.*`, this file is option-level and UX-level (full CRUD, validation, and safe apply), not just route/file detection.

## Status Model
- `missing`: not implemented in GUI/API in a usable form.
- `partial`: implemented but missing significant guide-covered options/workflows.
- `verify`: likely implemented, but needs guide-by-guide verification with fixture + save/apply + reload checks.

## Global Quality Bar (applies to every backlog item)
- No free-form CLI textbox as primary workflow.
- Full create/read/update/delete for supported objects.
- Input validation and guardrails for invalid combinations.
- Safe Apply path for connectivity-sensitive changes.
- Tests: unit (parsing/commands), integration (router/service), and route/runtime smoke.
- Verification artifact: expected config vs `show configuration commands` snapshot.

## Execution Order (Guide Order)
1. Container
2. Firewall
3. High availability
4. Interfaces
5. Load-balancing
6. NAT
7. PKI
8. Policy
9. Protocols
10. Service
11. Traffic Policy
12. VPN
13. VRF
14. System

---

## Backlog

### Container (`container/index.html`)
- `C-01` (`verify`): Expand container spec editor to full guide fields (resource limits, user/group, capabilities/devices, security/runtime knobs). Implemented in current slice; pending live-instance verification.
- `C-02` (`verify`): Image lifecycle workflows now include pull/update/delete APIs plus row-level quick actions in GUI; pending live verification on clean instance.
- `C-03` (`verify`): Network model now enforces overlap checks and static address/prefix safety (UI pre-check + backend validation); pending live-instance verification.
- `C-04` (`verify`): Operational workflows now include action controls, logs controls, and inspect summary parsing with raw fallback; pending live verification.
- `C-05` (`verify`): Validate full first-run bootstrap flow end-to-end on clean instance.

### Firewall (`firewall/*`)
- `F-01` (`partial`): IPv4 rule coverage parity pass (advanced match conditions, state behaviors, action sub-options). Batch API now includes strict chain/rule/value argument validation and deterministic `400` error semantics; rule modal now enforces action-dependent targets (jump/offload).
- `F-02` (`partial`): IPv6 rule coverage parity pass in progress (canonical icmpv6/hop-limit operation wiring fixed, legacy op aliases retained for compatibility, strict chain/rule/value argument validation added; rule modal action-dependent target validation added; advanced controls still pending).
- `F-03` (`partial`): Firewall groups type parity in progress (added typed create/edit validation + backend server-side value validation + HTTP status hardening; remaining advanced/reference depth pending).
- `F-04` (`partial`): Global options parity pass in progress (added server-side enum/timeout validation for both `/update` and `/batch`, with explicit 400 semantics and batch value normalization; deeper option coverage still pending).
- `F-05` (`partial`): Flowtables parity pass in progress (backend validation hardening for names/ops/interfaces/offload + dedicated tests complete; remaining tunable-depth UX/verification pending).
- `F-06` (`partial`): Zone workflow hardening in progress (cross-zone validation added: interface overlap protection + `from_zone` existence/canonicalization with `LOCAL`; UI now pre-validates policy textarea format/duplicates and guided preset interface conflicts before apply; remaining onboarding/UX depth pending).

### High Availability (`highavailability/index.html`)
- `HA-01` (`partial`): Complete VRRP and sync-group option parity audit against guide leaves.
- `HA-02` (`partial`): Complete IPVS virtual/real server parity (all health/protocol/scheduler options).
- `HA-03` (`verify`): Dual-node failover verification playbook and smoke tests.

### Interfaces (`interfaces/*`)
- `IF-01` (`partial`): Add robust `bonding` editor (members/mode/hash/lacp settings). Baseline page implemented; advanced option-depth verification remains.
- `IF-02` (`partial`): Add robust interface `bridge` editor (ports/stp/bridge options). Baseline page implemented; advanced option-depth verification remains.
- `IF-03` (`partial`): Add robust `geneve` editor. Baseline page implemented; advanced option-depth verification remains.
- `IF-04` (`partial`): Add robust `l2tpv3` editor. Baseline page implemented; advanced option-depth verification remains.
- `IF-05` (`partial`): Add robust `macsec` editor. Baseline page implemented; advanced option-depth verification remains.
- `IF-06` (`partial`): Add robust `openvpn` interface editor. Baseline page implemented; advanced option-depth verification remains.
- `IF-07` (`partial`): Add robust `pseudo-ethernet` (macvlan) editor. Baseline page implemented; VLAN-depth and edge-option verification remains.
- `IF-08` (`partial`): Add robust `sstp-client` editor. Baseline page implemented; extended auth/operation-depth verification remains.
- `IF-09` (`partial`): Add robust `tunnel` editor. Baseline page implemented; advanced protocol/parameter depth verification remains.
- `IF-10` (`partial`): Add robust `virtual-ethernet` (veth) editor. Baseline page implemented; VLAN-depth verification remains.
- `IF-11` (`partial`): Add robust `vti` editor. Baseline page implemented; VPN IPsec interaction and advanced parity verification remains.
- `IF-12` (`partial`): Add robust `vxlan` editor. Baseline page implemented; advanced EVPN/SVD depth verification remains.
- `IF-13` (`partial`): Add robust `wireless` editor. Baseline form-first page is implemented with core WLAN, WPA/RADIUS, HT capabilities, and country-code support; advanced 802.11 capability depth still needs parity sweep.
- `IF-14` (`partial`): Add robust `wwan` editor. Baseline form-first page is implemented with APN, addressing, DHCP options, and IPv4/IPv6 tuning; full DHCPv6-PD and modem-op depth still needs parity sweep.
- `IF-15` (`partial`): Deepen existing ethernet/pppoe/loopback/wireguard option parity.

### Load Balancing (`loadbalancing/*`)
- `LB-01` (`partial`): WAN load balancing full option parity (health, interface weights, policy controls).
- `LB-02` (`partial`): HAProxy parity pass (frontend/backend/listener/server-check options).
- `LB-03` (`verify`): Validation of route/failover behavior with multi-uplink fixtures.

### NAT (`nat/*`)
- `NAT-01` (`partial`): NAT44 advanced option parity (rule actions, flags, edge options).
- `NAT-02` (`partial`): NAT64 parity completion.
- `NAT-03` (`partial`): NAT66/NPTv6 parity completion.
- `NAT-04` (`partial`): CGNAT parity completion.

### PKI (`pki/index.html`)
- `PKI-01` (`partial`): Complete CA/certificate lifecycle parity (import/export/sign/revoke/CRL operations).
- `PKI-02` (`partial`): Add CSR and cert issuance workflows with validation helpers.
- `PKI-03` (`verify`): Cross-page consumers (VPN/services) correctly consume PKI objects.

### Policy (`policy/*`)
- `POL-01` (`partial`): Route-map action/match coverage parity sweep against guide options.
- `POL-02` (`partial`): Access/prefix/local-route edge-case validation parity.
- `POL-03` (`verify`): Policy object dependency checks and referential integrity hardening.

### Protocols (`protocols/*`)
- `PR-01` (`partial`): BGP full-depth parity pass (neighbors/AFI-SAFI/policy hooks/advanced timers/features).
- `PR-02` (`partial`): OSPF/IS-IS/OpenFabric/RIP depth parity audit and missing leaves implementation.
- `PR-03` (`partial`): Segment Routing page + backend parity implemented; option-depth validation and live interop verification remain.
- `PR-04` (`partial`): Static/failover advanced options parity completion.
- `PR-05` (`partial`): Multicast stack depth parity (IGMP Proxy/PIM/PIM6 advanced leaves).
- `PR-06` (`partial`): RPKI and MPLS option-level parity completion.

### Service (`service/*`)
- `SVC-01` (`partial`): Config Sync service page + backend wrapper implemented; perform option-depth/UX validation on live nodes.
- `SVC-02` (`partial`): Router Advertisements service page + backend wrapper implemented; continue option-depth parity audit and validation.
- `SVC-03` (`partial`): DHCP Server parity sweep vs guide (shared networks/subnets/options/UX guardrails).
- `SVC-04` (`partial`): DNS forwarder/resolver authoritative/reverse-lookup UX parity hardening.
- `SVC-05` (`partial`): Existing service tabs (SSH/NTP/LLDP/mDNS/SNMP/etc.) option-level completion.

### Traffic Policy (`trafficpolicy/index.html`)
- `TP-01` (`partial`): Complete remaining policy-type leaves and class defaults not yet modeled.
- `TP-02` (`partial`): Validate assignment semantics and incompatibility handling for all policy families.
- `TP-03` (`verify`): Throughput/latency fixture verification on representative links.

### VPN (`vpn/*`)
- `VPN-01` (`partial`): IPsec site-to-site phase1/phase2 full option parity (guide-complete selectors).
- `VPN-02` (`partial`): IPsec remote-access/mobile-clients parity and required dependent objects.
- `VPN-03` (`partial`): DMVPN option-depth parity (NHRP/IPsec profile interactions).
- `VPN-04` (`partial`): L2TP/OpenConnect/PPTP/SSTP option-level parity sweep.
- `VPN-05` (`verify`): End-to-end tunnel bring-up and diagnostics workflows (GUI-first).

### VRF (`vrf/index.html`)
- `VRF-01` (`partial`): Full VRF static and control-plane option-depth parity.
- `VRF-02` (`partial`): L3VPN/VRF operational workflow implemented on the VRF page; live interop and deep option validation remain.
- `VRF-03` (`verify`): Interactions with policy, interfaces, and routing protocols.

### System (`system/*`) — **last by request**
- `SYS-01` (`partial`): System Conntrack page + backend wrapper are implemented; option-depth parity and live workflow validation remain.
- `SYS-02` (`partial`): Serial Console page + backend wrapper are implemented; option-depth parity and live workflow validation remain.
- `SYS-03` (`partial`): Default Route/Gateway page + backend wrapper are implemented; option-depth parity and multi-path validation remain.
- `SYS-04` (`partial`): Build Flow Accounting page. Baseline form-first page + backend wrapper are implemented; option-depth parity and live telemetry validation remain.
- `SYS-05` (`partial`): FRR system page + backend wrapper are implemented; option-depth parity and live workflow validation remain.
- `SYS-06` (`partial`): IP system options page + backend wrapper are implemented; option-depth parity and live workflow validation remain.
- `SYS-07` (`partial`): IPv6 system options page + backend wrapper are implemented; option-depth parity and live workflow validation remain.
- `SYS-08` (`partial`): LCD page + backend wrapper are implemented; option-depth parity and live workflow validation remain.
- `SYS-09` (`partial`): Login/user management parity deepening in progress: local user CRUD now includes `authentication principal` + OTP controls (`key`, `rate-limit`, `window-size`), and global `system login` page coverage now includes pre/post-login banners, max sessions, timeout, RADIUS source address/server set, and TACACS server set with form-based UI + backend validation/tests. Remaining depth: advanced multi-auth edge behavior and live end-to-end verification against real AAA backends.
- `SYS-10` (`partial`): Name-server ownership and resolver integration cleanup.
- `SYS-11` (`partial`): Build System Proxy page. Baseline form-first page + backend wrapper are implemented; option-depth parity and live validation remain.
- `SYS-12` (`partial`): sFlow page + backend wrapper are implemented; option-depth parity and live workflow validation remain.
- `SYS-13` (`partial`): Build Sysctl page. Baseline parameter CRUD page + backend wrapper are implemented; option-depth parity and live validation remain.
- `SYS-14` (`partial`): System Syslog page + backend wrapper now implemented with global marker/FQDN/source controls and structured console/file/remote destination rule editing (including remote protocol/port/format/TLS baseline). Remaining depth: advanced archive/template leaves and exhaustive interop validation.
- `SYS-15` (`partial`): Task Scheduler page + backend wrapper are implemented; option-depth parity and live workflow validation remain.
- `SYS-16` (`partial`): Time-zone/update/watchdog parity deepening in progress (added `update-check auto-check` and watchdog hardware controls: `module`, `timeout`, `shutdown-timeout`, `reboot-timeout`; remaining depth + live verification still pending).

---

## Program-Level Cross-Cutting Backlog
- `X-01` (`partial`): Added option-level parity scorer (`scripts/score_option_parity.py`) with JSON/MD scorecards; next step is improving matching precision and enforcing per-domain thresholds in CI.
- `X-02` (`partial`): Added fixture-driven save/apply/reload loops (`backend/tests/fixtures/config_apply_loops.json`, `backend/tests/test_fixture_save_apply_reload_loops.py`, `backend/tests/test_firewall_nat_save_apply_reload_loops.py`) across 35 domains/endpoints (protocols, services, VPN, DMVPN, PKI, QoS, system wrappers, baseline firewall/NAT); remaining work is advanced-option depth and live-device runs.
- `X-03` (`partial`): Added domain config snapshot tests (`backend/tests/snapshots/domain_config_snapshots.json`, `backend/tests/test_domain_config_snapshots.py`, `backend/tests/snapshots/firewall_nat_config_snapshots.json`, `backend/tests/test_firewall_nat_config_snapshots.py`) across 38 endpoints; remaining work is command-delta snapshots and live-instance comparisons.
- `X-04`: Add browser smoke routes for every newly added/updated page.
- `X-05` (`partial`): Added reproducible robustness relook runner (`scripts/run_robustness_relook.py`) and generated baseline report (`ROBUSTNESS_RELOOK_REPORT.md`); remaining work is broadening to full parity-domain live verification before final sign-off.
