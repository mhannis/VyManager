# VyManager Agent Handoff

Last updated: 2026-02-11
Branch: `dev`

## Git / Remote Status
- `origin`: `git@github.com:mhannis/VyManager.git` (fork, push enabled)
- `upstream`: `https://github.com/Community-VyProjects/VyManager.git` (push disabled)

## Runtime Status (host)
- Backend API running: `0.0.0.0:8000` (`uvicorn`)
- Frontend UI running: `0.0.0.0:3000` (`next-server`)
- PostgreSQL running: `127.0.0.1:5432`
- tmux sessions active:
  - `vm-api`
  - `vm-ui`

## Completed Work In This Workspace

### 1) Auth/session/user management hardening
- Session timeout / middleware behavior adjusted in backend.
- Login/onboarding/user-management updated to support username-style auth identifiers (not only email format).
- User creation path fixed to reliably reach creation service across local/docker-style setups.

### 2) Interface visibility improvements
- Added backend support for physical NIC details in `show` endpoints.
- Dashboard/interfaces pages now show NIC model/driver/link metadata.
- Hidden noisy `Unknown! (255)` speed/duplex values when link is down.

### 3) New Network Setup Wizard (pfSense-like first-run flow)
- Added route/page: `frontend/src/app/network/setup-wizard/page.tsx`
- Added sidebar entry under Network.
- Added quick-launch button from Interfaces page.
- Wizard covers:
  - WAN/LAN interface selection
  - WAN DHCP/static
  - LAN static/DHCP mode
  - Optional LAN DHCP server + range
  - Optional default route handling for WAN static gateway
  - Optional baseline firewall defaults
  - Optional outbound NAT masquerade rule

### 4) Interface LED Blink / Identify from Setup Wizard
- Added backend endpoint: `POST /vyos/show/interface-blink`
  - File: `backend/routers/show.py`
  - Permission-gated with `INTERFACES` write permission
  - Validates ethernet interface exists
  - Attempts multiple VyOS command path variants for compatibility
- Added frontend API helper:
  - File: `frontend/src/lib/api/show.ts`
  - Method: `showService.blinkInterface(interfaceName, durationSeconds)`
- Added step-1 wizard controls:
  - File: `frontend/src/app/network/setup-wizard/page.tsx`
  - Buttons: `Blink Selected WAN` / `Blink Selected LAN`
  - Inline success/error status messages

## Current Request In Progress
End-to-end validation of blink behavior on live hardware/driver combinations.

Status:
- Implemented in backend + frontend.
- Not all NICs/drivers support identify/locator operations; unsupported devices return structured error from API.

## Known Notes / Caveats
- Repo has many pre-existing lint issues unrelated to current wizard work.
- Targeted type-check for current wizard path succeeded (`tsc --noEmit --project tsconfig.json`).
- Targeted checks for blink changes passed:
  - `python3 -m py_compile backend/routers/show.py`
  - `npx tsc --noEmit --project tsconfig.json`
  - `npx eslint src/app/network/setup-wizard/page.tsx src/lib/api/show.ts`
- Sidebar file has an existing lint rule issue (`react-hooks/set-state-in-effect`) that predates this handoff workflow.

## Files Touching Recent Feature Work
- Backend:
  - `backend/.env.example`
  - `backend/app.py`
  - `backend/middleware/auth.py`
  - `backend/middleware/session.py`
  - `backend/routers/show.py`
  - `backend/routers/user_management.py`
- Frontend:
  - `frontend/src/app/api/internal/create-user/route.ts`
  - `frontend/src/app/login/page.tsx`
  - `frontend/src/app/network/interfaces/page.tsx`
  - `frontend/src/app/network/setup-wizard/page.tsx`
  - `frontend/src/app/onboarding/page.tsx`
  - `frontend/src/app/page.tsx`
  - `frontend/src/components/dashboard/InterfaceStatisticsCard.tsx`
  - `frontend/src/components/layout/Sidebar.tsx`
  - `frontend/src/components/user-management/CreateUserModal.tsx`
  - `frontend/src/components/user-management/DeleteUserModal.tsx`
  - `frontend/src/components/user-management/EditUserModal.tsx`
  - `frontend/src/components/user-management/ManageUserAccessPanel.tsx`
  - `frontend/src/components/user-management/UsersTab.tsx`
  - `frontend/src/components/user-management/ViewInstanceAccessModal.tsx`
  - `frontend/src/lib/api/show.ts`
  - `frontend/src/lib/auth-identifier.ts`

## Resume Instructions For Next Agent
1. Read this file first.
2. Verify running services (`tmux ls`, ports 3000/8000).
3. Re-test wizard and blink behavior against live VyOS instance.
4. If identify fails on specific hardware, add a driver/platform-specific fallback command path in `backend/routers/show.py`.
