feature_id: traffic-policy-qos-default-subtree-2026-02-15
status: done
title: Traffic Policy parity deepening (QoS default subtree + traffic-match-group)
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added QoS traffic-match-group form editor to `/network/traffic-policy`.
  - Added QoS default subtree fields (`default bandwidth/burst/ceiling/priority/queue-type`) to QoS policy editor.
  - Extended diff-based save logic for both new subtrees without backend API changes.
  - Validated with frontend tsc/build and runtime + browser smoke.
