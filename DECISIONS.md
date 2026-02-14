# DECISIONS.md

## Decision Log

- 2026-02-13: New UI features (e.g., dashboard cards) may not appear if VyManager is running via `container/vymanager-prod/env-file-docker-compose.yml` because it uses pre-compiled `ghcr.io/...:beta` images. For testing fork changes, use `container/vymanager-dev/env-file-docker-compose.yml` (source build + bind mounts) or rebuild/publish custom images.
- 2026-02-13: Updated `ORCHESTRATOR.md` to add a HEAVY `Build/Execution` role, require canonical command discovery up front, and enforce feature-branch workflow (no direct commits to `main`).
- 2026-02-13: For Next.js start flags, use `npm run start -- --hostname 0.0.0.0 --port 3000` (or ensure args are passed after `--`); `npm exec next start --hostname ...` can mis-forward args and cause Next to treat the hostname as a positional project directory.
- 2026-02-13: Gateway Status card: removed redundant Link State text + Speed/Duplex display. pfSense-style RTT/RTTsd/Loss monitoring is deferred because VyOS REST `show` does not expose a ping/monitor operation (and no dpinger equivalent is available in this architecture) without adding an external probe/agent.
- 2026-02-14: Container image pulls require op-mode `add container image ...`, which is not supported by the VyOS HTTPS API; VyManager performs image pulls + host path creation via SSH after one-time bootstrap (enable `service ssh` + install an automation public key).
- 2026-02-14: VyOS container docs show that port publishing can be used with user-defined container networks; removed backend/frontend validation that incorrectly rejected `network` + `port` combinations.
- 2026-02-14: Store dev SSH automation material under `backend/.devdata/ssh/` (gitignored) so it persists in Docker dev where only `backend/` is bind-mounted; backend Dockerfile installs `openssh-client`.
- 2026-02-14: SSH automation hardening: reject `.`/`..` dot-segments in any host path passed to the backend volume mkdir helper to prevent directory traversal outside `/config/containers/`.
