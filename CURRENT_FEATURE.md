feature_id: system-logs-service-filtering-2026-02-15
status: done
title: Service-aware system logs filtering and export
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added service filter support in `System -> Logs` using both curated service groups and live discovered process names.
  - Filter now applies to table output and returned-count metric.
  - Download now exports the current filtered log view when a service filter is active.
  - Existing line count/source/search behavior remains intact.
  - Validated with frontend tsc/build and runtime + browser smoke.
