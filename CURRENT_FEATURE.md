feature_id: frontend-runtime-smoke-hardening-2026-02-14
status: done
title: Frontend route-level runtime smoke hardening
branch: feature/containers-automation-v1
commits:
  - uncommitted
notes:
  - Expanded `frontend/scripts/smoke-ui.mjs` default routes to cover reported regression pages (routing + DHCP + infrastructure/multicast).
  - Switched smoke default origin from `127.0.0.1` to `localhost` to avoid origin/cookie mismatches.
  - Expanded `frontend/scripts/check-runtime.sh` to probe critical routes, not just `/` and `/login`.
  - Verified runtime flow: build -> restart `vm-ui` -> `smoke:runtime` -> `smoke:ui` all pass.
