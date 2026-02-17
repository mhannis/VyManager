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

export interface HaProxyGlobal {
  max_connections: string | null;
  ssl_bind_ciphers: string | null;
  tls_version_min: string | null;
  logging_facility: string | null;
  logging_level: string | null;
  timeout_check: string | null;
  timeout_client: string | null;
  timeout_connect: string | null;
  timeout_server: string | null;
}

export interface HaProxyServiceRule {
  rule_id: string;
  domain_name: string | null;
  ssl_sni: string | null;
  url_path_match: string | null;
  url_path: string | null;
  set_backend: string | null;
  redirect_location: string | null;
}

export interface HaProxyService {
  mode: string | null;
  listen_addresses: string[];
  port: string | null;
  backend: string | null;
  ssl_certificates: string[];
  http_response_headers: Record<string, string>;
  logging_facility: string | null;
  logging_level: string | null;
  timeout_client: string | null;
  http_compression_algorithm: string | null;
  http_compression_mime_types: string[];
  redirect_http_to_https: boolean;
  rules: Record<string, HaProxyServiceRule>;
  // Legacy compat fields for pre-service syntax
  bind: string | null;
  default_backend: string | null;
}

export interface HaProxyBackendServer {
  address: string;
  port: string;
  check: boolean;
  check_port: string | null;
  send_proxy: boolean;
  send_proxy_v2: boolean;
}

export interface HaProxyBackend {
  mode: string | null;
  balance: string | null;
  ssl_ca_certificate: string | null;
  ssl_no_verify: boolean;
  http_response_headers: Record<string, string>;
  logging_facility: string | null;
  logging_level: string | null;
  timeout_check: string | null;
  timeout_connect: string | null;
  timeout_server: string | null;
  http_check_enabled: boolean;
  http_check_method: string | null;
  http_check_uri: string | null;
  http_check_expect: string | null;
  health_check: string | null;
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
    global: HaProxyGlobal;
    services: Record<string, HaProxyService>;
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

function parseTagChildren(value: unknown): string[] {
  return Object.keys(asObject(value)).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true })
  );
}

function parseHeaderValues(value: unknown): Record<string, string> {
  const root = asObject(value);
  return Object.entries(root).reduce<Record<string, string>>((acc, [headerName, headerConfig]) => {
    const config = asObject(headerConfig);
    acc[headerName] = asString(config.value);
    return acc;
  }, {});
}

function extractPathValue(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = asString(value);
    return normalized || null;
  }

  const root = asObject(value);
  if (Object.keys(root).length === 0) {
    return null;
  }

  const explicitValue = asString(root.value);
  if (explicitValue) return explicitValue;

  const [firstKey] = Object.keys(root);
  const normalizedKey = asString(firstKey);
  return normalizedKey || null;
}

