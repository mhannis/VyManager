feature_id: parity-phase3-protocols-batch-03
status: done
title: Phase 3 Protocols Batch (PIM, PIM6, Protocols index, BGP page, BFD page)
branch: feature/containers-automation-v1
commits:
  - 4f16851
notes:
  - Completed 5 protocol items before reporting, per execution policy.
  - Added backend routers for PIM and PIM6 plus protocol overview endpoints.
  - Added protocol overview frontend page at /routing/protocols.
  - Added PIM and PIM6 views in multicast page and dedicated routes.
  - Added dedicated routes for BGP and BFD.
  - Updated sidebar with Routing Overview link.
  - Expanded protocol tests and fixed validator behavior to allow subtree delete root commands.
  - Regenerated coverage artifacts; protocols domain now 18 implemented, 0 partial, 0 not_started.
  - Reviewer verdict: APPROVED.
  - Next target domain: services.
