export const SIDEBAR_VISIBILITY_STORAGE_KEY =
  "vymanager.sidebar.hidden-top-level.v1";
export const SIDEBAR_VISIBILITY_CHANGE_EVENT =
  "vymanager:sidebar-visibility-change";

export type SidebarItemId = string;

export interface SidebarVisibilityChildItem {
  id: SidebarItemId;
  label: string;
  href: string;
  canHide: boolean;
}

export interface SidebarVisibilityItem {
  id: SidebarItemId;
  label: string;
  canHide: boolean;
  children?: SidebarVisibilityChildItem[];
}

export const SIDEBAR_VISIBILITY_ITEMS: SidebarVisibilityItem[] = [
  { id: "dashboard", label: "Dashboard", canHide: false },
  { id: "containers", label: "Containers", canHide: true },
  {
    id: "firewall",
    label: "Firewall",
    canHide: true,
    children: [
      {
        id: "firewall-policies",
        label: "Policies",
        href: "/firewall/policies",
        canHide: true,
      },
      {
        id: "firewall-bridge",
        label: "Bridge",
        href: "/firewall/bridge",
        canHide: true,
      },
      {
        id: "firewall-groups",
        label: "Groups",
        href: "/firewall/groups",
        canHide: true,
      },
      {
        id: "firewall-zones",
        label: "Zones",
        href: "/firewall/zones",
        canHide: true,
      },
      {
        id: "firewall-global-options",
        label: "Global Options",
        href: "/firewall/global-options",
        canHide: true,
      },
      {
        id: "firewall-flowtables",
        label: "Flowtables",
        href: "/firewall/flowtables",
        canHide: true,
      },
    ],
  },
  { id: "high-availability", label: "High Availability", canHide: true },
  {
    id: "interfaces",
    label: "Interfaces",
    canHide: true,
    children: [
      {
        id: "interfaces-setup-wizard",
        label: "Setup Wizard",
        href: "/network/setup-wizard",
        canHide: true,
      },
      {
        id: "interfaces-all",
        label: "All Interfaces",
        href: "/network/interfaces",
        canHide: true,
      },
    ],
  },
  { id: "load-balancing", label: "Load Balancing", canHide: true },
  { id: "nat", label: "NAT", canHide: true },
  {
    id: "policy",
    label: "Policy",
    canHide: true,
    children: [
      { id: "policy-overview", label: "Overview", href: "/policies", canHide: true },
      {
        id: "policy-access-list",
        label: "Access List",
        href: "/policies/access-list",
        canHide: true,
      },
      {
        id: "policy-prefix-list",
        label: "Prefix List",
        href: "/policies/prefix-list",
        canHide: true,
      },
      { id: "policy-route", label: "Route", href: "/policies/route", canHide: true },
      {
        id: "policy-route-map",
        label: "Route Map",
        href: "/policies/route-map",
        canHide: true,
      },
      {
        id: "policy-local-route",
        label: "Local Route",
        href: "/policies/local-route",
        canHide: true,
      },
      {
        id: "policy-bgp-as",
        label: "BGP AS",
        href: "/policies/bgp-as",
        canHide: true,
      },
      {
        id: "policy-bgp-community",
        label: "BGP Community",
        href: "/policies/bgp-community",
        canHide: true,
      },
      {
        id: "policy-bgp-extended-community",
        label: "BGP Extended Community",
        href: "/policies/bgp-extended-community",
        canHide: true,
      },
      {
        id: "policy-bgp-large-community",
        label: "BGP Large Community",
        href: "/policies/bgp-large-community",
        canHide: true,
      },
      {
        id: "policy-examples",
        label: "Examples",
        href: "/policies/examples",
        canHide: true,
      },
    ],
  },
  { id: "pki", label: "PKI", canHide: true },
  {
    id: "protocols",
    label: "Protocols",
    canHide: true,
    children: [
      {
        id: "protocols-overview",
        label: "Overview",
        href: "/routing/protocols",
        canHide: true,
      },
      {
        id: "protocols-unicast",
        label: "Unicast Protocols",
        href: "/routing/unicast-protocols",
        canHide: true,
      },
      {
        id: "protocols-static-failover",
        label: "Static & Failover",
        href: "/routing/static-failover/static-routes",
        canHide: true,
      },
      {
        id: "protocols-infrastructure",
        label: "Routing Infrastructure",
        href: "/routing/infrastructure",
        canHide: true,
      },
      {
        id: "protocols-multicast",
        label: "Multicast",
        href: "/routing/multicast",
        canHide: true,
      },
    ],
  },
  {
    id: "services",
    label: "Services",
    canHide: true,
    children: [
      {
        id: "services-all",
        label: "All Services",
        href: "/system/services",
        canHide: true,
      },
      {
        id: "services-dhcp-server",
        label: "DHCP Server",
        href: "/network/dhcp",
        canHide: true,
      },
    ],
  },
  { id: "traffic-policy", label: "Traffic Policy", canHide: true },
  {
    id: "vpn",
    label: "VPN",
    canHide: true,
    children: [
      { id: "vpn-overview", label: "Overview", href: "/vpn", canHide: true },
      { id: "vpn-dmvpn", label: "DMVPN", href: "/vpn/dmvpn", canHide: true },
      { id: "vpn-ipsec", label: "IPsec", href: "/vpn/ipsec", canHide: true },
      { id: "vpn-l2tp", label: "L2TP", href: "/vpn/l2tp", canHide: true },
      {
        id: "vpn-openconnect",
        label: "OpenConnect",
        href: "/vpn/openconnect",
        canHide: true,
      },
      {
        id: "vpn-pptp",
        label: "PPTP Server",
        href: "/vpn/pptp",
        canHide: true,
      },
      {
        id: "vpn-rsa-keys",
        label: "RSA Keys",
        href: "/vpn/rsa-keys",
        canHide: true,
      },
      {
        id: "vpn-sstp",
        label: "SSTP Server",
        href: "/vpn/sstp",
        canHide: true,
      },
      {
        id: "vpn-wireguard",
        label: "WireGuard",
        href: "/vpn/wireguard",
        canHide: true,
      },
    ],
  },
  { id: "vrf", label: "VRF", canHide: true },
  { id: "l3vpn-vrfs", label: "L3VPN VRFs", canHide: true },
  {
    id: "settings",
    label: "Settings",
    canHide: false,
    children: [
      {
        id: "settings-general",
        label: "General",
        href: "/settings",
        canHide: false,
      },
      {
        id: "settings-navigation",
        label: "Navigation",
        href: "/settings/navigation",
        canHide: false,
      },
    ],
  },
  {
    id: "system",
    label: "System",
    canHide: true,
    children: [
      {
        id: "system-identification",
        label: "System Identification",
        href: "/system/identification",
        canHide: true,
      },
      {
        id: "system-guided-setup",
        label: "Guided Setup",
        href: "/system/options",
        canHide: true,
      },
      {
        id: "system-acceleration",
        label: "Acceleration",
        href: "/system/acceleration",
        canHide: true,
      },
      {
        id: "system-flow-accounting",
        label: "Flow Accounting",
        href: "/system/flow-accounting",
        canHide: true,
      },
      {
        id: "system-proxy",
        label: "Proxy",
        href: "/system/proxy",
        canHide: true,
      },
      {
        id: "system-sysctl",
        label: "Sysctl",
        href: "/system/sysctl",
        canHide: true,
      },
      { id: "system-logs", label: "Logs", href: "/system/logs", canHide: true },
      { id: "system-users", label: "Users", href: "/system/users", canHide: true },
    ],
  },
];

