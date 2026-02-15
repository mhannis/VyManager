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

export interface MacsecStaticPeer {
  name: string;
  mac: string;
  key: string;
  disable: boolean;
}

export interface MacsecInterfaceConfig {
  name: string;
  description: string;
  addresses: string[];
  mtu: string;
  vrf: string;
  disable: boolean;
  sourceInterface: string;
  mac: string;
  disableFlowControl: boolean;
  disableLinkDetect: boolean;
  securityCipher: string;
  securityEncrypt: boolean;
  securityReplayWindow: string;
  securityStaticKey: string;
  securityMkaCak: string;
  securityMkaCkn: string;
  securityMkaPriority: string;
  staticPeers: MacsecStaticPeer[];
}

export interface MacsecConfig {
  interfaces: MacsecInterfaceConfig[];
}

class MacsecService {
  private readonly api = new ConfigTreeApi("macsec", "macsec");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<MacsecConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const interfaces: MacsecInterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const security = asObject(node.security);
      const mka = asObject(security.mka);
      const staticSecurity = asObject(security.static);
      const peerRoot = asObject(staticSecurity.peer);

      const staticPeers: MacsecStaticPeer[] = Object.keys(peerRoot)
        .sort((left, right) => left.localeCompare(right))
        .map((peerName) => {
          const peerNode = asObject(peerRoot[peerName]);
          return {
            name: peerName,
            mac: asString(peerNode.mac),
            key: asString(peerNode.key),
            disable: Object.prototype.hasOwnProperty.call(peerNode, "disable"),
          };
        });

      interfaces.push({
        name,
        description: asString(node.description),
        addresses: readTagValues(node.address),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        sourceInterface: asString(node["source-interface"]),
        mac: asString(node.mac),
        disableFlowControl: Object.prototype.hasOwnProperty.call(node, "disable-flow-control"),
        disableLinkDetect: Object.prototype.hasOwnProperty.call(node, "disable-link-detect"),
        securityCipher: asString(security.cipher),
        securityEncrypt: Object.prototype.hasOwnProperty.call(security, "encrypt"),
        securityReplayWindow: asString(security["replay-window"]),
        securityStaticKey: asString(staticSecurity.key),
        securityMkaCak: asString(mka.cak),
        securityMkaCkn: asString(mka.ckn),
        securityMkaPriority: asString(mka.priority),
        staticPeers,
      });
    }

    return { interfaces };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const macsecService = new MacsecService();

