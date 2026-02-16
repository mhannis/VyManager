import { apiClient } from "./client";

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

function parseMgmtFrameProtection(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const node = asObject(value);
  const keys = Object.keys(node);
  if (keys.length > 0) return keys[0];
  return "";
}

export interface WirelessRadiusServer {
  host: string;
  key: string;
  port: string;
}

export interface WirelessInterfaceConfig {
  name: string;
  description: string;
  addresses: string[];
  mtu: string;
  vrf: string;
  disable: boolean;
  channel: string;
  ssid: string;
  type: string;
  mode: string;
  physicalDevice: string;
  maxStations: string;
  reduceTransmitPower: string;
  mgmtFrameProtection: string;
  disableBroadcastSsid: boolean;
  expungeFailingStations: boolean;
  isolateStations: boolean;
  enableBfProtection: boolean;
  perClientThread: boolean;
  wpaMode: string;
  wpaPassphrase: string;
  wpaCiphers: string[];
  wpaRadiusServers: WirelessRadiusServer[];
  capRequireHt: boolean;
  capRequireVht: boolean;
  capRequireHe: boolean;
  capHt40MhzIncapable: boolean;
  capHtAutoPowersave: boolean;
  capHtDsssCck40: boolean;
  capHtGreenfield: boolean;
  capHtLdpc: boolean;
  capHtLsigProtection: boolean;
  capHtStbcTx: boolean;
  capHtChannelSetWidth: string[];
  capHtShortGi: string[];
  capHtSmps: string;
  capHtStbcRx: string;
  capVhtAntennaCount: string;
  capVhtCenterChannelFreq1: string;
  capVhtCenterChannelFreq2: string;
  capVhtChannelSetWidth: string;
  capVhtLinkAdaptation: string;
  capVhtMaxMpduExp: string;
  capVhtMaxAmpduExp: string;
  capVhtShortGi: string[];
  capVhtBeamformSingleUserBeamformer: boolean;
  capVhtBeamformSingleUserBeamformee: boolean;
  capVhtBeamformMultiUserBeamformer: boolean;
  capVhtBeamformMultiUserBeamformee: boolean;
}

export interface WirelessConfig {
  interfaces: WirelessInterfaceConfig[];
  countryCode: string;
}

class WirelessService {
  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return apiClient.get<Record<string, unknown>>("/vyos/wireless-interface/config", {
      refresh: String(refresh),
    });
  }

  async getConfig(refresh = false): Promise<WirelessConfig> {
    const payload = asObject(await this.getRawConfig(refresh));
    const root = asObject(payload.wireless);
    const interfaces: WirelessInterfaceConfig[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const security = asObject(node.security);
      const wpa = asObject(security.wpa);
      const radius = asObject(asObject(wpa.radius).server);
      const capabilities = asObject(node.capabilities);
      const ht = asObject(capabilities.ht);
      const capHtStbc = asObject(ht.stbc);
      const vht = asObject(capabilities.vht);
      const vhtBeamform = asObject(vht.beamform);

      const radiusServers: WirelessRadiusServer[] = Object.keys(radius)
        .sort((left, right) => left.localeCompare(right))
        .map((host) => {
          const serverNode = asObject(radius[host]);
          return {
            host,
            key: asString(serverNode.key),
            port: asString(serverNode.port),
          };
        });

      interfaces.push({
        name,
        description: asString(node.description),
        addresses: readTagValues(node.address),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        channel: asString(node.channel),
        ssid: asString(node.ssid),
        type: asString(node.type),
        mode: asString(node.mode),
        physicalDevice: asString(node["physical-device"]),
        maxStations: asString(node["max-stations"]),
        reduceTransmitPower: asString(node["reduce-transmit-power"]),
        mgmtFrameProtection: parseMgmtFrameProtection(node["mgmt-frame-protection"]),
        disableBroadcastSsid: Object.prototype.hasOwnProperty.call(node, "disable-broadcast-ssid"),
        expungeFailingStations: Object.prototype.hasOwnProperty.call(node, "expunge-failing-stations"),
        isolateStations: Object.prototype.hasOwnProperty.call(node, "isolate-stations"),
        enableBfProtection: Object.prototype.hasOwnProperty.call(node, "enable-bf-protection"),
        perClientThread: Object.prototype.hasOwnProperty.call(node, "per-client-thread"),
        wpaMode: asString(wpa.mode),
        wpaPassphrase: asString(wpa.passphrase),
        wpaCiphers: readTagValues(wpa.cipher),
        wpaRadiusServers: radiusServers,
        capRequireHt: Object.prototype.hasOwnProperty.call(capabilities, "require-ht"),
        capRequireVht: Object.prototype.hasOwnProperty.call(capabilities, "require-vht"),
        capRequireHe: Object.prototype.hasOwnProperty.call(capabilities, "require-he"),
        capHt40MhzIncapable: Object.prototype.hasOwnProperty.call(ht, "40mhz-incapable"),
        capHtAutoPowersave: Object.prototype.hasOwnProperty.call(ht, "auto-powersave"),
        capHtDsssCck40: Object.prototype.hasOwnProperty.call(ht, "dsss-cck-40"),
        capHtGreenfield: Object.prototype.hasOwnProperty.call(ht, "greenfield"),
        capHtLdpc: Object.prototype.hasOwnProperty.call(ht, "ldpc"),
        capHtLsigProtection: Object.prototype.hasOwnProperty.call(ht, "lsig-protection"),
        capHtStbcTx: Object.prototype.hasOwnProperty.call(capHtStbc, "tx"),
        capHtChannelSetWidth: readTagValues(ht["channel-set-width"]),
        capHtShortGi: readTagValues(ht["short-gi"]),
        capHtSmps: asString(ht.smps),
        capHtStbcRx: asString(capHtStbc.rx),
        capVhtAntennaCount: asString(vht["antenna-count"]),
        capVhtCenterChannelFreq1: asString(vht["center-channel-freq-1"]),
        capVhtCenterChannelFreq2: asString(vht["center-channel-freq-2"]),
        capVhtChannelSetWidth: asString(vht["channel-set-width"]),
        capVhtLinkAdaptation: asString(vht["link-adaptation"]),
        capVhtMaxMpduExp: asString(vht["max-mpdu-exp"]),
        capVhtMaxAmpduExp: asString(vht["max-a-mpdu-exp"]),
        capVhtShortGi: readTagValues(vht["short-gi"]),
        capVhtBeamformSingleUserBeamformer: Object.prototype.hasOwnProperty.call(
          vhtBeamform,
          "single-user-beamformer",
        ),
        capVhtBeamformSingleUserBeamformee: Object.prototype.hasOwnProperty.call(
          vhtBeamform,
          "single-user-beamformee",
        ),
        capVhtBeamformMultiUserBeamformer: Object.prototype.hasOwnProperty.call(
          vhtBeamform,
          "multi-user-beamformer",
        ),
        capVhtBeamformMultiUserBeamformee: Object.prototype.hasOwnProperty.call(
          vhtBeamform,
          "multi-user-beamformee",
        ),
      });
    }

    return {
      interfaces,
      countryCode: asString(payload.country_code),
    };
  }

  async batchConfigure(operations: string[]) {
    return apiClient.post<{ success: boolean; data?: unknown; error?: string | null }>(
      "/vyos/wireless-interface/batch",
      { operations },
    );
  }
}

export const wirelessService = new WirelessService();
