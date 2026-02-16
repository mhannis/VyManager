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
      new Set(
        value
          .map((entry) => String(entry || "").trim())
          .filter((entry) => entry.length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }

  return Object.keys(asObject(value)).sort((left, right) => left.localeCompare(right));
}

export interface SystemWatchdogConfig {
  enabled: boolean;
  module: string;
  timeout: string;
  shutdownTimeout: string;
  rebootTimeout: string;
  pingTargets: string[];
  startupDelay: string;
  testInterval: string;
}

class SystemWatchdogService {
  private readonly api = new ConfigTreeApi("system-watchdog", "watchdog");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemWatchdogConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    return {
      enabled: Object.keys(root).length > 0,
      module: asString(root.module),
      timeout: asString(root.timeout),
      shutdownTimeout: asString(root["shutdown-timeout"]),
      rebootTimeout: asString(root["reboot-timeout"]),
      pingTargets: readTagValues(root.ping),
      startupDelay: asString(root["startup-delay"]),
      testInterval: asString(root["test-interval"]),
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemWatchdogService = new SystemWatchdogService();
