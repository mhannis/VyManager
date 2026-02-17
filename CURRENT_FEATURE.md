feature_id: none
title: No active feature
status: none
branch: dev
summary:
  - Parity backlog verification previously completed (`done: 86` in `CONFIG_GUIDE_IMPLEMENTATION_BACKLOG.json`).
  - Canonical continuation branch is `dev`.
  - Legacy feature branch `feature/containers-automation-v1` is slated for removal (same tip as `dev`), but deletion is blocked in this execution environment.
next_build_start:
  - Review `PROJECT_MEMORY.md` (Repo Facts + Next Build Kickoff section).
  - Confirm branch with `git branch --show-current` (must be `dev`).
  - Run runtime checks:
    - `cd backend && .venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000 --proxy-headers`
    - `cd frontend && npm run -s build && npm run -s start -- --hostname 0.0.0.0 --port 3000`
    - `cd frontend && npm run -s smoke:runtime`
notes:
  - Preserve unrelated dirty working tree files unless explicitly requested to clean.
