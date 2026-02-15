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

export interface NetflowServerConfig {
  address: string;
  port: string;
}

export interface SystemFlowAccountingConfig {
  interfaces: string[];
  disableImt: boolean;
  enableEgress: boolean;
  bufferSize: string;
  syslogFacility: string;
  netflowVersion: string;
  netflowEngineId: string;
  netflowSourceIp: string;
  netflowSamplingRate: string;
  netflowMaxFlows: string;
  netflowExpiryInterval: string;
  netflowServers: NetflowServerConfig[];
  sflowAgentAddress: string;
  sflowSamplingRate: string;
  sflowServers: string[];
}

class SystemFlowAccountingService {
  private readonly api = new ConfigTreeApi("system-flow-accounting", "flow_accounting");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemFlowAccountingConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const netflow = asObject(root.netflow);
    const netflowTimeout = asObject(netflow.timeout);
    const netflowServerRoot = asObject(netflow.server);
    const sflow = asObject(root.sflow);

    const netflowServers: NetflowServerConfig[] = Object.keys(netflowServerRoot)
      .sort((left, right) => left.localeCompare(right))
      .map((address) => {
        const node = asObject(netflowServerRoot[address]);
        return {
          address,
          port: asString(node.port),
        };
      });

    return {
      interfaces: readTagValues(root.interface),
      disableImt: Object.prototype.hasOwnProperty.call(root, "disable-imt"),
      enableEgress: Object.prototype.hasOwnProperty.call(root, "enable-egress"),
      bufferSize: asString(root["buffer-size"]),
      syslogFacility: asString(root["syslog-facility"]),
      netflowVersion: asString(netflow.version),
      netflowEngineId: asString(netflow["engine-id"]),
      netflowSourceIp: asString(netflow["source-ip"]),
      netflowSamplingRate: asString(netflow["sampling-rate"]),
      netflowMaxFlows: asString(netflow["max-flows"]),
      netflowExpiryInterval: asString(netflowTimeout["expiry-interval"]),
      netflowServers,
      sflowAgentAddress: asString(sflow["agent-address"]),
      sflowSamplingRate: asString(sflow["sampling-rate"]),
      sflowServers: readTagValues(sflow.server),
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemFlowAccountingService = new SystemFlowAccountingService();

