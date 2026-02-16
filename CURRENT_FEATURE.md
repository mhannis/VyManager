feature_id: system-frr-ip-ipv6-baseline-v1-2026-02-16
title: System baseline pages (FRR, IP, IPv6)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added backend wrappers:
    - /vyos/system-frr/*
    - /vyos/system-ip/*
    - /vyos/system-ipv6/*
  - Added dedicated pages:
    - /system/frr
    - /system/ip
    - /system/ipv6
  - Registered routers in backend app and extended wrapper capability/config/scope tests.
  - Added System sidebar links and smoke-route coverage for all 3 pages.
  - Updated strict backlog statuses: SYS-05/06/07 => partial.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_config_tree_wrapper_capabilities.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/app/system/frr/page.tsx src/app/system/ip/page.tsx src/app/system/ipv6/page.tsx src/lib/api/system-frr.ts src/lib/api/system-ip.ts src/lib/api/system-ipv6.ts src/lib/help/pageGuides.ts src/components/layout/Sidebar.tsx scripts/smoke-ui.mjs --max-warnings=0
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
next_queue:
  - SYS-08 LCD page
  - SYS-12 sFlow page
  - SYS-15 Task Scheduler page
