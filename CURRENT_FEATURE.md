feature_id: firewall-interfaces-containers-robustness-2026-02-15
status: done
title: Firewall/Interfaces/Containers robustness hardening
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added firewall zone `local-zone` support end-to-end in backend parser/upsert logic and frontend zone forms/overview.
  - Added container network CRUD endpoints and wired full GUI management in `System -> Containers`.
  - Added dedicated `Network -> Dummy Interfaces` page for create/edit/delete over existing `/vyos/dummy/batch`.
  - Added sidebar/interfaces-page navigation for dummy interfaces and expanded smoke route coverage.
  - Validated with backend pytest + frontend tsc/lint/build and runtime + browser smoke.
