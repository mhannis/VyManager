feature_id: interfaces-pppoe-pd-depth-2026-02-16
title: Interfaces PPPoE parity depth pass (`IF-15` subset)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Deepened `Network -> Interfaces -> PPPoE` with guide-aligned DHCPv6 Prefix Delegation support (`dhcpv6-options pd`).
  - Added PPPoE API/model parsing for DHCPv6-PD rows (`pd id`, `length`, delegated interface `address` and `sla-id`).
  - Added PPPoE form state and operation generation for DHCPv6-PD with deterministic normalization and conflict checks.
  - Added PPPoE UI editor section for DHCPv6-PD rows with add/remove/update controls and interface selector.
  - Added save-time error handling for invalid PD row data to prevent client-side crashes and provide actionable form errors.
  - Kept implementation additive and contract-preserving under existing `/vyos/pppoe-interface/*` APIs.
validation:
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/lib/api/pppoe.ts src/app/network/interfaces/pppoe/page.tsx
  - cd frontend && npm run -s build
  - tmux restart: vm-ui session restarted after build (`npm run -s start -- --hostname 0.0.0.0 --port 3000`)
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s smoke:ui
known_limitations:
  - IF-15 remains partial: ethernet/loopback/wireguard advanced option depth is still pending.
  - Frontend lint baseline still contains pre-existing repo-wide warnings outside this slice.
next_queue:
  - Continue IF-15 depth for ethernet interface advanced leaves.
  - Continue IF-15 depth for loopback and wireguard parity gaps.
  - Continue guide-order backlog progression once this PPPoE depth slice is reviewed.
