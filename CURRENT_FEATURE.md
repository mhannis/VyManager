feature_id: cross-cutting-robustness-expansion-v2-2026-02-16
title: Expand fixture loops and config snapshots across partial backlog domains
status: in_review
branch: feature/containers-automation-v1
completed_in_cycle:
  - Expanded `X-02` fixture save/apply/reload coverage from 12 loops to 31 loops across:
    - Protocols, VRF, load-balancing, HA, traffic-policy
    - System wrappers (proxy, sysctl, flow-accounting, ipv6, lcd, sflow, task-scheduler)
    - Service wrappers (dns, ntp, lldp, router-advert)
    - VPN wrappers (l2tp, openconnect, pptp, sstp, rsa-keys) + DMVPN
    - PKI and QoS wrappers
  - Expanded `X-03` config snapshot coverage from 15 endpoints to 34 endpoints across the same domain set.
  - Updated dummy-service harness and router wiring in both tests to validate real endpoint contracts (no route fakes).
  - Regenerated `ROBUSTNESS_RELOOK_REPORT.md` after expanded test scope.
  - Applied user correction in tracking: save/apply/reload loop is treated as one cross-cutting backlog item, with breadth tracked as loop count.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_fixture_save_apply_reload_loops.py tests/test_domain_config_snapshots.py
  - python3 scripts/run_robustness_relook.py --skip-ui-smoke
known_limitations:
  - Browser smoke (Playwright) remains blocked by missing host dependency libnspr4.so.
  - X-02 and X-03 remain `partial` until remaining domains (firewall/NAT/deeper service/VPN option trees) gain equivalent fixture and snapshot depth.
next_queue:
  - Extend fixture/snapshot parity into firewall and NAT custom routers.
  - Add command-delta snapshot assertions for expected `show configuration commands` style output.
  - Continue option-depth implementation on high-risk partial domains (Firewall, VPN, Services).
