import type { PageGuide } from "@/components/common/PageGuideDialog";

export const pageGuides: Record<
  | "networkInterfaces"
  | "bondingInterfaces"
  | "bridgeInterfaces"
  | "geneveInterfaces"
  | "l2tpv3Interfaces"
  | "loopbackInterfaces"
  | "macsecInterfaces"
  | "openvpnInterfaces"
  | "pppoeInterfaces"
  | "pseudoEthernetInterfaces"
  | "sstpClientInterfaces"
  | "virtualEthernetInterfaces"
  | "tunnelInterfaces"
  | "vtiInterfaces"
  | "vxlanInterfaces"
  | "wirelessInterfaces"
  | "wwanInterfaces"
  | "dhcpServer"
  | "firewallZones"
  | "firewallPolicies"
  | "firewallGroups"
  | "firewallGlobalOptions"
  | "firewallBridge"
  | "firewallFlowtables"
  | "systemFlowAccounting"
  | "systemConntrack"
  | "systemSerialConsole"
  | "systemDefaultRoute"
  | "systemFrr"
  | "systemIp"
  | "systemIpv6"
  | "systemLcd"
  | "systemSflow"
  | "systemTaskScheduler"
  | "systemProxy"
  | "systemSysctl"
  | "containers"
  | "ipsec",
  PageGuide
