feature_id: services-batch-2-2026-02-14
status: done
title: Services slice - Broadcast Relay, Conntrack Sync, Console Server, Salt Minion, Suricata
branch: feature/containers-automation-v1
commits:
  - uncommitted
notes:
  - Added backend wrappers for `/vyos/service-broadcast-relay`, `/vyos/service-conntrack-sync`, `/vyos/service-console-server`, `/vyos/service-salt-minion`, and `/vyos/service-suricata`.
  - Added form-driven tabs in `/system/services` for all five service domains.
  - Extended `Services` sidebar links in A-Z order with Broadcast Relay, Conntrack Sync, Console Server, Salt Minion, and Suricata.
  - Extended smoke defaults to include each new tab route and validated build/restart/runtime/browser smoke.
  - Regenerated coverage artifacts; services domain improved from 12/11/0 to 17/6/0 implemented/partial/not_started.
