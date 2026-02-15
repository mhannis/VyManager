import { ConfigTreeApi } from "./config-tree";

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

function readTagValues(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => String(entry || "").trim())
          .filter((entry) => entry.length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }

  return Object.keys(asObject(value)).sort((left, right) => left.localeCompare(right));
}

export interface L2tpv3InterfaceConfig {
  name: string;
  description: string;
  addresses: string[];
  mtu: string;
  vrf: string;
  disable: boolean;
  encapsulation: string;
  sourceAddress: string;
  remote: string;
  sessionId: string;
  peerSessionId: string;
  tunnelId: string;
  peerTunnelId: string;
  sourcePort: string;
  destinationPort: string;
  cookie: string;
  peerCookie: string;
}

export interface L2tpv3Config {
  interfaces: L2tpv3InterfaceConfig[];
}

class L2tpv3Service {
  private readonly api = new ConfigTreeApi("l2tpv3", "l2tpv3");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<L2tpv3Config> {
    const root = asObject(await this.getRawConfig(refresh));
    const interfaces: L2tpv3InterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const peerNode = asObject(node.peer);
      interfaces.push({
        name,
        description: asString(node.description),
        addresses: readTagValues(node.address),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        encapsulation: asString(node.encapsulation),
        sourceAddress: asString(node["source-address"] || node["local-ip"]),
        remote: asString(node.remote || node["remote-ip"]),
        sessionId: asString(node["session-id"]),
        peerSessionId: asString(node["peer-session-id"] || peerNode["session-id"]),
        tunnelId: asString(node["tunnel-id"]),
        peerTunnelId: asString(node["peer-tunnel-id"] || peerNode["tunnel-id"]),
        sourcePort: asString(node["source-port"]),
        destinationPort: asString(node["destination-port"]),
        cookie: asString(node.cookie),
        peerCookie: asString(node["peer-cookie"] || peerNode.cookie),
      });
    }

    return { interfaces };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const l2tpv3Service = new L2tpv3Service();

