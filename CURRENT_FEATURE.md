feature_id: routing-form-batch-2026-02-14
status: done
title: Routing form-driven batch - ISIS/OpenFabric/MPLS/IGMP/RIP/OSPF refinements
branch: feature/containers-automation-v1
commits:
  - 996398a
notes:
  - Promoted major routing protocol pages from placeholder/simple editors to full form-driven CRUD UX.
  - Added robust forms for ISIS, OpenFabric, MPLS, IGMP Proxy, RIP, OSPF, and improved ARP/RPKI interaction panes.
  - Cleaned selector pages to avoid dead options and replaced fallback placeholder panes with explicit selection prompts.
  - Added reusable `ProtocolSimpleListEditor` and fixture seeding scripts for rapid QA population/teardown.
  - Added missing service wrapper modules (`dns/lldp/mdns/ntp/ssh`) required by backend imports and service pages.
