import { ConfigTreeApi } from "./config-tree";

export interface VrfRouteInterface {
  vrf: string;
}

export interface VrfProtocolRouteMapEntry {
  protocol: string;
  route_map: string;
}

export interface VrfRoute {
  destination: string;
  interface: Record<string, VrfRouteInterface>;
  "next-hop": string | null;
}

export interface VrfProtocolsStatic {
  routes: Record<string, VrfRoute>;
}

export interface VrfBgpAddressFamilyConfig {
  rd_vpn_export: string | null;
  route_target_import: string[];
  route_target_export: string[];
  route_target_both: string[];
  label_vpn_export: string | null;
  label_vpn_allocation_mode_per_nexthop: boolean;
  import_vpn: boolean;
  export_vpn: boolean;
  import_vrf: string[];
  route_map_vpn_import: string | null;
  route_map_vpn_export: string | null;
  route_map_vrf_import: string | null;
}

export interface VrfL3vpnConfig {
  ipv4_unicast: VrfBgpAddressFamilyConfig;
  ipv6_unicast: VrfBgpAddressFamilyConfig;
  mpls_forwarding_interfaces: string[];
}

export interface VRFProtocols {
  static: VrfProtocolsStatic;
}

export interface VRF {
  name: string;
  table: string;
  description: string | null;
  ip_nht_no_resolve_via_default: boolean;
  ipv6_nht_no_resolve_via_default: boolean;
  ip_protocol_route_maps: VrfProtocolRouteMapEntry[];
  ipv6_protocol_route_maps: VrfProtocolRouteMapEntry[];
  protocols: VRFProtocols;
  l3vpn: VrfL3vpnConfig;
}

export interface VRFConfig {
  vrfs: Record<string, VRF>;
  "bind-to-all": boolean;
}

export interface VRFFlatRoute {
  vrf: string;
  destination: string;
  interface_name: string;
  target_vrf: string;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseObjectKeys(value: unknown): string[] {
  return Object.keys(asObject(value))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => asString(entry)).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return parseObjectKeys(value);
}

function parseRouteMapValue(value: unknown): string | null {
  const direct = asString(value);
  if (direct) {
    return direct;
  }
  const root = asObject(value);
  const embedded = asString(root["route-map"] ?? root.route_map);
  if (embedded) {
    return embedded;
  }
  const first = Object.keys(root)[0];
  return first ? first.trim() : null;
}

function parseAddressFamilyConfig(rawRoot: unknown): VrfBgpAddressFamilyConfig {
  const root = asObject(rawRoot);
  const rd = asObject(root.rd);
  const rdVpn = asObject(rd.vpn);
  const routeTarget = asObject(root["route-target"] ?? root.route_target);
  const routeTargetVpn = asObject(routeTarget.vpn);
  const label = asObject(root.label);
  const labelVpn = asObject(label.vpn);
  const importRoot = asObject(root.import);
  const exportRoot = asObject(root.export);
  const routeMap = asObject(root["route-map"] ?? root.route_map);
  const routeMapVpn = asObject(routeMap.vpn);
  const routeMapVrf = asObject(routeMap.vrf);

  return {
    rd_vpn_export: asString(rdVpn.export) || null,
    route_target_import: parseStringList(routeTargetVpn.import),
    route_target_export: parseStringList(routeTargetVpn.export),
    route_target_both: parseStringList(routeTargetVpn.both),
    label_vpn_export: asString(labelVpn.export) || null,
    label_vpn_allocation_mode_per_nexthop: asString(labelVpn["allocation-mode"] ?? labelVpn.allocation_mode) === "per-nexthop" || Object.prototype.hasOwnProperty.call(asObject(labelVpn["allocation-mode"] ?? labelVpn.allocation_mode), "per-nexthop"),
    import_vpn: Object.prototype.hasOwnProperty.call(importRoot, "vpn"),
    export_vpn: Object.prototype.hasOwnProperty.call(exportRoot, "vpn"),
    import_vrf: parseStringList(importRoot.vrf),
    route_map_vpn_import: parseRouteMapValue(routeMapVpn.import),
    route_map_vpn_export: parseRouteMapValue(routeMapVpn.export),
    route_map_vrf_import: parseRouteMapValue(routeMapVrf.import),
  };
}

function parseProtocolRouteMaps(rawRoot: unknown): VrfProtocolRouteMapEntry[] {
  const root = asObject(rawRoot);
  const protocolRoot = asObject(root.protocol);
  return Object.keys(protocolRoot)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((protocol) => {
      const node = asObject(protocolRoot[protocol]);
      return {
        protocol,
        route_map: asString(node["route-map"] ?? node.route_map),
      };
    })
    .filter((entry) => entry.protocol.length > 0 && entry.route_map.length > 0);
}

