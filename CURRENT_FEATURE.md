feature_id: nat-interface-labels-r4-2026-02-15
status: in_review
title: NAT modal interface-label robustness
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Updated NAT Create/Edit modals (source, destination, static) to hydrate interface descriptions from config snapshot.
  - NAT interface selectors now render description-first labels using shared formatter (`Description (ethX)`), including VLAN subinterfaces.
  - Preserved existing NAT payload behavior by keeping canonical interface names as submitted values.
  - Fallback to plain interface names remains in place when descriptions are absent.
  - Validated with frontend tsc/lint/build + runtime/browser smoke.
