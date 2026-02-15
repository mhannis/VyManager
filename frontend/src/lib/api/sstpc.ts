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
  if (rawString) {
    return { clamp: false, value: rawString };
  }

  const node = asObject(value);
  if (Object.prototype.hasOwnProperty.call(node, "clamp-mss-to-pmtu")) {
    return { clamp: true, value: "" };
  }

  return { clamp: false, value: "" };
}

export interface SstpcInterfaceConfig {
  name: string;
  description: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  server: string;
  username: string;
  password: string;
  noDefaultRoute: boolean;
  defaultRouteDistance: string;
  noPeerDns: boolean;
  ipDisableForwarding: boolean;
  ipSourceValidation: string;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
}

export interface SstpcConfig {
  interfaces: SstpcInterfaceConfig[];
}

class SstpcService {
  private readonly api = new ConfigTreeApi("sstpc", "sstpc");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SstpcConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const interfaces: SstpcInterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const ipNode = asObject(node.ip);
      const auth = asObject(node.authentication);
      const adjustMss = parseAdjustMss(ipNode["adjust-mss"]);
      interfaces.push({
        name,
        description: asString(node.description),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        server: asString(node.server),
        username: asString(node.username || auth.username),
        password: asString(node.password || auth.password),
        noDefaultRoute: Object.prototype.hasOwnProperty.call(node, "no-default-route"),
        defaultRouteDistance: asString(node["default-route-distance"]),
        noPeerDns: Object.prototype.hasOwnProperty.call(node, "no-peer-dns"),
        ipDisableForwarding: Object.prototype.hasOwnProperty.call(ipNode, "disable-forwarding"),
        ipSourceValidation: asString(ipNode["source-validation"]),
        ipAdjustMssClamp: adjustMss.clamp,
        ipAdjustMssValue: adjustMss.value,
      });
    }

    return { interfaces };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const sstpcService = new SstpcService();
