feature_id: containers-ux-simplification-r1-2026-02-15
status: in_review
title: Container management progressive disclosure UX
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Simplified `System -> Containers` create/edit flow with collapsible sections for optional/advanced settings.
  - Added progressive disclosure controls for LAN helper, runtime overrides, environment variables, port mappings, and volume mappings.
  - Updated template action wording to `Load Template` and clarified it does not install containers.
  - Preserved all existing container fields and API payload behavior.
  - Validated with frontend tsc/lint/build + runtime/browser smoke.
