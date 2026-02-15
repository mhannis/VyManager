feature_id: high-availability-vrrp-depth-2026-02-15
status: done
title: High Availability VRRP parity deepening (global + per-group options)
branch: feature/containers-automation-v1
commits:
  - pending-local-commit
notes:
  - Expanded /network/high-availability with VRRP global parameters (startup_delay, version, global GARP).
  - Added missing group options: disable, rfc3768-compatibility, excluded-address, and per-group GARP controls.
  - Kept diff-based save and scoped command generation under `high-availability vrrp ...`.
  - Validated with tsc, lint (0 errors), build, runtime smoke, and browser smoke.
