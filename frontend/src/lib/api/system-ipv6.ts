import { ConfigTreeApi } from "./config-tree";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export interface SystemIpv6ProtocolRouteMapEntry {
  protocol: string;
  routeMap: string;
}

export interface SystemIpv6Config {
  disableForwarding: boolean;
  multipathLayer4Hashing: boolean;
  neighborTableSize: string;
  nhtNoResolveViaDefault: boolean;
  protocolRouteMaps: SystemIpv6ProtocolRouteMapEntry[];
  strictDad: boolean;
}

class SystemIpv6Service {
  private readonly api = new ConfigTreeApi("system-ipv6", "ipv6");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemIpv6Config> {
    const root = asObject(await this.getRawConfig(refresh));
    const multipath = asObject(root.multipath);
    const nht = asObject(root.nht);
    const neighbor = asObject(root.neighbor);

    const protocolRoot = asObject(root.protocol);
    const protocolRouteMaps = Object.keys(protocolRoot)
      .sort((left, right) => left.localeCompare(right))
      .map((protocol) => {
        const node = asObject(protocolRoot[protocol]);
        return {
          protocol,
          routeMap: asString(node["route-map"]),
        };
      })
      .filter((entry) => entry.routeMap.length > 0);

    return {
      disableForwarding: Object.prototype.hasOwnProperty.call(root, "disable-forwarding"),
      multipathLayer4Hashing: Object.prototype.hasOwnProperty.call(multipath, "layer4-hashing"),
      neighborTableSize: asString(neighbor["table-size"]),
      nhtNoResolveViaDefault: Object.prototype.hasOwnProperty.call(nht, "no-resolve-via-default"),
      protocolRouteMaps,
      strictDad: Object.prototype.hasOwnProperty.call(root, "strict-dad"),
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemIpv6Service = new SystemIpv6Service();
