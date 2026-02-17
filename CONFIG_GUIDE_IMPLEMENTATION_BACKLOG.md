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
- `F-01` (`verify`): IPv4 rule parity hardening implemented (protocol/action semantic coupling, advanced-leaf reorder preservation including GeoIP/mac/domain/remote groups, and remote-group API mapping); pending live verification.
- `F-02` (`verify`): IPv6 rule parity hardening implemented (protocol/action semantic coupling, canonical icmpv6/hop-limit handling with compatibility aliases, advanced-leaf reorder preservation, and remote-group API mapping); pending live verification.
- `F-03` (`verify`): Firewall groups parity hardening implemented (typed validation, conflict/duplicate batch checks, single remote URL guardrail, and deterministic HTTP semantics); pending live verification.
- `F-04` (`verify`): Firewall global-options parity hardening implemented (enum/timeout validation in update+batch paths with normalized batch values); pending live verification.
- `F-05` (`verify`): Firewall flowtables parity hardening implemented (strict validation, duplicate/conflict checks, description bounds, and canonical offload normalization); pending live verification.
- `F-06` (`verify`): Firewall zones hardening implemented (cross-zone interface validation, canonicalized from-zone handling including LOCAL, policy-textarea validation, and guided-preset preflight checks); pending live verification.

### High Availability (`highavailability/index.html`)
- `HA-01` (`verify`): VRRP/sync-group depth now includes full add/edit/delete UX (including rename-safe updates), per-address interface bindings (`address=interface`) with deterministic save diffs, and guide-aligned numeric guardrails for startup/GARP/health fields. Pending live-node verification.
- `HA-02` (`verify`): IPVS depth now includes stronger virtual/real server guardrails (address validation, required backend members, numeric constraints, and deterministic diff writes) in the existing HA editor. Pending live interop verification.
- `HA-03` (`verify`): Dual-node failover verification playbook and smoke tests.

