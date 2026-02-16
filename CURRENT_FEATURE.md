feature_id: firewall-rule-modal-action-target-validation-2026-02-16
title: Firewall rule modal action-target validation (`F-01`/`F-02` UX depth pass)
status: done
branch: feature/containers-automation-v1
completed_in_cycle:
  - Hardened firewall rule create/edit modals to enforce action-dependent required targets before submit.
  - `jump` action now requires a jump target chain in both create and edit flows.
  - `offload` action now requires a flowtable target in both create and edit flows.
  - Invalid action/target combinations now fail in UI with explicit error messages instead of relying on backend rejection.
validation:
  - cd frontend && npx tsc --noEmit --pretty false && npm run -s build && npm run -s smoke:runtime
known_limitations:
  - Backend tests were not rerun for this UI-only slice; latest prior backend gate run remains green.
  - Browser smoke (Playwright) remains blocked on host dependency (`libnspr4.so`) and is outside this slice’s pass gate.
next_queue:
  - Continue firewall depth work (`F-01`, `F-02`) on rule option modeling/UX parity (advanced matches/actions) beyond argument and action-target validation.
  - Continue zone workflow onboarding and UX depth (`F-06`) beyond policy/guided pre-validation.
  - Continue interfaces-depth sweep (`IF-15`) with validation and fixture-backed verification.
  - Continue service parity depth (`SVC-03`, `SVC-04`, `SVC-05`) with guide-complete forms and test expansion.
