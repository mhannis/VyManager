feature_id: traffic-policy-qos-interface-assignment-2026-02-15
status: done
title: Traffic Policy parity deepening (QoS interface assignment)
branch: feature/containers-automation-v1
commits:
  - pending
notes:
  - Added QoS interface assignment editor on `/network/traffic-policy` for `qos interface <if> ingress|egress`.
  - Added interface discovery + description-first labeling for assignment selection.
  - Added save-time validation for ingress limiter policy names and egress QoS policy names.
  - Validated with backend test_app, frontend tsc/lint/build, runtime smoke, and browser smoke.
