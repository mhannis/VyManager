# Firewall/NAT Regression Slice (2026-02-16)

## Objective
Extend cross-cutting robustness gates into Firewall and NAT custom routers.

## Added
- `backend/tests/test_firewall_nat_save_apply_reload_loops.py`
  - Save/apply/reload loops for:
    - Firewall IPv4
    - Firewall IPv6
    - Firewall Groups
    - NAT Source rules
- `backend/tests/snapshots/firewall_nat_config_snapshots.json`
- `backend/tests/test_firewall_nat_config_snapshots.py`

## Updated
- `scripts/run_robustness_relook.py`
  - Backend suite now includes the new firewall/NAT loop + snapshot tests.

## Validation
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py tests/test_fixture_save_apply_reload_loops.py tests/test_domain_config_snapshots.py`
  - Result: `73 passed`
- `python3 scripts/run_robustness_relook.py --skip-ui-smoke`
  - Result: all configured checks passed.

## Notes
- Firewall groups router requires `create_firewall_groups_batch()` on the service object; this was added to the dummy service in the new loop test.
