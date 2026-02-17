import { ConfigTreeApi } from "./config-tree";
import { apiClient } from "./client";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export interface SystemUpdateCheckConfig {
  autoCheck: boolean;
  url: string;
}

export interface SystemUpdateCheckStatus {
  available: boolean;
  checked_at: string;
  command_used: string | null;
  current_version: string | null;
  update_available: boolean | null;
  update_version: string | null;
  update_url: string | null;
  summary: string | null;
  raw_output: string | null;
  warnings: string[];
}

class SystemUpdateCheckService {
  private readonly api = new ConfigTreeApi("system-update-check", "update_check");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemUpdateCheckConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    return {
      autoCheck: Object.prototype.hasOwnProperty.call(root, "auto-check"),
      url: asString(root.url),
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }

  async getStatus(refresh: boolean = false): Promise<SystemUpdateCheckStatus> {
    return apiClient.get<SystemUpdateCheckStatus>("/vyos/system-update-check/status", {
      refresh: refresh.toString(),
    });
  }
}

export const systemUpdateCheckService = new SystemUpdateCheckService();
