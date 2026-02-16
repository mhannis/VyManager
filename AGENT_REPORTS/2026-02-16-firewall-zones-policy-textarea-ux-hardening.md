# Firewall Zones Policy Textarea UX Hardening (2026-02-16)

## Scope
- Firewall `F-06` UX depth pass: improve `Firewall -> Zones` policy-entry usability by validating policy text input before API submission.

## Implemented
### Frontend UX validation
- `frontend/src/app/firewall/zones/page.tsx`

Added:
- strict parser for `From Policies` textarea:
  - enforces `FROM_ZONE:FIREWALL_NAME` format per line
  - rejects lines with missing fields
  - rejects duplicate `from_zone` mappings (case-insensitive)
- pre-submit validation gates in both create and edit flows:
  - blocks save/upsert when parser finds errors
  - surfaces concise actionable error messages in UI
- helper copy below policy textareas:
  - clarifies one mapping per from-zone
  - calls out `LOCAL` pseudo-zone support

## Validation Run
- `cd frontend && npx tsc --noEmit --pretty false && npm run -s build && npm run -s smoke:runtime`
  - Result: passed

## Notes
- This is UI-only hardening layered on existing backend zone validation.
- Goal is earlier, clearer feedback and fewer failed API round-trips.

## Review
- Manual reviewer pass: **APPROVED**
