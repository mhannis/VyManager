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

function isRouteNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { status?: unknown; message?: unknown };
  const status = typeof maybe.status === "number" ? maybe.status : null;
  const message =
    typeof maybe.message === "string" ? maybe.message.trim().toLowerCase() : "";
  return status === 404 && (message === "not found" || message === "404 not found");
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
    try {
      return await apiClient.get<SystemUpdateCheckStatus>("/vyos/system-update-check/status", {
        refresh: refresh.toString(),
      });
    } catch (error) {
      if (!isRouteNotFoundError(error)) {
        throw error;
      }

      return {
        available: false,
        checked_at: new Date().toISOString(),
        command_used: null,
        current_version: null,
        update_available: null,
        update_version: null,
        update_url: null,
        summary: "Runtime update status endpoint is unavailable on this backend build.",
        raw_output: null,
        warnings: [
          "Backend route /vyos/system-update-check/status returned Not Found. Restart vm-api on the latest build.",
        ],
      };
    }
  }
}

export const systemUpdateCheckService = new SystemUpdateCheckService();