function emptyAddressFamilyConfig(): VrfBgpAddressFamilyConfig {
  return {
    rd_vpn_export: null,
    route_target_import: [],
    route_target_export: [],
    route_target_both: [],
    label_vpn_export: null,
    label_vpn_allocation_mode_per_nexthop: false,
    import_vpn: false,
    export_vpn: false,
    import_vrf: [],
    route_map_vpn_import: null,
    route_map_vpn_export: null,
    route_map_vrf_import: null,
  };
}

class VRFService {
  private readonly api = new ConfigTreeApi("vrf", "vrf");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  /**
   * Get complete VRF configuration normalized for UI consumers.
   */
  async getConfig(refresh = false): Promise<VRFConfig> {
    const raw = await this.getRawConfig(refresh);
    const names = asObject(raw.name);

    const vrfs: Record<string, VRF> = {};
    for (const [name, value] of Object.entries(names)) {
      const root = asObject(value);
      const ipRoot = asObject(root.ip);
      const ipv6Root = asObject(root.ipv6);
      const ipNhtRoot = asObject(ipRoot.nht);
      const ipv6NhtRoot = asObject(ipv6Root.nht);
      const protocolsRoot = asObject(root.protocols);
      const staticRoot = asObject(protocolsRoot.static);
      const routeRoot = asObject(staticRoot.route);

      const routes: Record<string, VrfRoute> = {};
      for (const [destination, routeValue] of Object.entries(routeRoot)) {
        const routeConfig = asObject(routeValue);
        const interfaceRoot = asObject(routeConfig.interface);
        const normalizedInterface: Record<string, VrfRouteInterface> = {};

        for (const [iface, ifaceValue] of Object.entries(interfaceRoot)) {
          const ifaceConfig = asObject(ifaceValue);
          normalizedInterface[iface] = {
            vrf: asString(ifaceConfig.vrf),
          };
        }

        routes[destination] = {
          destination,
          interface: normalizedInterface,
          "next-hop": asString(routeConfig["next-hop"]) || null,
        };
      }

      const bgpRoot = asObject(protocolsRoot.bgp);
      const addressFamilyRoot = asObject(bgpRoot["address-family"] ?? bgpRoot.address_family);
      const bgpInterfaceRoot = asObject(bgpRoot.interface);
      const mplsForwardingInterfaces: string[] = [];

      for (const [interfaceName, interfaceValue] of Object.entries(bgpInterfaceRoot)) {
        const interfaceConfig = asObject(interfaceValue);
        const mplsRoot = asObject(interfaceConfig.mpls);
        if (Object.prototype.hasOwnProperty.call(mplsRoot, "forwarding")) {
          mplsForwardingInterfaces.push(interfaceName);
        }
      }

      mplsForwardingInterfaces.sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true })
      );

      vrfs[name] = {
        name,
        table: asString(root.table),
        description: asString(root.description) || null,
        ip_nht_no_resolve_via_default: Object.prototype.hasOwnProperty.call(
          ipNhtRoot,
          "no-resolve-via-default",
        ),
        ipv6_nht_no_resolve_via_default: Object.prototype.hasOwnProperty.call(
          ipv6NhtRoot,
          "no-resolve-via-default",
        ),
        ip_protocol_route_maps: parseProtocolRouteMaps(ipRoot),
        ipv6_protocol_route_maps: parseProtocolRouteMaps(ipv6Root),
        protocols: {
          static: {
            routes,
          },
        },
        l3vpn: {
          ipv4_unicast: Object.prototype.hasOwnProperty.call(addressFamilyRoot, "ipv4-unicast")
            ? parseAddressFamilyConfig(addressFamilyRoot["ipv4-unicast"])
            : emptyAddressFamilyConfig(),
          ipv6_unicast: Object.prototype.hasOwnProperty.call(addressFamilyRoot, "ipv6-unicast")
            ? parseAddressFamilyConfig(addressFamilyRoot["ipv6-unicast"])
            : emptyAddressFamilyConfig(),
          mpls_forwarding_interfaces: mplsForwardingInterfaces,
        },
      };
    }

    return {
      vrfs,
      "bind-to-all": Object.prototype.hasOwnProperty.call(raw, "bind-to-all"),
    };
  }

  /**
   * Get all VRF static routes as a flat list.
   */
  async getRoutes(refresh = false): Promise<VRFFlatRoute[]> {
    const config = await this.getConfig(refresh);
    const rows: VRFFlatRoute[] = [];

    for (const [vrfName, vrf] of Object.entries(config.vrfs)) {
      const routes = vrf.protocols.static.routes;
      for (const [destination, route] of Object.entries(routes)) {
        const interfaces = route.interface;
        for (const [interfaceName, iface] of Object.entries(interfaces)) {
          rows.push({
            vrf: vrfName,
            destination,
            interface_name: interfaceName,
            target_vrf: iface.vrf,
          });
        }
      }
    }

    return rows;
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const vrfService = new VRFService();
