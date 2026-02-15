feature_id: dashboard-containers-polish-r1-2026-02-15
status: in_review
title: Dashboard flexibility + container UX polish
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added persisted dashboard layout settings (`columns`, `gap_px`) and layout controls in dashboard edit mode.
  - Added a new `LLDP Neighbors` dashboard card for quick neighbor visibility.
  - Extended gateway summary API/card to include RTT, RTTsd, and Loss (best-effort probe metrics).
  - Enabled editing active instance host from `System -> Containers` and collapsed container network CRUD under on-demand expansion.
  - Validated with backend pytest + frontend tsc/lint/build + runtime/browser smoke.
