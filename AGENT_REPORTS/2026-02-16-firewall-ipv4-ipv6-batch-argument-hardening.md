# Firewall IPv4/IPv6 Batch Argument Hardening (2026-02-16)

## Scope
- Firewall `F-01`/`F-02` depth pass: tighten IPv4/IPv6 firewall batch API argument validation to eliminate runtime argument-shape failures and improve error clarity.

## Implemented
### Backend validation guardrails
- `backend/routers/firewall/ipv4.py`
- `backend/routers/firewall/ipv6.py`

Added:
- chain validation + normalization:
  - base chains must be `forward|input|output` (case-insensitive input normalized to lowercase)
  - custom chains validated with safe-name regex
- required argument checks:
  - operations that require `rule_number` now fail-fast with `400` when missing
  - operations that require value arguments now fail-fast with `400` when value is missing/blank
  - operations that do not accept values now fail-fast with `400` when a value is supplied
- deterministic dynamic invocation:
  - method args are built in signature order by parameter name (`chain`, `rule_number`, value param, `is_custom`)
  - unsupported/unknown method parameters return `400`
  - method `TypeError` is converted to explicit `400` instead of generic `500`
- kept IPv6 legacy operation alias compatibility in place.

### Tests added
- `backend/tests/test_firewall_rule_batch_validation.py`

Coverage:
- invalid IPv4 base chain -> `400`
- missing rule number for rule operation -> `400`
- missing required value for set operation -> `400`
- value on no-value operation -> `400`
- IPv6 legacy alias without required value -> `400`
- valid uppercase base-chain input normalizes and executes successfully -> `200`

## Validation Run
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_rule_batch_validation.py tests/test_firewall_batch_semantics.py tests/test_firewall_global_options_batch_validation.py tests/test_firewall_global_options_validation.py tests/test_firewall_zones_validation.py tests/test_firewall_zones_local_zone.py tests/test_firewall_flowtables_validation.py tests/test_firewall_groups_validation.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py`
  - Result: `43 passed, 4 warnings`
- `cd frontend && npx tsc --noEmit --pretty false`
  - Result: passed

## Notes
- This change is additive and preserves existing `/vyos/firewall/ipv4/*` and `/vyos/firewall/ipv6/*` API contracts.
- Focus is predictable batch behavior and safer GUI/API error handling.

## Review
- Manual reviewer pass: **APPROVED**
