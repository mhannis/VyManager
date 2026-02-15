import type { PageGuide } from "@/components/common/PageGuideDialog";

export const pageGuides: Record<
  | "networkInterfaces"
  | "dhcpServer"
  | "firewallZones"
  | "firewallPolicies"
  | "firewallGroups"
  | "firewallGlobalOptions"
  | "firewallBridge"
  | "firewallFlowtables"
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
