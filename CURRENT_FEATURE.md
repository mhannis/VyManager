feature_id: parity-phase3-protocols-batch-01
status: in_progress
title: Phase 3 Protocols Batch (ARP, OSPF, RIP, IS-IS, IGMP Proxy)
branch: feature/containers-automation-v1
commits:
  - cc385d6
  - 7229af3
  - 6370175
notes:
  - Completed a 5-item protocol batch before reporting, per execution policy.
  - Added backend protocol routers and tests for ARP/OSPF/RIP/IS-IS/IGMP Proxy.
  - Hardened protocol batch endpoints with per-protocol command-scope validation to prevent cross-feature command execution.
  - Added frontend protocol editors and route wiring (unicast, multicast, infrastructure).
  - Frontend protocol editor now surfaces backend batch failure responses instead of always showing success.
  - Added dedicated protocol subpages: /routing/unicast-protocols/{ospf,rip,isis}, /routing/multicast/igmp-proxy, /routing/infrastructure/arp.
  - Regenerated coverage artifacts; protocols backlog now: implemented 5, partial 5, not_started 8.
  - Reviewer verdict: APPROVED.
  - Next batch target: static + mpls + openfabric + pim/pim6 + rpki.
