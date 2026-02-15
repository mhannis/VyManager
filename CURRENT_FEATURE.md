feature_id: cross-domain-page-guides-2026-02-15
status: done
title: Cross-domain workflow guides for key operations pages
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added shared `pageGuides` registry for non-routing workflows (interfaces, DHCP, zones, containers, IPsec).
  - Integrated `PageGuideDialog` into each target page with canonical VyOS docs links and setup/validation/troubleshooting sections.
  - Kept Network Interfaces action layout with always-visible `Create Interface` and `Create VLAN / QinQ` buttons.
  - Added guide access to container loading/bootstrap/active states for consistent operator onboarding.
  - Validated with frontend tsc/build and runtime + browser smoke.
