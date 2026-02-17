import { ConfigTreeApi } from "./config-tree";

export const BONDING_MODE_OPTIONS = [
  "802.3ad",
  "active-backup",
  "balance-alb",
  "balance-rr",
  "balance-tlb",
  "balance-xor",
  "broadcast",
] as const;

export type BondingMode = (typeof BONDING_MODE_OPTIONS)[number];

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
    return value.trim() ? [value.trim()] : [];
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

  const map = asObject(value);
  return Object.keys(map).sort((left, right) => left.localeCompare(right));
}

export interface BondingInterface {
  name: string;
  description: string;
  addresses: string[];
  mtu: string;
  vrf: string;
  mode: string;
  hashPolicy: string;
  lacpRate: string;
  minLinks: string;
  primary: string;
  allMembersActive: boolean;
  disableFlowControl: boolean;
  disableLinkDetect: boolean;
  arpMonitorInterval: string;
  arpMonitorTargets: string[];
  mac: string;
  systemMac: string;
  systemPriority: string;
  disable: boolean;
  members: string[];
}

export interface BondingConfig {
  bonds: BondingInterface[];
}

class BondingService {
  private readonly api = new ConfigTreeApi("bonding", "bonding");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<BondingConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const bonds: BondingInterface[] = [];

    for (const name of Object.keys(root).sort((left, right) => left.localeCompare(right))) {
      const node = asObject(root[name]);
      const memberNode = asObject(node.member);
      const arpMonitorNode = asObject(node["arp-monitor"]);

      bonds.push({
        name,
        description: asString(node.description),
        addresses: readTagValues(node.address),
        mtu: asString(node.mtu),
        vrf: asString(node.vrf),
        mode: asString(node.mode),
        hashPolicy: asString(node["hash-policy"]),
        lacpRate: asString(node["lacp-rate"]),
        minLinks: asString(node["min-links"]),
        primary: asString(node.primary),
        allMembersActive: Object.prototype.hasOwnProperty.call(node, "all-members-active"),
        disableFlowControl: Object.prototype.hasOwnProperty.call(node, "disable-flow-control"),
        disableLinkDetect: Object.prototype.hasOwnProperty.call(node, "disable-link-detect"),
        arpMonitorInterval: asString(arpMonitorNode.interval),
        arpMonitorTargets: readTagValues(arpMonitorNode.target),
        mac: asString(node.mac),
        systemMac: asString(node["system-mac"]),
        systemPriority: asString(node["system-priority"]),
        disable: Object.prototype.hasOwnProperty.call(node, "disable"),
        members: readTagValues(memberNode.interface),
      });
    }

    return { bonds };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const bondingService = new BondingService();
