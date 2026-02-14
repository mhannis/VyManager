feature_id: vpn-batch-remaining-2026-02-14
status: done
title: VPN backlog batch - DMVPN/OpenConnect/PPTP/SSTP/Overview
branch: feature/containers-automation-v1
commits:
  - pending-commit
notes:
  - Added backend wrapper endpoints for `/vyos/vpn-openconnect`, `/vyos/vpn-pptp`, and `/vyos/vpn-sstp`.
  - Added DMVPN backend router at `/vyos/vpn-dmvpn` with scoped command validation for tunnel/NHRP/IPsec-profile operations.
  - Added VPN overview backend router at `/vyos/vpn` (`/capabilities` + `/overview`) to complete docs-index parity signal.
  - Added form-driven pages: `/vpn`, `/vpn/dmvpn`, `/vpn/openconnect`, `/vpn/pptp`, `/vpn/sstp`.
  - Updated VPN sidebar and smoke routes; regenerated parity artifacts with VPN domain now fully implemented.
