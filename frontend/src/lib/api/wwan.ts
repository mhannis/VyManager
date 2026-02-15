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

export interface WwanInterfaceConfig {
  name: string;
  description: string;
  addresses: string[];
  mtu: string;
  vrf: string;
  disable: boolean;
  disableLinkDetect: boolean;
  apn: string;
  ipDisableForwarding: boolean;
  ipSourceValidation: string;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipv6Addresses: string[];
  ipv6DisableForwarding: boolean;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
  dhcpClientId: string;
  dhcpHostName: string;
  dhcpVendorClassId: string;
  dhcpNoDefaultRoute: boolean;
  dhcpDefaultRouteDistance: string;
}

export interface WwanConfig {
  interfaces: WwanInterfaceConfig[];
}

class WwanService {
  private readonly api = new ConfigTreeApi("wwan-interface", "wwan");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<WwanConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const interfaces: WwanInterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const ipNode = asObject(node.ip);
      const ipv6Node = asObject(node.ipv6);
      const dhcpOptions = asObject(node["dhcp-options"]);
      const ipAdjustMss = parseAdjustMss(ipNode["adjust-mss"]);
      const ipv6AdjustMss = parseAdjustMss(ipv6Node["adjust-mss"]);

      interfaces.push({
        name,
        description: asString(node.description),
        addresses: readTagValues(node.address),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        disableLinkDetect: Object.prototype.hasOwnProperty.call(node, "disable-link-detect"),
        apn: asString(node.apn),
        ipDisableForwarding: Object.prototype.hasOwnProperty.call(ipNode, "disable-forwarding"),
        ipSourceValidation: asString(ipNode["source-validation"]),
        ipAdjustMssClamp: ipAdjustMss.clamp,
        ipAdjustMssValue: ipAdjustMss.value,
        ipv6Addresses: readTagValues(ipv6Node.address),
        ipv6DisableForwarding: Object.prototype.hasOwnProperty.call(ipv6Node, "disable-forwarding"),
        ipv6AdjustMssClamp: ipv6AdjustMss.clamp,
        ipv6AdjustMssValue: ipv6AdjustMss.value,
        dhcpClientId: asString(dhcpOptions["client-id"]),
        dhcpHostName: asString(dhcpOptions["host-name"]),
        dhcpVendorClassId: asString(dhcpOptions["vendor-class-id"]),
        dhcpNoDefaultRoute: Object.prototype.hasOwnProperty.call(dhcpOptions, "no-default-route"),
        dhcpDefaultRouteDistance: asString(dhcpOptions["default-route-distance"]),
      });
    }

    return { interfaces };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const wwanService = new WwanService();
