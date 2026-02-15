feature_id: routing-editor-cleanup-2026-02-15
status: done
title: Routing editor cleanup (remove obsolete command/list components)
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Removed unused `ProtocolCommandContent` and `ProtocolSimpleListEditor` components.
  - Confirmed no remaining imports and no routing pages depend on command-box/list-editor fallback components.
  - Validated with frontend tsc/build and runtime + browser smoke.
