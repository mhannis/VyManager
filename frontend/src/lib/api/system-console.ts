import { ConfigTreeApi } from "./config-tree";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export interface SerialConsoleDevice {
  name: string;
  speed: string;
}

export interface SystemConsoleConfig {
  devices: SerialConsoleDevice[];
}

class SystemConsoleService {
  private readonly api = new ConfigTreeApi("system-console", "console");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemConsoleConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const devicesRoot = asObject(root.device);
    const devices = Object.keys(devicesRoot)
      .sort((left, right) => left.localeCompare(right))
      .map((name) => {
        const node = asObject(devicesRoot[name]);
        return {
          name,
          speed: asString(node.speed),
        };
      });

    return { devices };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemConsoleService = new SystemConsoleService();

