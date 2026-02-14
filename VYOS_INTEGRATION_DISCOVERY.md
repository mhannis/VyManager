# VyOS Integration Discovery

Generated for the parity program bootstrap.

## Current Integration Architecture

- Primary backend service: `backend/vyos_service.py`
  - Holds connection metadata (`VyOSDeviceConfig`)
  - Wraps `pyvyos` device client (`VyDevice`)
  - Exposes config read helpers and batch execution
- Session scoping: `backend/session_vyos_service.py`
  - Binds active UI session to one VyOS instance (`request.state.instance`)
  - Caches one service per instance ID
- API client core: `backend/pyvyos/core/device.py`
  - `show(path=...)` for operational/state reads
  - `generate(path=...)` for generated artifacts (e.g., WireGuard keys)
  - `configure_multiple_op(op_path=[...])` for set/delete operations
  - `config_file_save/load` for config snapshots and restore

## Existing Router Access Pattern

- Most routers call:
  - `service = get_session_vyos_service(request)`
  - `service.get_full_config(...)` for reads
  - `service.execute_batch(...)` or direct configure calls for writes
- A subset previously called `service.device.configure_multiple_op(...)` directly.
  - These are now routed through `service.apply_operations(...)` so write safety policy can be enforced centrally.

## New Phase 0 Abstractions

## `backend/safe_apply.py`

- Adds centralized Safe Apply policy for high-risk paths.
- Risk-triggered trees include:
  - `interfaces`
  - `firewall`
  - `nat`
  - `vrf`
  - `policy`
  - `route` / `routes`
  - `protocols`
  - `vpn ipsec`
  - `vpn wireguard`
- Safe Apply flow (emulated commit-confirm):
  1. Save snapshot (`config_file_save`)
  2. Apply ops (`configure_multiple_op`)
  3. Probe connectivity (`show version`, optional ping target)
  4. Roll back (`config_file_load`) on probe failure

## `backend/vyos_driver.py`

- Thin wrapper around `VyOSService`.
- Unifies write entrypoint via `apply_operations(...)`.
- Preserves backward compatibility by delegating unknown attributes to `VyOSService`.
- Keeps existing API contracts intact.

## `VyOSService` updates

- Added `apply_operations(...)` as the central write path.
- `execute_batch(...)` and `configure_batch(...)` now use `apply_operations(...)`.
- Successful writes invalidate cached full config.

## `session_vyos_service` updates

- Added `get_session_vyos_driver(request)` returning a `VyOSDriver`.
- Existing `get_session_vyos_service(request)` remains unchanged for compatibility.
- Driver cache is keyed per instance and cleared with existing cache-clear functions.

## Safety Notes

- The current VyOS HTTPS API does not expose a native commit-confirm transaction.
- Safe Apply therefore uses an emulated commit-confirm model with snapshot+probe+rollback.
- This is enforced at service-level write methods and direct router write paths now call those methods.

