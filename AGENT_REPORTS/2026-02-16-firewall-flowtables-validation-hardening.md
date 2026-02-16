# Firewall Flowtables Validation Hardening (2026-02-16)

## Scope
- Firewall `F-05` depth pass: strengthen backend validation and error semantics for flowtable batch operations.

## Implemented
### Backend validation guardrails
- `backend/routers/firewall/flowtables.py`

Added:
- strict flowtable-name validation (`^[A-Za-z][A-Za-z0-9_-]{0,62}$`)
- strict interface-name validation for flowtable interface ops
- allowed-op allowlist for batch endpoint
- per-op value requirements for operations that need values
- offload-type validation (`hardware|software`)
- offload value normalization to lowercase before builder invocation
- normalized and trimmed values before builder invocation

Also hardened delete endpoint:
- validates `flowtable_name` path param before building delete op.

### Tests added
- `backend/tests/test_firewall_flowtables_validation.py`

Coverage:
- invalid flowtable name -> `400`
- invalid offload type -> `400`
- invalid interface name -> `400`
- missing required operation value -> `400`
- valid batch request -> `200` and expected generated paths
- delete with invalid flowtable name -> `400`

## Validation Run
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_flowtables_validation.py tests/test_firewall_batch_semantics.py tests/test_firewall_global_options_validation.py tests/test_firewall_groups_validation.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py`
  - Result: `25 passed, 3 warnings`
- `cd frontend && npx tsc --noEmit --pretty false` passed
- `cd frontend && npm run -s build` passed
- `cd frontend && npm run -s smoke:runtime` passed

## Notes
- This change is additive and preserves existing `/vyos/firewall/flowtables/*` API contracts.
- Focus is fail-fast backend validation for GUI and API safety.

## Review
- Manual reviewer pass: **APPROVED**
- Reviewer sub-agent was unavailable in this cycle due thread-cap limits; findings were reviewed in-process and a follow-up normalization fix was applied before final validation.
