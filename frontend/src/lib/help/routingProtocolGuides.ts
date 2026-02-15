import type { PageGuide } from "@/components/common/PageGuideDialog";

export const routingProtocolGuides: Record<
  "ospf" | "isis" | "openfabric" | "rip" | "mpls",
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
};