### Interfaces (`interfaces/*`)
- `IF-01` (`verify`): Bonding editor parity deepened with advanced leaves beyond baseline (`evpn uplink`, mirror ingress/egress, plus existing member/mode/hash/lacp/arp-monitor controls) and parser/diff-save support; pending live verification.
- `IF-02` (`verify`): Bridge editor parity deepened with per-member VLAN leaves (`native-vlan`, `allowed-vlan`) and bridge mirror ingress/egress controls in parser/form/diff-save workflow on top of existing STP/IGMP/member options; pending live verification.
- `IF-03` (`verify`): Geneve parity deepened with guide-covered IPv4/IPv6 interface controls (`ip arp-cache-timeout`, ARP/filter/forwarding/proxy toggles, `ipv6 accept-dad`, `ipv6 address autoconf/eui64/no-default-link-local`, `ipv6 dup-addr-detect-transmits`, `ipv6 disable-forwarding`) plus parser/diff-save support. Pending live verification.
- `IF-04` (`verify`): L2TPv3 command-scope audit against current guide confirms full coverage of documented leaves (`address`, `description`, `disable`) in the existing form workflow; pending live verification.
- `IF-05` (`verify`): MACsec command-scope audit confirms documented interface leaves (`address`, `description`, `disable`, `mtu`, `mac`, `disable-flow-control`, `disable-link-detect`) are covered in parser + form + diff-save workflow; pending live verification.
- `IF-06` (`verify`): OpenVPN interface command-scope audit against current guide confirms documented leaves are covered by the existing form-driven editor (authentication, device type, encryption/hash, and IP tuning controls). Pending live verification.
- `IF-07` (`verify`): Pseudo-ethernet parity deepened with full guide-covered interface controls (MAC, flow/link toggles, IPv4 MSS/ARP/filter/forwarding/source-validation, proxy-arp options, and IPv6 autoconf/eui64/no-default-link-local/forwarding) plus parser/diff-save support. Pending live verification.
- `IF-08` (`verify`): SSTP client page now matches documented interface leaves (`description`, `disable`, `mtu`, `vrf`, `no-default-route`, `default-route-distance`, `no-peer-dns`, `server`, `ip adjust-mss`, `ip disable-forwarding`, `ip source-validation`) with form CRUD. Pending live verification.
- `IF-09` (`verify`): Tunnel editor parity deepened to include guide-covered IPv4 ARP/neighbor controls (`arp-cache-timeout`, ARP filter/accept/announce/ignore, directed-broadcast, proxy-arp, proxy-arp-pvlan) with parser/form/diff-save support. Pending live verification.
- `IF-10` (`verify`): Virtual-ethernet parity deepened with full `vif` subinterface editor (VLAN ID, addresses, description, disable/disable-link-detect, MTU, MAC, `ip adjust-mss`, `ip arp-cache-timeout`, ARP/filter/forwarding toggles) plus parser/diff-save support. Pending live verification.
- `IF-11` (`verify`): VTI command-scope audit against current guide confirms coverage of documented workflow (interface addressing) in the existing form editor with optional description/mtu/vrf/disable controls. Pending live IPsec interop verification.
- `IF-12` (`verify`): VXLAN parity deepened with full guide-covered interface controls (MAC, flow/link detect toggles, IPv4/IPv6 MSS controls, ARP/filter/forwarding toggles, source-validation, IPv6 autoconf/eui64/no-default-link-local) plus parser/diff-save support. Pending live verification.
- `IF-13` (`verify`): Wireless parity deepened with HE capability controls (`antenna-pattern-fixed`, `beamform` modes, `bss-color`, `center-channel-freq freq-1`, `channel-set-width`) in parser/form/diff-save workflow on top of existing WLAN/WPA/HT/VHT controls; pending live verification.
- `IF-14` (`verify`): WWAN parity now covers guide command leaves (APN, addressing, IPv4/IPv6 tuning, DHCPv4 extras, DHCPv6 PD rows/flags/duid) and includes runtime telemetry on the page (runtime IPs/link/driver details) for operational visibility; pending live modem verification.
- `IF-15` (`verify`): Existing ethernet/pppoe/loopback/wireguard parity sweep completed. Loopback command-scope audit against current guide confirms full coverage (`address`, `description`) in form-driven workflow; pending live verification.

### Load Balancing (`loadbalancing/*`)
- `LB-01` (`verify`): WAN load-balancing parity expanded with global options (`disable-source-nat`, `flush-connections`, `sticky-connections inbound`, `hook script-name`), interface-health test CRUD (`type/target/resp-time/ttl-limit/test-script`), rule-level advanced match/behavior fields (`protocol`, source/destination selectors, interface weights, limit fields, `exclude`, `failover`, `per-packet-balancing`). Pending live verification.
- `LB-02` (`verify`): HAProxy parity expanded with guide-aligned global parameters, service/listener workflows, service rule actions, backend SSL/logging/timeout/http-check/health-check options, and per-server check/proxy controls in form-based workflows. Pending live verification.
- `LB-03` (`verify`): Validation of route/failover behavior with multi-uplink fixtures.

### NAT (`nat/*`)
- `NAT-01` (`verify`): NAT44 parity hardened for reliable CRUD/update workflows (field-clear delete semantics for source/destination/static edits, static rule update op-name parity, and static reorder builder parity). Pending live verification.
- `NAT-02` (`verify`): NAT64 guide scope is primarily workflow/policy guidance layered onto NAT source/destination rule primitives already covered by the NAT44 editor (address/port/protocol/translation selectors). Pending live IPv6 translation-path verification.
- `NAT-03` (`verify`): NAT66/NPTv6 guide scope is primarily workflow guidance layered onto existing NAT rule primitives; current editor supports required selector/translation inputs for the documented flows. Pending live NPTv6 verification.
- `NAT-04` (`verify`): CGNAT parity completion implemented with a dedicated form-driven editor (`/network/nat/cgnat`) covering global enable/log-allocation, external/internal pool CRUD, range/seq support, and source->translation pool rule mapping. Pending live carrier-grade verification.

