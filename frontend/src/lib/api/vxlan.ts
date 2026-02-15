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

export interface VxlanVlanToVni {
  vlan: string;
  vni: string;
}

export interface VxlanInterfaceConfig {
  name: string;
  description: string;
  addresses: string[];
  mtu: string;
  vrf: string;
  disable: boolean;
  vni: string;
  port: string;
  sourceAddress: string;
  sourceInterface: string;
  remote: string;
  group: string;
  gpe: boolean;
  parametersExternal: boolean;
  parametersNeighborSuppress: boolean;
  parametersNolearning: boolean;
  parametersVniFilter: boolean;
  vlanToVni: VxlanVlanToVni[];
}

export interface VxlanConfig {
  interfaces: VxlanInterfaceConfig[];
}

class VxlanService {
  private readonly api = new ConfigTreeApi("vxlan-interface", "vxlan");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<VxlanConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const interfaces: VxlanInterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const parameters = asObject(node.parameters);
      const vlanToVniRoot = asObject(node["vlan-to-vni"]);
      const vlanToVni: VxlanVlanToVni[] = Object.keys(vlanToVniRoot)
        .sort((left, right) => Number(left) - Number(right))
        .map((vlan) => {
          const vlanNode = asObject(vlanToVniRoot[vlan]);
          return {
            vlan,
            vni: asString(vlanNode.vni),
          };
        });

      interfaces.push({
        name,
        description: asString(node.description),
        addresses: readTagValues(node.address),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        vni: asString(node.vni),
        port: asString(node.port),
        sourceAddress: asString(node["source-address"]),
        sourceInterface: asString(node["source-interface"]),
        remote: asString(node.remote),
        group: asString(node.group),
        gpe: Object.prototype.hasOwnProperty.call(node, "gpe"),
        parametersExternal: Object.prototype.hasOwnProperty.call(parameters, "external"),
        parametersNeighborSuppress: Object.prototype.hasOwnProperty.call(parameters, "neighbor-suppress"),
        parametersNolearning: Object.prototype.hasOwnProperty.call(parameters, "nolearning"),
        parametersVniFilter: Object.prototype.hasOwnProperty.call(parameters, "vni-filter"),
        vlanToVni,
      });
    }

    return { interfaces };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const vxlanService = new VxlanService();
