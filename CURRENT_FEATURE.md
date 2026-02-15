feature_id: traffic-policy-qos-classes-depth-2026-02-15
status: done
title: Traffic Policy parity deepening (QoS class-level editors)
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added class-level QoS editor on `/network/traffic-policy` for `qos policy ... class ...` command trees.
  - Added class-capable policy gating to avoid invalid class operations on unsupported QoS policy types.
  - Extended diff-based save logic to include class leaves, DSCP, and class match/match-group nodes.
  - Validated with backend test_app, frontend tsc/lint/build, runtime smoke, and browser smoke.
