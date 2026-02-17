feature_id: backlog-partial-implementation-sweep-2026-02-17
title: Partial backlog implementation sweep (defer verify)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - SYS-10: system config DNS ownership cleanup implemented (`name_servers` optional/preserved when omitted).
  - X-04: smoke route inventories expanded to include all current static app pages (runtime + browser, with onboarding excluded from browser smoke).
  - SYS-16: moved to implementation-complete (`verify`) after guide-leaf audit for time-zone/update-check/watchdog controls.
  - X-01: option parity threshold gate implemented (`scripts/check_option_parity_thresholds.py`, thresholds config, CI workflow).
  - SVC-01: moved to implementation-complete (`verify`) after guide-leaf audit for Config Sync.
  - SYS-09 depth slice: added radius/tacacs source+vrf fields and per-server disable controls in backend+UI.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_system_services_ssh_dns.py
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_system_login_config.py tests/test_system_services_ssh_dns.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/app/system/identification/page.tsx src/lib/api/system.ts scripts/smoke-ui.mjs
  - cd frontend && npx eslint src/app/system/users/page.tsx src/lib/api/system.ts
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s smoke:ui
  - python3 scripts/score_option_parity.py && python3 scripts/check_option_parity_thresholds.py
known_limitations:
  - `System Users` still has an existing hooks warning (`react-hooks/exhaustive-deps`) with zero lint errors.
  - SYS-09 remains partial: local user public-key type/options and OTP rate-time parity leaves remain.
next_queue:
  - Continue partial backlog completion in guide order, prioritizing remaining System/Service partials then firewall/interfaces depth.
