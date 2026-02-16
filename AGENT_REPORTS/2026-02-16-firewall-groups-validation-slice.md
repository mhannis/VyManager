# 2026-02-16 Firewall Groups Validation Slice (`F-03` depth pass)

## Scope
- Improve firewall group create/edit correctness without backend contract changes.

## Implemented
- Added shared typed validation utility:
  - `frontend/src/lib/validation/firewall-groups.ts`
- Updated create modal:
  - `frontend/src/components/firewall/CreateGroupModal.tsx`
  - type-aware member validation per group type
  - remote-group constraint: exactly one HTTP/HTTPS URL
- Updated edit modal:
  - `frontend/src/components/firewall/EditGroupModal.tsx`
  - type-aware member validation for additions
  - remote-group constraint retained during edits
  - interface-group member datalist suggestions with description-first labels (`Description (ethX)`)

## Validation
- `cd frontend && npx tsc --noEmit --pretty false`
- `cd frontend && npm run -s build`
- `cd frontend && npm run -s smoke:runtime`

## Backlog Update
- `F-03` remains `partial`, but now records that type-aware member validation and remote-group URL constraints are implemented.
