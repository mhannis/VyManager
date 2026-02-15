feature_id: dashboard-capability-prune-r5-2026-02-15
status: in_review
title: Remove Gateway card and enforce native-only telemetry capability
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Gateway Status card removed from Add Card options and from render mapping.
  - Saved gateway-status cards are filtered out during dashboard layout load.
  - Gateway probe now sets probe_supported=false when API ping is invalid/unsupported, instead of trying SSH fallback.
  - System summary now sets cpu_temperature_supported=false when API sensor commands are unsupported.
  - UI now hides unsupported telemetry fields to avoid persistent failing warnings for unsupported capabilities.
