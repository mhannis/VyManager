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

export interface SystemConntrackConfig {
  tableSize: string;
  expectTableSize: string;
  hashSize: string;
  modules: string[];
  tcpHalfOpenConnections: string;
  tcpLoose: string;
  tcpMaxRetrans: string;
}

class SystemConntrackService {
  private readonly api = new ConfigTreeApi("system-conntrack", "conntrack");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemConntrackConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const tcp = asObject(root.tcp);

    return {
      tableSize: asString(root["table-size"]),
      expectTableSize: asString(root["expect-table-size"]),
      hashSize: asString(root["hash-size"]),
      modules: readTagValues(root.modules),
      tcpHalfOpenConnections: asString(tcp["half-open-connections"]),
      tcpLoose: asString(tcp.loose),
      tcpMaxRetrans: asString(tcp["max-retrans"]),
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemConntrackService = new SystemConntrackService();

