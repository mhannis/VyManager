# 2026-02-16 Firewall Groups Backend Hardening (`F-03` depth)

## Scope
- Improve firewall groups robustness without changing API routes/contracts.

## Implemented
- Backend validation hardening in `backend/routers/firewall/groups.py`:
  - group-name normalization/validation
  - type-aware operation value validation:
    - IPv4/IPv6 address or range
    - IPv4/IPv6 CIDR network
    - port/range/service token
    - interface name
    - MAC address
    - domain name
    - remote-group URL (http/https)
  - include-self rejection for include operations
- Error semantics fix:
  - added `except HTTPException: raise` in batch endpoint so client validation errors return correct status (`400`) instead of being wrapped as `500`.
- Tests added in `backend/tests/test_firewall_groups_validation.py`:
  - invalid group name -> 400
  - invalid remote-group URL -> 400
  - invalid MAC value -> 400
  - valid remote-group batch -> success

## Validation
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_groups_validation.py tests/test_containers_automation_v1.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py`
- `cd frontend && npx tsc --noEmit --pretty false`
- `cd frontend && npm run -s build`
- `cd frontend && npm run -s smoke:runtime`

## Notes
- Browser smoke still blocked by host Playwright dependency (`libnspr4.so`).
- This slice advances `F-03` robustness but does not complete all firewall parity depth (`F-01/F-02/F-04/F-05/F-06` remain queued).
