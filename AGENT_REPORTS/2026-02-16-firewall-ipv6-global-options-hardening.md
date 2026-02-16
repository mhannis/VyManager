# Firewall IPv6 + Global Options Hardening (2026-02-16)

## Scope
- Firewall `F-02` depth pass (IPv6 op semantics and compatibility)
- Firewall `F-04` depth pass (global-options backend payload validation)

## Implemented
1. Backend API error semantics
- `backend/routers/firewall/ipv4.py`
- `backend/routers/firewall/ipv6.py`

Added `except HTTPException: raise` in `/batch` and `/reorder` endpoints so input errors remain 4xx.

2. IPv6 operation compatibility + canonical mapping
- `backend/routers/firewall/ipv6.py`
- `frontend/src/lib/api/firewall-ipv6.ts`

Backend now aliases legacy op names:
- `set_rule_icmp_type_name` -> `set_rule_icmpv6_type_name`
- `delete_rule_icmp_type_name` -> `delete_rule_icmpv6_type_name`
- `set_rule_set_ttl` -> `set_rule_set_hop_limit`
- `delete_rule_set_ttl` -> `delete_rule_set_hop_limit`

Frontend now sends canonical IPv6 op names in create/update flows.

3. Firewall UI terminology alignment
- `frontend/src/components/firewall/CreateFirewallRuleModal.tsx`
- `frontend/src/components/firewall/EditFirewallRuleModal.tsx`

Packet modifications field is now labeled `Hop Limit` for IPv6 protocol.

4. Firewall global-options validation hardening
- `backend/routers/firewall_global_options/firewall_global_options.py`

Added payload validation before command generation:
- enable/disable enum checks
- source-validation enum checks
- state policy action/log-level enum checks
- timeout integer bounds checks (`1..2147483647`)

Added `except HTTPException: raise` in `/update` endpoint.

## Tests Added
- `backend/tests/test_firewall_batch_semantics.py`
  - unknown op in IPv4 batch -> `400`
  - unknown op in IPv6 batch -> `400`
  - legacy IPv6 alias ops apply successfully and generate `icmpv6` + `hop-limit` paths

- `backend/tests/test_firewall_global_options_validation.py`
  - invalid enable/disable field -> `400`
  - invalid log level -> `400`
  - invalid timeout range -> `400`
  - valid payload -> `200`

## Validation Run
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_firewall_batch_semantics.py tests/test_firewall_global_options_validation.py tests/test_firewall_groups_validation.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py`
  - Result: `19 passed, 2 warnings`
- `cd frontend && npx tsc --noEmit --pretty false` passed
- `cd frontend && npm run -s build` passed
- `cd frontend && npm run -s smoke:runtime` passed
- `cd frontend && npm run -s lint` passed with existing warnings only

## Notes
- During implementation, one test run failed with `name 'value' is not defined`; root cause was a misplaced `_parse_int` block in global-options router. Fixed and revalidated.
