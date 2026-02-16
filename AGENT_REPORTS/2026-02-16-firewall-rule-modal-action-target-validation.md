# Firewall Rule Modal Action-Target Validation (2026-02-16)

## Scope
- Firewall `F-01`/`F-02` UX depth pass: enforce action-dependent required fields in rule create/edit modals.

## Implemented
### Frontend validation hardening
- `frontend/src/components/firewall/CreateFirewallRuleModal.tsx`
- `frontend/src/components/firewall/EditFirewallRuleModal.tsx`

Added:
- submit-time validation for action dependencies:
  - `jump` action now requires a jump target chain
  - `offload` action now requires a flowtable target
- early UI error feedback via existing error banner before API call.
- action-target option availability guardrails:
  - jump target selector is disabled when no custom chains exist
  - offload target selector is disabled when no flowtables exist
  - submit button stays disabled when the selected action requires unavailable targets

## Validation Run
- `cd frontend && npx tsc --noEmit --pretty false && npm run -s build && npm run -s smoke:runtime`
  - Result: passed

## Notes
- UI-only hardening; no backend/API contract changes.
- Prevents avoidable invalid write attempts for action-specific rule requirements.

## Review
- Manual reviewer pass: **APPROVED**
