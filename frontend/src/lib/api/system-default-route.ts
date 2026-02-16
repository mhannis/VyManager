import { ConfigTreeApi } from "./config-tree";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export interface DefaultRouteNextHop {
  address: string;
  distance: string;
  disable: boolean;
}

export interface SystemDefaultRouteConfig {
  nextHops: DefaultRouteNextHop[];
}

class SystemDefaultRouteService {
  private readonly api = new ConfigTreeApi("system-default-route", "default_route");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemDefaultRouteConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const nextHopRoot = asObject(root["next-hop"]);
    const nextHops = Object.keys(nextHopRoot)
      .sort((left, right) => left.localeCompare(right))
      .map((address) => {
        const node = asObject(nextHopRoot[address]);
        return {
          address,
          distance: asString(node.distance),
          disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        };
      });

    return { nextHops };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemDefaultRouteService = new SystemDefaultRouteService();

