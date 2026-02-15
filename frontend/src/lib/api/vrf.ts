import { ConfigTreeApi } from "./config-tree";

export interface VRFRouteInterface {
  vrf: string;
}

export interface VRFRoute {
  destination: string;
  interface: Record<string, VRFRouteInterface>;
  "next-hop": string | null;
}

export interface VRFProtocolsStatic {
  routes: Record<string, VRFRoute>;
}

export interface VRFProtocols {
  static: VRFProtocolsStatic;
}

export interface VRF {
  name: string;
  table: string;
  description: string | null;
  protocols: VRFProtocols;
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
      const protocolsRoot = asObject(root.protocols);
      const staticRoot = asObject(protocolsRoot.static);
      const routeRoot = asObject(staticRoot.route);

      const routes: Record<string, VRFRoute> = {};
      for (const [destination, routeValue] of Object.entries(routeRoot)) {
        const routeConfig = asObject(routeValue);
        const interfaceRoot = asObject(routeConfig.interface);
        const normalizedInterface: Record<string, VRFRouteInterface> = {};

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

      vrfs[name] = {
        name,
        table: asString(root.table),
        description: asString(root.description) || null,
        protocols: {
          static: {
            routes,
          },
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
