import { ConfigTreeApi } from "./config-tree";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export interface SystemIpImportTableEntry {
  tableId: string;
  distance: string;
  routeMap: string;
}

export interface SystemIpProtocolRouteMapEntry {
  protocol: string;
  routeMap: string;
}

export interface SystemIpConfig {
  arpTableSize: string;
  disableDirectedBroadcast: boolean;
  disableForwarding: boolean;
  importTables: SystemIpImportTableEntry[];
  multipathLayer4Hashing: boolean;
  nhtNoResolveViaDefault: boolean;
  protocolRouteMaps: SystemIpProtocolRouteMapEntry[];
}

class SystemIpService {
  private readonly api = new ConfigTreeApi("system-ip", "ip");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemIpConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const arp = asObject(root.arp);
    const multipath = asObject(root.multipath);
    const nht = asObject(root.nht);

    const importTableRoot = asObject(root["import-table"]);
    const importTables = Object.keys(importTableRoot)
      .sort((left, right) => Number(left) - Number(right))
      .map((tableId) => {
        const node = asObject(importTableRoot[tableId]);
        return {
          tableId,
          distance: asString(node.distance),
          routeMap: asString(node["route-map"]),
        };
      });

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
      arpTableSize: asString(arp["table-size"]),
      disableDirectedBroadcast: Object.prototype.hasOwnProperty.call(root, "disable-directed-broadcast"),
      disableForwarding: Object.prototype.hasOwnProperty.call(root, "disable-forwarding"),
      importTables,
      multipathLayer4Hashing: Object.prototype.hasOwnProperty.call(multipath, "layer4-hashing"),
      nhtNoResolveViaDefault: Object.prototype.hasOwnProperty.call(nht, "no-resolve-via-default"),
      protocolRouteMaps,
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemIpService = new SystemIpService();
