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

export interface BridgeMember {
  interfaceName: string;
  cost: string;
  priority: string;
}

export interface BridgeInterfaceConfig {
  name: string;
  description: string;
  addresses: string[];
  mac: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  disableFlowControl: boolean;
  disableLinkDetect: boolean;
  aging: string;
  protocol: string;
  enableVlan: boolean;
  igmpSnooping: boolean;
  igmpQuerier: boolean;
  stpEnabled: boolean;
  stpPriority: string;
  stpHelloTime: string;
  stpMaxAge: string;
  stpForwardDelay: string;
  members: BridgeMember[];
}

export interface BridgeConfig {
  bridges: BridgeInterfaceConfig[];
}

class BridgeInterfaceService {
  private readonly api = new ConfigTreeApi("bridge", "bridge");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<BridgeConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const bridges: BridgeInterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const memberRoot = asObject(asObject(node.member).interface);
      const stpNode = asObject(node.stp);
      const igmpNode = asObject(node.igmp);

      const members: BridgeMember[] = Object.keys(memberRoot)
        .sort((left, right) => left.localeCompare(right))
        .map((interfaceName) => {
          const memberNode = asObject(memberRoot[interfaceName]);
          return {
            interfaceName,
            cost: asString(memberNode.cost),
            priority: asString(memberNode.priority),
          };
        });

      bridges.push({
        name,
        description: asString(node.description),
        addresses: readTagValues(node.address),
        mac: asString(node.mac),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        disableFlowControl: Object.prototype.hasOwnProperty.call(node, "disable-flow-control"),
        disableLinkDetect: Object.prototype.hasOwnProperty.call(node, "disable-link-detect"),
        aging: asString(node.aging),
        protocol: asString(node.protocol),
        enableVlan: Object.prototype.hasOwnProperty.call(node, "enable-vlan"),
        igmpSnooping: Object.prototype.hasOwnProperty.call(igmpNode, "snooping"),
        igmpQuerier: Object.prototype.hasOwnProperty.call(igmpNode, "querier"),
        stpEnabled: Object.prototype.hasOwnProperty.call(node, "stp"),
        stpPriority: asString(stpNode.priority),
        stpHelloTime: asString(stpNode["hello-time"]),
        stpMaxAge: asString(stpNode["max-age"]),
        stpForwardDelay: asString(stpNode["forward-delay"]),
        members,
      });
    }

    return { bridges };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const bridgeInterfaceService = new BridgeInterfaceService();
