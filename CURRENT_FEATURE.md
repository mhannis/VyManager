feature_id: system-lcd-sflow-task-scheduler-baseline-v1-2026-02-16
title: System baseline pages (LCD, sFlow, Task Scheduler)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added backend wrappers:
    - /vyos/system-lcd/*
    - /vyos/system-sflow/*
    - /vyos/system-task-scheduler/*
  - Added dedicated pages:
    - /system/lcd
    - /system/sflow
    - /system/task-scheduler
  - Registered routers in backend app and extended wrapper capability/config/scope tests.
  - Added System sidebar links and smoke-route coverage for all 3 pages.
  - Updated strict backlog statuses: SYS-08/12/15 => partial.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_config_tree_wrapper_capabilities.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/app/system/lcd/page.tsx src/app/system/sflow/page.tsx src/app/system/task-scheduler/page.tsx src/lib/api/system-lcd.ts src/lib/api/system-sflow.ts src/lib/api/system-task-scheduler.ts src/lib/help/pageGuides.ts src/components/layout/Sidebar.tsx scripts/smoke-ui.mjs --max-warnings=0
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
next_queue:
  - PR-03 Segment Routing implementation
  - VRF-02 L3VPN VRF workflow
  - X-01/X-02/X-03/X-05 cross-cutting parity hardening
