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
  const raw = asString(value);
  if (raw) return { clamp: false, value: raw };
  const node = asObject(value);
  if (Object.prototype.hasOwnProperty.call(node, "clamp-mss-to-pmtu")) {
    return { clamp: true, value: "" };
  }
  return { clamp: false, value: "" };
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
  mac: string;
  disableFlowControl: boolean;
  disableLinkDetect: boolean;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipArpCacheTimeout: string;
  ipDisableArpFilter: boolean;
  ipDisableForwarding: boolean;
  ipEnableArpAccept: boolean;
  ipEnableArpAnnounce: boolean;
  ipEnableArpIgnore: boolean;
  ipEnableDirectedBroadcast: boolean;
  ipEnableProxyArp: boolean;
  ipProxyArpPvlan: boolean;
  ipSourceValidation: string;
  ipv6AddressAutoconf: boolean;
  ipv6AddressEui64: string;
  ipv6AddressNoDefaultLinkLocal: boolean;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
  ipv6DisableForwarding: boolean;
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
      const ipNode = asObject(node.ip);
      const ipv6Node = asObject(node.ipv6);
      const ipv6AddressNode = asObject(ipv6Node.address);
      const ipAdjustMss = parseAdjustMss(ipNode["adjust-mss"]);
      const ipv6AdjustMss = parseAdjustMss(ipv6Node["adjust-mss"]);
      const vlanToVniRoot = asObject(node["vlan-to-vni"]);
      const vlanToVni: VxlanVlanToVni[] = Object.keys(vlanToVniRoot)
        .sort((left, right) => {
          const leftNumber = Number(left);
          const rightNumber = Number(right);
          if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
            return leftNumber - rightNumber;
          }
          return left.localeCompare(right);
        })
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
        mac: asString(node.mac),
        disableFlowControl: Object.prototype.hasOwnProperty.call(node, "disable-flow-control"),
        disableLinkDetect: Object.prototype.hasOwnProperty.call(node, "disable-link-detect"),
        ipAdjustMssClamp: ipAdjustMss.clamp,
        ipAdjustMssValue: ipAdjustMss.value,
        ipArpCacheTimeout: asString(ipNode["arp-cache-timeout"]),
        ipDisableArpFilter: Object.prototype.hasOwnProperty.call(ipNode, "disable-arp-filter"),
        ipDisableForwarding: Object.prototype.hasOwnProperty.call(ipNode, "disable-forwarding"),
        ipEnableArpAccept: Object.prototype.hasOwnProperty.call(ipNode, "enable-arp-accept"),
        ipEnableArpAnnounce: Object.prototype.hasOwnProperty.call(ipNode, "enable-arp-announce"),
        ipEnableArpIgnore: Object.prototype.hasOwnProperty.call(ipNode, "enable-arp-ignore"),
        ipEnableDirectedBroadcast: Object.prototype.hasOwnProperty.call(
          ipNode,
          "enable-directed-broadcast",
        ),
        ipEnableProxyArp: Object.prototype.hasOwnProperty.call(ipNode, "enable-proxy-arp"),
        ipProxyArpPvlan: Object.prototype.hasOwnProperty.call(ipNode, "proxy-arp-pvlan"),
        ipSourceValidation: asString(ipNode["source-validation"]),
        ipv6AddressAutoconf: Object.prototype.hasOwnProperty.call(ipv6AddressNode, "autoconf"),
        ipv6AddressEui64: asString(ipv6AddressNode.eui64),
        ipv6AddressNoDefaultLinkLocal: Object.prototype.hasOwnProperty.call(
          ipv6AddressNode,
          "no-default-link-local",
        ),
        ipv6AdjustMssClamp: ipv6AdjustMss.clamp,
        ipv6AdjustMssValue: ipv6AdjustMss.value,
        ipv6DisableForwarding: Object.prototype.hasOwnProperty.call(ipv6Node, "disable-forwarding"),
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
