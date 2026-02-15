feature_id: gateway-probe-metrics-r2-2026-02-15
status: in_review
title: Gateway Status card RTT/RTTsd/Loss hardening
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Hardened gateway ping metric parsing for additional ping summary variants and per-echo sample fallback.
  - Added DHCP lease router parsing as probe-target fallback for DHCP default routes without explicit next-hop.
  - Added ping command variant retries (with interface and without) plus generate fallback when show ping is unavailable.
  - Added targeted backend tests and revalidated runtime smoke after vm-api restart.
