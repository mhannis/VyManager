import { ConfigTreeApi } from "./config-tree";

export interface HealthTest {
  test_id: string;
  target: string;
  type: string;
}

export interface InterfaceHealth {
  interface_name: string;
  nexthop: string;
  "failure-count": string | null;
  "success-count": string | null;
  tests: Record<string, HealthTest>;
}

export interface LoadBalancingRule {
  rule_id: string;
  "inbound-interface": string;
  interfaces: Record<string, Record<string, never>>;
}

export interface HaProxyFrontend {
  bind: string;
  default_backend: string;
}

export interface HaProxyBackendServer {
  address: string;
  port: string;
}

export interface HaProxyBackend {
  mode: string;
  balance: string;
  servers: Record<string, HaProxyBackendServer>;
}

export interface LoadBalancingConfig {
  wan: {
    "interface-health": Record<string, InterfaceHealth>;
    rules: Record<string, LoadBalancingRule>;
  };
  haproxy: {
    frontends: Record<string, HaProxyFrontend>;
    backends: Record<string, HaProxyBackend>;
  };
}

export interface InterfaceHealthFlat {
  interface_name: string;
  nexthop: string;
  failure_count: string;
  test_count: number;
}

export interface LoadBalancingRuleFlat {
  rule_id: string;
  inbound_interface: string;
  outbound_interface_count: number;
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

class LoadBalancingService {
  private readonly api = new ConfigTreeApi("load-balancing", "load_balancing");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  /**
   * Get complete load balancing configuration normalized for UI consumers.
   */
  async getConfig(refresh = false): Promise<LoadBalancingConfig> {
    const root = await this.getRawConfig(refresh);

    const wan = asObject(root.wan);
    const interfaceHealthRoot = asObject(wan["interface-health"]);
    const rulesRoot = asObject(wan.rule);

    const interfaceHealth: Record<string, InterfaceHealth> = {};
    for (const [name, value] of Object.entries(interfaceHealthRoot)) {
      const config = asObject(value);
      const testsRoot = asObject(config.test);
      const tests: Record<string, HealthTest> = {};
      for (const [testId, testValue] of Object.entries(testsRoot)) {
        const testConfig = asObject(testValue);
        tests[testId] = {
          test_id: testId,
          target: asString(testConfig.target),
          type: asString(testConfig.type),
        };
      }

      interfaceHealth[name] = {
        interface_name: name,
        nexthop: asString(config.nexthop),
        "failure-count": asString(config["failure-count"]) || null,
        "success-count": asString(config["success-count"]) || null,
        tests,
      };
    }

    const rules: Record<string, LoadBalancingRule> = {};
    for (const [ruleId, value] of Object.entries(rulesRoot)) {
      const config = asObject(value);
      rules[ruleId] = {
        rule_id: ruleId,
        "inbound-interface": asString(config["inbound-interface"]),
        interfaces: asObject(config.interface) as Record<string, Record<string, never>>,
      };
    }

    const haproxy = asObject(root.haproxy);
    const frontendRoot = asObject(haproxy.frontend);
    const backendRoot = asObject(haproxy.backend);

    const frontends: Record<string, HaProxyFrontend> = {};
    for (const [name, value] of Object.entries(frontendRoot)) {
      const config = asObject(value);
      frontends[name] = {
        bind: asString(config.bind),
        default_backend: asString(config["default-backend"]),
      };
    }

    const backends: Record<string, HaProxyBackend> = {};
    for (const [name, value] of Object.entries(backendRoot)) {
      const config = asObject(value);
      const serverRoot = asObject(config.server);
      const servers: Record<string, HaProxyBackendServer> = {};
      for (const [serverName, serverValue] of Object.entries(serverRoot)) {
        const serverConfig = asObject(serverValue);
        servers[serverName] = {
          address: asString(serverConfig.address),
          port: asString(serverConfig.port),
        };
      }

      backends[name] = {
        mode: asString(config.mode),
        balance: asString(config.balance),
        servers,
      };
    }

    return {
      wan: {
        "interface-health": interfaceHealth,
        rules,
      },
      haproxy: {
        frontends,
        backends,
      },
    };
  }

  /**
   * Get all interface health configurations as a flat list.
   */
  async getInterfaceHealth(refresh = false): Promise<InterfaceHealthFlat[]> {
    const config = await this.getConfig(refresh);
    return Object.values(config.wan["interface-health"]).map((entry) => ({
      interface_name: entry.interface_name,
      nexthop: entry.nexthop,
      failure_count: entry["failure-count"] || "0",
      test_count: Object.keys(entry.tests).length,
    }));
  }

  /**
   * Get all WAN load balancing rules as a flat list.
   */
  async getRules(refresh = false): Promise<LoadBalancingRuleFlat[]> {
    const config = await this.getConfig(refresh);
    return Object.values(config.wan.rules).map((rule) => ({
      rule_id: rule.rule_id,
      inbound_interface: rule["inbound-interface"],
      outbound_interface_count: Object.keys(rule.interfaces).length,
    }));
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const loadBalancingService = new LoadBalancingService();
