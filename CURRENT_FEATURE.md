feature_id: gateway-temp-telemetry-r4-2026-02-15
status: in_review
title: Gateway ping and sensor telemetry SSH fallback hardening
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Gateway probe now retries via generate and then SSH ping when API ping commands are unsupported.
  - Added regression test for user-reported errors: Invalid command: show [ping] and generate [ping].
  - Dashboard temperature now falls back to SSH sensors when API sensor commands are unsupported.
  - Added regression test proving CPU temp still populates from SSH sensors output.
