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

const IPV6_ADDRESS_SPECIAL_KEYS = new Set(["autoconf", "eui64", "no-default-link-local"]);

function parseIpv6AddressEntries(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || IPV6_ADDRESS_SPECIAL_KEYS.has(trimmed)) {
      return [];
    }
    return [trimmed];
  }

  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => String(entry || "").trim())
          .filter((entry) => entry.length > 0 && !IPV6_ADDRESS_SPECIAL_KEYS.has(entry)),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }

  return Object.keys(asObject(value))
    .filter((entry) => !IPV6_ADDRESS_SPECIAL_KEYS.has(entry))
    .sort((left, right) => left.localeCompare(right));
}

function parseIpv6Eui64Prefix(value: unknown): string {
  const scalar = asString(value);
  if (scalar) {
    return scalar;
  }
  return asString(asObject(value).prefix);
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
  ipArpCacheTimeout: string;
  ipDisableArpFilter: boolean;
  ipEnableDirectedBroadcast: boolean;
  ipEnableArpAccept: boolean;
  ipEnableArpAnnounce: boolean;
  ipEnableArpIgnore: boolean;
  ipEnableProxyArp: boolean;
  ipProxyArpPvlan: boolean;
  ipSourceValidation: string;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipv6Addresses: string[];
  ipv6AddressAutoconf: boolean;
  ipv6AddressEui64: string;
  ipv6AddressNoDefaultLinkLocal: boolean;
  ipv6DisableForwarding: boolean;
  ipv6AcceptDad: string;
  ipv6DupAddrDetectTransmits: string;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
  dhcpClientId: string;
  dhcpHostName: string;
  dhcpVendorClassId: string;
  dhcpNoDefaultRoute: boolean;
  dhcpDefaultRouteDistance: string;
  dhcpReject: string[];
  dhcpUserClass: string;
  dhcpv6Duid: string;
  dhcpv6NoRelease: boolean;
  dhcpv6ParametersOnly: boolean;
  dhcpv6RapidCommit: boolean;
  dhcpv6Temporary: boolean;
  dhcpv6PdRows: WwanDhcpv6PdRow[];
}

export interface WwanDhcpv6PdRow {
  id: string;
  length: string;
  delegateInterface: string;
  address: string;
  slaId: string;
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
      const dhcpv6Options = asObject(node["dhcpv6-options"]);
      const ipAdjustMss = parseAdjustMss(ipNode["adjust-mss"]);
      const ipv6AdjustMss = parseAdjustMss(ipv6Node["adjust-mss"]);
      const ipv6AddressNode = asObject(ipv6Node.address);
      const ipv6AddressEntries = parseIpv6AddressEntries(ipv6Node.address);
      const pdRows: WwanDhcpv6PdRow[] = [];
      const pdRoot = asObject(dhcpv6Options.pd);
      for (const pdId of Object.keys(pdRoot).sort((left, right) => left.localeCompare(right))) {
        const pdNode = asObject(pdRoot[pdId]);
        const length = asString(pdNode.length);
        const interfacesNode = asObject(pdNode.interface);
        const delegateNames = Object.keys(interfacesNode).sort((left, right) => left.localeCompare(right));
        if (delegateNames.length === 0) {
          pdRows.push({
            id: pdId,
            length,
            delegateInterface: "",
            address: "",
            slaId: "",
          });
          continue;
        }

        for (const delegateInterface of delegateNames) {
          const delegateNode = asObject(interfacesNode[delegateInterface]);
          pdRows.push({
            id: pdId,
            length,
            delegateInterface,
            address: asString(delegateNode.address),
            slaId: asString(delegateNode["sla-id"]),
          });
        }
      }

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
        ipArpCacheTimeout: asString(ipNode["arp-cache-timeout"]),
        ipDisableArpFilter: Object.prototype.hasOwnProperty.call(ipNode, "disable-arp-filter"),
        ipEnableDirectedBroadcast: Object.prototype.hasOwnProperty.call(ipNode, "enable-directed-broadcast"),
        ipEnableArpAccept: Object.prototype.hasOwnProperty.call(ipNode, "enable-arp-accept"),
        ipEnableArpAnnounce: Object.prototype.hasOwnProperty.call(ipNode, "enable-arp-announce"),
        ipEnableArpIgnore: Object.prototype.hasOwnProperty.call(ipNode, "enable-arp-ignore"),
        ipEnableProxyArp: Object.prototype.hasOwnProperty.call(ipNode, "enable-proxy-arp"),
        ipProxyArpPvlan: Object.prototype.hasOwnProperty.call(ipNode, "proxy-arp-pvlan"),
        ipSourceValidation: asString(ipNode["source-validation"]),
        ipAdjustMssClamp: ipAdjustMss.clamp,
        ipAdjustMssValue: ipAdjustMss.value,
        ipv6Addresses: ipv6AddressEntries,
        ipv6AddressAutoconf: Object.prototype.hasOwnProperty.call(ipv6AddressNode, "autoconf"),
        ipv6AddressEui64: parseIpv6Eui64Prefix(ipv6AddressNode.eui64),
        ipv6AddressNoDefaultLinkLocal: Object.prototype.hasOwnProperty.call(
          ipv6AddressNode,
          "no-default-link-local",
        ),
        ipv6DisableForwarding: Object.prototype.hasOwnProperty.call(ipv6Node, "disable-forwarding"),
        ipv6AcceptDad: asString(ipv6Node["accept-dad"]),
        ipv6DupAddrDetectTransmits: asString(ipv6Node["dup-addr-detect-transmits"]),
        ipv6AdjustMssClamp: ipv6AdjustMss.clamp,
        ipv6AdjustMssValue: ipv6AdjustMss.value,
        dhcpClientId: asString(dhcpOptions["client-id"]),
        dhcpHostName: asString(dhcpOptions["host-name"]),
        dhcpVendorClassId: asString(dhcpOptions["vendor-class-id"]),
        dhcpNoDefaultRoute: Object.prototype.hasOwnProperty.call(dhcpOptions, "no-default-route"),
        dhcpDefaultRouteDistance: asString(dhcpOptions["default-route-distance"]),
        dhcpReject: readTagValues(dhcpOptions.reject),
        dhcpUserClass: asString(dhcpOptions["user-class"]),
        dhcpv6Duid: asString(dhcpv6Options.duid),
        dhcpv6NoRelease: Object.prototype.hasOwnProperty.call(dhcpv6Options, "no-release"),
        dhcpv6ParametersOnly: Object.prototype.hasOwnProperty.call(dhcpv6Options, "parameters-only"),
        dhcpv6RapidCommit: Object.prototype.hasOwnProperty.call(dhcpv6Options, "rapid-commit"),
        dhcpv6Temporary: Object.prototype.hasOwnProperty.call(dhcpv6Options, "temporary"),
        dhcpv6PdRows: pdRows,
      });
    }

    return { interfaces };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const wwanService = new WwanService();
