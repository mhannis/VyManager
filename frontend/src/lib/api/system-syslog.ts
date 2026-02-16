import { ConfigTreeApi } from "./config-tree";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
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
      new Set(value.map((entry) => String(entry || "").trim()).filter((entry) => entry.length > 0)),
    ).sort((left, right) => left.localeCompare(right));
  }
  return Object.keys(asObject(value)).sort((left, right) => left.localeCompare(right));
}

export interface SyslogFacilityRule {
  facility: string;
  level: string;
}

export interface SyslogFileRule extends SyslogFacilityRule {
  file: string;
}

export interface SyslogRemoteRule extends SyslogFacilityRule {
  address: string;
  protocol: "udp" | "tcp";
  port: string;
  vrf: string;
  sourceAddress: string;
  includeTimezone: boolean;
  octetCounted: boolean;
  tls: boolean;
  tlsCaCertificate: string;
  tlsCertificate: string;
  tlsAuthMode: string;
  tlsPermittedPeers: string;
}

export interface SystemSyslogConfig {
  markerDisabled: boolean;
  markerInterval: string;
  preserveFqdn: boolean;
  sourceAddress: string;
  consoleRules: SyslogFacilityRule[];
  fileRules: SyslogFileRule[];
  remoteRules: SyslogRemoteRule[];
  remoteNodeType: "remote" | "host";
}

function parseFacilityRules(node: Record<string, unknown>): SyslogFacilityRule[] {
  const facilityRoot = asObject(node.facility);
  return Object.keys(facilityRoot)
    .sort((left, right) => left.localeCompare(right))
    .map((facility) => {
      const facilityNode = asObject(facilityRoot[facility]);
      return {
        facility,
        level: asString(facilityNode.level),
      };
    });
}

function parseConsoleRules(root: Record<string, unknown>): SyslogFacilityRule[] {
  return parseFacilityRules(asObject(root.console));
}

function parseFileRules(root: Record<string, unknown>): SyslogFileRule[] {
  const fileRoot = asObject(root.file);
  const rows: SyslogFileRule[] = [];
  for (const file of Object.keys(fileRoot).sort((left, right) => left.localeCompare(right))) {
    const fileNode = asObject(fileRoot[file]);
    const facilities = parseFacilityRules(fileNode);
    if (facilities.length === 0) {
      rows.push({ file, facility: "", level: "" });
      continue;
    }
    for (const facility of facilities) {
      rows.push({
        file,
        facility: facility.facility,
        level: facility.level,
      });
    }
  }
  return rows;
}

function parseRemoteRules(
  root: Record<string, unknown>,
): { rules: SyslogRemoteRule[]; nodeType: "remote" | "host" } {
  const remoteRoot = asObject(root.remote);
  const hostRoot = asObject(root.host);
  const nodeType: "remote" | "host" =
    Object.keys(remoteRoot).length > 0 || Object.keys(hostRoot).length === 0 ? "remote" : "host";
  const targetRoot = nodeType === "remote" ? remoteRoot : hostRoot;

  const rows: SyslogRemoteRule[] = [];
  for (const address of Object.keys(targetRoot).sort((left, right) => left.localeCompare(right))) {
    const node = asObject(targetRoot[address]);
    const formatRoot = asObject(node.format);
    const tlsRaw = node.tls;
    const tlsRoot = asObject(tlsRaw);
    const facilities = parseFacilityRules(node);

    const protocol: "udp" | "tcp" = asString(node.protocol).toLowerCase() === "tcp" ? "tcp" : "udp";
    const base = {
      address,
      protocol,
      port: asString(node.port),
      vrf: asString(node.vrf),
      sourceAddress: asString(node["source-address"]),
      includeTimezone: Object.prototype.hasOwnProperty.call(formatRoot, "include-timezone"),
      octetCounted: Object.prototype.hasOwnProperty.call(formatRoot, "octet-counted"),
      tls: tlsRaw !== null && tlsRaw !== undefined,
      tlsCaCertificate: asString(tlsRoot["ca-certificate"]),
      tlsCertificate: asString(tlsRoot.certificate),
      tlsAuthMode: asString(tlsRoot["auth-mode"]),
      tlsPermittedPeers: readTagValues(tlsRoot["permitted-peer"]).join(", "),
    };

    if (facilities.length === 0) {
      rows.push({ ...base, facility: "", level: "" });
      continue;
    }

    for (const facility of facilities) {
      rows.push({
        ...base,
        facility: facility.facility,
        level: facility.level,
      });
    }
  }

  return { rules: rows, nodeType };
}

class SystemSyslogService {
  private readonly api = new ConfigTreeApi("system-syslog", "syslog");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemSyslogConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const markerRoot = asObject(root.marker);
    const remote = parseRemoteRules(root);
    return {
      markerDisabled: Object.prototype.hasOwnProperty.call(markerRoot, "disable"),
      markerInterval: asString(markerRoot.interval),
      preserveFqdn: Object.prototype.hasOwnProperty.call(root, "preserve-fqdn"),
      sourceAddress: asString(root["source-address"]),
      consoleRules: parseConsoleRules(root),
      fileRules: parseFileRules(root),
      remoteRules: remote.rules,
      remoteNodeType: remote.nodeType,
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemSyslogService = new SystemSyslogService();
