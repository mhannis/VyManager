import type { PageGuide } from "@/components/common/PageGuideDialog";

export const routingProtocolGuides: Record<
  | "ospf"
  | "isis"
  | "openfabric"
  | "rip"
  | "mpls"
  | "segmentRouting"
  | "bfd"
  | "rpki"
  | "igmpProxy"
  | "pim"
  | "pim6",
  PageGuide
> = {
  ospf: {
    title: "OSPF How-To",
    summary:
      "Use this page to configure OSPF process parameters, area assignments, interface tuning, and redistribution without CLI entry.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/ospf.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set global values first: Router ID, ABR type, max paths, and SPF throttle timers.",
          "Add interface-to-area assignments so adjacency can form on the right links.",
          "Define area network advertisements and optional area types when needed.",
          "Add redistribution entries only after route-maps are created (if used).",
          "Save changes, then verify neighbors and learned routes with operational commands.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm configured state using `show configuration commands | match protocols ospf`.",
          "Check neighbor state in operations mode (`show ip ospf neighbor`).",
          "Check route installation (`show ip route ospf`).",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If no neighbors form, verify interface area assignment, hello/dead timers, and network type on both sides.",
          "If routes are missing, validate area networks and redistribution route-map logic.",
        ],
      },
    ],
  },
  isis: {
    title: "IS-IS How-To",
    summary:
      "Configure IS-IS NET identity, level/metric behavior, interface controls, and redistribution from one form-first workflow.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/isis.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set global IS-IS identity first (NET is mandatory) and choose level/metric style.",
          "Add interfaces and tune circuit-type, hello timers, metric, and passive state.",
          "Apply optional global behavior flags (dynamic-hostname, overload, purge-originator).",
          "Add redistribution source/level entries after route-maps exist.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm generated config via `show configuration commands | match protocols isis`.",
          "Check adjacency and LSDB in operations mode.",
          "Verify expected ISIS routes in RIB.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "No adjacency usually means mismatched level, NET/domain mismatch, or interface timer differences.",
          "If redistribution does not appear, verify source protocol routes exist before policy filtering.",
        ],
      },
    ],
  },
  openfabric: {
    title: "OpenFabric How-To",
    summary:
      "Configure OpenFabric domains and per-domain interface behavior including NET, timers, passwording, and AF settings.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/openfabric.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create at least one domain and set NET first (required).",
          "Add optional domain controls (tier, LSP timers, SPF interval, flags).",
          "Attach interfaces to the domain and enable IPv4/IPv6 address families as needed.",
          "Save and validate neighbor formation and route exchange.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Verify config tree with `show configuration commands | match protocols openfabric`.",
          "Confirm adjacency and route installation with OpenFabric operational commands.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If the domain fails to start, NET format or duplication is the first thing to verify.",
          "If adjacency is unstable, review hello multiplier and interval settings per interface.",
        ],
      },
    ],
  },
  rip: {
    title: "RIP How-To",
    summary:
      "Configure RIP process defaults, network participation, passive behavior, filtering, and redistribution in one place.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/rip.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set global defaults and timer values first.",
          "Add networks or interfaces that should run RIP.",
          "Use passive defaults/interfaces for safety, then explicitly enable active edges.",
          "Add distribute-list and network-distance controls, then redistribution if required.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Review resulting config via `show configuration commands | match protocols rip`.",
          "Check neighbor updates and learned RIP routes in operations mode.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "No route exchange typically indicates passive-interface behavior or network mismatch.",
          "Unexpected filtering often comes from distribute-list references to missing ACL/prefix-list names.",
        ],
      },
    ],
  },
  mpls: {
    title: "MPLS/LDP How-To",
    summary:
      "Configure MPLS forwarding interfaces, LDP session behavior, transport addresses, and static LDP neighbors.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/mpls.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Add interface membership for both MPLS and LDP on transit links.",
          "Set core LDP parameters (router-id, transport addresses, discovery/session timers).",
          "Apply optional behavior flags (explicit-null, disable-targeted-hello, dual-stack transport preference).",
          "Add static LDP neighbors only when dynamic discovery is not sufficient.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm config with `show configuration commands | match protocols mpls`.",
          "Validate label bindings and LDP neighbor/session state in operations mode.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "No labels usually means missing MPLS/LDP interface assignment or IGP reachability gaps.",
          "Static neighbor issues often come from source-address and transport-address mismatch.",
        ],
      },
    ],
  },
  segmentRouting: {
    title: "Segment Routing How-To",
    summary:
      "Enable OSPF/IS-IS Segment Routing with label blocks and Prefix SID entries while keeping OSPF opaque-LSA prerequisites aligned.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/segment-routing.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "For OSPF, enable Opaque LSA first so Segment Routing extensions can be advertised.",
          "Set global and local label blocks for each protocol before creating Prefix SID mappings.",
          "Add Prefix SID entries for loopback/router prefixes with index value and required flags.",
          "Apply and validate that both sides use compatible SRGB/SRLB ranges.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm OSPF Opaque LSA and Segment Routing values remain present after reload.",
          "Verify Prefix SID rows reflect expected index/flag values for each protocol.",
          "Check route installation and label behavior from the related routing dashboards/pages.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Missing SR behavior on OSPF usually indicates Opaque LSA is disabled on one side.",
          "Label conflicts are often caused by mismatched SRGB/SRLB ranges between neighbors.",
          "If Prefix SID labels are absent, confirm prefix format and per-protocol index values.",
        ],
      },
    ],
  },
  bfd: {
    title: "BFD How-To",
    summary:
      "Use BFD to provide fast liveliness detection for routing protocols and static peers with reusable timer profiles.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/bfd.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Create profile templates first when multiple peers share timer behavior.",
          "Add peers and bind each to the correct source address/interface and optional profile.",
          "Enable multihop only for non-direct peers.",
          "Apply, then verify protocol consumers (BGP/OSPF/IS-IS) are referencing the expected BFD sessions.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Inspect generated config with `show configuration commands | match protocols bfd`.",
          "Verify BFD session state and timers in operations mode.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If sessions stay down, validate source/interface selection and underlay reachability first.",
          "Timer mismatches between peers can cause repeated flaps; align profile values on both sides.",
        ],
      },
    ],
  },
  rpki: {
    title: "RPKI How-To",
    summary:
      "Configure validator caches and global poll/expire/retry timers to support route-origin validation workflows.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/rpki.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set global polling/expire/retry timers first.",
          "Add one or more validator caches and tune cache preference values.",
          "Add SSH transport options only when your validator requires them.",
          "Apply changes, then confirm policy objects are consuming RPKI validation state as expected.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm resulting tree with `show configuration commands | match protocols rpki`.",
          "Check cache connection/refresh behavior in operations mode and route-policy matches.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "Cache connectivity failures are usually address/port reachability or TLS/SSH parameter mismatches.",
          "If validation state is absent in policy decisions, verify at least one cache is healthy and synced.",
        ],
      },
    ],
  },
  igmpProxy: {
    title: "IGMP Proxy How-To",
    summary:
      "Configure upstream/downstream IGMP proxy interfaces and alternate source subnets for multicast forwarding.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/igmp-proxy.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set one upstream interface toward multicast sources.",
          "Set one or more downstream interfaces toward clients.",
          "Add alternative source subnets where multicast sources are not directly connected.",
          "Apply and verify joins/forwarding counters in operations mode.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Check generated config with `show configuration commands | match protocols igmp-proxy`.",
          "Verify upstream/downstream role assignment and active group forwarding state.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "No stream forwarding commonly means incorrect upstream role or missing alternate subnet declarations.",
          "Quickleave behavior can interrupt streams on shared segments; tune only after baseline works.",
        ],
      },
    ],
  },
  pim: {
    title: "PIM How-To",
    summary:
      "Configure IPv4 multicast routing using PIM global controls, interface settings, RP mappings, and IGMP joins.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/pim.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Set global PIM behavior first (ECMP, timers, SSM/SPT controls).",
          "Configure interface-level parameters on participating multicast links.",
          "Add RP mappings for multicast groups.",
          "Add static IGMP joins only where required, then apply and validate tree formation.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm config with `show configuration commands | match protocols pim`.",
          "Validate RP, multicast routes, and interface state in operations mode.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "If multicast trees do not form, validate RP mapping and unicast reachability to RP/source.",
          "Interface timer/profile mismatches can cause unstable adjacencies and intermittent forwarding.",
        ],
      },
    ],
  },
  pim6: {
    title: "PIM6 How-To",
    summary:
      "Configure IPv6 multicast routing with per-interface MLD controls and static join definitions.",
    docsUrl: "https://docs.vyos.io/en/latest/configuration/protocols/pim6.html",
    sections: [
      {
        title: "Recommended Setup Order",
        items: [
          "Add participating interfaces and baseline MLD timer/version values.",
          "Enable/disable interface MLD behavior explicitly where needed.",
          "Add static MLD joins for required groups.",
          "Apply changes and validate multicast forwarding behavior end-to-end.",
        ],
      },
      {
        title: "Validation",
        items: [
          "Confirm tree with `show configuration commands | match protocols pim6`.",
          "Check multicast join and interface state using IPv6 multicast operational commands.",
        ],
      },
      {
        title: "Troubleshooting",
        items: [
          "No group forwarding often indicates missing join definitions or wrong interface participation.",
          "MLD timing mismatches can delay joins and create apparent packet loss at startup.",
        ],
      },
    ],
  },
};
