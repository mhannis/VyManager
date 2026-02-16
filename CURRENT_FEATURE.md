feature_id: firewall-zones-policy-textarea-ux-hardening-2026-02-16
title: Firewall zones policy textarea UX hardening (`F-06` depth pass)
status: done
branch: feature/containers-automation-v1
completed_in_cycle:
  - Hardened `Firewall -> Zones` policy text parsing in create/edit forms to fail fast on invalid line formats.
  - Added pre-submit validation for `FROM_ZONE:FIREWALL_NAME` rows with duplicate `from_zone` protection (case-insensitive).
  - Improved UI error clarity by surfacing parser failures before API calls.
  - Added helper guidance text clarifying one mapping per from-zone and `LOCAL` support.
  - Added guided setup preflight checks to block WAN/LAN preset apply when selected interfaces are still assigned to other zones.
validation:
  - cd frontend && npx tsc --noEmit --pretty false && npm run -s build && npm run -s smoke:runtime
known_limitations:
  - Backend tests were not rerun for this UI-only slice; latest prior backend gate run remains green.
  - Browser smoke (Playwright) remains blocked on host dependency (`libnspr4.so`) and is outside this slice’s pass gate.
next_queue:
  - Continue firewall depth work (`F-01`, `F-02`) on rule option modeling/UX parity (advanced matches/actions) beyond backend argument-shape hardening.
  - Continue zone workflow onboarding and UX depth (`F-06`) beyond textarea validation (guided flow clarity and policy mapping ergonomics).
  - Continue interfaces-depth sweep (`IF-15`) with validation and fixture-backed verification.
  - Continue service parity depth (`SVC-03`, `SVC-04`, `SVC-05`) with guide-complete forms and test expansion.
