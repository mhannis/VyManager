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

export interface VirtualEthernetVifConfig {
  id: string;
  description: string;
  addresses: string[];
  mtu: string;
  mac: string;
  disable: boolean;
  disableLinkDetect: boolean;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipArpCacheTimeout: string;
  ipDisableArpFilter: boolean;
  ipDisableForwarding: boolean;
  ipEnableArpAccept: boolean;
  ipEnableArpAnnounce: boolean;
  ipEnableDirectedBroadcast: boolean;
}

export interface VirtualEthernetInterfaceConfig {
  name: string;
  description: string;
  peerName: string;
  addresses: string[];
  mtu: string;
  vrf: string;
  disable: boolean;
  vifs: VirtualEthernetVifConfig[];
}

export interface VirtualEthernetConfig {
  interfaces: VirtualEthernetInterfaceConfig[];
}

class VirtualEthernetService {
  private readonly api = new ConfigTreeApi("virtual-ethernet", "virtual_ethernet");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<VirtualEthernetConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const interfaces: VirtualEthernetInterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const vifRoot = asObject(node.vif);
      const vifs: VirtualEthernetVifConfig[] = Object.keys(vifRoot)
        .sort((left, right) => {
          const leftNumber = Number(left);
          const rightNumber = Number(right);
          if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
            return leftNumber - rightNumber;
          }
          return left.localeCompare(right);
        })
        .map((id) => {
          const vifNode = asObject(vifRoot[id]);
          const ipNode = asObject(vifNode.ip);
          const ipAdjustMss = parseAdjustMss(ipNode["adjust-mss"]);

          return {
            id,
            description: asString(vifNode.description),
            addresses: readTagValues(vifNode.address),
            mtu: asString(vifNode.mtu),
            mac: asString(vifNode.mac),
            disable: Object.prototype.hasOwnProperty.call(vifNode, "disable"),
            disableLinkDetect: Object.prototype.hasOwnProperty.call(vifNode, "disable-link-detect"),
            ipAdjustMssClamp: ipAdjustMss.clamp,
            ipAdjustMssValue: ipAdjustMss.value,
            ipArpCacheTimeout: asString(ipNode["arp-cache-timeout"]),
            ipDisableArpFilter: Object.prototype.hasOwnProperty.call(ipNode, "disable-arp-filter"),
            ipDisableForwarding: Object.prototype.hasOwnProperty.call(ipNode, "disable-forwarding"),
            ipEnableArpAccept: Object.prototype.hasOwnProperty.call(ipNode, "enable-arp-accept"),
            ipEnableArpAnnounce: Object.prototype.hasOwnProperty.call(ipNode, "enable-arp-announce"),
            ipEnableDirectedBroadcast: Object.prototype.hasOwnProperty.call(
              ipNode,
              "enable-directed-broadcast",
            ),
          };
        });

      interfaces.push({
        name,
        description: asString(node.description),
        peerName: asString(node["peer-name"]),
        addresses: readTagValues(node.address),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        vifs,
      });
    }

    return { interfaces };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const virtualEthernetService = new VirtualEthernetService();