const allIds = new Set<SidebarItemId>();
const hideableIds = new Set<SidebarItemId>();
const childIdsByHref = new Map<string, SidebarItemId>();
for (const item of SIDEBAR_VISIBILITY_ITEMS) {
  allIds.add(item.id);
  if (item.canHide) hideableIds.add(item.id);
  for (const child of item.children ?? []) {
    allIds.add(child.id);
    if (child.canHide) hideableIds.add(child.id);
    if (!childIdsByHref.has(child.href)) {
      childIdsByHref.set(child.href, child.id);
    }
  }
}

export const resolveSidebarChildId = (href: string): SidebarItemId =>
  childIdsByHref.get(href) ?? (`child:${href}` as SidebarItemId);

const sanitizeHiddenIds = (value: unknown): SidebarItemId[] => {
  if (!Array.isArray(value)) return [];
  const sanitized: SidebarItemId[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    if (!allIds.has(entry)) continue;
    if (!hideableIds.has(entry)) continue;
    sanitized.push(entry);
  }
  return Array.from(new Set(sanitized));
};

export const loadHiddenSidebarIds = (): Set<SidebarItemId> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SIDEBAR_VISIBILITY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(sanitizeHiddenIds(parsed));
  } catch {
    return new Set();
  }
};

export const saveHiddenSidebarIds = (
  hiddenIds: Iterable<SidebarItemId>,
): void => {
  if (typeof window === "undefined") return;
  const sanitized = sanitizeHiddenIds(Array.from(hiddenIds));
  window.localStorage.setItem(
    SIDEBAR_VISIBILITY_STORAGE_KEY,
    JSON.stringify(sanitized),
  );
  window.dispatchEvent(
    new CustomEvent(SIDEBAR_VISIBILITY_CHANGE_EVENT, {
      detail: { hiddenIds: sanitized },
    }),
  );
};

export const clearHiddenSidebarIds = (): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SIDEBAR_VISIBILITY_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(SIDEBAR_VISIBILITY_CHANGE_EVENT));
};
