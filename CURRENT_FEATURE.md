feature_id: container-option-depth-c0204-2026-02-16
title: Container workflows parity sweep (image lifecycle, network validation, inspect UX)
status: in_review
branch: feature/containers-automation-v1
completed_in_cycle:
  - Added backend guardrails for container networking:
    - reject overlapping container network prefixes across `container network <name> prefix`
    - validate container attachment addresses are within configured network prefixes
    - reject network/broadcast IPv4 host assignments for static container addresses
  - Added container network overlap pre-check in UI before save so operators get immediate feedback.
  - Expanded image lifecycle UX with row-level quick actions (`Use`, `Pull`, `Update`, `Delete`) from configured/runtime image lists.
  - Expanded inspect UX with parsed summary fields (JSON + key/value fallback) above raw inspect output.
  - Added firewall group type-aware member validation in create/edit flows, including strict remote-group single-URL behavior and format validation per group type.
  - Added backend tests for overlap and address validation helper paths.
validation:
  - cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_containers_automation_v1.py
  - cd frontend && npx tsc --noEmit --pretty false
  - cd frontend && npm run -s build
  - cd frontend && npm run -s smoke:runtime
known_limitations:
  - Container address validation is strict for explicit static addresses; non-addressed attachments are still allowed for pre-stage workflows.
  - Browser smoke (Playwright) remains blocked on host dependency (`libnspr4.so`) and is not part of this cycle’s pass gate.
next_queue:
  - Continue container parity depth on registry/image workflows (bulk cleanup/import and clearer status/health signals).
  - Continue firewall option-depth parity (F-01..F-06) with advanced match/action and validation passes.
  - Continue interface depth sweep on advanced per-family leaves and verification.