### PKI (`pki/index.html`)
- `PKI-01` (`verify`): PKI configuration-tree parity confirmed for CA/certificate/private/acme/revoke/CRL leaves with form-based CRUD; pending live verification.
- `PKI-02` (`verify`): Current guide configuration scope is covered; operational key/cert generation/import/export workflows are tracked as a separate enhancement stream.
- `PKI-03` (`verify`): Cross-page consumers (VPN/services) correctly consume PKI objects.

### Policy (`policy/*`)
- `POL-01` (`verify`): Route-map action/match coverage audited against current GUI implementation (broad match trees, BGP attributes, community/large-community action families, next-hop controls, and advanced flow controls) with form-driven CRUD; pending live verification.
- `POL-02` (`verify`): Route-map rule edge-case validation hardened in add/edit flows (self-call guard, continue/goto/on-match exclusivity, and strict numeric-field validation before submit); pending live verification.
- `POL-03` (`verify`): Policy object dependency checks and referential integrity hardening.

### Protocols (`protocols/*`)
- `PR-01` (`verify`): BGP depth audited across system/neighbor/peer-group/address-family/parameter workflows (including route-map and BFD hooks) with form-based CRUD; pending live interoperability verification.
- `PR-02` (`verify`): OSPF/IS-IS/OpenFabric/RIP depth audited in existing dedicated protocol editors; runtime route smoke on all pages is stable and pending live protocol-neighbor verification.
- `PR-03` (`verify`): Segment Routing page fully models currently documented IS-IS/OSPF segment-routing leaves (global/local blocks, maximum label depth, prefix-SID index value/flags, and OSPF `opaque-lsa`) with form-based diff operations. Pending live interop verification.
- `PR-04` (`verify`): Static/failover advanced options parity tightened: failover `check type` now aligns to guide enum (`icmp|arp|tcp`), `check policy` is enum-backed (`any-available|all-available`), and timeout/metric numeric guardrails are enforced. Pending live verification.
- `PR-05` (`verify`): Multicast stack depth parity is implemented across IGMP Proxy/PIM/PIM6, including joins, timers, RP/prefix-list controls, and interface-level options. Pending live verification.
- `PR-06` (`verify`): RPKI/MPLS option parity is implemented: MPLS LDP uses guide-aligned command trees (discovery timers, targeted-neighbor controls, import/export filters, allocation ACLs, explicit-null), and RPKI cache/timer coverage remains complete. Pending live verification.

### Service (`service/*`)
- `SVC-01` (`verify`): Config Sync guide leaves (`mode`, `secondary address/key/port/timeout`, `section`) are now represented with form-based CRUD and wrapper-backed writes; pending live-node verification.
- `SVC-02` (`verify`): Router Advertisements service page now enforces guide-aligned validation depth (IPv6 CIDR checks, NAT64 allowed masks, interval consistency, duplicate guardrails, DNSSL/captive-portal sanity) on top of full form-based CRUD. Pending live-node verification.
- `SVC-03` (`verify`): DHCP Server parity sweep completed (shared-network/subnet/range/static-mapping workflows, interface-template prefill, gateway-as-default-DNS fallback, and shared-network move/edit flows); pending live verification.
- `SVC-04` (`verify`): DNS workflow parity hardened (forwarder/resolver controls, authoritative domains including reverse zones, domain overrides, and host overrides with validation); pending live verification.
- `SVC-05` (`verify`): Existing service tabs (SSH/NTP/LLDP/mDNS/SNMP/etc.) are consolidated with form validation and wrapper-backed CRUD; pending live verification depth.

