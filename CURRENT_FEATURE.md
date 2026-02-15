feature_id: lldp-cpu-firewall-guides-r1-2026-02-15
status: in_review
title: LLDP dashboard visibility and firewall guide UX pass
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - LLDP dashboard card now fetches live status with refresh enabled on load/auto-refresh cycles.
  - System Information card now always shows CPU temperature badge (value or `Unavailable`).
  - Added How-To dialogs to firewall Policies, Groups, Global Options, Bridge, and Flowtables pages.
  - Updated guide validation language to GUI-first validation steps (removed CLI-centric checks).
  - Validated with frontend tsc/lint/build + runtime/browser smoke.
