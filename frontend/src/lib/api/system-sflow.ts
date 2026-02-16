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

export interface SflowServerEntry {
  address: string;
  port: string;
}

export interface SystemSflowConfig {
  agentAddress: string;
  agentInterface: string;
  dropMonitorLimit: string;
  enableEgress: boolean;
  interfaces: string[];
  polling: string;
  samplingRate: string;
  servers: SflowServerEntry[];
}

class SystemSflowService {
  private readonly api = new ConfigTreeApi("system-sflow", "sflow");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemSflowConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const serverRoot = asObject(root.server);
    const servers = Object.keys(serverRoot)
      .sort((left, right) => left.localeCompare(right))
      .map((address) => {
        const node = asObject(serverRoot[address]);
        return {
          address,
          port: asString(node.port),
        };
      });

    return {
      agentAddress: asString(root["agent-address"]),
      agentInterface: asString(root["agent-interface"]),
      dropMonitorLimit: asString(root["drop-monitor-limit"]),
      enableEgress: Object.prototype.hasOwnProperty.call(root, "enable-egress"),
      interfaces: readTagValues(root.interface),
      polling: asString(root.polling),
      samplingRate: asString(root["sampling-rate"]),
      servers,
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemSflowService = new SystemSflowService();
