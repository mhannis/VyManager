feature_id: traffic-policy-qos-traffic-match-group-2026-02-15
status: done
title: Traffic Policy parity deepening (QoS traffic-match-group)
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added full form-driven QoS traffic-match-group editor on `/network/traffic-policy`.
  - Added parse/load/save diff support for `qos traffic-match-group` set/delete operations.
  - Preserved all existing API contracts and existing traffic-policy/qos behavior.
  - Validated with frontend tsc/lint/build and runtime + browser smoke.
