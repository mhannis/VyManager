feature_id: firewall-flowtables-validation-hardening-2026-02-16
title: Firewall flowtables input validation hardening (`F-05` depth pass)
status: done
branch: feature/containers-automation-v1
completed_in_cycle:
  - Hardened `POST /vyos/firewall/flowtables/batch` with fail-fast backend validation for flowtable names, operation allowlist, required values, interface names, and offload enum values.
  - Hardened `DELETE /vyos/firewall/flowtables/{flowtable_name}` with path-level flowtable name validation.
  - Normalized offload value writes to lowercase (`hardware|software`) so accepted mixed-case input generates valid canonical commands.
  - Added regression tests in `backend/tests/test_firewall_flowtables_validation.py` for invalid input handling and valid-batch success behavior.
  - Preserved API contracts and command-builder flow while improving 400-level error semantics.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_flowtables_validation.py tests/test_firewall_batch_semantics.py tests/test_firewall_global_options_validation.py tests/test_firewall_groups_validation.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - cd frontend && npm run -s lint
known_limitations:
  - Frontend lint has existing repository-wide warnings (0 errors); this slice does not introduce new lint errors.
  - Browser smoke (Playwright) remains blocked on host dependency (`libnspr4.so`) and is not part of this cycle’s pass gate.
next_queue:
  - Continue firewall depth work (`F-01`, `F-02`, `F-04`, `F-06`) with additional option-level UX and command coverage.
  - Continue interfaces-depth sweep (`IF-15`) with validation and fixture-backed verification.
  - Continue service parity depth (`SVC-03`, `SVC-04`, `SVC-05`) with guide-complete forms and test expansion.
