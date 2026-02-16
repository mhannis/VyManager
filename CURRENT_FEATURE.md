feature_id: firewall-zones-cross-validation-hardening-2026-02-16
title: Firewall zones cross-zone validation hardening (`F-06` depth pass)
status: done
branch: feature/containers-automation-v1
completed_in_cycle:
  - Hardened `PUT /vyos/firewall/zones/zone/{zone_name}` with cross-zone interface ownership checks so one interface cannot be assigned to multiple zones.
  - Added canonical `from_zone` resolution against existing zones (case-insensitive matching), explicit unknown-zone rejection, and `LOCAL` pseudo-zone support.
  - Added duplicate `from_zone` protection after canonicalization (e.g. `WAN` + `wan` now correctly fails as duplicate).
  - Added regression tests in `backend/tests/test_firewall_zones_validation.py` for interface overlap conflicts, unknown `from_zone`, canonicalization behavior, and duplicate detection.
  - Preserved existing API contracts and response models while tightening validation semantics to fail fast with explicit `400` errors.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_zones_validation.py tests/test_firewall_zones_local_zone.py tests/test_firewall_flowtables_validation.py tests/test_firewall_batch_semantics.py tests/test_firewall_global_options_validation.py tests/test_firewall_groups_validation.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py
  - cd frontend && npx tsc --noEmit --pretty false
known_limitations:
  - Frontend smoke/build gates were not rerun this backend-only slice; latest prior cycle state remains green (build + runtime smoke pass, lint warnings only).
  - Browser smoke (Playwright) remains blocked on host dependency (`libnspr4.so`) and is outside this slice’s pass gate.
next_queue:
  - Continue firewall depth work (`F-01`, `F-02`, `F-04`) with additional option-level UX and command coverage.
  - Continue zone workflow onboarding and UX depth (`F-06`) on top of this validation baseline.
  - Continue interfaces-depth sweep (`IF-15`) with validation and fixture-backed verification.
  - Continue service parity depth (`SVC-03`, `SVC-04`, `SVC-05`) with guide-complete forms and test expansion.
