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

function readBooleanFlag(parent: Record<string, unknown>, token: string): boolean {
  return Object.prototype.hasOwnProperty.call(parent, token);
}

export interface OpenvpnInterfaceConfig {
  name: string;
  description: string;
  addresses: string[];
  mtu: string;
  vrf: string;
  disable: boolean;
  mode: string;
  protocol: string;
  deviceType: string;
  hash: string;
  localAddress: string;
  remoteAddress: string;
  localHost: string;
  localPort: string;
  remoteHost: string;
  remotePort: string;
  keepAliveInterval: string;
  keepAliveFailureCount: string;
  authenticationUsername: string;
  authenticationPassword: string;
  sharedSecretKey: string;
  redirectInterface: string;
  mirrorIngress: string;
  mirrorEgress: string;
  openvpnOptions: string[];
  encryptionCipher: string;
  encryptionDataCiphers: string[];
  encryptionDataCiphersFallback: string;
  tlsAuthKey: string;
  tlsCaCertificate: string;
  tlsCertificate: string;
  tlsPeerFingerprint: string;
  tlsRole: string;
  tlsVersionMin: string;
  persistentTunnel: boolean;
  replaceDefaultRoute: boolean;
  useLzoCompression: boolean;
  offloadDco: boolean;
  tlsCryptKey: boolean;
  tlsDhParams: boolean;
  serverSubnet: string;
  serverTopology: string;
  serverDomainName: string;
  serverMaxConnections: string;
  serverRejectUnconfiguredClient: boolean;
  serverNameServers: string[];
  serverPushRoutes: string[];
  serverClientIpPoolStart: string;
  serverClientIpPoolStop: string;
  serverClientIpPoolSubnet: string;
  serverClientIpv6PoolBase: string;
  serverBridgeDisable: boolean;
  serverBridgeGateway: string;
  serverBridgeStart: string;
  serverBridgeStop: string;
  serverBridgeSubnetMask: string;
}

export interface OpenvpnConfig {
  interfaces: OpenvpnInterfaceConfig[];
}

class OpenvpnInterfaceService {
  private readonly api = new ConfigTreeApi("interface-openvpn", "openvpn");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<OpenvpnConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const interfaces: OpenvpnInterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const auth = asObject(node.authentication);
      const encryption = asObject(node.encryption);
      const tls = asObject(node.tls);
      const keepAlive = asObject(node["keep-alive"]);
      const mirror = asObject(node.mirror);
      const server = asObject(node.server);
      const serverBridge = asObject(server.bridge);
      const serverClientIpPool = asObject(server["client-ip-pool"]);
      const serverClientIpv6Pool = asObject(server["client-ipv6-pool"]);

      interfaces.push({
        name,
        description: asString(node.description),
        addresses: readTagValues(node.address),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: readBooleanFlag(node, "disable"),
        mode: asString(node.mode),
        protocol: asString(node.protocol),
        deviceType: asString(node["device-type"]),
        hash: asString(node.hash),
        localAddress: asString(node["local-address"]),
        remoteAddress: asString(node["remote-address"]),
        localHost: asString(node["local-host"]),
        localPort: asString(node["local-port"]),
        remoteHost: asString(node["remote-host"]),
        remotePort: asString(node["remote-port"]),
        keepAliveInterval: asString(keepAlive.interval),
        keepAliveFailureCount: asString(keepAlive["failure-count"]),
        authenticationUsername: asString(auth.username),
        authenticationPassword: asString(auth.password),
        sharedSecretKey: asString(node["shared-secret-key"]),
        redirectInterface: asString(node.redirect),
        mirrorIngress: asString(mirror.ingress),
        mirrorEgress: asString(mirror.egress),
        openvpnOptions: readTagValues(node["openvpn-option"]),
        encryptionCipher: asString(encryption.cipher),
        encryptionDataCiphers: readTagValues(encryption["data-ciphers"]),
        encryptionDataCiphersFallback: asString(encryption["data-ciphers-fallback"]),
        tlsAuthKey: asString(tls["auth-key"]),
        tlsCaCertificate: asString(tls["ca-certificate"]),
        tlsCertificate: asString(tls.certificate),
        tlsPeerFingerprint: asString(tls["peer-fingerprint"]),
        tlsRole: asString(tls.role),
        tlsVersionMin: asString(tls["tls-version-min"]),
        persistentTunnel: readBooleanFlag(node, "persistent-tunnel"),
        replaceDefaultRoute: readBooleanFlag(node, "replace-default-route"),
        useLzoCompression: readBooleanFlag(node, "use-lzo-compression"),
        offloadDco: readBooleanFlag(asObject(node.offload), "dco"),
        tlsCryptKey: readBooleanFlag(tls, "crypt-key"),
        tlsDhParams: readBooleanFlag(tls, "dh-params"),
        serverSubnet: asString(server.subnet),
        serverTopology: asString(server.topology),
        serverDomainName: asString(server["domain-name"]),
        serverMaxConnections: asString(server["max-connections"]),
        serverRejectUnconfiguredClient: readBooleanFlag(server, "reject-unconfigured-client"),
        serverNameServers: readTagValues(server["name-server"]),
        serverPushRoutes: readTagValues(server["push-route"]),
        serverClientIpPoolStart: asString(serverClientIpPool.start),
        serverClientIpPoolStop: asString(serverClientIpPool.stop),
        serverClientIpPoolSubnet: asString(serverClientIpPool.subnet),
        serverClientIpv6PoolBase: asString(serverClientIpv6Pool.base),
        serverBridgeDisable: readBooleanFlag(serverBridge, "disable"),
        serverBridgeGateway: asString(serverBridge.gateway),
        serverBridgeStart: asString(serverBridge.start),
        serverBridgeStop: asString(serverBridge.stop),
        serverBridgeSubnetMask: asString(serverBridge["subnet-mask"]),
      });
    }

    return { interfaces };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const openvpnInterfaceService = new OpenvpnInterfaceService();
