feature_id: system-baseline-pages-v1-2026-02-16
title: System baseline pages (Conntrack, Serial Console, Default Route)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added backend wrappers:
    - /vyos/system-conntrack/*
    - /vyos/system-console/*
    - /vyos/system-default-route/*
  - Added dedicated pages:
    - /system/conntrack
    - /system/serial-console
    - /system/default-route
  - Registered routers in backend app and extended wrapper capability/config/scope tests.
  - Added System sidebar links and smoke-route coverage for all 3 pages.
  - Updated strict backlog statuses: SYS-01/02/03 => partial.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_config_tree_wrapper_capabilities.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/components/layout/Sidebar.tsx scripts/smoke-ui.mjs --max-warnings=0
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
next_queue:
  - SYS-05 FRR system page
  - SYS-06 IP system options page
  - SYS-07 IPv6 system options page
  - SYS-08 LCD page
  - SYS-12 sFlow page
  - SYS-15 Task Scheduler page
