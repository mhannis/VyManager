# 2026-02-16 Container Parity Slice (`C-02`,`C-03`,`C-04`)

## Scope
- Deepen container parity without changing core backend architecture.
- Keep existing API contracts and thin-wrapper model intact.

## Implemented
- Backend validation hardening (`backend/routers/containers.py`):
  - Reject overlapping container network prefixes on network upsert.
  - Validate container static attachment addresses against configured network prefixes before upsert/install.
  - Reject invalid IPv4 network and broadcast static addresses.
- Frontend workflow improvements (`frontend/src/app/system/containers/page.tsx`):
  - Added row-level image lifecycle quick actions (`Use`, `Pull`, `Update`, `Delete`) in image catalog lists.
  - Added inspect summary parsing panel (JSON/object parsing with key-value fallback).
  - Added client-side IPv4 overlap pre-check for container network save.
- Tests (`backend/tests/test_containers_automation_v1.py`):
  - Added coverage for prefix overlap rejection.
  - Added coverage for static address outside-prefix rejection.
  - Added coverage for IPv4 network-address rejection.
  - Added coverage for valid static address acceptance.

## Validation
- `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_containers_automation_v1.py`
- `cd frontend && npx tsc --noEmit --pretty false`
- `cd frontend && npm run -s build`
- `cd frontend && npm run -s smoke:runtime`

## Backlog State Update
- `C-02`: `partial` -> `verify`
- `C-03`: `partial` -> `verify`
- `C-04`: `partial` -> `verify`

## Notes
- Browser UI smoke remains blocked by host Playwright dependency (`libnspr4.so` missing).
- Unknown network names without explicit static addresses remain allowed to preserve pre-stage/template workflows.
