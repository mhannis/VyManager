feature_id: cross-cutting-robustness-batch-v1-2026-02-16
title: Close 3 missing cross-cutting items + deliver 15-item robustness batch
status: in_review
branch: feature/containers-automation-v1
completed_in_cycle:
  - Implemented strict missing cross-cutting backlog items as baseline deliverables:
    - X-02 (fixture save/apply/reload loops)
    - X-03 (domain config snapshots)
    - X-05 (robustness relook runner + report)
  - Added loop fixture file and loop test:
    - backend/tests/fixtures/config_apply_loops.json
    - backend/tests/test_fixture_save_apply_reload_loops.py
  - Added domain snapshot fixture file and snapshot test:
    - backend/tests/snapshots/domain_config_snapshots.json
    - backend/tests/test_domain_config_snapshots.py
  - Added reproducible robustness runner/report:
    - scripts/run_robustness_relook.py
    - ROBUSTNESS_RELOOK_REPORT.md
  - Updated strict backlog statuses:
    - X-02 => partial
    - X-03 => partial
    - X-05 => partial
  - Completed 15 concrete items in this batch:
    - Item 01: X-02 baseline implemented
    - Item 02: X-03 baseline implemented
    - Item 03: X-05 baseline implemented
    - Item 04: OSPF save/apply/reload loop
    - Item 05: RIP save/apply/reload loop
    - Item 06: IS-IS save/apply/reload loop
    - Item 07: MPLS save/apply/reload loop
    - Item 08: Segment Routing save/apply/reload loop
    - Item 09: VRF save/apply/reload loop
    - Item 10: Load Balancing save/apply/reload loop
    - Item 11: High Availability save/apply/reload loop
    - Item 12: Traffic Policy save/apply/reload loop
    - Item 13: System IP save/apply/reload loop
    - Item 14: System Conntrack save/apply/reload loop
    - Item 15: System FRR save/apply/reload loop
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_fixture_save_apply_reload_loops.py tests/test_domain_config_snapshots.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
  - python3 scripts/run_robustness_relook.py --skip-ui-smoke
known_limitations:
  - Browser smoke (Playwright) still blocked by missing host dependency libnspr4.so.
  - X-02/X-03/X-05 are now partial (baseline complete) and still require full-domain depth and live-device execution before final parity sign-off.
next_queue:
  - Expand X-02 fixture loops across remaining partial domains (Firewall, NAT, Services, VPN, PKI).
  - Expand X-03 snapshots into command-delta checks against expected `show configuration commands` outputs.
  - Continue option-depth parity hardening for top-risk partial tasks (F-01..F-06, VPN-01..VPN-04, SVC-03..SVC-05).
