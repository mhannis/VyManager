# Firewall Global Options Batch Validation Hardening (2026-02-16)

## Scope
- Firewall `F-04` depth pass: harden `POST /vyos/firewall/global-options/batch` with strict value validation and deterministic 400-level error behavior.

## Implemented
### Backend validation guardrails
- `backend/routers/firewall_global_options/firewall_global_options.py`

Added:
- operation-group validation for batch `set_*` values:
  - enable/disable options
  - source-validation options
  - state-policy action options
  - state-policy log-level options
- timeout validation for all `set_timeout_*` operations:
  - integer-only requirement
  - range check (`1..2147483647`)
- strict parameter-arity enforcement for batch operations:
  - rejects values on no-arg operations
  - rejects missing values on value-requiring operations
  - rejects unsupported method signatures with explicit `400`
- normalization of accepted enum-like values to canonical lowercase before builder invocation.

### Tests added
- `backend/tests/test_firewall_global_options_batch_validation.py`

Coverage:
- missing value for set operation -> `400`
- value on delete/no-arg operation -> `400`
- invalid enum value -> `400`
- invalid timeout non-integer -> `400`
- invalid timeout out-of-range -> `400`
- valid mixed-case enum + timeout -> `200` with canonicalized operation paths

## Validation Run
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_global_options_batch_validation.py tests/test_firewall_global_options_validation.py tests/test_firewall_zones_validation.py tests/test_firewall_zones_local_zone.py tests/test_firewall_flowtables_validation.py tests/test_firewall_batch_semantics.py tests/test_firewall_groups_validation.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py`
  - Result: `37 passed, 4 warnings`
- `cd frontend && npx tsc --noEmit --pretty false`
  - Result: passed

## Notes
- This change is additive and preserves existing `/vyos/firewall/global-options/*` API contracts.
- Focus is predictable API behavior and fail-fast validation for GUI-driven batch updates.

## Review
- Manual reviewer pass: **APPROVED**
