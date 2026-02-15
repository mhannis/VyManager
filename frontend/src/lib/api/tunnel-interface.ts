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

function parseAdjustMss(value: unknown): { clamp: boolean; value: string } {
  const rawString = asString(value);
  if (rawString) {
    return { clamp: false, value: rawString };
  }

  const node = asObject(value);
  if (Object.prototype.hasOwnProperty.call(node, "clamp-mss-to-pmtu")) {
    return { clamp: true, value: "" };
  }

  return { clamp: false, value: "" };
}

export interface TunnelInterfaceConfig {
  name: string;
  description: string;
  addresses: string[];
  mtu: string;
  vrf: string;
  disable: boolean;
  encapsulation: string;
  sourceAddress: string;
  remote: string;
  ipKey: string;
  disableFlowControl: boolean;
  disableLinkDetect: boolean;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
  ipSourceValidation: string;
  ipDisableForwarding: boolean;
  ipv6DisableForwarding: boolean;
}

export interface TunnelConfig {
  interfaces: TunnelInterfaceConfig[];
}

class TunnelInterfaceService {
  private readonly api = new ConfigTreeApi("tunnel-interface", "tunnel");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<TunnelConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const interfaces: TunnelInterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const ipNode = asObject(node.ip);
      const ipv6Node = asObject(node.ipv6);
      const parametersNode = asObject(node.parameters);
      const ipParametersNode = asObject(parametersNode.ip);
      const ipAdjustMss = parseAdjustMss(ipNode["adjust-mss"]);
      const ipv6AdjustMss = parseAdjustMss(ipv6Node["adjust-mss"]);

      interfaces.push({
        name,
        description: asString(node.description),
        addresses: readTagValues(node.address),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        encapsulation: asString(node.encapsulation),
        sourceAddress: asString(node["source-address"]),
        remote: asString(node.remote),
        ipKey: asString(ipParametersNode.key),
        disableFlowControl: Object.prototype.hasOwnProperty.call(node, "disable-flow-control"),
        disableLinkDetect: Object.prototype.hasOwnProperty.call(node, "disable-link-detect"),
        ipAdjustMssClamp: ipAdjustMss.clamp,
        ipAdjustMssValue: ipAdjustMss.value,
        ipv6AdjustMssClamp: ipv6AdjustMss.clamp,
        ipv6AdjustMssValue: ipv6AdjustMss.value,
        ipSourceValidation: asString(ipNode["source-validation"]),
        ipDisableForwarding: Object.prototype.hasOwnProperty.call(ipNode, "disable-forwarding"),
        ipv6DisableForwarding: Object.prototype.hasOwnProperty.call(ipv6Node, "disable-forwarding"),
      });
    }

    return { interfaces };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const tunnelInterfaceService = new TunnelInterfaceService();
