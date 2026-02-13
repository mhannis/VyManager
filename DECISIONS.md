# DECISIONS.md

## Decision Log

- 2026-02-13: New UI features (e.g., dashboard cards) may not appear if VyManager is running via `container/vymanager-prod/env-file-docker-compose.yml` because it uses pre-compiled `ghcr.io/...:beta` images. For testing fork changes, use `container/vymanager-dev/env-file-docker-compose.yml` (source build + bind mounts) or rebuild/publish custom images.
- 2026-02-13: Updated `ORCHESTRATOR.md` to add a HEAVY `Build/Execution` role, require canonical command discovery up front, and enforce feature-branch workflow (no direct commits to `main`).
- 2026-02-13: For Next.js start flags, use `npm run start -- --hostname 0.0.0.0 --port 3000` (or ensure args are passed after `--`); `npm exec next start --hostname ...` can mis-forward args and cause Next to treat the hostname as a positional project directory.
