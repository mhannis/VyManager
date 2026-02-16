feature_id: system-interfaces-largest-buckets-2026-02-16
title: System + Interfaces largest bucket depth pass (`SYS-10`, `SYS-16`, `IF-13`)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added backend config-tree wrappers for `system update-check` and `system watchdog` (`/vyos/system-update-check/*`, `/vyos/system-watchdog/*`) and registered both in app routing.
  - Added full GUI pages for `System -> Update Check` and `System -> Watchdog` with structured form-based save flows (no command textbox UX).
  - Added sidebar navigation and navigation-visibility support for the new System pages.
  - Extended DNS service API model and backend implementation to expose and manage `system name-server` + `system domain-search` through DNS settings ownership cleanup.
  - Added DNS tab UI fields for System Name Servers and System Domain Search with validation and explicit payload wiring.
  - Deepened Wireless interface parity with VHT capability coverage:
    - `vht antenna-count`
    - `vht center-channel-freq-1/2`
    - `vht channel-set-width`
    - `vht link-adaptation`
    - `vht max-mpdu-exp`
    - `vht max-a-mpdu-exp`
    - `vht short-gi`
    - `vht beamform` flags (SU/MU beamformer/beamformee)
  - Expanded runtime/browser smoke route lists to include the new System pages.
  - Extended backend wrapper regression test suite for the two new wrappers.
  - Extended backend DNS tests for system resolver defaults parsing/update/validation.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_system_services_ssh_dns.py tests/test_config_tree_wrapper_capabilities.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s lint  # warnings-only baseline remains; no errors
known_limitations:
  - Frontend lint baseline still contains pre-existing repo-wide warnings outside this slice.
  - Browser Playwright smoke was not re-run in this cycle; runtime smoke + build/typecheck passed.
next_queue:
  - Continue `system` bucket depth: login/user parity deepening and remaining time/update/watchdog option coverage verification.
  - Continue `interfaces` bucket depth for WWAN/Wireless advanced leaves and live-save guide verification.
  - Continue backlog progression in requested guide order after this batch is reviewed.
