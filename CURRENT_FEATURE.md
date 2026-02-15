feature_id: traffic-policy-qos-advanced-subtrees-2026-02-15
status: done
title: Traffic Policy parity deepening (traffic-match-group, defaults, CAKE flow-isolation)
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added QoS traffic-match-group form editor to `/network/traffic-policy`.
  - Added QoS policy default subtree fields (`default bandwidth/burst/ceiling/priority/queue-type`).
  - Added CAKE flow-isolation selector and command generation.
  - Extended diff-based save logic for all three subtrees with existing API contracts unchanged.
  - Validated with frontend tsc/build and runtime + browser smoke.
