feature_id: system-interfaces-largest-buckets-2026-02-16
title: System + Interfaces largest bucket depth pass (`SYS-09`, `SYS-10`, `SYS-16`, `IF-13`)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Extended `SYS-09` global login parity with dedicated backend API (`/vyos/system/login-config`) covering:
    - pre/post-login banners
    - max sessions per user
    - login timeout
    - RADIUS source-address and server set (address/key/port/timeout)
    - TACACS server set (address/key/port/timeout)
  - Extended `System -> Users` with a form-first `Global Login Authentication` section for RADIUS/TACACS rows and login banner/session controls.
  - Added backend regression tests `backend/tests/test_system_login_config.py` for login-config parsing, command generation, and validation semantics.
  - Deepened `SYS-09` local login-user parity:
    - backend `system/local-users` now supports `authentication principal`
    - backend `system/local-users` now supports OTP controls (`otp key`, `otp rate-limit`, `otp window-size`) with range validation
    - local-user parse/model now exposes principal and OTP state (`otp_key_configured`, `otp_rate_limit`, `otp_window_size`)
  - Extended `System -> Users` UI with form-first principal and OTP controls for create/edit workflows, including input validation and clear/delete semantics.
  - Added backend regression coverage `backend/tests/test_system_local_users_parity.py` for local-user principal/OTP parsing, validation, and update operation generation.
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
  - Triage pass for user-reported `Not Found` on System IP / Update Check / Watchdog:
    - confirmed wrapper endpoints are present in backend runtime
    - restarted `vm-api` and `vm-ui`
    - revalidated runtime smoke (`smoke:runtime` pass)
  - Extended `System -> Update Check` parity:
    - added `auto-check` toggle support (`set/delete system update-check auto-check`)
    - retained custom `url` field handling
  - Extended `System -> Watchdog` parity:
    - added watchdog enable/disable control (`set/delete system watchdog`)
    - added `module`, `timeout`, `shutdown-timeout`, and `reboot-timeout` fields
    - retained optional ping/startup-delay/test-interval controls for compatibility
  - Updated System how-to guides for Update Check and Watchdog to reflect the expanded controls.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_system_login_config.py tests/test_system_local_users_parity.py tests/test_system_services_ssh_dns.py tests/test_config_tree_wrapper_capabilities.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s lint  # warnings-only baseline remains; no errors
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s smoke:ui
  - tmux restart: vm-ui session restarted after build (`npm run -s start -- --hostname 0.0.0.0 --port 3000`)
known_limitations:
  - Frontend lint baseline still contains pre-existing repo-wide warnings outside this slice.
  - UI smoke can fail transiently with stale chunk artifacts if `vm-ui` serves an older build after a rebuild; restart `vm-ui` before rerunning `smoke:ui`.
next_queue:
  - Continue `system` bucket depth: live AAA verification hardening for RADIUS/TACACS login config and remaining login-auth edge cases.
  - Continue `interfaces` bucket depth for WWAN/Wireless advanced leaves and live-save guide verification.
  - Continue backlog progression in requested guide order after this batch is reviewed.
