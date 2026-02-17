feature_id: system-update-runtime-visibility-2026-02-17
title: System update runtime visibility and dashboard indicator (SYS-17)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added backend runtime status endpoint `GET /vyos/system-update-check/status` with best-effort probe fallback (`show/generate system updates`, `system update-check`, `system image`).
  - Added structured parser for update command output (`current_version`, `update_available`, `update_version`, `update_url`, summary, warnings, raw output).
  - Extended `System -> Update Check` page to display live update status/output and probe warnings in addition to config settings.
  - Updated `Dashboard -> System Information` card to show update state and link to `/system/update-check` when update is available.
  - Added backend tests for status endpoint behavior (`update available`, `up to date`, `generate fallback`, `all probes fail`).
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_system_update_check_status.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/app/system/update-check/page.tsx src/components/dashboard/SystemInformationCard.tsx src/lib/api/system-update-check.ts
  - cd frontend && npm run -s build
  - tmux restart vm-ui to pick up fresh Next build artifacts
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s smoke:ui
known_limitations:
  - Update status parsing remains best-effort because command output shape can vary by VyOS image/version.
  - Probe execution may return warnings on targets that do not support one or more candidate op-mode commands.
next_queue:
  - Continue HA depth (`HA-01`/`HA-02`) and then proceed through remaining partial domains in guide order.
  - Perform live verification pass on SYS-17 output semantics across additional VyOS images.
