import { ConfigTreeApi } from "./config-tree";

export interface CgnatPoolRange {
  range: string;
  seq: string | null;
}

export interface CgnatExternalPool {
  name: string;
  external_port_ranges: string[];
  per_user_limit_port: string | null;
  ranges: CgnatPoolRange[];
}

export interface CgnatInternalPool {
  name: string;
  ranges: string[];
}

export interface CgnatRule {
  rule_id: string;
  source_pool: string;
  translation_pool: string;
}

export interface CgnatConfig {
  enabled: boolean;
  log_allocation: boolean;
  external_pools: CgnatExternalPool[];
  internal_pools: CgnatInternalPool[];
  rules: CgnatRule[];
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function extractTags(value: unknown): string[] {
  const root = asObject(value);
  return Object.keys(root)
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

class NatCgnatService {
  private readonly api = new ConfigTreeApi("nat", "nat");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<CgnatConfig> {
    const root = await this.getRawConfig(refresh);
    const cgnatRoot = asObject(root.cgnat);
    const poolRoot = asObject(cgnatRoot.pool);

    const externalPools: CgnatExternalPool[] = Object.entries(asObject(poolRoot.external))
      .map(([name, value]) => {
        const config = asObject(value);
        const ranges = Object.entries(asObject(config.range)).map(([range, rangeConfig]) => ({
          range,
          seq: asString(asObject(rangeConfig).seq) || null,
        }));
        ranges.sort((left, right) => left.range.localeCompare(right.range, undefined, { numeric: true }));

        return {
          name,
          external_port_ranges: extractTags(config["external-port-range"]),
          per_user_limit_port: asString(asObject(config["per-user-limit"]).port) || null,
          ranges,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

    const internalPools: CgnatInternalPool[] = Object.entries(asObject(poolRoot.internal))
      .map(([name, value]) => {
        const config = asObject(value);
        return {
          name,
          ranges: extractTags(config.range),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

    const rules: CgnatRule[] = Object.entries(asObject(cgnatRoot.rule))
      .map(([ruleId, value]) => {
        const config = asObject(value);
        return {
          rule_id: ruleId,
          source_pool: asString(asObject(config.source).pool),
          translation_pool: asString(asObject(config.translation).pool),
        };
      })
      .filter((entry) => entry.rule_id)
      .sort((left, right) => left.rule_id.localeCompare(right.rule_id, undefined, { numeric: true }));

    return {
      enabled: Object.keys(cgnatRoot).length > 0,
      log_allocation: Object.prototype.hasOwnProperty.call(cgnatRoot, "log-allocation"),
      external_pools: externalPools,
      internal_pools: internalPools,
      rules,
    };
  }

  async configure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const natCgnatService = new NatCgnatService();