### Traffic Policy (`trafficpolicy/index.html`)
- `TP-01` (`verify`): Traffic-policy/QoS editor audited with full policy-family coverage (`cake`, `drop-tail`, `fair-queue`, `fq-codel`, `limiter`, `network-emulator`, `priority-queue`, `random-detect`, `rate-control`, `round-robin`, `shaper`) including class/default queue controls and interface bindings; pending live verification.
- `TP-02` (`verify`): Assignment incompatibility handling added for QoS bindings (IFB ingress guard, limiter-as-egress guard, and existing ingress/egress policy existence checks); pending live verification.
- `TP-03` (`verify`): Throughput/latency fixture verification on representative links.

### VPN (`vpn/*`)
- `VPN-01` (`verify`): IPsec site-to-site workflow now provides form-driven Phase 1/Phase 2 configuration depth (peer auth/IDs, IKE/ESP group proposal editors with encryption/hash/DH/PRF options, VTI bindings, tunnel selectors/priority/protocol, and wizard-assisted baseline generation). Pending live interoperability verification.
- `VPN-02` (`verify`): Added IPsec remote-access (mobile clients) API + UI coverage for enable/disable, connection method, pool prefix, server address/auth mode, client DNS/DHCP/split include/exclude subnets, and local/RADIUS authentication objects (users/servers). Pending live interoperability verification.
- `VPN-03` (`verify`): DMVPN workflow now provides form-driven tunnel/NHRP/IPsec profile composition (interface tunnel + `protocols nhrp` + IPsec profile binding) including map/NHS entries, multicast/redirect/shortcut controls, and save/apply orchestration. Pending live multi-node verification.
- `VPN-04` (`verify`): L2TP/OpenConnect/PPTP/SSTP pages provide form-driven remote-access configuration depth (auth modes, local users, pool/range management, DNS/WINS propagation, SSL/cert leaves where applicable, and accounting hooks). Pending live interoperability verification.
- `VPN-05` (`verify`): End-to-end tunnel bring-up and diagnostics workflows (GUI-first).

### VRF (`vrf/index.html`)
- `VRF-01` (`verify`): VRF option-depth parity expanded with `ip/ipv6 nht no-resolve-via-default` and per-family protocol route-map controls; pending live verification.
- `VRF-02` (`verify`): L3VPN VRF workflow audited against current guide leaves (RD/route-target/label/route-map/MPLS forwarding); pending live verification.
- `VRF-03` (`verify`): Interactions with policy, interfaces, and routing protocols.

