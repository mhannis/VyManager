# ROBUSTNESS_RELOOK_REPORT.md

Generated: 2026-02-16T14:41:43+00:00

- `skip_ui_smoke`: `true`

## Summary

- Passed: 4/4
- Failed: 0/4

## Steps

### Backend protocol + wrapper tests [PASS]
- Command: `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_protocol_capabilities.py tests/test_config_tree_wrapper_capabilities.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_fixture_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py tests/test_domain_config_snapshots.py`
- Return code: `0`

```text
........................................................................ [ 33%]
........................................................................ [ 67%]
......................................................................   [100%]
=============================== warnings summary ===============================
routers/firewall/groups.py:38
  /home/redhot/VyOS/VyManager/backend/routers/firewall/groups.py:38: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
    class GroupBatchRequest(BaseModel):

routers/nat/nat.py:38
  /home/redhot/VyOS/VyManager/backend/routers/nat/nat.py:38: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
    class NATBatchRequest(BaseModel):

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
214 passed, 2 warnings in 9.12s
```

### Frontend TypeScript [PASS]
- Command: `cd frontend && npx tsc --noEmit --pretty false`
- Return code: `0`

### Frontend build [PASS]
- Command: `cd frontend && npm run -s build`
- Return code: `0`

```text
ve
├ ○ /network/interfaces/l2tpv3
├ ○ /network/interfaces/loopback
├ ○ /network/interfaces/macsec
├ ○ /network/interfaces/openvpn
├ ○ /network/interfaces/pppoe
├ ○ /network/interfaces/pseudo-ethernet
├ ○ /network/interfaces/sstp-client
├ ○ /network/interfaces/tunnel
├ ○ /network/interfaces/virtual-ethernet
├ ○ /network/interfaces/vti
├ ○ /network/interfaces/vxlan
├ ○ /network/interfaces/wireless
├ ○ /network/interfaces/wwan
├ ○ /network/load-balancing
├ ○ /network/nat
├ ○ /network/routes
├ ○ /network/setup-wizard
├ ○ /network/traffic-policy
├ ○ /network/vrf
├ ○ /onboarding
├ ○ /policies
├ ○ /policies/access-list
├ ○ /policies/bgp-as
├ ○ /policies/bgp-community
├ ○ /policies/bgp-extended-community
├ ○ /policies/bgp-large-community
├ ○ /policies/examples
├ ○ /policies/local-route
├ ○ /policies/prefix-list
├ ○ /policies/route
├ ○ /policies/route-map
├ ○ /routing/infrastructure
├ ○ /routing/infrastructure/arp
├ ○ /routing/infrastructure/bfd
├ ○ /routing/infrastructure/mpls
├ ○ /routing/infrastructure/rpki
├ ○ /routing/infrastructure/segment-routing
├ ○ /routing/multicast
├ ○ /routing/multicast/igmp-proxy
├ ○ /routing/multicast/pim
├ ○ /routing/multicast/pim6
├ ○ /routing/protocols
├ ○ /routing/static-failover
├ ○ /routing/static-failover/failover
├ ○ /routing/static-failover/static-routes
├ ○ /routing/unicast-protocols
├ ○ /routing/unicast-protocols/bgp
├ ○ /routing/unicast-protocols/isis
├ ○ /routing/unicast-protocols/openfabric
├ ○ /routing/unicast-protocols/ospf
├ ○ /routing/unicast-protocols/rip
├ ○ /routing/unicast-protocols/static
├ ○ /settings
├ ○ /settings/navigation
├ ○ /sites
├ ○ /system/acceleration
├ ○ /system/conntrack
├ ○ /system/containers
├ ○ /system/default-route
├ ○ /system/flow-accounting
├ ○ /system/frr
├ ○ /system/identification
├ ○ /system/ip
├ ○ /system/ipv6
├ ○ /system/lcd
├ ○ /system/logs
├ ○ /system/options
├ ○ /system/pki
├ ○ /system/proxy
├ ○ /system/serial-console
├ ○ /system/services
├ ○ /system/sflow
├ ○ /system/sysctl
├ ○ /system/task-scheduler
├ ○ /system/users
├ ○ /vpn
├ ○ /vpn/dmvpn
├ ○ /vpn/ipsec
├ ○ /vpn/l2tp
├ ○ /vpn/openconnect
├ ○ /vpn/pptp
├ ○ /vpn/rsa-keys
├ ○ /vpn/sstp
└ ○ /vpn/wireguard


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
 We detected multiple lockfiles and selected the directory of /home/redhot/VyOS/VyManager/package-lock.json as the root directory.
 To silence this warning, set `turbopack.root` in your Next.js config, or consider removing one of the lockfiles if it's not needed.
   See https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory for more information.
 Detected additional lockfiles: 
   * /home/redhot/VyOS/VyManager/frontend/package-lock.json

2026-02-16T14:41:42.270Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET should be at least 32 characters long for adequate security. Generate one with `npx @better-auth/cli secret` or `openssl rand -base64 32`.
2026-02-16T14:41:42.271Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET appears low-entropy. Use a randomly generated secret for production.
2026-02-16T14:41:42.274Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET should be at least 32 characters long for adequate security. Generate one with `npx @better-auth/cli secret` or `openssl rand -base64 32`.
2026-02-16T14:41:42.275Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET appears low-entropy. Use a randomly generated secret for production.
2026-02-16T14:41:42.447Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET should be at least 32 characters long for adequate security. Generate one with `npx @better-auth/cli secret` or `openssl rand -base64 32`.
2026-02-16T14:41:42.448Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET appears low-entropy. Use a randomly generated secret for production.
```

### Frontend runtime smoke [PASS]
- Command: `cd frontend && npm run -s smoke:runtime`
- Return code: `0`

```text
[runtime-check] Probing http://localhost:3000
[runtime-check] OK: frontend responds and no known fatal runtime signatures were found.
```
