feature_id: service-ux-and-lldp-parsing-hardening-2026-02-16
title: Service UX and LLDP parsing hardening (`SVC-03`/`SVC-05` support pass)
status: in_progress
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added backend LLDP structured-payload fallback parsing for runtime neighbor status when table output is empty.
  - Added LLDP parser regression coverage for list-style and nested interface-key structured payloads.
  - Added LLDP `/vyos/system/lldp-status` endpoint tests to verify structured neighbor/detail payload fallback behavior end-to-end.
  - Extended LLDP structured parser to decode JSON-text payloads embedded in show `data` fields and added endpoint/unit regression coverage.
  - DHCP create/edit modals now default DNS servers to the gateway IP in form state when DNS is empty.
  - DHCP create modal now auto-prefills gateway/domain/lease/DNS defaults when adding a subnet into an existing shared network.
  - Router Advertisements service tab now provides description-first interface suggestions while preserving free-form interface entry.
  - DNS service tab now blocks partial/invalid domain and host override rows (with explicit row-level error messages) instead of silently dropping malformed entries.
  - DNS backend update endpoint now validates `listen-address`, `allow-from`, `name-server`, `authoritative-domain`, and `local_domain_name` inputs before apply.
  - Expanded DNS backend regression coverage to verify hostname upstream nameservers still work and invalid local domain names return HTTP 400.
  - System Services LLDP/mDNS save paths now pre-validate LLDP management IPs, mDNS browse domains, mDNS service-filter tokens, and cache-entry integer constraints.
  - LLDP configuration/runtime tables now consistently display interface labels using description-first naming when available.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_system_lldp_parsing.py
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_system_dashboard_temperature.py tests/test_system_lldp_parsing.py tests/test_system_services_ssh_dns.py
  - cd frontend && npx tsc --noEmit --pretty false && npm run -s build && npm run -s smoke:runtime
known_limitations:
  - Browser smoke (Playwright) remains blocked on host dependency (`libnspr4.so`) and is outside this slice’s pass gate.
next_queue:
  - Continue service parity depth (`SVC-03`, `SVC-04`, `SVC-05`) with guide-complete forms and validation.
  - Continue interface label consistency sweep for remaining service/protocol forms.
  - Continue firewall option-depth parity hardening (`F-01`..`F-06`).
