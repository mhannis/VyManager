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
- 2026-02-14: Hardened `System -> Containers` UI against partial/mixed backend payloads and browser storage failures by treating list fields as best-effort arrays and wrapping localStorage access in try/catch; this avoids runtime crashes during page load.
- 2026-02-14: Added runtime validation gates to reduce false positives from build-only checks: `frontend/scripts/check-runtime.sh` (`npm run smoke:runtime`) and Playwright login/route probe script (`npm run smoke:ui`).
- 2026-02-14: Diagnosed user-reported site crash as stale/mismatched Next runtime artifacts (`Invariant: client reference manifest ... does not exist`, missing `/500.html`) in the running `vm-ui` process; resolved by rebuilding and restarting the frontend session.
- 2026-02-14: Browser smoke gate remains blocked on this host until Playwright dependencies are installed (`sudo npx playwright install-deps`), tracked in `LAST_FAILURE.txt`.
- 2026-02-14: Implemented interface naming convention `Description (ethX)` via shared helper `formatInterfaceDisplayName` and applied it across high-traffic selectors/cards; explicitly excluded interface-description edit surfaces per user request.
- 2026-02-14: Site-to-site IPsec wizard modal widened (`max-w-6xl`, scrollable) and crypto proposal inputs relabeled to prevent truncated/unreadable proposal fields.
- 2026-02-14: Added CPU temperature as best-effort dashboard metric by probing multiple show commands (`show hardware temperature`, `show system temperature`, fallback `show hardware sensors`) and parsing C/F values to Celsius.
- 2026-02-14: Added higher-level Services navigation group with direct service links; `System Services` now supports URL tab deep links and includes placeholders for DNS Resolver, Dynamic DNS, DHCP Relay, and Power Mgmt pending full backend implementation.
- 2026-02-14: `powerd`-style CPU governor control treated as unsupported in current VyOS API/config integration unless explicit platform/docs evidence is provided.
- 2026-02-14: Replaced System Services placeholders for Dynamic DNS and DHCP Relay with full read/write GUI tabs backed by `/vyos/system/dynamic-dns-config` and `/vyos/system/dhcp-relay-config`.
- 2026-02-14: DNS Resolver tab now intentionally reuses existing DNS service configuration UI because current VyOS surface in this project exposes resolver/forwarding controls through the same DNS service model.
- 2026-02-14: Removed Power Mgmt placeholder tab from System Services at Mark's request (unsupported on current VyOS API surface).
- 2026-02-14: Dynamic DNS update semantics now enforce uniqueness by `(interface, provider)` and preserve existing provider password when blank password is submitted.
- 2026-02-14: DDNS/DHCP relay disable operations were changed to skip payload entry validation and directly delete service subtrees, preventing disable failures caused by stale invalid form data.
