feature_id: vlan-robust-handling-v1
status: in_review
title: Robust VLAN/QinQ Handling Across Network Interfaces
branch: feature/containers-automation-v1
commits:
  - working-tree-not-committed
notes:
  - Added backend batch operation support for `delete_vif_s` and `delete_vif_c`.
  - Updated ethernet batch endpoint to preserve explicit `HTTPException` status (400 validation errors are no longer masked as 500).
  - Reworked VLAN modal to support `vif`, `vif-s`, and `vif-c` create/edit with operation-family-aware payloads.
  - Added QinQ customer flow support with optional auto-create of missing service VLAN.
  - Expanded interface VLAN listing to include nested `vif-c` entries and clear VLAN type badges.
  - Implemented VLAN delete action in UI through `DeleteVLANModal` for all supported VLAN types.
  - Added backend tests for new VLAN delete operations and malformed payload validation.
  - Validated with backend pytest + frontend typecheck/build/lint/runtime smoke and restarted `vm-api`/`vm-ui`.
