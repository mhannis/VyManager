import { ConfigTreeApi } from "./config-tree";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export interface SystemLcdConfig {
  device: string;
  model: string;
}

class SystemLcdService {
  private readonly api = new ConfigTreeApi("system-lcd", "lcd");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemLcdConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    return {
      device: asString(root.device),
      model: asString(root.model),
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemLcdService = new SystemLcdService();
