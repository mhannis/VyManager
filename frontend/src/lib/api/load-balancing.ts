import { ConfigTreeApi } from "./config-tree";

export interface HealthTest {
  test_id: string;
  target: string;
  type: string;
  "resp-time": string | null;
  "ttl-limit": string | null;
  "test-script": string | null;
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
  interfaces: Record<string, { weight: string | null }>;
  protocol: string | null;
  "source-address": string | null;
  "source-port": string | null;
  "destination-address": string | null;
  "destination-port": string | null;
  "limit-rate": string | null;
  "limit-burst": string | null;
  "limit-threshold": string | null;
  "limit-period": string | null;
  exclude: boolean;
  failover: boolean;
  "per-packet-balancing": boolean;
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
    global: {
      "disable-source-nat": boolean;
      "flush-connections": boolean;
      "sticky-connections-inbound": boolean;
      "hook-script-name": string | null;
    };
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
          "resp-time": asString(testConfig["resp-time"]) || null,
          "ttl-limit": asString(testConfig["ttl-limit"]) || null,
          "test-script": asString(testConfig["test-script"]) || null,
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
      const interfaceRoot = asObject(config.interface);
      const interfaces: Record<string, { weight: string | null }> = {};
      for (const [interfaceName, interfaceValue] of Object.entries(interfaceRoot)) {
        const interfaceConfig = asObject(interfaceValue);
        interfaces[interfaceName] = {
          weight: asString(interfaceConfig.weight) || null,
        };
      }

      const source = asObject(config.source);
      const destination = asObject(config.destination);
      const limit = asObject(config.limit);

      rules[ruleId] = {
        rule_id: ruleId,
        "inbound-interface": asString(config["inbound-interface"]),
        interfaces,
        protocol: asString(config.protocol) || null,
        "source-address": asString(source.address) || null,
        "source-port": asString(source.port) || null,
        "destination-address": asString(destination.address) || null,
        "destination-port": asString(destination.port) || null,
        "limit-rate": asString(limit.rate) || null,
        "limit-burst": asString(limit.burst) || null,
        "limit-threshold": asString(limit.threshold) || null,
        "limit-period": asString(limit.period) || null,
        exclude: Object.prototype.hasOwnProperty.call(config, "exclude"),
        failover: Object.prototype.hasOwnProperty.call(config, "failover"),
        "per-packet-balancing": Object.prototype.hasOwnProperty.call(config, "per-packet-balancing"),
      };
    }

    const stickyConnections = asObject(wan["sticky-connections"]);
    const hook = asObject(wan.hook);

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
        global: {
          "disable-source-nat": Object.prototype.hasOwnProperty.call(wan, "disable-source-nat"),
          "flush-connections": Object.prototype.hasOwnProperty.call(wan, "flush-connections"),
          "sticky-connections-inbound": Object.prototype.hasOwnProperty.call(stickyConnections, "inbound"),
          "hook-script-name": asString(hook["script-name"]) || null,
        },
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
