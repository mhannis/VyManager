feature_id: dashboard-polish-services-card-r2-2026-02-15
status: in_review
title: Dashboard monitoring expansion + 4-column card spans
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added `Services Status` dashboard card with live checks for SSH, NTP, LLDP, mDNS, DNS Forwarder, and DHCP Server.
  - Added `services-status` option to Add Card modal and dashboard renderer.
  - Enabled 4-column span selection on all dashboard cards to match new dashboard column layouts.
  - Hardened dashboard drag math by clamping active card span against current column count.
  - Validated with frontend tsc/lint/build + runtime/browser smoke.
