feature_id: services-https-snmp-tftp-2026-02-14
status: done
title: Services slice - HTTP API, SNMP, and TFTP Server form pages
branch: feature/containers-automation-v1
commits:
  - uncommitted
notes:
  - Added backend wrappers for `/vyos/service-https`, `/vyos/service-snmp`, and `/vyos/service-tftp-server`.
  - Added form-driven tabs in `/system/services` for HTTP API, SNMP, and TFTP Server.
  - Extended `Services` sidebar links in A-Z order with HTTP API, SNMP, and TFTP Server.
  - Extended smoke defaults to include the new service tabs and validated build/restart/runtime/browser smoke.
  - Regenerated coverage artifacts; services domain improved from 9/14/0 to 12/11/0 implemented/partial/not_started.