> = {
  networkInterfaces: {
    title: "Network Interfaces How-To",
    summary:
      "Use this page to build interface topology first (descriptions, addressing, VLANs) so downstream services can be configured safely.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/index.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set interface descriptions first so every selector across the UI is easier to read.",
          "Configure WAN and LAN addressing next (DHCP/static) and verify link status.",
          "Create VLANs after parent interfaces are stable.",
          "Assign interfaces to VRFs only after base connectivity is confirmed.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm interface link state and IP assignment from the Interface Overview and Interface Statistics dashboard cards.",
          "Verify that interfaces appear correctly in downstream selectors (DHCP, firewall, routing, VPN).",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If an interface is missing from selectors, confirm it exists and has not been removed/renamed.",
          "Unknown speed/duplex typically indicates link-down or unsupported NIC reporting.",
        ],
      },
    ],
  },
  bondingInterfaces: {
    title: "Bonding Interfaces How-To",
    summary:
      "Use bonding interfaces to combine multiple links for redundancy or throughput before assigning them to firewall/routing workloads.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/bonding.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Apply clear descriptions to member ethernet interfaces first.",
          "Create the bond, select member interfaces, and choose the bonding mode.",
          "For LACP (`802.3ad`), set hash policy and LACP timing to match your switch configuration.",
          "Assign IP/VRF on the bond interface (not on member interfaces).",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm the bond stays up after a link flap on one member.",
          "Verify downstream services (DHCP, firewall zones, routing) reference the bond interface, not individual members.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If LACP does not come up, verify the same mode/hash behavior on both VyOS and switch-side port-channel.",
          "Unexpected traffic imbalance usually points to hash policy mismatch with the peer device.",
        ],
      },
    ],
  },
  bridgeInterfaces: {
    title: "Bridge Interfaces How-To",
    summary:
      "Use bridge interfaces to place multiple ports into a shared L2 domain, then tune STP and VLAN behavior as needed.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/bridge.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create the bridge interface and add member ports first.",
          "Assign gateway IP addresses on the bridge itself (not individual member ports).",
          "Enable STP and tune timers/priority before connecting to larger switched domains.",
          "Enable VLAN filtering/protocol only when your bridge design requires tagged segmentation.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm bridge members and interface status after save.",
          "Verify clients on different member ports can pass expected traffic and receive services from the bridge IP.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "L2 loops are usually STP misconfiguration; verify priority and timer settings when convergence is unstable.",
          "If VLAN traffic is missing, verify protocol and filtering settings align with the upstream switch trunk/access mode.",
        ],
      },
    ],
  },
  geneveInterfaces: {
    title: "Geneve Interfaces How-To",
    summary:
      "Build Geneve overlay tunnels by defining remote/source endpoints and VNI, then apply addressing and MSS tuning as needed.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/geneve.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create the Geneve interface and set remote endpoint plus VNI first.",
          "Define source selection via source-address or source-interface based on your routing design.",
          "Apply tunnel interface addressing and MTU after underlay connectivity is confirmed.",
          "Use MSS adjustment only when needed to prevent fragmentation across constrained paths.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Verify interface presence and addressing from the Geneve page and interface dashboards.",
          "Confirm traffic across the overlay with expected path MTU and no repeated packet drops.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If the tunnel does not pass traffic, verify remote endpoint reachability and source path selection first.",
          "For intermittent drops, lower MTU or enable clamp-to-PMTU MSS mode and retest.",
        ],
      },
    ],
  },
  l2tpv3Interfaces: {
    title: "L2TPv3 Interfaces How-To",
    summary:
      "Use L2TPv3 interfaces for Layer-2 pseudowires across routed underlays with explicit session and tunnel identifiers.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/l2tpv3.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create the interface and set remote/source addressing first.",
          "Set local/peer session IDs and tunnel IDs to match the remote endpoint.",
          "Apply encapsulation/port/cookie settings only when required by your peer implementation.",
          "Assign interface addressing and policy/firewall references after base pseudowire state is stable.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm both peers use matching session/tunnel parameters and reachability exists between underlay endpoints.",
          "Verify traffic passes across the pseudowire and expected MAC/IP learning behavior is present.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Session bring-up failures are usually ID/cookie mismatches or source/remote addressing errors.",
          "If traffic is blackholed, verify encapsulation mode and UDP port agreement on both sides.",
        ],
      },
    ],
  },
  loopbackInterfaces: {
    title: "Loopback Interfaces How-To",
    summary:
      "Use loopback interfaces for stable router/service addresses and protocol IDs that should not depend on physical link state.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/loopback.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create or edit loopback interfaces with descriptive names and descriptions first.",
          "Assign host-style addresses (`/32` IPv4 or `/128` IPv6) for router IDs and control-plane services.",
          "Reference loopback addresses from routing protocol, VPN, and management workflows as needed.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm loopback entries and addresses are present after save and refresh.",
          "Verify dependent services (routing IDs, management endpoints) resolve to loopback addresses as intended.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Address overlap with other interfaces can cause route ambiguity; keep loopback subnets unique.",
          "If dependent features fail, verify they reference the correct loopback interface/address.",
        ],
      },
    ],
  },
  macsecInterfaces: {
    title: "MACsec Interfaces How-To",
    summary:
      "Use MACsec interfaces to encrypt L2 links by binding to a source interface and configuring MKA or static peer security.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/macsec.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create the MACsec interface and bind it to the correct source interface first.",
          "Select cipher and encryption mode, then configure either MKA credentials or static peer keys.",
          "Add interface addressing after security settings are in place and both endpoints agree on policy.",
          "Apply optional replay-window and link/flow-control toggles after baseline connectivity is confirmed.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Verify both peers use matching cipher/key material and that encrypted traffic flows on the expected interface.",
          "Confirm address assignment, VRF placement, and policy references after save/reload.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Handshake failures usually indicate CAK/CKN/static-key mismatch or incorrect source-interface binding.",
          "If traffic drops intermittently, review replay-window and peer state consistency first.",
        ],
      },
    ],
  },
  pppoeInterfaces: {
    title: "PPPoE Interfaces How-To",
    summary:
      "Configure PPPoE uplinks with source-interface, authentication, route behavior, and MSS/IPv6 tuning from a single workflow.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/pppoe.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create PPPoE interface and pick the correct source interface first.",
          "Apply authentication username/password and optional service/access-concentrator constraints.",
          "Configure route behavior (`no-default-route`, distance, peer DNS) before advanced MSS and IPv6 controls.",
          "Enable on-demand mode only when dial behavior and idle timers are explicitly planned.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm PPPoE interface is enabled and has expected peer/session details after apply.",
          "Verify default route and DNS behavior match your selected options.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Authentication failures are usually credential/service-name mismatches with ISP requirements.",
          "If traffic is unstable, tune MTU/MRU and MSS settings and verify firewall/NAT policy on the PPPoE interface.",
        ],
      },
    ],
  },
  openvpnInterfaces: {
    title: "OpenVPN Interfaces How-To",
    summary:
      "Configure OpenVPN under `interfaces openvpn` using mode-appropriate options for site-to-site, client, and server deployments.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/openvpn.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create the OpenVPN interface first, then choose operation mode and protocol.",
          "Set remote/local endpoint values and keepalive settings before adding advanced TLS/encryption options.",
          "For server mode, define subnet/topology and client DNS/routes before onboarding clients.",
          "Only enable optional features (DCO, LZO, raw options) after baseline tunnel stability is confirmed.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save and verify interface state in the OpenVPN interface table and dashboard cards.",
          "Confirm connected peers can reach expected networks based on pushed routes and mode selection.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Handshake failures are commonly caused by CA/certificate/key mismatch or incompatible cipher/hash settings.",
          "If the tunnel comes up but traffic fails, verify push-route/name-server values and route precedence.",
        ],
      },
    ],
  },
  pseudoEthernetInterfaces: {
    title: "Pseudo-Ethernet Interfaces How-To",
    summary:
      "Use pseudo-ethernet (MACVLAN) interfaces to create additional L2/L3 interfaces on top of a parent Ethernet link.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/pseudo-ethernet.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create a pseudo-ethernet interface and bind it to the correct source ethernet interface.",
          "Apply address/MTU/VRF settings after the parent interface is validated.",
          "Use clear descriptions so downstream selectors identify each logical segment quickly.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Verify source-interface binding and address assignment in the pseudo-ethernet list after save.",
          "Confirm routing/firewall references use the pseudo interface where intended.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Traffic issues usually come from incorrect parent interface selection or upstream MAC filtering behavior.",
          "If reachability is asymmetric, confirm policy/NAT/routing rules reference the pseudo interface explicitly.",
        ],
      },
    ],
  },
  sstpClientInterfaces: {
    title: "SSTP Client Interfaces How-To",
    summary:
      "Build SSTP client tunnels under `interfaces sstpc` with explicit server, route, and per-interface IP controls.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/sstp-client.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create the SSTP client interface and set the remote server first.",
          "Set route behavior (`no-default-route`, distance) and DNS preference next.",
          "Apply MSS and source-validation settings when needed for constrained WAN paths.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm the interface is enabled and negotiated with the expected server endpoint.",
          "Verify default-route/DNS behavior matches your selected route and peer DNS toggles.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Connection failures are often server hostname/credential related; verify each value and TLS reachability.",
          "Path MTU issues typically require adjust-MSS tuning or clamp-to-PMTU enablement.",
        ],
      },
    ],
  },
  virtualEthernetInterfaces: {
    title: "Virtual-Ethernet Interfaces How-To",
    summary:
      "Configure `interfaces virtual-ethernet` pairs for namespace/VRF interconnects and virtual transit links.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/virtual-ethernet.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create each veth endpoint with a unique peer-name to form a valid pair.",
          "Apply addressing and optional VRF assignment after the pair is defined.",
          "Use descriptions to document each pair's role (transit, namespace handoff, service link).",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm both sides of each veth pair are present and enabled in the interface list.",
          "Verify routing/policy behavior for traffic entering and exiting each paired endpoint.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Peer mismatches (`vethA -> vethB` without reciprocal mapping) can create confusing partial state.",
          "If reachability fails, verify each endpoint has the expected address/VRF and that firewall policy permits flow.",
        ],
      },
    ],
  },
  tunnelInterfaces: {
    title: "Tunnel Interfaces How-To",
    summary:
      "Configure classic `interfaces tunnel` types (GRE, IPIP, SIT, and related encapsulations) with explicit source/remote endpoints.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/tunnel.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create the tunnel interface, then choose encapsulation type based on your transport and payload requirements.",
          "Set source-address and remote endpoint next, then apply tunnel addresses.",
          "Tune optional GRE key, MSS behavior, and forwarding/source-validation controls only after baseline reachability is confirmed.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Verify source-to-remote underlay connectivity first, then confirm tunnel interface comes up with expected local addresses.",
          "Check routed traffic over the tunnel for both directions before attaching additional protocols or policies.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Common failures are blocked encapsulation protocol traffic or incorrect source/remote addressing.",
          "If the tunnel is up but traffic is unstable, adjust MTU/MSS and confirm firewall/NAT rules do not alter tunnel payload unexpectedly.",
        ],
      },
    ],
  },
  vtiInterfaces: {
    title: "VTI Interfaces How-To",
    summary:
      "Configure `interfaces vti` for route-based IPsec workflows where routing and policy are applied directly on tunnel interfaces.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/vti.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create VTI interfaces and assign IP addresses first, then map them to IPsec site-to-site peers.",
          "Ensure IPsec route-autoinstall behavior is aligned with VTI guidance before enabling full routing policies.",
          "Apply optional MTU/VRF settings after baseline tunnel reachability is confirmed.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm VTI interfaces are up with expected IPv4/IPv6 addresses and references from VPN IPsec pages.",
          "Verify routed traffic traverses VTI interfaces as intended and does not create unintended default-route behavior.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If traffic blackholes, verify IPsec VTI peer selectors/options and route-autoinstall settings first.",
          "When route behavior is unexpected, confirm route priorities and firewall/NAT policy around VTI interfaces.",
        ],
      },
    ],
  },
  vxlanInterfaces: {
    title: "VXLAN Interfaces How-To",
    summary:
      "Configure `interfaces vxlan` for overlay L2 extension using unicast or multicast transport, with optional EVPN-oriented parameters.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/vxlan.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create the VXLAN interface, set VNI, and choose transport mode (unicast `remote` or multicast `group`).",
          "Set source-address/source-interface and optional port overrides to match your underlay and peer devices.",
          "Enable advanced parameters (`external`, `neighbor-suppress`, `vni-filter`, `nolearning`) only when your control plane design requires them.",
          "Use VLAN-to-VNI mappings when deploying SVD/EVPN-style designs tied to bridge consumers.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm VTEP reachability on the underlay, then verify overlay traffic forwarding and MAC learning behavior.",
          "For multicast mode, ensure upstream multicast routing/PIM is active and the group is joined by all intended leaves.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Remote/group misconfiguration and underlay ACL/firewall blocks are the most common causes of VXLAN traffic loss.",
          "If interoperability fails across vendors, verify UDP destination port expectations and encapsulation defaults.",
        ],
      },
    ],
  },
  wirelessInterfaces: {
    title: "Wireless Interfaces How-To",
    summary:
      "Configure WLAN interfaces for station or access-point operation with WPA and radio capability tuning.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/wireless.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set `system wireless country-code` first, especially before enabling access-point mode.",
          "Create interface basics (type, mode, channel, SSID, addressing) before enabling advanced capabilities.",
          "Apply WPA mode/ciphers/passphrase (or RADIUS servers) before onboarding clients.",
          "Enable advanced HT capability flags only after baseline connectivity is stable.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm interface appears in the configured list with the intended SSID/type/mode values.",
          "Check client association and traffic flow after save using the dashboard and interface pages.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Association failures are commonly country-code/channel incompatibility or WPA mismatch issues.",
          "If AP works but traffic fails, verify DHCP/firewall/NAT path for the WLAN subnet.",
        ],
      },
    ],
  },
  wwanInterfaces: {
    title: "WWAN Interfaces How-To",
    summary:
      "Configure cellular modem interfaces with APN, DHCP/static addressing, and per-interface IP behavior.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/interfaces/wwan.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create the WWAN interface and set APN based on your carrier requirements.",
          "Set addressing (typically `dhcp`) and default-route behavior before applying advanced IP tweaks.",
          "Apply MSS/forwarding/source-validation settings only when needed for your uplink design.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Verify WWAN interface is enabled and has a leased/assigned address after save.",
          "Confirm route behavior and upstream reachability with expected DHCP route distance settings.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "No connectivity is often APN mismatch or modem not fully initialized by the platform.",
          "For unstable sessions, tune MSS and verify provider-side DHCP/default-route expectations.",
        ],
      },
    ],
  },
  dhcpServer: {
    title: "DHCP Server How-To",
    summary:
      "Build DHCP shared networks from static LAN interface segments, then manage pools, static mappings, and lease tracking.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/service/dhcp-server.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Ensure the target interface has a static IPv4 address before creating DHCP.",
          "Use LAN segment template prefill to initialize subnet, router, and range values.",
          "Set default DNS to the interface gateway IP, then add additional resolvers as needed.",
          "Add static mappings after dynamic leasing is confirmed.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Connect a client and verify active lease state and gateway/DNS assignment.",
          "Use the DHCP page lease tables to confirm dynamic/static lease behavior after apply.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "No lease usually means range/subnet mismatch or interface not in the intended segment.",
          "If clients get IP but no internet, verify firewall rules and upstream routing/NAT.",
        ],
      },
    ],
  },
  firewallZones: {
    title: "Firewall Zones How-To",
    summary:
      "Use zones as trust boundaries and control traffic with explicit from-zone rulesets.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/firewall/zone.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create WAN/LAN zones and assign interfaces with clear descriptions.",
          "Set default actions conservatively (typically drop) and add explicit allow rulesets.",
          "Map from-zone policies (e.g., LAN -> WAN) before testing traffic.",
          "Use Zone Guided Setup for initial baseline, then maintain manually.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Test each expected direction explicitly (LAN->WAN, WAN->LAN, intra-zone).",
          "Use ruleset counters/log visibility in the GUI to confirm the expected policy is matching.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Traffic drops often come from missing from-zone policy mappings, not interface status.",
          "When uncertain, review ruleset counters/logs to identify the blocking chain.",
        ],
      },
    ],
  },
  firewallPolicies: {
    title: "Firewall Policies How-To",
    summary:
      "Build IPv4/IPv6 rules in base and custom chains with explicit default actions and ordered evaluation.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/firewall/ipv4.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set base chain default actions first, then add allow/deny exceptions.",
          "Create shared firewall groups before building many rules to reduce duplication.",
          "Use custom chains for reusable logic and jump from base chains where needed.",
          "After first pass, reorder rules so most specific matches are evaluated first.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Use the IPv4/IPv6 tabs to validate rule presence, rule order, and default action state.",
          "Generate expected traffic flows and confirm counters/log behavior reflects your intended matches.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Unexpected drops are commonly caused by chain default action or rule ordering rather than syntax.",
          "If traffic is still blocked, confirm zone-policy direction and NAT/routing expectations alongside rules.",
        ],
      },
    ],
  },
  firewallGroups: {
    title: "Firewall Groups How-To",
    summary:
      "Define reusable object groups (addresses, networks, ports, interfaces, domains) for cleaner rule design.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/firewall/groups.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create address/network/port groups first for common sources and destinations.",
          "Use clear names and descriptions so rules remain readable across large policies.",
          "Prefer group reuse instead of duplicating equivalent members across many rules.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Verify member counts and included-group relationships in group cards after save.",
          "Confirm updated groups are immediately selectable in firewall rule create/edit dialogs.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If a group is missing in rule selectors, refresh the groups page and verify group type compatibility.",
          "Check for overlap conflicts between included groups and direct members when troubleshooting matches.",
        ],
      },
    ],
  },
  firewallGlobalOptions: {
    title: "Firewall Global Options How-To",
    summary:
      "Tune platform-wide firewall behavior such as redirects, source validation, state policy, and timeout controls.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/firewall/global-options.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Apply baseline hardening first (source validation, martian logging, redirect handling).",
          "Set state policy actions/logging for established, related, and invalid traffic.",
          "Adjust timeout and bridged-traffic options only after baseline behavior is stable.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save changes and confirm values persist after a refresh of the page.",
          "Monitor firewall behavior and logging patterns to verify state-policy impact.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If sessions drop unexpectedly, revisit timeout values and state-policy actions.",
          "When migrating from previous configs, compare each non-default setting before enabling broadly.",
        ],
      },
    ],
  },
  firewallBridge: {
    title: "Bridge Firewall How-To",
    summary:
      "Control traffic on bridged domains using base/custom chains with optional hardware offload policies.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/firewall/bridge.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Define base chain defaults before adding rule exceptions.",
          "Create custom chains for repeated bridge-policy logic.",
          "Use drag-and-drop reordering after initial rule creation to optimize evaluation order.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm rule order, default action, and chain assignment from the page list views.",
          "Run representative bridged traffic tests and verify expected pass/block outcomes.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If traffic behavior is inconsistent, verify active bridge membership and selected chain direction.",
          "Review custom-chain jump logic when rules appear to be skipped unexpectedly.",
        ],
      },
    ],
  },
  firewallFlowtables: {
    title: "Firewall Flowtables How-To",
    summary:
      "Use flowtables to offload eligible established traffic for higher throughput and lower CPU load.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/firewall/flowtables.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create one flowtable with the intended interfaces first, then expand as needed.",
          "Choose software vs hardware offload based on platform capability and stability goals.",
          "Add descriptive names so policies referencing flowtables are easy to audit later.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Verify configured interfaces and offload mode are shown correctly in the table after save.",
          "Confirm expected traffic paths are stable after enabling flowtable acceleration.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If performance does not improve, validate that the chosen interfaces and traffic classes are eligible.",
          "Use conservative rollout when enabling hardware offload on new platforms.",
        ],
      },
    ],
  },
  systemFlowAccounting: {
    title: "Flow Accounting How-To",
    summary:
      "Export flow telemetry to NetFlow and sFlow collectors for traffic visibility, capacity planning, and troubleshooting.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/flow-accounting.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Select one or more interfaces to export first.",
          "Set NetFlow version/source/engine fields and add collector addresses.",
          "Configure sFlow agent/sampling and collector list if your tooling uses sFlow.",
          "Tune buffer and timeout values only after baseline export is confirmed.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save changes and refresh the page to confirm settings persist.",
          "Verify collector dashboards are receiving flows from expected interfaces and source address.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "No telemetry is usually interface-selection or collector reachability related.",
          "If export is inconsistent, verify sampling/timeout settings and collector port expectations.",
        ],
      },
    ],
  },
  systemConntrack: {
    title: "System Conntrack How-To",
    summary:
      "Tune connection tracking table size, TCP behavior, and helper modules for your traffic profile.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/conntrack.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set global table sizing first (`table-size`, `expect-table-size`, `hash-size`).",
          "Adjust TCP behavior (`half-open-connections`, `loose`, `max-retrans`) based on workload.",
          "Enable only required helper modules to reduce unnecessary protocol parsing.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save changes and refresh to confirm values persist.",
          "Monitor connection stability and expected session capacity after tuning.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Too-small tables can cause dropped sessions under load.",
          "If specific application flows break, review helper module requirements and TCP loose mode.",
        ],
      },
    ],
  },
  systemSerialConsole: {
    title: "System Serial Console How-To",
    summary:
      "Configure serial console devices and line speed under `system console` for platform access and recovery.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/console.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Add the serial device first (for example `ttyS0`).",
          "Set speed to match host BIOS, hypervisor, or terminal server expectations.",
          "Validate one device at a time before adding additional console devices.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save and refresh to verify devices and speeds persist.",
          "Confirm you can connect over serial at the configured bitrate.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Mismatched baud rate causes unreadable output.",
          "If serial access fails, verify the device path exists on the platform.",
        ],
      },
    ],
  },
  systemDefaultRoute: {
    title: "System Default Route How-To",
    summary:
      "Manage IPv4 default route next-hops (`0.0.0.0/0`) with distance and disable controls.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/static.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Add primary next-hop first.",
          "Add backup next-hop(s) with higher distance for failover behavior.",
          "Disable next-hops only for temporary operational testing or maintenance windows.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save and refresh to verify next-hop list persists.",
          "Confirm route preference behavior using operational routing status.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Route installation issues are commonly caused by unreachable gateway addresses.",
          "Unexpected failover behavior usually indicates distance values are equal or inverted.",
        ],
      },
    ],
  },
  systemFrr: {
    title: "System FRR How-To",
    summary:
      "Tune FRR process profile, descriptor limits, and optional daemon integrations under `system frr`.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/frr.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Pick the FRR profile (`traditional` or `datacenter`) first.",
          "Set descriptors only when your route scale requires higher limits.",
          "Enable BMP/IRDP and SNMP daemon hooks only when your design needs those integrations.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save and refresh to confirm profile and daemon settings persist.",
          "Verify protocol processes remain healthy after descriptor/profile changes.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Unexpected protocol behavior after profile changes should be tested by rolling back to the previous profile.",
          "If integrations fail, verify daemon names and dependent service availability.",
        ],
      },
    ],
  },
  systemIp: {
    title: "System IP How-To",
    summary:
      "Manage IPv4 forwarding behavior, import-table controls, and protocol route-map hooks from a form-first workflow.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/ip.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set global IPv4 behavior flags first (forwarding, directed-broadcast, multipath, NHT).",
          "Configure ARP table size if scale tuning is required.",
          "Add import-table entries and protocol route-map hooks last.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save and refresh to confirm all IPv4 system controls persist.",
          "Validate route-map effects using routing/policy status views in the GUI.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Incorrect table IDs or route-map names are common causes of import-policy mismatches.",
          "Only enable forwarding-disable in designs that intentionally suppress transit behavior.",
        ],
      },
    ],
  },
  systemIpv6: {
    title: "System IPv6 How-To",
    summary:
      "Manage IPv6 forwarding behavior, neighbor table sizing, and protocol route-map hooks under `system ipv6`.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/ipv6.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set global IPv6 behavior flags first (forwarding, strict DAD, multipath, NHT).",
          "Tune neighbor table size based on host scale expectations.",
          "Apply protocol route-map hooks after base forwarding behavior is validated.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save and refresh to confirm IPv6 controls persist.",
          "Verify expected IPv6 routing behavior through existing routing/neighbor pages.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Neighbor issues are often table-size or duplicate-address related; review strict DAD behavior carefully.",
          "Protocol route-map mismatches are commonly due to wrong protocol token or route-map name.",
        ],
      },
    ],
  },
  systemLcd: {
    title: "System LCD How-To",
    summary:
      "Configure LCD model and device mapping for supported hardware platforms.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/lcd.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set the LCD model first, then the device path exposed by your platform.",
          "Apply only on systems that physically support LCD integration.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save and refresh to confirm model/device persist.",
          "Confirm on-device LCD behavior matches expectations after apply.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If no LCD output appears, verify the hardware model and device path are correct.",
          "LCD support can vary by platform build; test on target hardware.",
        ],
      },
    ],
  },
  systemSflow: {
    title: "System sFlow How-To",
    summary:
      "Configure sFlow exporter identity, sampling behavior, monitored interfaces, and collector servers.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/sflow.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set agent address/interface and baseline polling/sampling values first.",
          "Select monitored interfaces, then add collector servers with ports.",
          "Enable egress export only when your analysis tooling expects it.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save and refresh to confirm collector and interface lists persist.",
          "Verify collector receives flow samples from expected interfaces.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "No telemetry usually means collector reachability, server port, or interface selection mismatch.",
          "Sampling rates that are too high can impact control-plane overhead on smaller platforms.",
        ],
      },
    ],
  },
  systemTaskScheduler: {
    title: "Task Scheduler How-To",
    summary:
      "Create recurring automation tasks using interval or crontab scheduling under `system task-scheduler`.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/task-scheduler.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Define task name and executable path first.",
          "Choose either interval-based scheduling or a crontab spec.",
          "Add arguments only when your script requires them.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save and refresh to confirm tasks persist with expected schedule.",
          "Verify task side effects/logs to ensure the executable path and arguments are correct.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Failed tasks often come from wrong script path, permissions, or malformed schedule values.",
          "Use explicit absolute paths for scripts and binaries.",
        ],
      },
    ],
  },
  systemProxy: {
    title: "System Proxy How-To",
    summary:
      "Configure outbound proxy settings for system-originated workflows that honor global proxy configuration.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/proxy.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set proxy URL and port first.",
          "Add proxy authentication only when required by upstream proxy policy.",
          "Populate no-proxy targets for local domains and internal services.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save and refresh to confirm all values persist.",
          "Test an outbound service that uses system proxy settings to confirm expected behavior.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Authentication or URL mistakes are the most common cause of failed outbound proxy usage.",
          "If internal destinations fail, add them to no-proxy targets.",
        ],
      },
    ],
  },
  systemSysctl: {
    title: "System Sysctl How-To",
    summary:
      "Manage persistent kernel tuning under `system sysctl parameter` without using direct CLI edits.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/system/sysctl.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Add only required keys and keep a clear record of why each value is set.",
          "Apply one change at a time for high-impact networking kernel parameters.",
          "Pair kernel tuning updates with validation of affected data paths and services.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Save, refresh, and verify key-value pairs remain present.",
          "Confirm dependent behavior (routing, forwarding, conntrack scale) matches your intended result.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Invalid or conflicting parameter values can destabilize traffic handling; revert recent changes when in doubt.",
          "Use conservative increments for scale/timing values and retest after each adjustment.",
        ],
      },
    ],
  },
  containers: {
    title: "Container Management How-To",
    summary:
      "Perform one-time automation bootstrap, then deploy and control containers with LAN-oriented exposure.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/container/index.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Complete automation bootstrap first (SSH enabled + automation key installed).",
          "Choose LAN host/link target before exposing web services.",
          "Populate a template, adjust image/env/ports/volumes, then install.",
          "Use start/stop/restart controls and open links from selected LAN host context.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Verify exposed service URL opens from intended interface/host path.",
          "Confirm installed containers show expected status and logs from the management panel.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If container fails to start, confirm image exists locally and source paths/volumes are valid.",
          "If web UI opens on wrong network, adjust host/link selection and port exposure model.",
        ],
      },
    ],
  },
  ipsec: {
    title: "IPsec How-To",
    summary:
      "Configure site-to-site tunnels using Phase 1/Phase 2 workflow, crypto groups, and integrated log diagnostics.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/vpn/ipsec.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create IKE and ESP groups first so peers can reference standard proposals.",
          "Create Phase 1 peer (remote/local/auth settings), then add Phase 2 tunnels.",
          "Use the Site-to-Site Wizard for baseline tunnel plus required supporting settings.",
          "Tune global settings and inspect logs for handshake status before policy tuning.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm Phase 1/Phase 2 objects persist and display expected values after refresh.",
          "Use status and log views in the IPsec page to verify negotiation and tunnel health.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Most failures are proposal/auth mismatch (encryption/hash/DH/local-remote IDs).",
          "If SA forms but no traffic passes, verify routing and firewall policy for tunnel networks.",
        ],
      },
    ],
  },
};