function parseServiceRules(value: unknown): Record<string, HaProxyServiceRule> {
  const root = asObject(value);
  const output: Record<string, HaProxyServiceRule> = {};

  for (const [ruleId, ruleValue] of Object.entries(root)) {
    const ruleConfig = asObject(ruleValue);
    const urlPath = asObject(ruleConfig["url-path"]);
    const setTree = asObject(ruleConfig.set);
    const setBackendTree = asObject(setTree.backend);

    let urlPathMatch: string | null = null;
    let urlPathValue: string | null = null;
    for (const candidate of ["begin", "end", "exact"]) {
      if (Object.prototype.hasOwnProperty.call(urlPath, candidate)) {
        urlPathMatch = candidate;
        urlPathValue = extractPathValue(urlPath[candidate]);
        break;
      }
    }

    if (!urlPathMatch && Object.keys(urlPath).length > 0) {
      const [firstMatch] = Object.keys(urlPath);
      urlPathMatch = asString(firstMatch) || null;
      urlPathValue = extractPathValue(urlPath[firstMatch]);
    }

    output[ruleId] = {
      rule_id: ruleId,
      domain_name: asString(ruleConfig["domain-name"]) || null,
      ssl_sni: asString(ruleConfig.ssl) || null,
      url_path_match: urlPathMatch,
      url_path: urlPathValue,
      set_backend: asString(setBackendTree["backend"]) || null,
      redirect_location: asString(ruleConfig["redirect-location"]) || null,
    };
  }

  return output;
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
    const globalParameters = asObject(haproxy["global-parameters"]);
    const globalLogging = asObject(globalParameters.logging);
    const globalTimeout = asObject(haproxy.timeout);

    const services: Record<string, HaProxyService> = {};
    const serviceRoot = asObject(haproxy.service);
    for (const [name, value] of Object.entries(serviceRoot)) {
      const config = asObject(value);
      const sslConfig = asObject(config.ssl);
      const loggingConfig = asObject(config.logging);
      const timeoutConfig = asObject(config.timeout);
      const compressionConfig = asObject(config["http-compression"]);

      services[name] = {
        mode: asString(config.mode) || null,
        listen_addresses: parseTagChildren(config["listen-address"]),
        port: asString(config.port) || null,
        backend: asString(config.backend) || null,
        ssl_certificates: parseTagChildren(asObject(sslConfig.certificate)),
        http_response_headers: parseHeaderValues(config["http-response-headers"]),
        logging_facility: asString(loggingConfig.facility) || null,
        logging_level: asString(loggingConfig.level) || null,
        timeout_client: asString(timeoutConfig.client) || null,
        http_compression_algorithm: asString(compressionConfig.algorithm) || null,
        http_compression_mime_types: parseTagChildren(compressionConfig["mime-type"]),
        redirect_http_to_https: Object.prototype.hasOwnProperty.call(config, "redirect-http-to-https"),
        rules: parseServiceRules(config.rule),
        bind: null,
        default_backend: null,
      };
    }

    // Backward compatibility for older frontend syntax; map into services if needed.
    const frontendRoot = asObject(haproxy.frontend);
    for (const [name, value] of Object.entries(frontendRoot)) {
      if (Object.prototype.hasOwnProperty.call(services, name)) {
        continue;
      }
      const config = asObject(value);
      const bind = asString(config.bind);
      const defaultBackend = asString(config["default-backend"]);
      const bindHost = bind.includes(":") ? bind.split(":")[0] : "";
      const bindPort = bind.includes(":") ? bind.split(":").slice(1).join(":") : "";

      services[name] = {
        mode: null,
        listen_addresses: bindHost ? [bindHost] : [],
        port: bindPort || null,
        backend: defaultBackend || null,
        ssl_certificates: [],
        http_response_headers: {},
        logging_facility: null,
        logging_level: null,
        timeout_client: null,
        http_compression_algorithm: null,
        http_compression_mime_types: [],
        redirect_http_to_https: false,
        rules: {},
        bind: bind || null,
        default_backend: defaultBackend || null,
      };
    }

    const backendRoot = asObject(haproxy.backend);
    const backends: Record<string, HaProxyBackend> = {};
    for (const [name, value] of Object.entries(backendRoot)) {
      const config = asObject(value);
      const serverRoot = asObject(config.server);
      const sslConfig = asObject(config.ssl);
      const loggingConfig = asObject(config.logging);
      const timeoutConfig = asObject(config.timeout);
      const httpCheckConfig = asObject(config["http-check"]);
      const servers: Record<string, HaProxyBackendServer> = {};
      for (const [serverName, serverValue] of Object.entries(serverRoot)) {
        const serverConfig = asObject(serverValue);
        const checkConfig = asObject(serverConfig.check);
        servers[serverName] = {
          address: asString(serverConfig.address),
          port: asString(serverConfig.port),
          check: Object.prototype.hasOwnProperty.call(serverConfig, "check"),
          check_port: asString(checkConfig.port) || null,
          send_proxy: Object.prototype.hasOwnProperty.call(serverConfig, "send-proxy"),
          send_proxy_v2: Object.prototype.hasOwnProperty.call(serverConfig, "send-proxy-v2"),
        };
      }

      backends[name] = {
        mode: asString(config.mode) || null,
        balance: asString(config.balance) || null,
        ssl_ca_certificate: asString(sslConfig["ca-certificate"]) || null,
        ssl_no_verify: Object.prototype.hasOwnProperty.call(sslConfig, "no-verify"),
        http_response_headers: parseHeaderValues(config["http-response-headers"]),
        logging_facility: asString(loggingConfig.facility) || null,
        logging_level: asString(loggingConfig.level) || null,
        timeout_check: asString(timeoutConfig.check) || null,
        timeout_connect: asString(timeoutConfig.connect) || null,
        timeout_server: asString(timeoutConfig.server) || null,
        http_check_enabled: Object.prototype.hasOwnProperty.call(config, "http-check"),
        http_check_method: asString(httpCheckConfig.method) || null,
        http_check_uri: asString(httpCheckConfig.uri) || null,
        http_check_expect: asString(httpCheckConfig.expect) || null,
        health_check: asString(config["health-check"]) || null,
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
        global: {
          max_connections: asString(globalParameters["max-connections"]) || null,
          ssl_bind_ciphers: asString(globalParameters["ssl-bind-ciphers"]) || null,
          tls_version_min: asString(globalParameters["tls-version-min"]) || null,
          logging_facility: asString(globalLogging.facility) || null,
          logging_level: asString(globalLogging.level) || null,
          timeout_check: asString(globalTimeout.check) || null,
          timeout_client: asString(globalTimeout.client) || null,
          timeout_connect: asString(globalTimeout.connect) || null,
          timeout_server: asString(globalTimeout.server) || null,
        },
        services,
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
