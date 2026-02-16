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

function parseAdjustMss(value: unknown): { clamp: boolean; value: string } {
  const rawString = asString(value);
  if (rawString) return { clamp: false, value: rawString };

  const node = asObject(value);
  if (Object.prototype.hasOwnProperty.call(node, "clamp-mss-to-pmtu")) {
    return { clamp: true, value: "" };
  }

  return { clamp: false, value: "" };
}

export interface PppoeDhcpv6PdRow {
  id: string;
  length: string;
  delegateInterface: string;
  address: string;
  slaId: string;
}

export interface PppoeInterfaceConfig {
  name: string;
  description: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  sourceInterface: string;
  accessConcentrator: string;
  serviceName: string;
  connectOnDemand: boolean;
  noDefaultRoute: boolean;
  defaultRouteDistance: string;
  mru: string;
  idleTimeout: string;
  holdoff: string;
  localAddress: string;
  remoteAddress: string;
  noPeerDns: boolean;
  authenticationUsername: string;
  authenticationPassword: string;
  ipDisableForwarding: boolean;
  ipSourceValidation: string;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipv6AddressAutoconf: boolean;
  ipv6DisableForwarding: boolean;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
  dhcpv6PdRows: PppoeDhcpv6PdRow[];
}

export interface PppoeConfig {
  interfaces: PppoeInterfaceConfig[];
}

class PppoeService {
  private readonly api = new ConfigTreeApi("pppoe-interface", "pppoe");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<PppoeConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const interfaces: PppoeInterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const authentication = asObject(node.authentication);
      const ipNode = asObject(node.ip);
      const ipv6Node = asObject(node.ipv6);
      const ipv6AddressNode = asObject(ipv6Node.address);
      const ipv6AddressScalar = asString(ipv6Node.address);
      const dhcpv6Options = asObject(node["dhcpv6-options"]);
      const ipAdjustMss = parseAdjustMss(ipNode["adjust-mss"]);
      const ipv6AdjustMss = parseAdjustMss(ipv6Node["adjust-mss"]);
      const pdRows: PppoeDhcpv6PdRow[] = [];
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
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        sourceInterface: asString(node["source-interface"]),
        accessConcentrator: asString(node["access-concentrator"]),
        serviceName: asString(node["service-name"]),
        connectOnDemand: Object.prototype.hasOwnProperty.call(node, "connect-on-demand"),
        noDefaultRoute: Object.prototype.hasOwnProperty.call(node, "no-default-route"),
        defaultRouteDistance: asString(node["default-route-distance"]),
        mru: asString(node.mru),
        idleTimeout: asString(node["idle-timeout"]),
        holdoff: asString(node.holdoff),
        localAddress: asString(node["local-address"]),
        remoteAddress: asString(node["remote-address"]),
        noPeerDns: Object.prototype.hasOwnProperty.call(node, "no-peer-dns"),
        authenticationUsername: asString(authentication.username),
        authenticationPassword: asString(authentication.password),
        ipDisableForwarding: Object.prototype.hasOwnProperty.call(ipNode, "disable-forwarding"),
        ipSourceValidation: asString(ipNode["source-validation"]),
        ipAdjustMssClamp: ipAdjustMss.clamp,
        ipAdjustMssValue: ipAdjustMss.value,
        ipv6AddressAutoconf:
          ipv6AddressScalar === "autoconf" ||
          Object.prototype.hasOwnProperty.call(ipv6AddressNode, "autoconf"),
        ipv6DisableForwarding: Object.prototype.hasOwnProperty.call(ipv6Node, "disable-forwarding"),
        ipv6AdjustMssClamp: ipv6AdjustMss.clamp,
        ipv6AdjustMssValue: ipv6AdjustMss.value,
        dhcpv6PdRows: pdRows,
      });
    }

    return { interfaces };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const pppoeService = new PppoeService();
