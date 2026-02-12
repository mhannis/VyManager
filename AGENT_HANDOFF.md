# VyManager Agent Handoff

Last updated: 2026-02-12
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
- Backend process currently launched with:
  - `DATABASE_URL=postgresql://vymanager:vymanager_secure_password@127.0.0.1:5432/vymanager_auth`

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
  - Queues identify work in a background thread and returns immediately (no 30s API wait).
  - Uses upstream-supported VyOS op-mode path first:
    - `show interfaces ethernet <iface> identify`
  - Falls back through additional legacy/variant command paths for compatibility.
  - Logs failures server-side (unsupported NIC/driver cases), instead of blocking UI.
- Added frontend API helper:
  - File: `frontend/src/lib/api/show.ts`
  - Method: `showService.blinkInterface(interfaceName, durationSeconds)`
- Added step-1 wizard controls:
  - File: `frontend/src/app/network/setup-wizard/page.tsx`
  - Buttons: `Blink Selected WAN` / `Blink Selected LAN`
  - Inline success/error status messages
  - Improved error parsing so UI shows backend detail (including first failed attempt), not only generic fallback text.

### 5) New System Dashboard Cards + NTP Service Management
- Backend system API expanded:
  - File: `backend/routers/system.py`
  - New endpoints:
    - `GET /vyos/system/dashboard-summary`
    - `GET /vyos/system/disk-status`
    - `GET /vyos/system/ntp-status`
    - `GET /vyos/system/ntp-config`
    - `PUT /vyos/system/ntp-config`
  - Added parsers for:
    - System version/uptime/cpu/memory outputs
    - Storage status output
    - NTP tracking/activity/sources outputs
    - NTP service config extraction and update diffing
  - All new endpoints permission-gated with `FeatureGroup.SYSTEM` read/write checks.
- Frontend API client expanded:
  - File: `frontend/src/lib/api/system.ts`
  - Added typed models + methods for dashboard summary, disk status, NTP status, and NTP config update.
- New dashboard cards:
  - `frontend/src/components/dashboard/SystemInformationCard.tsx`
  - `frontend/src/components/dashboard/NtpStatusCard.tsx`
  - `frontend/src/components/dashboard/DiskUsageCard.tsx`
  - Integrated via:
    - `frontend/src/components/dashboard/AddCardModal.tsx`
    - `frontend/src/app/page.tsx`
- New NTP configuration UI page:
  - File: `frontend/src/app/system/services/page.tsx`
  - Supports enabling/disabling NTP, server options, allow-client networks, listen addresses, save/apply.
  - Includes runtime NTP status section.
- Sidebar updates:
  - File: `frontend/src/components/layout/Sidebar.tsx`
  - Added system submenu entries for Services/Logs/Users with SYSTEM permission gating.
  - Refactored submenu open-state logic to avoid `setState` inside an effect (lint-safe).

### 6) New Container Management (VyOS Container / Podman)
- Backend container API added:
  - File: `backend/routers/containers.py`
  - Endpoints:
    - `GET /vyos/containers/overview`
    - `PUT /vyos/containers/{container_name}`
    - `DELETE /vyos/containers/{container_name}`
    - `POST /vyos/containers/{container_name}/action` (`start` / `stop` / `restart`)
    - `GET /vyos/containers/{container_name}/logs`
  - Behavior:
    - Parses configured containers from `container name ...` config tree (image/env/ports/volumes/restart/network).
    - Builds launch links from published TCP ports using connected instance host.
    - Implements restart with op-command attempts first, then safe fallback (`disable` toggle) when unsupported.
    - Logs endpoint tries multiple VyOS log command variants for compatibility.
    - Permission-gated with `FeatureGroup.SYSTEM` read/write checks.
- Backend wiring updates:
  - File: `backend/app.py`:
    - Included `containers` router.
  - File: `backend/fastapi_permissions.py`:
    - Added `/vyos/containers` route prefix mapping to `FeatureGroup.SYSTEM`.
- Frontend container UI added:
  - File: `frontend/src/app/system/containers/page.tsx`
  - Features:
    - Container list with status badges, quick start/stop/restart/delete controls.
    - Direct web links for exposed container services.
    - Log viewer panel.
    - Full create/edit form for image, restart policy, networking, env vars, ports, volumes.
    - Pi-hole starter template.
- Frontend API client:
  - File: `frontend/src/lib/api/containers.ts`
  - Typed API bindings for overview/config/actions/logs.
- Sidebar updates:
  - File: `frontend/src/components/layout/Sidebar.tsx`
  - Added `System -> Containers` entry.

## Known Notes / Caveats
- Frontend build warning remains about multiple lockfiles at repo root and `frontend/`; build still succeeds.
- Better Auth warns that current `BETTER_AUTH_SECRET` value is weak/short for production.
- If backend is restarted manually without `DATABASE_URL`, frontend API calls degrade to `503` auth/session failures.
- Existing backend tests require `PYTHONPATH=.` from `backend/` to import `app.py` correctly.

## Files Touching Recent Feature Work
- Backend:
  - `backend/.env.example`
  - `backend/app.py`
  - `backend/middleware/auth.py`
  - `backend/middleware/session.py`
  - `backend/routers/show.py`
  - `backend/routers/system.py`
  - `backend/routers/containers.py`
  - `backend/routers/user_management.py`
  - `backend/fastapi_permissions.py`
- Frontend:
  - `frontend/src/app/system/containers/page.tsx`
  - `frontend/src/app/system/services/page.tsx`
  - `frontend/src/app/api/internal/create-user/route.ts`
  - `frontend/src/app/login/page.tsx`
  - `frontend/src/app/network/interfaces/page.tsx`
  - `frontend/src/app/network/setup-wizard/page.tsx`
  - `frontend/src/app/onboarding/page.tsx`
  - `frontend/src/app/page.tsx`
  - `frontend/src/components/dashboard/AddCardModal.tsx`
  - `frontend/src/components/dashboard/DiskUsageCard.tsx`
  - `frontend/src/components/dashboard/InterfaceStatisticsCard.tsx`
  - `frontend/src/components/dashboard/NtpStatusCard.tsx`
  - `frontend/src/components/dashboard/SystemInformationCard.tsx`
  - `frontend/src/components/layout/Sidebar.tsx`
  - `frontend/src/components/user-management/CreateUserModal.tsx`
  - `frontend/src/components/user-management/DeleteUserModal.tsx`
  - `frontend/src/components/user-management/EditUserModal.tsx`
  - `frontend/src/components/user-management/ManageUserAccessPanel.tsx`
  - `frontend/src/components/user-management/UsersTab.tsx`
  - `frontend/src/components/user-management/ViewInstanceAccessModal.tsx`
  - `frontend/src/lib/api/show.ts`
  - `frontend/src/lib/api/containers.ts`
  - `frontend/src/lib/api/system.ts`
  - `frontend/src/lib/auth-identifier.ts`

## Resume Instructions For Next Agent
1. Read this file first.
2. Verify running services (`tmux ls`, ports 3000/8000).
3. Re-test dashboard cards (`System Information`, `NTP Status`, `Disk Usage`) and System Services NTP configuration against live VyOS.
4. Re-test System Containers page end-to-end:
   - create/update container
   - start/stop/restart actions
   - logs retrieval
   - generated service URL links
5. If container restart/log command variants fail on a target image, inspect backend logs (`tmux capture-pane -pt vm-api:0.0`) and adjust command fallback order in `backend/routers/containers.py`.
6. For unsupported hardware identify LED cases (e.g., some SFP+), inspect logs and add/adjust fallback command paths in `backend/routers/show.py` if needed.
