feature_id: firewall-interfaces-containers-robustness-r2-2026-02-15
status: done
title: Firewall/Interfaces/Containers robustness relook pass
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Completed container bootstrap setup workflow so first-run automation can also create a configurable default container network.
  - Added backend bootstrap coverage for network-only setup (`enable_automation=false`) in `test_containers_automation_v1.py`.
  - Improved firewall zone create/edit UX with interface checkbox selectors backed by discovered interfaces plus manual override entry.
  - Updated interface cards to show description-first labels while retaining canonical interface names.
  - Validated with backend pytest + frontend tsc/lint/build and runtime + browser smoke.
