feature_id: interfaces-wireguard-peer-validation-depth-2026-02-16
title: Interfaces WireGuard peer validation/safety parity depth pass (`IF-15` subset)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Hardened `VPN -> WireGuard` peer workflows with backend validation in `/vyos/vpn/wireguard/peer/batch` for endpoint consistency and routing safety.
  - Added server-side validation for:
    endpoint exclusivity (`address` XOR `host-name`), endpoint port dependency,
    persistent keepalive range (0-65535), allowed-IP syntax, duplicate allowed-IPs within a peer,
    and allowed-IP collisions across peers on the same interface.
  - Added frontend guardrails in Create/Edit peer modals to surface these constraints immediately before submit.
  - Added backend regression suite `backend/tests/test_wireguard_peer_validation.py`.
  - Kept implementation additive and contract-preserving under existing `/vyos/vpn/wireguard/*` APIs.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_wireguard_peer_validation.py tests/test_ethernet_batch_parity_options.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/components/vpn/CreatePeerModal.tsx src/components/vpn/EditPeerModal.tsx src/app/vpn/wireguard/page.tsx src/components/network/ComprehensiveEthernetModal.tsx src/lib/api/types/ethernet.ts
  - cd frontend && npm run -s build
  - tmux restart: vm-ui session restarted after build (`npm run -s start -- --hostname 0.0.0.0 --port 3000`)
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s smoke:ui
known_limitations:
  - IF-15 remains partial: loopback edge-option depth and any remaining low-visibility wireguard leaves are still pending.
  - Frontend lint baseline still contains pre-existing repo-wide warnings outside this slice.
next_queue:
  - Continue IF-15 depth for loopback edge parity gaps.
  - Continue guide-order backlog progression once IF-15 is fully verified.
