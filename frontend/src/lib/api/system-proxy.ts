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

export interface SystemProxyConfig {
  url: string;
  port: string;
  username: string;
  password: string;
  noProxy: string[];
}

class SystemProxyService {
  private readonly api = new ConfigTreeApi("system-proxy", "proxy");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemProxyConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    return {
      url: asString(root.url),
      port: asString(root.port),
      username: asString(root.username),
      password: asString(root.password),
      noProxy: readTagValues(root["no-proxy"]),
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemProxyService = new SystemProxyService();

