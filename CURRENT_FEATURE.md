feature_id: high-availability-parity-depth-2026-02-16
title: High Availability parity depth (HA-01/HA-02)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added VRRP per-address interface mapping support in `Network -> High Availability` (`address <cidr> interface <if>`).
  - Updated config parsing to preserve existing VRRP address-interface bindings from live config.
  - Updated HA save diff logic to handle address interface rebinding via deterministic delete/recreate commands.
  - Added strict client-side validation for VRRP/IPVS fields (VRID/priority/intervals, port/fwmark/timeouts, sync-group member existence).
  - Added dual-stack guardrail for VRRP group addresses (no IPv4+IPv6 mix in one group).
validation:
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/app/network/high-availability/page.tsx
  - cd frontend && npm run -s build
  - tmux restart vm-ui to pick up fresh Next build artifacts
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s smoke:ui
known_limitations:
  - HA-01/HA-02 remain `partial`; VRRP/sync-group inline edit UX and dual-node live failover verification are still pending.
  - UI smoke remains sensitive to stale chunks if vm-ui is not restarted after each build.
next_queue:
  - Continue HA depth (`HA-01`/`HA-02`) with inline edit UX and additional option parity.
  - Execute `HA-03` live verification playbook updates after option parity depth pass.
