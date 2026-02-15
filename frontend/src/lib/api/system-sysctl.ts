import { ConfigTreeApi } from "./config-tree";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export interface SysctlParameter {
  key: string;
  value: string;
}

export interface SystemSysctlConfig {
  parameters: SysctlParameter[];
}

class SystemSysctlService {
  private readonly api = new ConfigTreeApi("system-sysctl", "sysctl");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemSysctlConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const parameterRoot = asObject(root.parameter);

    const parameters: SysctlParameter[] = Object.keys(parameterRoot)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => {
        const node = parameterRoot[key];
        if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
          return { key, value: asString(node) };
        }
        return { key, value: asString(asObject(node).value) };
      });

    return { parameters };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemSysctlService = new SystemSysctlService();

