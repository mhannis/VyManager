# PARITY_BACKLOG

Prioritization policy:
1. Foundational risk (interfaces/routing/firewall/nat first)
2. Breadth (highest uncovered page count)
3. Reuse potential

| Priority | Domain | Risk | Breadth | Reuse | Implemented | Partial | Not Started | Total |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | `policy` | 95 | 6 | 100 | 5 | 4 | 2 | 11 |
| 2 | `protocols` | 94 | 18 | 90 | 0 | 5 | 13 | 18 |
| 3 | `services` | 78 | 19 | 88 | 4 | 19 | 0 | 23 |
| 4 | `vpn` | 70 | 7 | 72 | 5 | 7 | 0 | 12 |
| 5 | `ha` | 65 | 1 | 55 | 0 | 0 | 1 | 1 |
| 6 | `vrf` | 60 | 1 | 62 | 0 | 1 | 0 | 1 |
| 7 | `load_balancing` | 55 | 3 | 68 | 0 | 3 | 0 | 3 |
| 8 | `traffic_policy` | 50 | 1 | 78 | 0 | 0 | 1 | 1 |
| 9 | `pki` | 35 | 1 | 30 | 0 | 0 | 1 | 1 |
| 10 | `meta` | 10 | 1 | 10 | 0 | 0 | 1 | 1 |

Completed domains (no uncovered pages detected):

| Domain | Implemented | Partial | Not Started | Total |
|---|---:|---:|---:|---:|
| `interfaces` | 21 | 0 | 0 | 21 |
| `firewall` | 8 | 0 | 0 | 8 |
| `nat` | 5 | 0 | 0 | 5 |
| `system` | 22 | 0 | 0 | 22 |
| `container` | 1 | 0 | 0 | 1 |
