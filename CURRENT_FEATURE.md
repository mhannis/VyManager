feature_id: firewall-ipv4-ipv6-batch-argument-hardening-2026-02-16
title: Firewall IPv4/IPv6 batch argument validation hardening (`F-01`/`F-02` depth pass)
status: done
branch: feature/containers-automation-v1
completed_in_cycle:
  - Hardened `POST /vyos/firewall/ipv4/batch` and `POST /vyos/firewall/ipv6/batch` with strict chain/rule/value argument validation.
  - Added chain normalization/validation for base vs custom chain contexts, including explicit invalid-chain `400` behavior.
  - Added deterministic method-argument construction by signature with fail-fast handling for missing `rule_number`, missing required values, and unexpected values on no-arg operations.
  - Added explicit `400` handling for unsupported method parameter shapes and method `TypeError` invocation failures.
  - Added regression tests in `backend/tests/test_firewall_rule_batch_validation.py` for argument-shape validation and valid normalized execution behavior.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_rule_batch_validation.py tests/test_firewall_batch_semantics.py tests/test_firewall_global_options_batch_validation.py tests/test_firewall_global_options_validation.py tests/test_firewall_zones_validation.py tests/test_firewall_zones_local_zone.py tests/test_firewall_flowtables_validation.py tests/test_firewall_groups_validation.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py
  - cd frontend && npx tsc --noEmit --pretty false
known_limitations:
  - Frontend smoke/build gates were not rerun this backend-only slice; latest prior cycle state remains green (build + runtime smoke pass, lint warnings only).
  - Browser smoke (Playwright) remains blocked on host dependency (`libnspr4.so`) and is outside this slice’s pass gate.
next_queue:
  - Continue firewall depth work (`F-01`, `F-02`) on rule option modeling/UX parity (advanced matches/actions) beyond backend argument-shape hardening.
  - Continue zone workflow onboarding and UX depth (`F-06`) on top of the new cross-zone validation baseline.
  - Continue interfaces-depth sweep (`IF-15`) with validation and fixture-backed verification.
  - Continue service parity depth (`SVC-03`, `SVC-04`, `SVC-05`) with guide-complete forms and test expansion.