### System (`system/*`) — **last by request**
- `SYS-01` (`verify`): System Conntrack parity expanded with timeout defaults, custom timeout rules, ignore rules, and log event controls; pending live verification.
- `SYS-02` (`verify`): Serial Console coverage matches current guide scope (`set/delete system console device <device>` and `speed`) with full form CRUD and wrapper-backed operations. Pending live hardware validation only.
- `SYS-03` (`verify`): Default Route/Gateway page now models both documented trees (`next-hop` and `next-hop-interface`) with full form CRUD, distance/disable controls, rename-safe edits, and validation guardrails (IPv4 gateway and interface token checks, distance range). Pending live multipath verification.
- `SYS-04` (`verify`): Flow Accounting page matches current guide scope (`interface`, `disable-imt`, `enable-egress`, `buffer-size`, `syslog-facility`, and NetFlow leaves including version/server/source/engine-id/sampling/timeout/max-flows) with form CRUD and wrapper-backed operations. Pending live telemetry verification.
- `SYS-05` (`verify`): FRR system page matches current guide scope (`bmp`, `descriptors`, `irdp`, `profile`, `snmp`) with form CRUD and wrapper-backed operations. Pending live workflow verification.
- `SYS-06` (`verify`): System IP page matches current guide scope (`arp table-size`, forwarding flags, multipath hash, import-table distance/route-map, protocol route-map, NHT behavior) with form CRUD and wrapper-backed operations. Pending live workflow verification.
- `SYS-07` (`verify`): System IPv6 page matches current guide scope (forwarding/strict-DAD flags, neighbor table-size, multipath hash, protocol route-map, NHT behavior) with form CRUD and wrapper-backed operations. Pending live workflow verification.
- `SYS-08` (`verify`): LCD page fully covers current guide scope (`system lcd model` and `system lcd device`) with form-based CRUD and wrapper-backed writes. Pending live hardware verification.
- `SYS-09` (`verify`): Login/user management parity now includes structured local SSH public-key entry controls (`identifier`, `key`, `type`, `options`) plus OTP depth (`key`, `rate-limit`, `rate-time`, `window-size`) and global `system login` controls (banners, session limits, RADIUS/TACACS source+VRF+server sets) with form-based UI, backend validation, and regression tests. Pending live AAA backend verification.
- `SYS-10` (`verify`): Name-server ownership cleanup completed: `system/config` now treats `name_servers` as optional and preserves existing `system name-server` entries unless explicitly provided, so System Identification no longer risks resolver-side DNS drift.
- `SYS-11` (`verify`): System Proxy page now covers all documented leaves (`url`, `port`, `username`, `password`) with strict form validation (URL scheme, port range, auth dependencies, no-proxy token sanity) on top of wrapper-backed writes. Pending live-node verification.
- `SYS-12` (`verify`): sFlow page now enforces guide-aligned validation depth for agent/collector addressing (IPv4/IPv6), collector port ranges, and numeric fields while preserving full form-based coverage of documented leaves. Pending live-node verification.
- `SYS-13` (`verify`): Sysctl page now supports full key/value CRUD with rename-safe edit flow (delete old + set new) and strict parameter-key validation, covering documented `system sysctl parameter <parameter> value <value>` workflows. Pending live-node verification.
- `SYS-14` (`verify`): System Syslog page now includes guide-aligned form CRUD for global marker/FQDN/source settings plus console/file/remote rules, with stronger validation (IP/hostname checks, port range, TLS/auth consistency, octet-counted transport checks) and explicit `remote`/`host` destination-tree control for compatibility. Pending live interop verification.
- `SYS-15` (`verify`): Task Scheduler page now enforces guide-aligned schedule validation (interval supports numeric with optional `m|h|d`, cron requires five fields, exclusive schedule mode) plus absolute executable path checks, with full task CRUD via wrapper-backed writes. Pending live-node verification.
- `SYS-16` (`verify`): Time-zone/update/watchdog implementation coverage now matches guide leaves (`system time-zone`, `system update-check auto-check/url`, `system watchdog module/timeout/shutdown-timeout/reboot-timeout`) with form-based controls; pending live verification.
- `SYS-17` (`verify`): Update runtime visibility implementation is complete: `System -> Update Check` shows live command output/status (up-to-date vs update available) with fallback probes and warning surfaces, and `Dashboard -> System Information` exposes update state with link-through. Pending multi-version live verification only.

---

## Program-Level Cross-Cutting Backlog
- `X-01` (`verify`): Option-level parity scorer is now enforced via threshold gate (`scripts/check_option_parity_thresholds.py` + `scripts/option_parity_thresholds.json`) and CI workflow (`.github/workflows/option-parity.yml`); pending long-run tuning of thresholds as coverage increases.
- `X-02` (`verify`): Fixture save/apply/reload loops expanded with advanced-option coverage and explicit command-delta assertions in loop responses; pending live-device verification.
- `X-03` (`verify`): Domain config snapshots expanded with richer payloads and loop-level command-delta assertions; pending live-instance snapshot comparisons.
- `X-04` (`verify`): Browser/runtime smoke route coverage now includes every current app page route (with route-appropriate exclusions), pending ongoing verification as new pages are added.
- `X-05` (`verify`): Robustness relook runner now expanded to broader backend suites + critical frontend lint/ts/build/runtime/browser smoke routes, with regenerated report artifact (`ROBUSTNESS_RELOOK_REPORT.md`). Pending live parity-domain sign-off.
