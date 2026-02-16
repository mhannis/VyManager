feature_id: interfaces-wwan-depth-2026-02-16
title: Interfaces WWAN parity depth pass (`IF-14`)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Deepened `Network -> Interfaces -> WWAN` to expose guide-aligned advanced settings instead of baseline-only controls.
  - Added WWAN parser/model support for advanced IPv4 toggles and scalar leaves:
    - `ip arp-cache-timeout`
    - `ip disable-arp-filter`
    - `ip enable-directed-broadcast`
    - `ip enable-arp-accept`
    - `ip enable-arp-announce`
    - `ip enable-arp-ignore`
    - `ip enable-proxy-arp`
    - `ip proxy-arp-pvlan`
  - Added WWAN parser/model support for advanced IPv6 leaves:
    - `ipv6 address autoconf`
    - `ipv6 address eui64`
    - `ipv6 address no-default-link-local`
    - `ipv6 accept-dad`
    - `ipv6 dup-addr-detect-transmits`
  - Added WWAN parser/model support for DHCP extras:
    - `dhcp-options reject`
    - `dhcp-options user-class`
    - `dhcpv6-options duid`
    - `dhcpv6-options no-release`
    - `dhcpv6-options parameters-only`
    - `dhcpv6-options rapid-commit`
    - `dhcpv6-options temporary`
  - Added WWAN parser/model support for DHCPv6 Prefix Delegation rows (`pd <id> length`, delegated interface `address` + `sla-id`).
  - Added WWAN operation generation + validation for all new fields, including deterministic DHCPv6-PD normalization and conflict checks.
  - Fixed IPv6 address parsing to avoid treating special keys (`autoconf`, `eui64`, `no-default-link-local`) as literal IPv6 address entries.
  - Reworked WWAN page UX into grouped sections:
    - IPv4 settings
    - IPv6 settings
    - DHCPv4 client options
    - DHCPv6 client + prefix delegation
    - interface flags
  - Added in-form DHCPv6 PD row CRUD with delegate-interface suggestions from live interface inventory.
validation:
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s lint  # warnings-only baseline remains; no errors
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s smoke:ui
  - tmux restart: vm-ui session restarted after build (`npm run -s start -- --hostname 0.0.0.0 --port 3000`)
known_limitations:
  - Frontend lint baseline still contains pre-existing repo-wide warnings outside this slice.
  - WWAN modem operational diagnostics/actions (op-mode workflows) are still pending and remain part of IF-14 depth follow-up.
  - Browser smoke can fail transiently with stale chunk artifacts; restart `vm-ui` and rerun smoke gates when `ChunkLoadError` appears.
next_queue:
  - Continue interfaces depth pass (`IF-15`) on ethernet/pppoe/loopback/wireguard parity gaps.
  - Continue WWAN modem operational workflow parity after stable form-first config depth.
  - Continue guide-order backlog progression once this WWAN depth slice is reviewed.
