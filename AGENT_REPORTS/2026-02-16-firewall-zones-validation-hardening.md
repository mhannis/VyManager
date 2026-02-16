# Firewall Zones Cross-Validation Hardening (2026-02-16)

## Scope
- Firewall `F-06` depth pass: tighten zone upsert validation for cross-zone consistency and safer policy mapping.

## Implemented
### Backend validation guardrails
- `backend/routers/firewall/zones.py`

Added:
- interface ownership checks during zone upsert:
  - rejects assigning an interface to a zone if that interface is already in another zone
- `from_zone` canonicalization and validation:
  - case-insensitive match against existing zone names
  - unknown `from_zone` values now fail with explicit `400`
  - `LOCAL` pseudo-zone support (`local` input normalizes to `LOCAL`)
- duplicate `from_zone` detection after canonicalization:
  - catches duplicates such as `WAN` + `wan` in the same request

### Tests added
- `backend/tests/test_firewall_zones_validation.py`

Coverage:
- interface overlap with another zone -> `400`
- unknown `from_zone` reference -> `400`
- case-insensitive `from_zone` + `LOCAL` normalization -> `200` with canonical paths
- duplicate `from_zone` after canonicalization -> `400`

## Validation Run
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_zones_validation.py tests/test_firewall_zones_local_zone.py tests/test_firewall_flowtables_validation.py tests/test_firewall_batch_semantics.py tests/test_firewall_global_options_validation.py tests/test_firewall_groups_validation.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py`
  - Result: `31 passed, 4 warnings`
- `cd frontend && npx tsc --noEmit --pretty false`
  - Result: passed

## Notes
- This change is additive and preserves existing `/vyos/firewall/zones/*` API contracts.
- Focus is fail-fast backend validation for cross-zone safety and predictable GUI/API behavior.

## Review
- Manual reviewer pass: **APPROVED**
