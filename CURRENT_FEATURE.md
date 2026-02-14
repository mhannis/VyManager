feature_id: services-core-missing-2026-02-14
status: done
title: Services slice - Monitoring, Webproxy, PPPoE Server, IPoE Server
branch: feature/containers-automation-v1
commits:
  - uncommitted
notes:
  - Added backend wrappers for `/vyos/service-monitoring`, `/vyos/service-webproxy`, `/vyos/service-pppoe-server`, `/vyos/service-ipoe-server`.
  - Added form-driven tabs in `/system/services` for Monitoring, Webproxy, PPPoE Server, and IPoE Server.
  - Extended Services sidebar links and smoke routes for the new service tabs.
  - Expanded backend wrapper capability/config/scope tests for the new service routes.
  - Regenerated parity artifacts; services domain is now 23/0/0 (implemented/partial/not_started).
