feature_id: firewall-interface-labels-r3-2026-02-15
status: in_review
title: Firewall rule modal interface-label robustness
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Updated firewall Create/Edit rule modals to load interface descriptions from ethernet config.
  - Interface selectors now render description-first labels using shared formatter (`Description (ethX)`).
  - Preserved existing rule payload values by still storing canonical interface names for API writes.
  - Maintains compatibility for non-ethernet interfaces by falling back to plain interface name labels.
  - Validated with frontend tsc/lint/build + runtime/browser smoke.
