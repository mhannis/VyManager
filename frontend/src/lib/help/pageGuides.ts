import type { PageGuide } from "@/components/common/PageGuideDialog";

export const pageGuides: Record<
  "networkInterfaces" | "dhcpServer" | "firewallZones" | "containers" | "ipsec",
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
          "Check `show configuration commands | match interfaces` for expected config output.",
          "Verify operational link/IP state from interface overview and dashboard cards.",
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
          "Confirm config with `show configuration commands | match service dhcp-server`.",
          "Connect a client and verify active lease state and gateway/DNS assignment.",
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
          "Verify config via `show configuration commands | match firewall zone`.",
          "Test each expected direction explicitly (LAN->WAN, WAN->LAN, intra-zone).",
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
          "Check `show configuration commands | match container` for committed state.",
          "Verify exposed service URL opens from intended interface/host path.",
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
          "Verify config with `show configuration commands | match vpn ipsec`.",
          "Check tunnel/SA status and inspect logs (`charon`) for negotiation results.",
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
