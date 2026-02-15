feature_id: high-availability-virtual-server-depth-2026-02-15
status: done
title: High Availability virtual-server parity deepening (IPVS virtual-server + real-server CRUD)
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added form-driven management for `high-availability virtual-server` objects on `/network/high-availability`.
  - Added nested real-server CRUD with per-server port, connection-timeout, and health-check script support.
  - Save path now emits diff-based commands for both VRRP/sync-group and virtual-server trees in one apply operation.
  - Validated with backend test_app, frontend tsc/lint/build, runtime smoke, and browser smoke.
