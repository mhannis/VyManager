feature_id: traffic-policy-qos-depth-2026-02-15
status: done
title: Traffic Policy parity deepening (traffic-policy + qos policy structured editors)
branch: feature/containers-automation-v1
commits:
  - 1b96f27
notes:
  - Added backend `/vyos/qos/*` thin wrapper router (config + capabilities + batch) without changing existing service architecture.
  - Expanded `/network/traffic-policy` to manage both `traffic-policy` and `qos policy` trees via form-driven editors.
  - Added diff-based command generation for traffic-policy fields (including queue-limit/reordering) and QoS policy fields.
  - Validated with backend test_app, frontend tsc/lint/build, runtime smoke, and browser smoke.
