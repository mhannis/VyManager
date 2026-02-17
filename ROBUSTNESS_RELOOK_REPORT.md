# ROBUSTNESS_RELOOK_REPORT.md

Generated: 2026-02-17T17:35:14+00:00

- `skip_ui_smoke`: `false`

## Summary

- Passed: 6/6
- Failed: 0/6

## Steps

### Backend robustness test suite [PASS]
- Command: `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q tests/test_protocol_capabilities.py tests/test_config_tree_wrapper_capabilities.py tests/test_firewall_nat_save_apply_reload_loops.py tests/test_fixture_save_apply_reload_loops.py tests/test_firewall_nat_config_snapshots.py tests/test_domain_config_snapshots.py tests/test_nat_reorder_static.py tests/test_system_update_check_status.py tests/test_system_services_ssh_dns.py tests/test_firewall_flowtables_validation.py`
- Return code: `0`

```text
........................................................................ [ 27%]
........................................................................ [ 54%]
........................................................................ [ 81%]
................................................                         [100%]
=============================== warnings summary ===============================
routers/firewall/groups.py:253
  /home/redhot/VyOS/VyManager/backend/routers/firewall/groups.py:253: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
    class GroupBatchRequest(BaseModel):

routers/nat/nat.py:38
  /home/redhot/VyOS/VyManager/backend/routers/nat/nat.py:38: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
    class NATBatchRequest(BaseModel):

routers/firewall/flowtables.py:32
  /home/redhot/VyOS/VyManager/backend/routers/firewall/flowtables.py:32: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
    class FlowtableBatchRequest(BaseModel):

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
264 passed, 3 warnings in 11.53s
```

### Frontend lint (critical surfaces) [PASS]
- Command: `cd frontend && npx eslint src/app/page.tsx src/app/network/nat/page.tsx src/app/network/load-balancing/page.tsx src/app/system/services/page.tsx src/app/vpn/ipsec/page.tsx src/components/dashboard/SystemInformationCard.tsx src/components/network/EditSourceNATModal.tsx src/components/network/EditDestinationNATModal.tsx src/components/network/EditStaticNATModal.tsx src/lib/api/nat.ts`
- Return code: `0`

```text
/home/redhot/VyOS/VyManager/frontend/src/app/network/nat/page.tsx
  129:35  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  133:33  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  170:23  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/redhot/VyOS/VyManager/frontend/src/app/vpn/ipsec/page.tsx
   99:48  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  182:78  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  184:80  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  202:94  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  334:19  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  799:45  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  898:41  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/redhot/VyOS/VyManager/frontend/src/components/network/EditDestinationNATModal.tsx
  350:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/redhot/VyOS/VyManager/frontend/src/components/network/EditSourceNATModal.tsx
  362:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/redhot/VyOS/VyManager/frontend/src/components/network/EditStaticNATModal.tsx
  192:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/redhot/VyOS/VyManager/frontend/src/lib/api/nat.ts
  110:25  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  139:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  965:18  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  974:21  warning  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

✖ 17 problems (0 errors, 17 warnings)
```

### Frontend TypeScript [PASS]
- Command: `cd frontend && npx tsc --noEmit --pretty false`
- Return code: `0`

### Frontend build [PASS]
- Command: `cd frontend && npm run -s build`
- Return code: `0`

```text
/macsec
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
├ ○ /system/services/dns
├ ○ /system/sflow
├ ○ /system/sysctl
├ ○ /system/syslog
├ ○ /system/task-scheduler
├ ○ /system/update-check
├ ○ /system/users
├ ○ /system/watchdog
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

2026-02-17T17:34:40.904Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET should be at least 32 characters long for adequate security. Generate one with `npx @better-auth/cli secret` or `openssl rand -base64 32`.
2026-02-17T17:34:40.907Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET appears low-entropy. Use a randomly generated secret for production.
2026-02-17T17:34:40.928Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET should be at least 32 characters long for adequate security. Generate one with `npx @better-auth/cli secret` or `openssl rand -base64 32`.
2026-02-17T17:34:40.930Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET appears low-entropy. Use a randomly generated secret for production.
2026-02-17T17:34:41.120Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET should be at least 32 characters long for adequate security. Generate one with `npx @better-auth/cli secret` or `openssl rand -base64 32`.
2026-02-17T17:34:41.121Z WARN [Better Auth]: [better-auth] Warning: your BETTER_AUTH_SECRET appears low-entropy. Use a randomly generated secret for production.
```

### Frontend runtime smoke [PASS]
- Command: `cd frontend && npm run -s smoke:runtime`
- Return code: `0`

```text
[runtime-check] Probing http://localhost:3000
[runtime-check] OK: frontend responds and no known fatal runtime signatures were found.
```

### Frontend browser smoke (high-risk routes) [PASS]
- Command: `cd frontend && SMOKE_ROUTES=/,/network/interfaces,/network/nat,/network/load-balancing,/network/traffic-policy,/routing/static-failover,/vpn/ipsec,/system/services,/system/users npm run -s smoke:ui`
- Return code: `0`

```text
UI smoke test PASSED.
```
