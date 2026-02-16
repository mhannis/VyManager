feature_id: firewall-parity-hardening-2026-02-16
title: Firewall parity hardening batch (F-01/F-02/F-03/F-05 depth + remote-group rule mapping)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added IPv4/IPv6 batch semantic validation for protocol/action coupling (ports/TCP flags/ICMP constraints + jump/offload target coupling).
  - Expanded IPv4/IPv6 reorder handlers to preserve GeoIP and mac/domain/remote group leaves when recreating rules.
  - Added frontend firewall IPv4/IPv6 rule API mapping for source/destination `remote-group` operations in create/update paths.
  - Added firewall groups batch consistency validation for conflicting set/delete operations, duplicate member operations, and multiple remote URL values.
  - Added flowtables batch consistency validation for duplicate interface entries, conflicting offload settings, and oversized descriptions.
  - Added/updated backend regression tests:
    - `backend/tests/test_firewall_rule_batch_validation.py`
    - `backend/tests/test_firewall_groups_validation.py`
    - `backend/tests/test_firewall_flowtables_validation.py`
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_rule_batch_validation.py tests/test_firewall_groups_validation.py tests/test_firewall_flowtables_validation.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npx eslint src/lib/api/firewall-ipv4.ts src/lib/api/firewall-ipv6.ts
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s smoke:ui
known_limitations:
  - F-01/F-02/F-03/F-05 remain `partial`; deeper option-level parity and live-device verification still pending.
  - UI smoke remains sensitive to stale Next chunks if `vm-ui` is not restarted after build.
next_queue:
  - Continue remaining firewall parity depth (`F-01`/`F-02`/`F-04`/`F-05`/`F-06`) before advancing deeper into the next domain backlog.
  - Keep full gate sequence on each slice (`pytest` + `tsc` + `eslint` + `build` + `smoke:runtime` + `smoke:ui`).
