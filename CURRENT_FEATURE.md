feature_id: system-update-runtime-visibility-2026-02-17
title: System update/user route resilience + default update URL (SYS-17 follow-up)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Reproduced and triaged `Not Found` regressions affecting `System -> Update Check` and `System -> Users`.
  - Added frontend fallback in `systemUpdateCheckService.getStatus()` for route-level 404 on `/vyos/system-update-check/status`.
  - Changed `System -> Users` loading flow to independent `allSettled` fetches so local user CRUD remains available when `/vyos/system/login-config` is unavailable.
  - Added explicit warning banner in `System -> Users` when global login endpoint is unavailable.
  - Set default update-check URL form value to `https://raw.githubusercontent.com/vyos/vyos-nightly-build/refs/heads/current/version.json` while keeping auto-check disabled by default.
  - Restarted `vm-api` and `vm-ui`; verified route availability and smoke checks.
validation:
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/lib/api/system-update-check.ts src/app/system/update-check/page.tsx src/app/system/users/page.tsx
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s smoke:ui
known_limitations:
  - Targeted lint run still reports one existing warning in `system/users/page.tsx` (`react-hooks/exhaustive-deps`) with zero lint errors.
next_queue:
  - Continue partial-backlog completion in guide order (implementation first, verify pass after completion sweep).
