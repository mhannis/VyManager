feature_id: routing-help-and-selector-stability-2026-02-15
status: done
title: Routing help guides and selector-state stability hardening
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added reusable page-level how-to dialog and guide content for core routing protocols.
  - Integrated guides into OSPF, IS-IS, OpenFabric, RIP, MPLS, BFD, RPKI, IGMP Proxy, PIM, and PIM6 pages.
  - Reworked routing selector shell state to remove effect-driven setState patterns and reduce flicker.
  - Wrapped redirect-only route pages in AppLayout to keep left navigation visible during route transitions.
  - Validated with frontend tsc/build and runtime + browser smoke.
