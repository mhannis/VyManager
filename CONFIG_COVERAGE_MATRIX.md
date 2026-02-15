# CONFIG_COVERAGE_MATRIX

Generated: `2026-02-14T23:59:20Z`
Source: `https://docs.vyos.io/en/latest/configuration/`

## Status Summary

- Total documentation pages discovered: **129**
- `DETECTED` (backend + frontend signal): **125**
- `BACKEND_ONLY`: **0**
- `FRONTEND_ONLY`: **4**
- `MISSING`: **0**

## Notes

- This matrix is generated via URL/token detection and is intentionally conservative.
- `DETECTED` does not imply full option-level parity; it indicates a likely implementation anchor exists.
- Use this file as the execution backlog for parity slices and update statuses with verified coverage.

## Matrix

| # | Doc Section | CLI Scope (derived) | Backend | Frontend | Status |
|---:|---|---|:---:|:---:|---|
| 1 | [Container](https://docs.vyos.io/en/latest/configuration/container/index.html) | `container` | Y | Y | `DETECTED` |
| 2 | [Bridge Firewall Configuration](https://docs.vyos.io/en/latest/configuration/firewall/bridge.html) | `firewall bridge` | Y | Y | `DETECTED` |
| 3 | [Flowtables Firewall Configuration](https://docs.vyos.io/en/latest/configuration/firewall/flowtables.html) | `firewall flowtables` | Y | Y | `DETECTED` |
| 4 | [Global Options Firewall Configuration](https://docs.vyos.io/en/latest/configuration/firewall/global-options.html) | `firewall global options` | Y | Y | `DETECTED` |
| 5 | [Firewall groups](https://docs.vyos.io/en/latest/configuration/firewall/groups.html) | `firewall groups` | Y | Y | `DETECTED` |
| 6 | [Firewall](https://docs.vyos.io/en/latest/configuration/firewall/index.html) | `firewall` | Y | Y | `DETECTED` |
| 7 | [IPv4 Firewall Configuration](https://docs.vyos.io/en/latest/configuration/firewall/ipv4.html) | `firewall ipv4` | Y | Y | `DETECTED` |
| 8 | [IPv6 Firewall Configuration](https://docs.vyos.io/en/latest/configuration/firewall/ipv6.html) | `firewall ipv6` | Y | Y | `DETECTED` |
| 9 | [Zone Based Firewall](https://docs.vyos.io/en/latest/configuration/firewall/zone.html) | `firewall zone` | Y | Y | `DETECTED` |
| 10 | [High availability](https://docs.vyos.io/en/latest/configuration/highavailability/index.html) | `highavailability` | Y | Y | `DETECTED` |
| 11 | [Configuration Guide](https://docs.vyos.io/en/latest/configuration/index.html) | `configuration` | N | Y | `FRONTEND_ONLY` |
| 12 | [Bond / link aggregation](https://docs.vyos.io/en/latest/configuration/interfaces/bonding.html) | `interfaces bonding` | Y | Y | `DETECTED` |
| 13 | [Bridge](https://docs.vyos.io/en/latest/configuration/interfaces/bridge.html) | `interfaces bridge` | Y | Y | `DETECTED` |
| 14 | [Dummy](https://docs.vyos.io/en/latest/configuration/interfaces/dummy.html) | `interfaces dummy` | Y | Y | `DETECTED` |
| 15 | [Ethernet](https://docs.vyos.io/en/latest/configuration/interfaces/ethernet.html) | `interfaces ethernet` | Y | Y | `DETECTED` |
| 16 | [GENEVE](https://docs.vyos.io/en/latest/configuration/interfaces/geneve.html) | `interfaces geneve` | Y | Y | `DETECTED` |
| 17 | [Interfaces](https://docs.vyos.io/en/latest/configuration/interfaces/index.html) | `interfaces` | Y | Y | `DETECTED` |
| 18 | [L2TPv3](https://docs.vyos.io/en/latest/configuration/interfaces/l2tpv3.html) | `interfaces l2tpv3` | Y | Y | `DETECTED` |
| 19 | [Loopback](https://docs.vyos.io/en/latest/configuration/interfaces/loopback.html) | `interfaces loopback` | Y | Y | `DETECTED` |
| 20 | [MACsec](https://docs.vyos.io/en/latest/configuration/interfaces/macsec.html) | `interfaces macsec` | Y | Y | `DETECTED` |
| 21 | [Site-to-Site](https://docs.vyos.io/en/latest/configuration/interfaces/openvpn-examples.html) | `interfaces openvpn examples` | Y | Y | `DETECTED` |
| 22 | [OpenVPN](https://docs.vyos.io/en/latest/configuration/interfaces/openvpn.html) | `interfaces openvpn` | Y | Y | `DETECTED` |
| 23 | [PPPoE](https://docs.vyos.io/en/latest/configuration/interfaces/pppoe.html) | `interfaces pppoe` | Y | Y | `DETECTED` |
| 24 | [MACVLAN - Pseudo Ethernet](https://docs.vyos.io/en/latest/configuration/interfaces/pseudo-ethernet.html) | `interfaces pseudo ethernet` | Y | Y | `DETECTED` |
| 25 | [SSTP Client](https://docs.vyos.io/en/latest/configuration/interfaces/sstp-client.html) | `interfaces sstp client` | Y | Y | `DETECTED` |
| 26 | [Tunnel](https://docs.vyos.io/en/latest/configuration/interfaces/tunnel.html) | `interfaces tunnel` | Y | Y | `DETECTED` |
| 27 | [Virtual Ethernet](https://docs.vyos.io/en/latest/configuration/interfaces/virtual-ethernet.html) | `interfaces virtual ethernet` | Y | Y | `DETECTED` |
| 28 | [VTI - Virtual Tunnel Interface](https://docs.vyos.io/en/latest/configuration/interfaces/vti.html) | `interfaces vti` | Y | Y | `DETECTED` |
| 29 | [VXLAN](https://docs.vyos.io/en/latest/configuration/interfaces/vxlan.html) | `interfaces vxlan` | Y | Y | `DETECTED` |
| 30 | [WireGuard](https://docs.vyos.io/en/latest/configuration/interfaces/wireguard.html) | `interfaces wireguard` | Y | Y | `DETECTED` |
| 31 | [WLAN/WIFI - Wireless LAN](https://docs.vyos.io/en/latest/configuration/interfaces/wireless.html) | `interfaces wireless` | Y | Y | `DETECTED` |
| 32 | [WWAN - Wireless Wide-Area-Network](https://docs.vyos.io/en/latest/configuration/interfaces/wwan.html) | `interfaces wwan` | Y | Y | `DETECTED` |
| 33 | [Haproxy](https://docs.vyos.io/en/latest/configuration/loadbalancing/haproxy.html) | `loadbalancing haproxy` | Y | Y | `DETECTED` |
| 34 | [Load-balancing](https://docs.vyos.io/en/latest/configuration/loadbalancing/index.html) | `loadbalancing` | Y | Y | `DETECTED` |
| 35 | [WAN load balancing](https://docs.vyos.io/en/latest/configuration/loadbalancing/wan.html) | `loadbalancing wan` | Y | Y | `DETECTED` |
| 36 | [CGNAT](https://docs.vyos.io/en/latest/configuration/nat/cgnat.html) | `nat cgnat` | Y | Y | `DETECTED` |
| 37 | [NAT](https://docs.vyos.io/en/latest/configuration/nat/index.html) | `nat` | Y | Y | `DETECTED` |
| 38 | [NAT44](https://docs.vyos.io/en/latest/configuration/nat/nat44.html) | `nat nat44` | Y | Y | `DETECTED` |
| 39 | [NAT64](https://docs.vyos.io/en/latest/configuration/nat/nat64.html) | `nat nat64` | Y | Y | `DETECTED` |
| 40 | [NAT66(NPTv6)](https://docs.vyos.io/en/latest/configuration/nat/nat66.html) | `nat nat66` | Y | Y | `DETECTED` |
| 41 | [PKI](https://docs.vyos.io/en/latest/configuration/pki/index.html) | `pki` | Y | Y | `DETECTED` |
| 42 | [Access List Policy](https://docs.vyos.io/en/latest/configuration/policy/access-list.html) | `policy access list` | Y | Y | `DETECTED` |
| 43 | [BGP - AS Path Policy](https://docs.vyos.io/en/latest/configuration/policy/as-path-list.html) | `policy as path list` | Y | Y | `DETECTED` |
| 44 | [BGP - Community List](https://docs.vyos.io/en/latest/configuration/policy/community-list.html) | `policy community list` | Y | Y | `DETECTED` |
| 45 | [BGP Example](https://docs.vyos.io/en/latest/configuration/policy/examples.html) | `policy examples` | N | Y | `FRONTEND_ONLY` |
| 46 | [BGP - Extended Community List](https://docs.vyos.io/en/latest/configuration/policy/extcommunity-list.html) | `policy extcommunity list` | Y | Y | `DETECTED` |
| 47 | [Policy](https://docs.vyos.io/en/latest/configuration/policy/index.html) | `policy` | N | Y | `FRONTEND_ONLY` |
| 48 | [BGP - Large Community List](https://docs.vyos.io/en/latest/configuration/policy/large-community-list.html) | `policy large community list` | Y | Y | `DETECTED` |
| 49 | [Local Route Policy](https://docs.vyos.io/en/latest/configuration/policy/local-route.html) | `policy local route` | Y | Y | `DETECTED` |
| 50 | [Prefix List Policy](https://docs.vyos.io/en/latest/configuration/policy/prefix-list.html) | `policy prefix list` | Y | Y | `DETECTED` |
| 51 | [Route Map Policy](https://docs.vyos.io/en/latest/configuration/policy/route-map.html) | `policy route map` | Y | Y | `DETECTED` |
| 52 | [Route and Route6 Policy](https://docs.vyos.io/en/latest/configuration/policy/route.html) | `policy route` | Y | Y | `DETECTED` |
| 53 | [ARP](https://docs.vyos.io/en/latest/configuration/protocols/arp.html) | `protocols arp` | Y | Y | `DETECTED` |
| 54 | [Babel](https://docs.vyos.io/en/latest/configuration/protocols/babel.html) | `protocols babel` | Y | Y | `DETECTED` |
| 55 | [BFD](https://docs.vyos.io/en/latest/configuration/protocols/bfd.html) | `protocols bfd` | Y | Y | `DETECTED` |
| 56 | [BGP](https://docs.vyos.io/en/latest/configuration/protocols/bgp.html) | `protocols bgp` | Y | Y | `DETECTED` |
| 57 | [Failover](https://docs.vyos.io/en/latest/configuration/protocols/failover.html) | `protocols failover` | Y | Y | `DETECTED` |
| 58 | [IGMP Proxy](https://docs.vyos.io/en/latest/configuration/protocols/igmp-proxy.html) | `protocols igmp proxy` | Y | Y | `DETECTED` |
| 59 | [Protocols](https://docs.vyos.io/en/latest/configuration/protocols/index.html) | `protocols` | Y | Y | `DETECTED` |
| 60 | [IS-IS](https://docs.vyos.io/en/latest/configuration/protocols/isis.html) | `protocols isis` | Y | Y | `DETECTED` |
| 61 | [MPLS](https://docs.vyos.io/en/latest/configuration/protocols/mpls.html) | `protocols mpls` | Y | Y | `DETECTED` |
| 62 | [Multicast](https://docs.vyos.io/en/latest/configuration/protocols/multicast.html) | `protocols multicast` | Y | Y | `DETECTED` |
| 63 | [OpenFabric](https://docs.vyos.io/en/latest/configuration/protocols/openfabric.html) | `protocols openfabric` | Y | Y | `DETECTED` |
| 64 | [OSPF](https://docs.vyos.io/en/latest/configuration/protocols/ospf.html) | `protocols ospf` | Y | Y | `DETECTED` |
| 65 | [PIM – Protocol Independent Multicast](https://docs.vyos.io/en/latest/configuration/protocols/pim.html) | `protocols pim` | Y | Y | `DETECTED` |
| 66 | [PIM6 - Protocol Independent Multicast for IPv6](https://docs.vyos.io/en/latest/configuration/protocols/pim6.html) | `protocols pim6` | Y | Y | `DETECTED` |
| 67 | [RIP](https://docs.vyos.io/en/latest/configuration/protocols/rip.html) | `protocols rip` | Y | Y | `DETECTED` |
| 68 | [RPKI](https://docs.vyos.io/en/latest/configuration/protocols/rpki.html) | `protocols rpki` | Y | Y | `DETECTED` |
| 69 | [Segment Routing](https://docs.vyos.io/en/latest/configuration/protocols/segment-routing.html) | `protocols segment routing` | Y | Y | `DETECTED` |
| 70 | [Static](https://docs.vyos.io/en/latest/configuration/protocols/static.html) | `protocols static` | Y | Y | `DETECTED` |
| 71 | [UDP Broadcast Relay](https://docs.vyos.io/en/latest/configuration/service/broadcast-relay.html) | `service broadcast relay` | Y | Y | `DETECTED` |
| 72 | [Config Sync](https://docs.vyos.io/en/latest/configuration/service/config-sync.html) | `service config sync` | Y | Y | `DETECTED` |
| 73 | [Conntrack Sync](https://docs.vyos.io/en/latest/configuration/service/conntrack-sync.html) | `service conntrack sync` | Y | Y | `DETECTED` |
| 74 | [Console Server](https://docs.vyos.io/en/latest/configuration/service/console-server.html) | `service console server` | Y | Y | `DETECTED` |
| 75 | [DHCP Relay](https://docs.vyos.io/en/latest/configuration/service/dhcp-relay.html) | `service dhcp relay` | Y | Y | `DETECTED` |
| 76 | [DHCP Server](https://docs.vyos.io/en/latest/configuration/service/dhcp-server.html) | `service dhcp server` | Y | Y | `DETECTED` |
| 77 | [DNS Forwarding](https://docs.vyos.io/en/latest/configuration/service/dns.html) | `service dns` | Y | Y | `DETECTED` |
| 78 | [Event Handler](https://docs.vyos.io/en/latest/configuration/service/eventhandler.html) | `service eventhandler` | Y | Y | `DETECTED` |
| 79 | [HTTP API](https://docs.vyos.io/en/latest/configuration/service/https.html) | `service https` | Y | Y | `DETECTED` |
| 80 | [Service](https://docs.vyos.io/en/latest/configuration/service/index.html) | `service` | N | Y | `FRONTEND_ONLY` |
| 81 | [IPoE Server](https://docs.vyos.io/en/latest/configuration/service/ipoe-server.html) | `service ipoe server` | Y | Y | `DETECTED` |
| 82 | [LLDP](https://docs.vyos.io/en/latest/configuration/service/lldp.html) | `service lldp` | Y | Y | `DETECTED` |
| 83 | [mDNS Repeater](https://docs.vyos.io/en/latest/configuration/service/mdns.html) | `service mdns` | Y | Y | `DETECTED` |
| 84 | [Monitoring](https://docs.vyos.io/en/latest/configuration/service/monitoring.html) | `service monitoring` | Y | Y | `DETECTED` |
| 85 | [NTP](https://docs.vyos.io/en/latest/configuration/service/ntp.html) | `service ntp` | Y | Y | `DETECTED` |
| 86 | [PPPoE Server](https://docs.vyos.io/en/latest/configuration/service/pppoe-server.html) | `service pppoe server` | Y | Y | `DETECTED` |
| 87 | [Router Advertisements](https://docs.vyos.io/en/latest/configuration/service/router-advert.html) | `service router advert` | Y | Y | `DETECTED` |
| 88 | [Salt-Minion](https://docs.vyos.io/en/latest/configuration/service/salt-minion.html) | `service salt minion` | Y | Y | `DETECTED` |
| 89 | [SNMP](https://docs.vyos.io/en/latest/configuration/service/snmp.html) | `service snmp` | Y | Y | `DETECTED` |
| 90 | [SSH](https://docs.vyos.io/en/latest/configuration/service/ssh.html) | `service ssh` | Y | Y | `DETECTED` |
| 91 | [suricata](https://docs.vyos.io/en/latest/configuration/service/suricata.html) | `service suricata` | Y | Y | `DETECTED` |
| 92 | [TFTP Server](https://docs.vyos.io/en/latest/configuration/service/tftp-server.html) | `service tftp server` | Y | Y | `DETECTED` |
| 93 | [Webproxy](https://docs.vyos.io/en/latest/configuration/service/webproxy.html) | `service webproxy` | Y | Y | `DETECTED` |
| 94 | [Acceleration](https://docs.vyos.io/en/latest/configuration/system/acceleration.html) | `system acceleration` | Y | Y | `DETECTED` |
| 95 | [Conntrack](https://docs.vyos.io/en/latest/configuration/system/conntrack.html) | `system conntrack` | Y | Y | `DETECTED` |
| 96 | [Serial Console](https://docs.vyos.io/en/latest/configuration/system/console.html) | `system console` | Y | Y | `DETECTED` |
| 97 | [Default Gateway/Route](https://docs.vyos.io/en/latest/configuration/system/default-route.html) | `system default route` | Y | Y | `DETECTED` |
| 98 | [Flow Accounting](https://docs.vyos.io/en/latest/configuration/system/flow-accounting.html) | `system flow accounting` | Y | Y | `DETECTED` |
| 99 | [FRR](https://docs.vyos.io/en/latest/configuration/system/frr.html) | `system frr` | Y | Y | `DETECTED` |
| 100 | [Host Information](https://docs.vyos.io/en/latest/configuration/system/host-name.html) | `system host name` | Y | Y | `DETECTED` |
| 101 | [System](https://docs.vyos.io/en/latest/configuration/system/index.html) | `system` | Y | Y | `DETECTED` |
| 102 | [IP](https://docs.vyos.io/en/latest/configuration/system/ip.html) | `system ip` | Y | Y | `DETECTED` |
| 103 | [IPv6](https://docs.vyos.io/en/latest/configuration/system/ipv6.html) | `system ipv6` | Y | Y | `DETECTED` |
| 104 | [System Display (LCD)](https://docs.vyos.io/en/latest/configuration/system/lcd.html) | `system lcd` | Y | Y | `DETECTED` |
| 105 | [Login/user management](https://docs.vyos.io/en/latest/configuration/system/login.html) | `system login` | Y | Y | `DETECTED` |
| 106 | [System DNS](https://docs.vyos.io/en/latest/configuration/system/name-server.html) | `system name server` | Y | Y | `DETECTED` |
| 107 | [Option](https://docs.vyos.io/en/latest/configuration/system/option.html) | `system option` | Y | Y | `DETECTED` |
| 108 | [System Proxy](https://docs.vyos.io/en/latest/configuration/system/proxy.html) | `system proxy` | Y | Y | `DETECTED` |
| 109 | [sFlow](https://docs.vyos.io/en/latest/configuration/system/sflow.html) | `system sflow` | Y | Y | `DETECTED` |
| 110 | [Sysctl](https://docs.vyos.io/en/latest/configuration/system/sysctl.html) | `system sysctl` | Y | Y | `DETECTED` |
| 111 | [Syslog](https://docs.vyos.io/en/latest/configuration/system/syslog.html) | `system syslog` | Y | Y | `DETECTED` |
| 112 | [Task Scheduler](https://docs.vyos.io/en/latest/configuration/system/task-scheduler.html) | `system task scheduler` | Y | Y | `DETECTED` |
| 113 | [Time Zone](https://docs.vyos.io/en/latest/configuration/system/time-zone.html) | `system time zone` | Y | Y | `DETECTED` |
| 114 | [Updates](https://docs.vyos.io/en/latest/configuration/system/updates.html) | `system updates` | Y | Y | `DETECTED` |
| 115 | [Watchdog](https://docs.vyos.io/en/latest/configuration/system/watchdog.html) | `system watchdog` | Y | Y | `DETECTED` |
| 116 | [Traffic Policy](https://docs.vyos.io/en/latest/configuration/trafficpolicy/index.html) | `trafficpolicy` | Y | Y | `DETECTED` |
| 117 | [DMVPN](https://docs.vyos.io/en/latest/configuration/vpn/dmvpn.html) | `vpn dmvpn` | Y | Y | `DETECTED` |
| 118 | [VPN](https://docs.vyos.io/en/latest/configuration/vpn/index.html) | `vpn` | Y | Y | `DETECTED` |
| 119 | [IPsec](https://docs.vyos.io/en/latest/configuration/vpn/ipsec/index.html) | `vpn ipsec` | Y | Y | `DETECTED` |
| 120 | [IPsec General Information](https://docs.vyos.io/en/latest/configuration/vpn/ipsec/ipsec_general.html) | `vpn ipsec ipsec_general` | Y | Y | `DETECTED` |
| 121 | [IPSec IKEv2 Remote Access VPN](https://docs.vyos.io/en/latest/configuration/vpn/ipsec/remoteaccess_ipsec.html) | `vpn ipsec remoteaccess_ipsec` | Y | Y | `DETECTED` |
| 122 | [IPsec Site-to-Site VPN](https://docs.vyos.io/en/latest/configuration/vpn/ipsec/site2site_ipsec.html) | `vpn ipsec site2site_ipsec` | Y | Y | `DETECTED` |
| 123 | [Troubleshooting Site-to-Site VPN IPsec](https://docs.vyos.io/en/latest/configuration/vpn/ipsec/troubleshooting_ipsec.html) | `vpn ipsec troubleshooting_ipsec` | Y | Y | `DETECTED` |
| 124 | [L2TP](https://docs.vyos.io/en/latest/configuration/vpn/l2tp.html) | `vpn l2tp` | Y | Y | `DETECTED` |
| 125 | [OpenConnect](https://docs.vyos.io/en/latest/configuration/vpn/openconnect.html) | `vpn openconnect` | Y | Y | `DETECTED` |
| 126 | [PPTP-Server](https://docs.vyos.io/en/latest/configuration/vpn/pptp.html) | `vpn pptp` | Y | Y | `DETECTED` |
| 127 | [RSA-Keys](https://docs.vyos.io/en/latest/configuration/vpn/rsa-keys.html) | `vpn rsa keys` | Y | Y | `DETECTED` |
| 128 | [SSTP Server](https://docs.vyos.io/en/latest/configuration/vpn/sstp.html) | `vpn sstp` | Y | Y | `DETECTED` |
| 129 | [VRF](https://docs.vyos.io/en/latest/configuration/vrf/index.html) | `vrf` | Y | Y | `DETECTED` |
