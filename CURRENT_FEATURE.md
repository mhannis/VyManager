feature_id: system-ia-guided-setup-v2
status: in_progress
title: System IA Cohesion + Options Coverage + Guided Setup Entry Points
branch: feature/containers-automation-v1
commits: []
notes:
  - Added backend endpoint `PUT /vyos/system/config` for hostname/timezone/domain/name-server updates.
  - Added new `System -> Options & Coverage` page with editable system identity settings and guided setup launch links.
  - Sidebar IA updated so SSH stays under `System`, DHCP Server is no longer listed under `Services`, and `System -> Options & Coverage` is exposed.
  - Firewall Zones guided setup is exposed as top-right one-time wizard (re-runnable) and Firewall Policies now links to setup wizards.
  - Runtime services were rebuilt/restarted and verified healthy (`vm-api` + `vm-ui`).
