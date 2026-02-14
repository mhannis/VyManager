feature_id: system-ia-guided-setup-v2
status: in_progress
title: System IA Cohesion + Options Coverage + Guided Setup Entry Points
branch: feature/containers-automation-v1
commits:
  - ecc2a5b
  - 5bf29bc
  - 36e9a56
notes:
  - Added backend endpoint `PUT /vyos/system/config` for hostname/timezone/domain/name-server updates.
  - Added new `System -> Options & Coverage` page with editable system identity settings and guided setup launch links.
  - Sidebar IA updated so NTP/LLDP/mDNS are under `Services`, DHCP Server is not listed under `Services`, and `System -> Options & Coverage` is exposed.
  - Service shortcuts now use single-service mode so `/system/services` does not show the cross-service top tab bar.
  - SSH stays available via `System -> Options & Coverage`; redundant options shortcuts (Logs/Users/Containers) were removed.
  - DNS server ownership stays in DNS Resolver flow; System Options no longer edits name-servers directly.
  - Clarified System Identity description text so it no longer claims name-server editing is on that page.
  - Firewall Zones guided setup is exposed as top-right one-time wizard (re-runnable) and Firewall Policies now links to setup wizards.
  - Runtime services were rebuilt/restarted and verified healthy (`vm-api` + `vm-ui`).
