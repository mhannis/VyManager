feature_id: firewall-ipv6-ops-and-global-options-hardening-2026-02-16
title: Firewall IPv6 operation parity + firewall global-options input validation hardening
status: in_review
branch: feature/containers-automation-v1
completed_in_cycle:
  - Fixed firewall API error semantics in IPv4/IPv6 batch and reorder endpoints by preserving HTTPException status codes (`400` now remains `400` instead of becoming `500`).
  - Added IPv6 firewall operation aliasing on backend batch endpoint for legacy payload compatibility:
    - `set_rule_icmp_type_name` -> `set_rule_icmpv6_type_name`
    - `delete_rule_icmp_type_name` -> `delete_rule_icmpv6_type_name`
    - `set_rule_set_ttl` -> `set_rule_set_hop_limit`
    - `delete_rule_set_ttl` -> `delete_rule_set_hop_limit`
  - Updated frontend IPv6 firewall API client to use canonical IPv6 operation names (`icmpv6` + `hop-limit`) for create/update rule flows.
  - Updated IPv6 firewall rule modals to label packet modification field as `Hop Limit` (instead of `TTL`) in create/edit dialogs.
  - Added server-side validation for firewall global-options update payloads (enum checks + timeout bounds) with explicit `400` errors for invalid input.
  - Added new backend regression suites:
    - `backend/tests/test_firewall_batch_semantics.py`
    - `backend/tests/test_firewall_global_options_validation.py`
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_batch_semantics.py tests/test_firewall_global_options_validation.py tests/test_firewall_groups_validation.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s lint
known_limitations:
  - Frontend lint has existing repository-wide warnings (0 errors); this slice introduces no new lint errors.
  - Browser smoke (Playwright) remains blocked on host dependency (`libnspr4.so`) and is not part of this cycle’s pass gate.
next_queue:
  - Continue firewall depth work (`F-01`, `F-02`, `F-04`) with additional option-level UX and command coverage.
  - Continue interfaces-depth sweep (`IF-15`) with validation and fixture-backed verification.
  - Continue service parity depth (`SVC-03`, `SVC-04`, `SVC-05`) with guide-complete forms and test expansion.
