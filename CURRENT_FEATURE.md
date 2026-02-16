feature_id: interfaces-ethernet-dhcp-ipv6-depth-2026-02-16
title: Interfaces Ethernet DHCP/DHCPv6/IPv6 parity depth pass (`IF-15` subset)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Deepened `Network -> Interfaces -> Ethernet` with guide-aligned DHCP/DHCPv6/IPv6 controls:
    `dhcp-options reject`, `dhcp-options user-class`, `dhcpv6-options no-release`,
    `dhcpv6-options parameters-only`, `dhcpv6-options temporary`,
    `ipv6 accept-dad`, and `ipv6 address no-default-link-local`.
  - Added end-to-end backend support (mapper, builder, router models/capabilities/batch handlers) for new leaves and related delete operations.
  - Fixed boolean operation semantics in ethernet batch handling so legacy `set_* value=false` payloads map to deletes.
  - Fixed IPv6 autoconf/eui64 state round-trip in the Ethernet modal and resolved incorrect hook logic that always compared autoconf against `false`.
  - Added frontend controls and command generation for new DHCP/DHCPv6/IPv6 fields, including deterministic reject-route set/delete diffing.
  - Added backend regression suite `backend/tests/test_ethernet_batch_parity_options.py` to lock behavior for new ops and boolean false->delete compatibility.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_ethernet_batch_parity_options.py tests/test_ethernet_vlan_batch_ops.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/components/network/ComprehensiveEthernetModal.tsx src/lib/api/types/ethernet.ts
  - cd frontend && npm run -s build
  - tmux restart: vm-ui session restarted after build (`npm run -s start -- --hostname 0.0.0.0 --port 3000`)
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s smoke:ui
known_limitations:
  - IF-15 remains partial: loopback and wireguard advanced option depth is still pending.
  - Frontend lint baseline still contains pre-existing repo-wide warnings outside this slice.
next_queue:
  - Continue IF-15 depth for loopback and wireguard parity gaps.
  - Continue guide-order backlog progression once loopback/wireguard depth is completed.
