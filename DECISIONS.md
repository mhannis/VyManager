# DECISIONS.md

## Decision Log

- 2026-02-13: New UI features (e.g., dashboard cards) may not appear if VyManager is running via `container/vymanager-prod/env-file-docker-compose.yml` because it uses pre-compiled `ghcr.io/...:beta` images. For testing fork changes, use `container/vymanager-dev/env-file-docker-compose.yml` (source build + bind mounts) or rebuild/publish custom images.
