feature_id: firewall-groups-backend-hardening-f03-2026-02-16
title: Firewall groups backend validation hardening and error semantics fix
status: in_review
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added backend server-side validation for firewall group batch values:
    - group name format guardrails
    - type-aware value validation (IPv4/IPv6 address/range, CIDR, port/service, interface, MAC, domain, URL)
    - include-self prevention for include operations
  - Fixed API error semantics in firewall groups batch:
    - preserved `HTTPException` status codes (previously swallowed by generic exception handler and returned as `500`)
  - Added backend tests covering new validation/error behavior:
    - invalid group name -> `400`
    - invalid remote URL -> `400`
    - invalid MAC -> `400`
    - valid remote-group create -> success path
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_groups_validation.py tests/test_containers_automation_v1.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
known_limitations:
  - Browser smoke (Playwright) remains blocked on host dependency (`libnspr4.so`) and is not part of this cycle’s pass gate.
next_queue:
  - Continue firewall option-depth parity (`F-01`, `F-02`, `F-04`, `F-05`, `F-06`).
  - Continue interface advanced-leaf parity (`IF-15`) with robust validation patterns similar to this slice.
