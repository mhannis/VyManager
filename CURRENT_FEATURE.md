feature_id: gateway-temp-telemetry-r3-2026-02-15
status: in_review
title: Gateway ping and sensor telemetry compatibility hardening
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Gateway probe now retries via generate when show ping returns Invalid command.
  - Added regression test for user-reported warning: Invalid command: show [ping].
  - Dashboard temperature acquisition now falls back to generate for sensors commands.
  - Added dashboard summary test proving CPU temp can be read from sensors when show sensors fails.
