"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { loadBalancingService } from "@/lib/api/load-balancing";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";

type WanHealthEntry = {
  interface: string;
  nexthop: string;
  failureCount: string;
  successCount: string;
};

type WanHealthTestEntry = {
  interface: string;
  testId: string;
  type: string;
  target: string;
  respTime: string;
  ttlLimit: string;
  testScript: string;
};

type WanGlobalSettings = {
  disableSourceNat: boolean;
  flushConnections: boolean;
  stickyConnectionsInbound: boolean;
  hookScriptName: string;
};

type WanRuleEntry = {
  ruleId: string;
  inboundInterface: string;
  outboundInterfaces: string[];
  outboundWeights: Record<string, string>;
  sourceAddress: string;
  sourcePort: string;
  destinationAddress: string;
  destinationPort: string;
  protocol: string;
  exclude: boolean;
  failover: boolean;
  perPacketBalancing: boolean;
  limitRate: string;
  limitBurst: string;
  limitThreshold: string;
  limitPeriod: string;
};

type HaproxyGlobalSettings = {
  maxConnections: string;
  sslBindCiphers: string;
  tlsVersionMin: string;
  loggingFacility: string;
  loggingLevel: string;
  timeoutCheck: string;
  timeoutClient: string;
  timeoutConnect: string;
  timeoutServer: string;
};

type HaproxyServiceRuleEntry = {
  ruleId: string;
  domainName: string;
  sslSni: string;
  urlPathMatch: string;
  urlPath: string;
  setBackend: string;
  redirectLocation: string;
};

type HaproxyServiceEntry = {
  name: string;
  mode: string;
  listenAddresses: string[];
  port: string;
  backend: string;
  sslCertificates: string[];
  httpResponseHeaders: Record<string, string>;
  loggingFacility: string;
  loggingLevel: string;
  timeoutClient: string;
  httpCompressionAlgorithm: string;
  httpCompressionMimeTypes: string[];
  redirectHttpToHttps: boolean;
  rules: HaproxyServiceRuleEntry[];
  // Legacy fallback display
  bindLegacy: string;
  defaultBackendLegacy: string;
};

type HaproxyBackendServerEntry = {
  name: string;
  address: string;
  port: string;
  check: boolean;
  checkPort: string;
  sendProxy: boolean;
  sendProxyV2: boolean;
};

type HaproxyBackendEntry = {
  name: string;
  mode: string;
  balance: string;
  sslCaCertificate: string;
  sslNoVerify: boolean;
  httpResponseHeaders: Record<string, string>;
  loggingFacility: string;
  loggingLevel: string;
  timeoutCheck: string;
  timeoutConnect: string;
  timeoutServer: string;
  httpCheckEnabled: boolean;
  httpCheckMethod: string;
  httpCheckUri: string;
  httpCheckExpect: string;
  healthCheck: string;
  servers: Record<string, HaproxyBackendServerEntry>;
};

const EMPTY_HEALTH_DRAFT: WanHealthEntry = {
  interface: "",
  nexthop: "",
  failureCount: "",
  successCount: "",
};

const EMPTY_HEALTH_TEST_DRAFT: WanHealthTestEntry = {
  interface: "",
  testId: "",
  type: "",
  target: "",
  respTime: "",
  ttlLimit: "",
  testScript: "",
};

const EMPTY_WAN_GLOBAL_DRAFT: WanGlobalSettings = {
  disableSourceNat: false,
  flushConnections: false,
  stickyConnectionsInbound: false,
  hookScriptName: "",
};

const EMPTY_RULE_DRAFT: WanRuleEntry = {
  ruleId: "",
  inboundInterface: "",
  outboundInterfaces: [],
  outboundWeights: {},
  sourceAddress: "",
  sourcePort: "",
  destinationAddress: "",
  destinationPort: "",
  protocol: "",
  exclude: false,
  failover: false,
  perPacketBalancing: false,
  limitRate: "",
  limitBurst: "",
  limitThreshold: "",
  limitPeriod: "",
};

const EMPTY_HAPROXY_GLOBAL_DRAFT: HaproxyGlobalSettings = {
  maxConnections: "",
  sslBindCiphers: "",
  tlsVersionMin: "",
  loggingFacility: "",
  loggingLevel: "",
  timeoutCheck: "",
  timeoutClient: "",
  timeoutConnect: "",
  timeoutServer: "",
};

const EMPTY_SERVICE_RULE_DRAFT: HaproxyServiceRuleEntry = {
  ruleId: "",
  domainName: "",
  sslSni: "",
  urlPathMatch: "",
  urlPath: "",
  setBackend: "",
  redirectLocation: "",
};

const EMPTY_SERVICE_DRAFT: HaproxyServiceEntry = {
  name: "",
  mode: "",
  listenAddresses: [],
  port: "",
  backend: "",
  sslCertificates: [],
  httpResponseHeaders: {},
  loggingFacility: "",
  loggingLevel: "",
  timeoutClient: "",
  httpCompressionAlgorithm: "",
  httpCompressionMimeTypes: [],
  redirectHttpToHttps: false,
  rules: [],
  bindLegacy: "",
  defaultBackendLegacy: "",
};

const EMPTY_BACKEND_SERVER_DRAFT: HaproxyBackendServerEntry = {
  name: "",
  address: "",
  port: "",
  check: false,
  checkPort: "",
  sendProxy: false,
  sendProxyV2: false,
};

const EMPTY_BACKEND_DRAFT: HaproxyBackendEntry = {
  name: "",
  mode: "",
  balance: "",
  sslCaCertificate: "",
  sslNoVerify: false,
  httpResponseHeaders: {},
  loggingFacility: "",
  loggingLevel: "",
  timeoutCheck: "",
  timeoutConnect: "",
  timeoutServer: "",
  httpCheckEnabled: false,
  httpCheckMethod: "",
  httpCheckUri: "",
  httpCheckExpect: "",
  healthCheck: "",
  servers: {},
};

function normalizeText(value: string): string {
  return value.trim();
}

function uniqueList(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = normalizeText(value);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function parseCsvList(value: string): string[] {
  return uniqueList(value.split(",").map((item) => item.trim()));
}

function serializeCsvList(values: string[]): string {
  return uniqueList(values).join(", ");
}

function parseOutboundWeightList(value: string): Record<string, string> {
  const output: Record<string, string> = {};
  const chunks = value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const [rawName, rawWeight] = chunk.split("=");
    const name = normalizeText(rawName || "");
    const weight = normalizeText(rawWeight || "");
    if (!name || !weight) continue;
    output[name] = weight;
  }

  return output;
}

function serializeOutboundWeightList(weights: Record<string, string>): string {
  return Object.entries(weights)
    .filter(([, weight]) => normalizeText(weight))
    .map(([name, weight]) => `${name}=${weight}`)
    .join(", ");
}

function parseKeyValueList(value: string): Record<string, string> {
  const output: Record<string, string> = {};
  const chunks = value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const [rawKey, ...rawValueParts] = chunk.split("=");
    const key = normalizeText(rawKey || "");
    const mappedValue = normalizeText(rawValueParts.join("=") || "");
    if (!key) continue;
    output[key] = mappedValue;
  }

  return output;
}

function weightMapEquals(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftNames = Object.keys(left).sort();
  const rightNames = Object.keys(right).sort();
  if (!arrayEquals(leftNames, rightNames)) return false;
  return leftNames.every((name) => left[name] === right[name]);
}

function serializeServerList(servers: Record<string, HaproxyBackendServerEntry>): string {
  return Object.entries(servers)
    .map(([name, value]) => {
      const attributes: string[] = [];
      if (value.check) {
        attributes.push(value.checkPort ? `check:${value.checkPort}` : "check");
      }
      if (value.sendProxy) attributes.push("send-proxy");
      if (value.sendProxyV2) attributes.push("send-proxy-v2");
      return `${name}=${value.address}:${value.port}${attributes.length > 0 ? ` (${attributes.join(", ")})` : ""}`;
    })
    .join(", ");
}

function arrayEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function quoteCliValue(value: string): string {
  const cleaned = normalizeText(value);
  if (!cleaned) return "''";
  if (/^[A-Za-z0-9._:/@+,-]+$/.test(cleaned)) {
    return cleaned;
  }
  return `'${cleaned.replace(/'/g, "'\\''")}'`;
}

export default function LoadBalancingPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.LOAD_BALANCING);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [wanGlobal, setWanGlobal] = useState<WanGlobalSettings>(EMPTY_WAN_GLOBAL_DRAFT);
  const [wanHealth, setWanHealth] = useState<WanHealthEntry[]>([]);
  const [wanHealthTests, setWanHealthTests] = useState<WanHealthTestEntry[]>([]);
  const [wanRules, setWanRules] = useState<WanRuleEntry[]>([]);
  const [haproxyGlobal, setHaproxyGlobal] = useState<HaproxyGlobalSettings>(EMPTY_HAPROXY_GLOBAL_DRAFT);
  const [services, setServices] = useState<HaproxyServiceEntry[]>([]);
  const [backends, setBackends] = useState<HaproxyBackendEntry[]>([]);

  const [currentWanGlobal, setCurrentWanGlobal] = useState<WanGlobalSettings>(EMPTY_WAN_GLOBAL_DRAFT);
  const [currentWanHealth, setCurrentWanHealth] = useState<WanHealthEntry[]>([]);
  const [currentWanHealthTests, setCurrentWanHealthTests] = useState<WanHealthTestEntry[]>([]);
  const [currentWanRules, setCurrentWanRules] = useState<WanRuleEntry[]>([]);
  const [currentHaproxyGlobal, setCurrentHaproxyGlobal] = useState<HaproxyGlobalSettings>(
    EMPTY_HAPROXY_GLOBAL_DRAFT
  );
  const [currentServices, setCurrentServices] = useState<HaproxyServiceEntry[]>([]);
  const [currentBackends, setCurrentBackends] = useState<HaproxyBackendEntry[]>([]);

  const [healthDraft, setHealthDraft] = useState<WanHealthEntry>(EMPTY_HEALTH_DRAFT);
  const [healthTestDraft, setHealthTestDraft] = useState<WanHealthTestEntry>(EMPTY_HEALTH_TEST_DRAFT);
  const [ruleDraft, setRuleDraft] = useState<WanRuleEntry>(EMPTY_RULE_DRAFT);
  const [ruleOutboundInput, setRuleOutboundInput] = useState("");
  const [ruleOutboundWeightsInput, setRuleOutboundWeightsInput] = useState("");
  const [serviceDraft, setServiceDraft] = useState<HaproxyServiceEntry>(EMPTY_SERVICE_DRAFT);
  const [serviceListenInput, setServiceListenInput] = useState("");
  const [serviceSslCertificatesInput, setServiceSslCertificatesInput] = useState("");
  const [serviceHeadersInput, setServiceHeadersInput] = useState("");
  const [serviceMimeTypesInput, setServiceMimeTypesInput] = useState("");
  const [serviceRuleParentName, setServiceRuleParentName] = useState("");
  const [serviceRuleDraft, setServiceRuleDraft] = useState<HaproxyServiceRuleEntry>(
    EMPTY_SERVICE_RULE_DRAFT
  );
  const [backendDraft, setBackendDraft] = useState<HaproxyBackendEntry>(EMPTY_BACKEND_DRAFT);
  const [backendHeadersInput, setBackendHeadersInput] = useState("");
  const [backendServerDraft, setBackendServerDraft] = useState<HaproxyBackendServerEntry>(
    EMPTY_BACKEND_SERVER_DRAFT
  );

  const [interfaceOptions, setInterfaceOptions] = useState<Array<{ value: string; label: string }>>([]);

  const interfaceLabelByName = useMemo(
    () =>
      interfaceOptions.reduce<Record<string, string>>((acc, item) => {
        acc[item.value] = item.label;
        return acc;
      }, {}),
    [interfaceOptions]
  );

  const backendNames = useMemo(
    () => backends.map((entry) => entry.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [backends]
  );
  const serviceNames = useMemo(
    () => services.map((entry) => entry.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [services]
  );
  const selectedOutboundInterfaces = useMemo(
    () => new Set(parseCsvList(ruleOutboundInput)),
    [ruleOutboundInput]
  );

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const [config, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        loadBalancingService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const parsedWanGlobal: WanGlobalSettings = {
        disableSourceNat: config.wan.global["disable-source-nat"],
        flushConnections: config.wan.global["flush-connections"],
        stickyConnectionsInbound: config.wan.global["sticky-connections-inbound"],
        hookScriptName: normalizeText(config.wan.global["hook-script-name"] || ""),
      };

      const parsedWanHealth = Object.values(config.wan["interface-health"])
        .map((entry) => ({
          interface: normalizeText(entry.interface_name),
          nexthop: normalizeText(entry.nexthop),
          failureCount: normalizeText(entry["failure-count"] || ""),
          successCount: normalizeText(entry["success-count"] || ""),
        }))
        .filter((entry) => entry.interface)
        .sort((left, right) => left.interface.localeCompare(right.interface, undefined, { numeric: true }));

      const parsedWanHealthTests = Object.values(config.wan["interface-health"])
        .flatMap((entry) =>
          Object.values(entry.tests).map((test) => ({
            interface: normalizeText(entry.interface_name),
            testId: normalizeText(test.test_id),
            type: normalizeText(test.type),
            target: normalizeText(test.target),
            respTime: normalizeText(test["resp-time"] || ""),
            ttlLimit: normalizeText(test["ttl-limit"] || ""),
            testScript: normalizeText(test["test-script"] || ""),
          }))
        )
        .filter((entry) => entry.interface && entry.testId)
        .sort((left, right) => {
          const interfaceComparison = left.interface.localeCompare(right.interface, undefined, {
            numeric: true,
          });
          if (interfaceComparison !== 0) return interfaceComparison;
          return left.testId.localeCompare(right.testId, undefined, { numeric: true });
        });

      const parsedWanRules = Object.values(config.wan.rules)
        .map((entry) => ({
          ruleId: normalizeText(entry.rule_id),
          inboundInterface: normalizeText(entry["inbound-interface"]),
          outboundInterfaces: Object.keys(entry.interfaces).map((name) => normalizeText(name)),
          outboundWeights: Object.entries(entry.interfaces).reduce<Record<string, string>>(
            (acc, [name, value]) => {
              const normalizedWeight = normalizeText(value.weight || "");
              if (normalizedWeight) {
                acc[normalizeText(name)] = normalizedWeight;
              }
              return acc;
            },
            {}
          ),
          sourceAddress: normalizeText(entry["source-address"] || ""),
          sourcePort: normalizeText(entry["source-port"] || ""),
          destinationAddress: normalizeText(entry["destination-address"] || ""),
          destinationPort: normalizeText(entry["destination-port"] || ""),
          protocol: normalizeText(entry.protocol || ""),
          exclude: entry.exclude,
          failover: entry.failover,
          perPacketBalancing: entry["per-packet-balancing"],
          limitRate: normalizeText(entry["limit-rate"] || ""),
          limitBurst: normalizeText(entry["limit-burst"] || ""),
          limitThreshold: normalizeText(entry["limit-threshold"] || ""),
          limitPeriod: normalizeText(entry["limit-period"] || ""),
        }))
        .filter((entry) => entry.ruleId)
        .sort((left, right) => left.ruleId.localeCompare(right.ruleId, undefined, { numeric: true }));

      const parsedHaproxyGlobal: HaproxyGlobalSettings = {
        maxConnections: normalizeText(config.haproxy.global.max_connections || ""),
        sslBindCiphers: normalizeText(config.haproxy.global.ssl_bind_ciphers || ""),
        tlsVersionMin: normalizeText(config.haproxy.global.tls_version_min || ""),
        loggingFacility: normalizeText(config.haproxy.global.logging_facility || ""),
        loggingLevel: normalizeText(config.haproxy.global.logging_level || ""),
        timeoutCheck: normalizeText(config.haproxy.global.timeout_check || ""),
        timeoutClient: normalizeText(config.haproxy.global.timeout_client || ""),
        timeoutConnect: normalizeText(config.haproxy.global.timeout_connect || ""),
        timeoutServer: normalizeText(config.haproxy.global.timeout_server || ""),
      };

      const parsedServices = Object.entries(config.haproxy.services)
        .map(([name, entry]) => ({
          name: normalizeText(name),
          mode: normalizeText(entry.mode || ""),
          listenAddresses: uniqueList(entry.listen_addresses.map((item) => normalizeText(item))),
          port: normalizeText(entry.port || ""),
          backend: normalizeText(entry.backend || entry.default_backend || ""),
          sslCertificates: uniqueList(entry.ssl_certificates.map((item) => normalizeText(item))),
          httpResponseHeaders: entry.http_response_headers,
          loggingFacility: normalizeText(entry.logging_facility || ""),
          loggingLevel: normalizeText(entry.logging_level || ""),
          timeoutClient: normalizeText(entry.timeout_client || ""),
          httpCompressionAlgorithm: normalizeText(entry.http_compression_algorithm || ""),
          httpCompressionMimeTypes: uniqueList(
            entry.http_compression_mime_types.map((item) => normalizeText(item))
          ),
          redirectHttpToHttps: entry.redirect_http_to_https,
          rules: Object.values(entry.rules)
            .map((ruleEntry) => ({
              ruleId: normalizeText(ruleEntry.rule_id),
              domainName: normalizeText(ruleEntry.domain_name || ""),
              sslSni: normalizeText(ruleEntry.ssl_sni || ""),
              urlPathMatch: normalizeText(ruleEntry.url_path_match || ""),
              urlPath: normalizeText(ruleEntry.url_path || ""),
              setBackend: normalizeText(ruleEntry.set_backend || ""),
              redirectLocation: normalizeText(ruleEntry.redirect_location || ""),
            }))
            .sort((left, right) => left.ruleId.localeCompare(right.ruleId, undefined, { numeric: true })),
          bindLegacy: normalizeText(entry.bind || ""),
          defaultBackendLegacy: normalizeText(entry.default_backend || ""),
        }))
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const parsedBackends = Object.entries(config.haproxy.backends)
        .map(([name, entry]) => ({
          name: normalizeText(name),
          mode: normalizeText(entry.mode || ""),
          balance: normalizeText(entry.balance || ""),
          sslCaCertificate: normalizeText(entry.ssl_ca_certificate || ""),
          sslNoVerify: entry.ssl_no_verify,
          httpResponseHeaders: entry.http_response_headers,
          loggingFacility: normalizeText(entry.logging_facility || ""),
          loggingLevel: normalizeText(entry.logging_level || ""),
          timeoutCheck: normalizeText(entry.timeout_check || ""),
          timeoutConnect: normalizeText(entry.timeout_connect || ""),
          timeoutServer: normalizeText(entry.timeout_server || ""),
          httpCheckEnabled: entry.http_check_enabled,
          httpCheckMethod: normalizeText(entry.http_check_method || ""),
          httpCheckUri: normalizeText(entry.http_check_uri || ""),
          httpCheckExpect: normalizeText(entry.http_check_expect || ""),
          healthCheck: normalizeText(entry.health_check || ""),
          servers: Object.entries(entry.servers).reduce<Record<string, HaproxyBackendServerEntry>>(
            (acc, [serverName, serverEntry]) => {
              acc[serverName] = {
                name: normalizeText(serverName),
                address: normalizeText(serverEntry.address || ""),
                port: normalizeText(serverEntry.port || ""),
                check: serverEntry.check,
                checkPort: normalizeText(serverEntry.check_port || ""),
                sendProxy: serverEntry.send_proxy,
                sendProxyV2: serverEntry.send_proxy_v2,
              };
              return acc;
            },
            {}
          ),
        }))
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const interfaceNames = new Set<string>();
      const descriptionByName = ethernetConfig.interfaces.reduce<Record<string, string | null>>(
        (acc, iface) => {
          acc[iface.name] = iface.description ?? null;
          return acc;
        },
        {}
      );

      ethernetConfig.interfaces.forEach((iface) => interfaceNames.add(iface.name));
      physicalConfig.interfaces.forEach((iface) => interfaceNames.add(iface.interface));
      allInterfacesConfig.interfaces.forEach((iface) => interfaceNames.add(iface.name));
      parsedWanHealth.forEach((entry) => interfaceNames.add(entry.interface));
      parsedWanRules.forEach((entry) => {
        if (entry.inboundInterface) interfaceNames.add(entry.inboundInterface);
        entry.outboundInterfaces.forEach((iface) => interfaceNames.add(iface));
      });

      const normalizedOptions = [...interfaceNames]
        .filter((name) => name !== "lo")
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setInterfaceOptions(normalizedOptions);
      setWanGlobal(parsedWanGlobal);
      setWanHealth(parsedWanHealth);
      setWanHealthTests(parsedWanHealthTests);
      setWanRules(parsedWanRules);
      setHaproxyGlobal(parsedHaproxyGlobal);
      setServices(parsedServices);
      setBackends(parsedBackends);

      setCurrentWanGlobal(parsedWanGlobal);
      setCurrentWanHealth(parsedWanHealth);
      setCurrentWanHealthTests(parsedWanHealthTests);
      setCurrentWanRules(parsedWanRules);
      setCurrentHaproxyGlobal(parsedHaproxyGlobal);
      setCurrentServices(parsedServices);
      setCurrentBackends(parsedBackends);

      setHealthDraft({ ...EMPTY_HEALTH_DRAFT, interface: normalizedOptions[0]?.value || "" });
      setHealthTestDraft({
        ...EMPTY_HEALTH_TEST_DRAFT,
        interface: normalizedOptions[0]?.value || "",
      });
      setRuleDraft({
        ...EMPTY_RULE_DRAFT,
        inboundInterface: normalizedOptions[0]?.value || "",
      });
      setRuleOutboundInput("");
      setRuleOutboundWeightsInput("");
      setServiceDraft(EMPTY_SERVICE_DRAFT);
      setServiceListenInput("");
      setServiceSslCertificatesInput("");
      setServiceHeadersInput("");
      setServiceMimeTypesInput("");
      setServiceRuleParentName(parsedServices[0]?.name || "");
      setServiceRuleDraft(EMPTY_SERVICE_RULE_DRAFT);
      setBackendDraft(EMPTY_BACKEND_DRAFT);
      setBackendHeadersInput("");
      setBackendServerDraft(EMPTY_BACKEND_SERVER_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load load-balancing configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const addHealthEntry = () => {
    setError(null);

    const entry: WanHealthEntry = {
      interface: normalizeText(healthDraft.interface),
      nexthop: normalizeText(healthDraft.nexthop),
      failureCount: normalizeText(healthDraft.failureCount),
      successCount: normalizeText(healthDraft.successCount),
    };

    if (!entry.interface || !entry.nexthop) {
      setError("WAN health entry requires interface and nexthop.");
      return;
    }

    if (wanHealth.some((item) => item.interface === entry.interface)) {
      setError("Interface health entry already exists for this interface.");
      return;
    }

    setWanHealth((previous) =>
      [...previous, entry].sort((left, right) =>
        left.interface.localeCompare(right.interface, undefined, { numeric: true })
      )
    );

    setHealthDraft({ ...EMPTY_HEALTH_DRAFT, interface: interfaceOptions[0]?.value || "" });
  };

  const removeHealthEntry = (iface: string) => {
    setWanHealth((previous) => previous.filter((item) => item.interface !== iface));
    setWanHealthTests((previous) => previous.filter((item) => item.interface !== iface));
  };

  const addHealthTestEntry = () => {
    setError(null);

    const entry: WanHealthTestEntry = {
      interface: normalizeText(healthTestDraft.interface),
      testId: normalizeText(healthTestDraft.testId),
      type: normalizeText(healthTestDraft.type),
      target: normalizeText(healthTestDraft.target),
      respTime: normalizeText(healthTestDraft.respTime),
      ttlLimit: normalizeText(healthTestDraft.ttlLimit),
      testScript: normalizeText(healthTestDraft.testScript),
    };

    if (!entry.interface || !entry.testId || !entry.type) {
      setError("WAN health test requires interface, test ID, and type.");
      return;
    }

    if (entry.respTime && !/^\d+$/.test(entry.respTime)) {
      setError("Health test response time must be a positive integer.");
      return;
    }

    if (entry.ttlLimit && !/^\d+$/.test(entry.ttlLimit)) {
      setError("Health test TTL limit must be a positive integer.");
      return;
    }

    if (wanHealthTests.some((item) => item.interface === entry.interface && item.testId === entry.testId)) {
      setError("Health test ID already exists for this interface.");
      return;
    }

    setWanHealthTests((previous) =>
      [...previous, entry].sort((left, right) => {
        const interfaceComparison = left.interface.localeCompare(right.interface, undefined, { numeric: true });
        if (interfaceComparison !== 0) return interfaceComparison;
        return left.testId.localeCompare(right.testId, undefined, { numeric: true });
      })
    );

    setHealthTestDraft({
      ...EMPTY_HEALTH_TEST_DRAFT,
      interface: healthTestDraft.interface || interfaceOptions[0]?.value || "",
    });
  };

  const removeHealthTestEntry = (iface: string, testId: string) => {
    setWanHealthTests((previous) =>
      previous.filter((item) => !(item.interface === iface && item.testId === testId))
    );
  };

  const addRuleEntry = () => {
    setError(null);

    const availableInterfaces = new Set(interfaceOptions.map((option) => option.value));
    const outboundWeights = parseOutboundWeightList(ruleOutboundWeightsInput);
    const entry: WanRuleEntry = {
      ruleId: normalizeText(ruleDraft.ruleId),
      inboundInterface: normalizeText(ruleDraft.inboundInterface),
      outboundInterfaces: parseCsvList(ruleOutboundInput),
      outboundWeights,
      sourceAddress: normalizeText(ruleDraft.sourceAddress),
      sourcePort: normalizeText(ruleDraft.sourcePort),
      destinationAddress: normalizeText(ruleDraft.destinationAddress),
      destinationPort: normalizeText(ruleDraft.destinationPort),
      protocol: normalizeText(ruleDraft.protocol),
      exclude: ruleDraft.exclude,
      failover: ruleDraft.failover,
      perPacketBalancing: ruleDraft.perPacketBalancing,
      limitRate: normalizeText(ruleDraft.limitRate),
      limitBurst: normalizeText(ruleDraft.limitBurst),
      limitThreshold: normalizeText(ruleDraft.limitThreshold),
      limitPeriod: normalizeText(ruleDraft.limitPeriod),
    };

    if (!entry.ruleId || !entry.inboundInterface) {
      setError("Rule requires ID and inbound interface.");
      return;
    }

    if (!/^\d+$/.test(entry.ruleId)) {
      setError("Rule ID must be a positive integer.");
      return;
    }

    if (!availableInterfaces.has(entry.inboundInterface)) {
      setError(`Inbound interface '${entry.inboundInterface}' is not available.`);
      return;
    }

    if (entry.outboundInterfaces.length === 0) {
      setError("Rule requires at least one outbound interface.");
      return;
    }

    const invalidOutbound = entry.outboundInterfaces.filter((iface) => !availableInterfaces.has(iface));
    if (invalidOutbound.length > 0) {
      setError(`Unknown outbound interface(s): ${invalidOutbound.join(", ")}`);
      return;
    }

    const weightInterfaces = Object.keys(entry.outboundWeights);
    const invalidWeightInterfaces = weightInterfaces.filter(
      (iface) => !entry.outboundInterfaces.includes(iface)
    );
    if (invalidWeightInterfaces.length > 0) {
      setError(
        `Outbound weight interface(s) must be in outbound list: ${invalidWeightInterfaces.join(", ")}`
      );
      return;
    }

    for (const [iface, weight] of Object.entries(entry.outboundWeights)) {
      if (!/^\d+$/.test(weight)) {
        setError(`Weight for ${iface} must be an integer.`);
        return;
      }
      const numericWeight = Number(weight);
      if (numericWeight < 1 || numericWeight > 100) {
        setError(`Weight for ${iface} must be between 1 and 100.`);
        return;
      }
    }

    if (wanRules.some((item) => item.ruleId === entry.ruleId)) {
      setError("Rule ID already exists.");
      return;
    }

    setWanRules((previous) =>
      [...previous, entry].sort((left, right) => left.ruleId.localeCompare(right.ruleId, undefined, { numeric: true }))
    );

    setRuleDraft({ ...EMPTY_RULE_DRAFT, inboundInterface: interfaceOptions[0]?.value || "" });
    setRuleOutboundInput("");
    setRuleOutboundWeightsInput("");
  };

  const removeRuleEntry = (ruleId: string) => {
    setWanRules((previous) => previous.filter((item) => item.ruleId !== ruleId));
  };

  const toggleRuleOutboundInterface = (interfaceName: string, checked: boolean) => {
    const current = parseCsvList(ruleOutboundInput);
    const next = checked
      ? serializeCsvList([...current, interfaceName])
      : serializeCsvList(current.filter((value) => value !== interfaceName));
    setRuleOutboundInput(next);

    if (!checked) {
      const currentWeights = parseOutboundWeightList(ruleOutboundWeightsInput);
      if (Object.prototype.hasOwnProperty.call(currentWeights, interfaceName)) {
        delete currentWeights[interfaceName];
        setRuleOutboundWeightsInput(serializeOutboundWeightList(currentWeights));
      }
    }
  };

  const addServiceEntry = () => {
    setError(null);

    const entry: HaproxyServiceEntry = {
      name: normalizeText(serviceDraft.name),
      mode: normalizeText(serviceDraft.mode),
      listenAddresses: parseCsvList(serviceListenInput),
      port: normalizeText(serviceDraft.port),
      backend: normalizeText(serviceDraft.backend),
      sslCertificates: parseCsvList(serviceSslCertificatesInput),
      httpResponseHeaders: parseKeyValueList(serviceHeadersInput),
      loggingFacility: normalizeText(serviceDraft.loggingFacility),
      loggingLevel: normalizeText(serviceDraft.loggingLevel),
      timeoutClient: normalizeText(serviceDraft.timeoutClient),
      httpCompressionAlgorithm: normalizeText(serviceDraft.httpCompressionAlgorithm),
      httpCompressionMimeTypes: parseCsvList(serviceMimeTypesInput),
      redirectHttpToHttps: serviceDraft.redirectHttpToHttps,
      rules: serviceDraft.rules,
      bindLegacy: "",
      defaultBackendLegacy: "",
    };

    if (!entry.name) {
      setError("HAProxy service name is required.");
      return;
    }

    if (!entry.backend) {
      setError("HAProxy service requires a backend name.");
      return;
    }

    if (!entry.port) {
      setError("HAProxy service requires a listen port.");
      return;
    }

    if (services.some((item) => item.name === entry.name)) {
      setError("Service name already exists.");
      return;
    }

    setServices((previous) =>
      [...previous, entry].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    );
    setServiceDraft(EMPTY_SERVICE_DRAFT);
    setServiceListenInput("");
    setServiceSslCertificatesInput("");
    setServiceHeadersInput("");
    setServiceMimeTypesInput("");
    setServiceRuleParentName(entry.name);
  };

  const removeServiceEntry = (name: string) => {
    setServices((previous) => previous.filter((item) => item.name !== name));
    setServiceRuleParentName((previous) => (previous === name ? "" : previous));
  };

  const addServiceRuleEntry = () => {
    setError(null);

    const serviceName = normalizeText(serviceRuleParentName);
    const rule: HaproxyServiceRuleEntry = {
      ruleId: normalizeText(serviceRuleDraft.ruleId),
      domainName: normalizeText(serviceRuleDraft.domainName),
      sslSni: normalizeText(serviceRuleDraft.sslSni),
      urlPathMatch: normalizeText(serviceRuleDraft.urlPathMatch),
      urlPath: normalizeText(serviceRuleDraft.urlPath),
      setBackend: normalizeText(serviceRuleDraft.setBackend),
      redirectLocation: normalizeText(serviceRuleDraft.redirectLocation),
    };

    if (!serviceName) {
      setError("Select a service before adding a rule.");
      return;
    }

    if (!rule.ruleId || !/^[0-9]+$/.test(rule.ruleId)) {
      setError("Service rule ID must be a positive integer.");
      return;
    }

    const service = services.find((item) => item.name === serviceName);
    if (!service) {
      setError("Selected service was not found.");
      return;
    }

    if (
      !rule.domainName &&
      !rule.sslSni &&
      !(rule.urlPathMatch && rule.urlPath) &&
      !rule.redirectLocation
    ) {
      setError("Define at least one rule match/redirect (domain, ssl, url-path, or redirect).");
      return;
    }

    if (!rule.setBackend && !rule.redirectLocation) {
      setError("Rule action requires either backend target or redirect location.");
      return;
    }

    if (service.rules.some((entry) => entry.ruleId === rule.ruleId)) {
      setError(`Rule ID ${rule.ruleId} already exists for service '${serviceName}'.`);
      return;
    }

    setServices((previous) =>
      previous.map((entry) => {
        if (entry.name !== serviceName) return entry;
        return {
          ...entry,
          rules: [...entry.rules, rule].sort((left, right) =>
            left.ruleId.localeCompare(right.ruleId, undefined, { numeric: true })
          ),
        };
      })
    );

    setServiceRuleDraft(EMPTY_SERVICE_RULE_DRAFT);
  };

  const removeServiceRuleEntry = (serviceName: string, ruleId: string) => {
    setServices((previous) =>
      previous.map((entry) =>
        entry.name === serviceName
          ? { ...entry, rules: entry.rules.filter((item) => item.ruleId !== ruleId) }
          : entry
      )
    );
  };

  const addBackendServerDraftEntry = () => {
    setError(null);

    const entry: HaproxyBackendServerEntry = {
      name: normalizeText(backendServerDraft.name),
      address: normalizeText(backendServerDraft.address),
      port: normalizeText(backendServerDraft.port),
      check: backendServerDraft.check,
      checkPort: normalizeText(backendServerDraft.checkPort),
      sendProxy: backendServerDraft.sendProxy,
      sendProxyV2: backendServerDraft.sendProxyV2,
    };

    if (!entry.name || !entry.address || !entry.port) {
      setError("Backend server requires name, address, and port.");
      return;
    }

    if (!/^[0-9]+$/.test(entry.port)) {
      setError("Backend server port must be numeric.");
      return;
    }

    if (entry.checkPort && !/^[0-9]+$/.test(entry.checkPort)) {
      setError("Backend server check port must be numeric.");
      return;
    }

    setBackendDraft((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous.servers, entry.name)) {
        setError(`Server name '${entry.name}' already exists in this backend draft.`);
        return previous;
      }
      return {
        ...previous,
        servers: {
          ...previous.servers,
          [entry.name]: entry,
        },
      };
    });

    setBackendServerDraft(EMPTY_BACKEND_SERVER_DRAFT);
  };

  const removeBackendServerDraftEntry = (name: string) => {
    setBackendDraft((previous) => {
      const nextServers = { ...previous.servers };
      delete nextServers[name];
      return {
        ...previous,
        servers: nextServers,
      };
    });
  };

  const addBackendEntry = () => {
    setError(null);

    const entry: HaproxyBackendEntry = {
      name: normalizeText(backendDraft.name),
      mode: normalizeText(backendDraft.mode),
      balance: normalizeText(backendDraft.balance),
      sslCaCertificate: normalizeText(backendDraft.sslCaCertificate),
      sslNoVerify: backendDraft.sslNoVerify,
      httpResponseHeaders: parseKeyValueList(backendHeadersInput),
      loggingFacility: normalizeText(backendDraft.loggingFacility),
      loggingLevel: normalizeText(backendDraft.loggingLevel),
      timeoutCheck: normalizeText(backendDraft.timeoutCheck),
      timeoutConnect: normalizeText(backendDraft.timeoutConnect),
      timeoutServer: normalizeText(backendDraft.timeoutServer),
      httpCheckEnabled: backendDraft.httpCheckEnabled,
      httpCheckMethod: normalizeText(backendDraft.httpCheckMethod),
      httpCheckUri: normalizeText(backendDraft.httpCheckUri),
      httpCheckExpect: normalizeText(backendDraft.httpCheckExpect),
      healthCheck: normalizeText(backendDraft.healthCheck),
      servers: backendDraft.servers,
    };

    if (!entry.name) {
      setError("Backend name is required.");
      return;
    }

    if (backends.some((item) => item.name === entry.name)) {
      setError("Backend name already exists.");
      return;
    }

    setBackends((previous) =>
      [...previous, entry].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    );
    setBackendDraft(EMPTY_BACKEND_DRAFT);
    setBackendHeadersInput("");
    setBackendServerDraft(EMPTY_BACKEND_SERVER_DRAFT);
  };

  const removeBackendEntry = (name: string) => {
    setBackends((previous) => previous.filter((item) => item.name !== name));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      if (wanGlobal.disableSourceNat !== currentWanGlobal.disableSourceNat) {
        operations.push(
          wanGlobal.disableSourceNat
            ? "set load-balancing wan disable-source-nat"
            : "delete load-balancing wan disable-source-nat"
        );
      }

      if (wanGlobal.flushConnections !== currentWanGlobal.flushConnections) {
        operations.push(
          wanGlobal.flushConnections
            ? "set load-balancing wan flush-connections"
            : "delete load-balancing wan flush-connections"
        );
      }

      if (wanGlobal.stickyConnectionsInbound !== currentWanGlobal.stickyConnectionsInbound) {
        operations.push(
          wanGlobal.stickyConnectionsInbound
            ? "set load-balancing wan sticky-connections inbound"
            : "delete load-balancing wan sticky-connections inbound"
        );
      }

      const desiredHookScriptName = normalizeText(wanGlobal.hookScriptName);
      const currentHookScriptName = normalizeText(currentWanGlobal.hookScriptName);
      if (desiredHookScriptName !== currentHookScriptName) {
        if (desiredHookScriptName) {
          operations.push(`set load-balancing wan hook script-name ${desiredHookScriptName}`);
        } else if (currentHookScriptName) {
          operations.push("delete load-balancing wan hook script-name");
        }
      }

      const currentHealthMap = new Map(currentWanHealth.map((entry) => [entry.interface, entry]));
      const desiredHealthMap = new Map(wanHealth.map((entry) => [entry.interface, entry]));

      for (const [iface] of currentHealthMap.entries()) {
        if (!desiredHealthMap.has(iface)) {
          operations.push(`delete load-balancing wan interface-health ${iface}`);
        }
      }

      for (const [iface, desired] of desiredHealthMap.entries()) {
        const current = currentHealthMap.get(iface);
        if (
          current &&
          current.nexthop === desired.nexthop &&
          current.failureCount === desired.failureCount &&
          current.successCount === desired.successCount
        ) {
          continue;
        }

        operations.push(`set load-balancing wan interface-health ${iface} nexthop ${desired.nexthop}`);

        if (desired.failureCount) {
          operations.push(`set load-balancing wan interface-health ${iface} failure-count ${desired.failureCount}`);
        } else if (current?.failureCount) {
          operations.push(`delete load-balancing wan interface-health ${iface} failure-count`);
        }

        if (desired.successCount) {
          operations.push(`set load-balancing wan interface-health ${iface} success-count ${desired.successCount}`);
        } else if (current?.successCount) {
          operations.push(`delete load-balancing wan interface-health ${iface} success-count`);
        }
      }

      const currentHealthTestMap = new Map(
        currentWanHealthTests.map((entry) => [`${entry.interface}::${entry.testId}`, entry])
      );
      const desiredHealthTestMap = new Map(
        wanHealthTests.map((entry) => [`${entry.interface}::${entry.testId}`, entry])
      );

      for (const [key, current] of currentHealthTestMap.entries()) {
        if (!desiredHealthTestMap.has(key)) {
          operations.push(
            `delete load-balancing wan interface-health ${current.interface} test ${current.testId}`
          );
        }
      }

      for (const [key, desired] of desiredHealthTestMap.entries()) {
        const current = currentHealthTestMap.get(key);
        const testPrefix = `load-balancing wan interface-health ${desired.interface} test ${desired.testId}`;

        if (current && current.type === desired.type) {
          // no-op
        } else if (desired.type) {
          operations.push(`set ${testPrefix} type ${desired.type}`);
        }

        if (current && current.target === desired.target) {
          // no-op
        } else if (desired.target) {
          operations.push(`set ${testPrefix} target ${desired.target}`);
        } else if (current?.target) {
          operations.push(`delete ${testPrefix} target`);
        }

        if (current && current.respTime === desired.respTime) {
          // no-op
        } else if (desired.respTime) {
          operations.push(`set ${testPrefix} resp-time ${desired.respTime}`);
        } else if (current?.respTime) {
          operations.push(`delete ${testPrefix} resp-time`);
        }

        if (current && current.ttlLimit === desired.ttlLimit) {
          // no-op
        } else if (desired.ttlLimit) {
          operations.push(`set ${testPrefix} ttl-limit ${desired.ttlLimit}`);
        } else if (current?.ttlLimit) {
          operations.push(`delete ${testPrefix} ttl-limit`);
        }

        if (current && current.testScript === desired.testScript) {
          // no-op
        } else if (desired.testScript) {
          operations.push(`set ${testPrefix} test-script ${desired.testScript}`);
        } else if (current?.testScript) {
          operations.push(`delete ${testPrefix} test-script`);
        }
      }

      const currentRuleMap = new Map(currentWanRules.map((entry) => [entry.ruleId, entry]));
      const desiredRuleMap = new Map(wanRules.map((entry) => [entry.ruleId, entry]));

      for (const [ruleId] of currentRuleMap.entries()) {
        if (!desiredRuleMap.has(ruleId)) {
          operations.push(`delete load-balancing wan rule ${ruleId}`);
        }
      }

      for (const [ruleId, desired] of desiredRuleMap.entries()) {
        const current = currentRuleMap.get(ruleId);

        if (
          current &&
          current.inboundInterface === desired.inboundInterface &&
          arrayEquals(
            [...current.outboundInterfaces].sort(),
            [...desired.outboundInterfaces].sort()
          ) &&
          weightMapEquals(current.outboundWeights, desired.outboundWeights) &&
          current.sourceAddress === desired.sourceAddress &&
          current.sourcePort === desired.sourcePort &&
          current.destinationAddress === desired.destinationAddress &&
          current.destinationPort === desired.destinationPort &&
          current.protocol === desired.protocol &&
          current.exclude === desired.exclude &&
          current.failover === desired.failover &&
          current.perPacketBalancing === desired.perPacketBalancing &&
          current.limitRate === desired.limitRate &&
          current.limitBurst === desired.limitBurst &&
          current.limitThreshold === desired.limitThreshold &&
          current.limitPeriod === desired.limitPeriod
        ) {
          continue;
        }

        operations.push(`set load-balancing wan rule ${ruleId} inbound-interface ${desired.inboundInterface}`);

        const currentOutbounds = uniqueList(current?.outboundInterfaces || []);
        const desiredOutbounds = uniqueList(desired.outboundInterfaces);

        for (const iface of currentOutbounds) {
          if (!desiredOutbounds.includes(iface)) {
            operations.push(`delete load-balancing wan rule ${ruleId} interface ${iface}`);
          }
        }

        for (const iface of desiredOutbounds) {
          if (!currentOutbounds.includes(iface)) {
            operations.push(`set load-balancing wan rule ${ruleId} interface ${iface}`);
          }

          const desiredWeight = normalizeText(desired.outboundWeights[iface] || "");
          const currentWeight = normalizeText(current?.outboundWeights[iface] || "");
          if (desiredWeight && desiredWeight !== currentWeight) {
            operations.push(`set load-balancing wan rule ${ruleId} interface ${iface} weight ${desiredWeight}`);
          } else if (!desiredWeight && currentWeight) {
            operations.push(`delete load-balancing wan rule ${ruleId} interface ${iface} weight`);
          }
        }

        if (desired.protocol) {
          operations.push(`set load-balancing wan rule ${ruleId} protocol ${desired.protocol}`);
        } else if (current?.protocol) {
          operations.push(`delete load-balancing wan rule ${ruleId} protocol`);
        }

        if (desired.sourceAddress) {
          operations.push(`set load-balancing wan rule ${ruleId} source address ${desired.sourceAddress}`);
        } else if (current?.sourceAddress) {
          operations.push(`delete load-balancing wan rule ${ruleId} source address`);
        }

        if (desired.sourcePort) {
          operations.push(`set load-balancing wan rule ${ruleId} source port ${desired.sourcePort}`);
        } else if (current?.sourcePort) {
          operations.push(`delete load-balancing wan rule ${ruleId} source port`);
        }

        if (desired.destinationAddress) {
          operations.push(
            `set load-balancing wan rule ${ruleId} destination address ${desired.destinationAddress}`
          );
        } else if (current?.destinationAddress) {
          operations.push(`delete load-balancing wan rule ${ruleId} destination address`);
        }

        if (desired.destinationPort) {
          operations.push(`set load-balancing wan rule ${ruleId} destination port ${desired.destinationPort}`);
        } else if (current?.destinationPort) {
          operations.push(`delete load-balancing wan rule ${ruleId} destination port`);
        }

        if (desired.limitRate) {
          operations.push(`set load-balancing wan rule ${ruleId} limit rate ${desired.limitRate}`);
        } else if (current?.limitRate) {
          operations.push(`delete load-balancing wan rule ${ruleId} limit rate`);
        }

        if (desired.limitBurst) {
          operations.push(`set load-balancing wan rule ${ruleId} limit burst ${desired.limitBurst}`);
        } else if (current?.limitBurst) {
          operations.push(`delete load-balancing wan rule ${ruleId} limit burst`);
        }

        if (desired.limitThreshold) {
          operations.push(`set load-balancing wan rule ${ruleId} limit threshold ${desired.limitThreshold}`);
        } else if (current?.limitThreshold) {
          operations.push(`delete load-balancing wan rule ${ruleId} limit threshold`);
        }

        if (desired.limitPeriod) {
          operations.push(`set load-balancing wan rule ${ruleId} limit period ${desired.limitPeriod}`);
        } else if (current?.limitPeriod) {
          operations.push(`delete load-balancing wan rule ${ruleId} limit period`);
        }

        const currentExclude = current?.exclude ?? false;
        const currentFailover = current?.failover ?? false;
        const currentPerPacketBalancing = current?.perPacketBalancing ?? false;

        if (desired.exclude !== currentExclude) {
          operations.push(
            desired.exclude
              ? `set load-balancing wan rule ${ruleId} exclude`
              : `delete load-balancing wan rule ${ruleId} exclude`
          );
        }

        if (desired.failover !== currentFailover) {
          operations.push(
            desired.failover
              ? `set load-balancing wan rule ${ruleId} failover`
              : `delete load-balancing wan rule ${ruleId} failover`
          );
        }

        if (desired.perPacketBalancing !== currentPerPacketBalancing) {
          operations.push(
            desired.perPacketBalancing
              ? `set load-balancing wan rule ${ruleId} per-packet-balancing`
              : `delete load-balancing wan rule ${ruleId} per-packet-balancing`
          );
        }
      }

      const setOrDelete = (path: string, desiredValue: string, currentValue: string) => {
        const desired = normalizeText(desiredValue);
        const current = normalizeText(currentValue);
        if (desired === current) return;
        if (desired) {
          operations.push(`set ${path} ${quoteCliValue(desired)}`);
        } else if (current) {
          operations.push(`delete ${path}`);
        }
      };

      setOrDelete(
        "load-balancing haproxy global-parameters max-connections",
        haproxyGlobal.maxConnections,
        currentHaproxyGlobal.maxConnections
      );
      setOrDelete(
        "load-balancing haproxy global-parameters ssl-bind-ciphers",
        haproxyGlobal.sslBindCiphers,
        currentHaproxyGlobal.sslBindCiphers
      );
      setOrDelete(
        "load-balancing haproxy global-parameters tls-version-min",
        haproxyGlobal.tlsVersionMin,
        currentHaproxyGlobal.tlsVersionMin
      );
      setOrDelete(
        "load-balancing haproxy global-parameters logging facility",
        haproxyGlobal.loggingFacility,
        currentHaproxyGlobal.loggingFacility
      );
      setOrDelete(
        "load-balancing haproxy global-parameters logging level",
        haproxyGlobal.loggingLevel,
        currentHaproxyGlobal.loggingLevel
      );
      setOrDelete(
        "load-balancing haproxy timeout check",
        haproxyGlobal.timeoutCheck,
        currentHaproxyGlobal.timeoutCheck
      );
      setOrDelete(
        "load-balancing haproxy timeout client",
        haproxyGlobal.timeoutClient,
        currentHaproxyGlobal.timeoutClient
      );
      setOrDelete(
        "load-balancing haproxy timeout connect",
        haproxyGlobal.timeoutConnect,
        currentHaproxyGlobal.timeoutConnect
      );
      setOrDelete(
        "load-balancing haproxy timeout server",
        haproxyGlobal.timeoutServer,
        currentHaproxyGlobal.timeoutServer
      );

      const currentServiceMap = new Map(currentServices.map((entry) => [entry.name, entry]));
      const desiredServiceMap = new Map(services.map((entry) => [entry.name, entry]));

      for (const [name, current] of currentServiceMap.entries()) {
        if (!desiredServiceMap.has(name)) {
          operations.push(`delete load-balancing haproxy service ${quoteCliValue(name)}`);
          if (current.bindLegacy || current.defaultBackendLegacy) {
            operations.push(`delete load-balancing haproxy frontend ${quoteCliValue(name)}`);
          }
        }
      }

      for (const [name, desired] of desiredServiceMap.entries()) {
        const current = currentServiceMap.get(name);
        const servicePrefix = `load-balancing haproxy service ${quoteCliValue(name)}`;

        if (current?.bindLegacy || current?.defaultBackendLegacy) {
          operations.push(`delete load-balancing haproxy frontend ${quoteCliValue(name)}`);
        }

        setOrDelete(`${servicePrefix} mode`, desired.mode, current?.mode || "");
        setOrDelete(`${servicePrefix} port`, desired.port, current?.port || "");
        setOrDelete(`${servicePrefix} backend`, desired.backend, current?.backend || "");
        setOrDelete(`${servicePrefix} timeout client`, desired.timeoutClient, current?.timeoutClient || "");
        setOrDelete(
          `${servicePrefix} logging facility`,
          desired.loggingFacility,
          current?.loggingFacility || ""
        );
        setOrDelete(`${servicePrefix} logging level`, desired.loggingLevel, current?.loggingLevel || "");
        setOrDelete(
          `${servicePrefix} http-compression algorithm`,
          desired.httpCompressionAlgorithm,
          current?.httpCompressionAlgorithm || ""
        );

        const currentListen = uniqueList(current?.listenAddresses || []);
        const desiredListen = uniqueList(desired.listenAddresses);
        for (const listenAddress of currentListen) {
          if (!desiredListen.includes(listenAddress)) {
            operations.push(
              `delete ${servicePrefix} listen-address ${quoteCliValue(listenAddress)}`
            );
          }
        }
        for (const listenAddress of desiredListen) {
          if (!currentListen.includes(listenAddress)) {
            operations.push(`set ${servicePrefix} listen-address ${quoteCliValue(listenAddress)}`);
          }
        }

        const currentCertificates = uniqueList(current?.sslCertificates || []);
        const desiredCertificates = uniqueList(desired.sslCertificates);
        for (const certificate of currentCertificates) {
          if (!desiredCertificates.includes(certificate)) {
            operations.push(
              `delete ${servicePrefix} ssl certificate ${quoteCliValue(certificate)}`
            );
          }
        }
        for (const certificate of desiredCertificates) {
          if (!currentCertificates.includes(certificate)) {
            operations.push(`set ${servicePrefix} ssl certificate ${quoteCliValue(certificate)}`);
          }
        }

        const currentMimeTypes = uniqueList(current?.httpCompressionMimeTypes || []);
        const desiredMimeTypes = uniqueList(desired.httpCompressionMimeTypes);
        for (const mimeType of currentMimeTypes) {
          if (!desiredMimeTypes.includes(mimeType)) {
            operations.push(
              `delete ${servicePrefix} http-compression mime-type ${quoteCliValue(mimeType)}`
            );
          }
        }
        for (const mimeType of desiredMimeTypes) {
          if (!currentMimeTypes.includes(mimeType)) {
            operations.push(
              `set ${servicePrefix} http-compression mime-type ${quoteCliValue(mimeType)}`
            );
          }
        }

        const currentHeaders = current?.httpResponseHeaders || {};
        const desiredHeaders = desired.httpResponseHeaders;
        for (const headerName of Object.keys(currentHeaders)) {
          if (!Object.prototype.hasOwnProperty.call(desiredHeaders, headerName)) {
            operations.push(
              `delete ${servicePrefix} http-response-headers ${quoteCliValue(headerName)}`
            );
          }
        }
        for (const [headerName, headerValue] of Object.entries(desiredHeaders)) {
          const currentHeaderValue = normalizeText(currentHeaders[headerName] || "");
          const desiredHeaderValue = normalizeText(headerValue || "");
          if (desiredHeaderValue !== currentHeaderValue) {
            operations.push(
              `set ${servicePrefix} http-response-headers ${quoteCliValue(headerName)} value ${quoteCliValue(desiredHeaderValue)}`
            );
          }
        }

        const currentRedirectHttps = current?.redirectHttpToHttps ?? false;
        if (desired.redirectHttpToHttps !== currentRedirectHttps) {
          operations.push(
            desired.redirectHttpToHttps
              ? `set ${servicePrefix} redirect-http-to-https`
              : `delete ${servicePrefix} redirect-http-to-https`
          );
        }

        const currentRuleMap = new Map((current?.rules || []).map((rule) => [rule.ruleId, rule]));
        const desiredRuleMap = new Map(desired.rules.map((rule) => [rule.ruleId, rule]));

        for (const [ruleId] of currentRuleMap.entries()) {
          if (!desiredRuleMap.has(ruleId)) {
            operations.push(`delete ${servicePrefix} rule ${quoteCliValue(ruleId)}`);
          }
        }

        for (const [ruleId, desiredRule] of desiredRuleMap.entries()) {
          const currentRule = currentRuleMap.get(ruleId);
          const rulePrefix = `${servicePrefix} rule ${quoteCliValue(ruleId)}`;

          setOrDelete(`${rulePrefix} domain-name`, desiredRule.domainName, currentRule?.domainName || "");
          setOrDelete(`${rulePrefix} ssl`, desiredRule.sslSni, currentRule?.sslSni || "");
          setOrDelete(
            `${rulePrefix} redirect-location`,
            desiredRule.redirectLocation,
            currentRule?.redirectLocation || ""
          );
          setOrDelete(
            `${rulePrefix} set backend`,
            desiredRule.setBackend,
            currentRule?.setBackend || ""
          );

          const desiredMatch = normalizeText(desiredRule.urlPathMatch);
          const currentMatch = normalizeText(currentRule?.urlPathMatch || "");
          const desiredPath = normalizeText(desiredRule.urlPath);
          const currentPath = normalizeText(currentRule?.urlPath || "");

          if (!desiredMatch || !desiredPath) {
            if (currentMatch || currentPath) {
              operations.push(`delete ${rulePrefix} url-path`);
            }
          } else if (desiredMatch !== currentMatch || desiredPath !== currentPath) {
            if (currentMatch || currentPath) {
              operations.push(`delete ${rulePrefix} url-path`);
            }
            operations.push(
              `set ${rulePrefix} url-path ${quoteCliValue(desiredMatch)} ${quoteCliValue(desiredPath)}`
            );
          }
        }
      }

      const currentBackendMap = new Map(currentBackends.map((entry) => [entry.name, entry]));
      const desiredBackendMap = new Map(backends.map((entry) => [entry.name, entry]));

      for (const [name] of currentBackendMap.entries()) {
        if (!desiredBackendMap.has(name)) {
          operations.push(`delete load-balancing haproxy backend ${quoteCliValue(name)}`);
        }
      }

      for (const [name, desired] of desiredBackendMap.entries()) {
        const current = currentBackendMap.get(name);
        const backendPrefix = `load-balancing haproxy backend ${quoteCliValue(name)}`;

        setOrDelete(`${backendPrefix} mode`, desired.mode, current?.mode || "");
        setOrDelete(`${backendPrefix} balance`, desired.balance, current?.balance || "");
        setOrDelete(
          `${backendPrefix} ssl ca-certificate`,
          desired.sslCaCertificate,
          current?.sslCaCertificate || ""
        );
        setOrDelete(`${backendPrefix} logging facility`, desired.loggingFacility, current?.loggingFacility || "");
        setOrDelete(`${backendPrefix} logging level`, desired.loggingLevel, current?.loggingLevel || "");
        setOrDelete(`${backendPrefix} timeout check`, desired.timeoutCheck, current?.timeoutCheck || "");
        setOrDelete(`${backendPrefix} timeout connect`, desired.timeoutConnect, current?.timeoutConnect || "");
        setOrDelete(`${backendPrefix} timeout server`, desired.timeoutServer, current?.timeoutServer || "");
        setOrDelete(
          `${backendPrefix} health-check`,
          desired.healthCheck,
          current?.healthCheck || ""
        );

        const currentSslNoVerify = current?.sslNoVerify ?? false;
        if (desired.sslNoVerify !== currentSslNoVerify) {
          operations.push(
            desired.sslNoVerify
              ? `set ${backendPrefix} ssl no-verify`
              : `delete ${backendPrefix} ssl no-verify`
          );
        }

        const currentHttpCheckEnabled = current?.httpCheckEnabled ?? false;
        if (desired.httpCheckEnabled !== currentHttpCheckEnabled) {
          operations.push(
            desired.httpCheckEnabled
              ? `set ${backendPrefix} http-check`
              : `delete ${backendPrefix} http-check`
          );
        }
        setOrDelete(`${backendPrefix} http-check method`, desired.httpCheckMethod, current?.httpCheckMethod || "");
        setOrDelete(`${backendPrefix} http-check uri`, desired.httpCheckUri, current?.httpCheckUri || "");
        setOrDelete(
          `${backendPrefix} http-check expect`,
          desired.httpCheckExpect,
          current?.httpCheckExpect || ""
        );

        const currentHeaders = current?.httpResponseHeaders || {};
        const desiredHeaders = desired.httpResponseHeaders;
        for (const headerName of Object.keys(currentHeaders)) {
          if (!Object.prototype.hasOwnProperty.call(desiredHeaders, headerName)) {
            operations.push(
              `delete ${backendPrefix} http-response-headers ${quoteCliValue(headerName)}`
            );
          }
        }
        for (const [headerName, headerValue] of Object.entries(desiredHeaders)) {
          const currentHeaderValue = normalizeText(currentHeaders[headerName] || "");
          const desiredHeaderValue = normalizeText(headerValue || "");
          if (desiredHeaderValue !== currentHeaderValue) {
            operations.push(
              `set ${backendPrefix} http-response-headers ${quoteCliValue(headerName)} value ${quoteCliValue(desiredHeaderValue)}`
            );
          }
        }

        const currentServers = current?.servers || {};
        const desiredServers = desired.servers;
        for (const serverName of Object.keys(currentServers)) {
          if (!Object.prototype.hasOwnProperty.call(desiredServers, serverName)) {
            operations.push(`delete ${backendPrefix} server ${quoteCliValue(serverName)}`);
          }
        }

        for (const [serverName, server] of Object.entries(desiredServers)) {
          const currentServer = currentServers[serverName];
          const serverPrefix = `${backendPrefix} server ${quoteCliValue(serverName)}`;
          setOrDelete(`${serverPrefix} address`, server.address, currentServer?.address || "");
          setOrDelete(`${serverPrefix} port`, server.port, currentServer?.port || "");

          const currentCheck = currentServer?.check ?? false;
          if (server.check !== currentCheck) {
            operations.push(server.check ? `set ${serverPrefix} check` : `delete ${serverPrefix} check`);
          }
          setOrDelete(`${serverPrefix} check port`, server.checkPort, currentServer?.checkPort || "");

          const currentSendProxy = currentServer?.sendProxy ?? false;
          if (server.sendProxy !== currentSendProxy) {
            operations.push(
              server.sendProxy ? `set ${serverPrefix} send-proxy` : `delete ${serverPrefix} send-proxy`
            );
          }

          const currentSendProxyV2 = currentServer?.sendProxyV2 ?? false;
          if (server.sendProxyV2 !== currentSendProxyV2) {
            operations.push(
              server.sendProxyV2
                ? `set ${serverPrefix} send-proxy-v2`
                : `delete ${serverPrefix} send-proxy-v2`
            );
          }
        }
      }

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await loadBalancingService.batchConfigure(operations);
      if (!result.success) {
        throw new Error(result.error || "Failed to save load-balancing configuration");
      }

      setMessage("Load-balancing configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save load-balancing configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Load Balancing</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure WAN load balancing and HAProxy application load-balancing from structured forms.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {message && (
          <Card className="border-primary/40">
            <CardContent className="pt-6 text-sm text-primary">{message}</CardContent>
          </Card>
        )}

        <Tabs defaultValue="wan" className="space-y-4">
          <TabsList>
            <TabsTrigger value="wan">WAN</TabsTrigger>
            <TabsTrigger value="haproxy">HAProxy</TabsTrigger>
          </TabsList>

          <TabsContent value="wan" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>WAN Global Options</CardTitle>
                <CardDescription>Control global WAN load-balancing behavior.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
                    <Checkbox
                      checked={wanGlobal.disableSourceNat}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        setWanGlobal((previous) => ({ ...previous, disableSourceNat: checked === true }))
                      }
                    />
                    <span>Disable Source NAT</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
                    <Checkbox
                      checked={wanGlobal.flushConnections}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        setWanGlobal((previous) => ({ ...previous, flushConnections: checked === true }))
                      }
                    />
                    <span>Flush Connections on Interface Events</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm md:col-span-2">
                    <Checkbox
                      checked={wanGlobal.stickyConnectionsInbound}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        setWanGlobal((previous) => ({
                          ...previous,
                          stickyConnectionsInbound: checked === true,
                        }))
                      }
                    />
                    <span>Sticky Connections (Inbound)</span>
                  </label>
                </div>
                <div className="space-y-2">
                  <Label>Hook Script Name (optional)</Label>
                  <Input
                    value={wanGlobal.hookScriptName}
                    onChange={(event) =>
                      setWanGlobal((previous) => ({ ...previous, hookScriptName: event.target.value }))
                    }
                    placeholder="/config/scripts/wan-hook.sh"
                    disabled={!canEdit}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Interface Health</CardTitle>
                <CardDescription>Define WAN interfaces and health failover thresholds.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Interface</Label>
                    <Select
                      value={healthDraft.interface || ""}
                      onValueChange={(value) => setHealthDraft((previous) => ({ ...previous, interface: value }))}
                      disabled={!canEdit || interfaceOptions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select interface" />
                      </SelectTrigger>
                      <SelectContent>
                        {interfaceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nexthop</Label>
                    <Input
                      value={healthDraft.nexthop}
                      onChange={(event) =>
                        setHealthDraft((previous) => ({ ...previous, nexthop: event.target.value }))
                      }
                      placeholder="203.0.113.1"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Failure Count</Label>
                    <Input
                      value={healthDraft.failureCount}
                      onChange={(event) =>
                        setHealthDraft((previous) => ({ ...previous, failureCount: event.target.value }))
                      }
                      placeholder="3"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Success Count</Label>
                    <Input
                      value={healthDraft.successCount}
                      onChange={(event) =>
                        setHealthDraft((previous) => ({ ...previous, successCount: event.target.value }))
                      }
                      placeholder="1"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={addHealthEntry} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Interface Health
                </Button>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Nexthop</TableHead>
                      <TableHead>Failure</TableHead>
                      <TableHead>Success</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wanHealth.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          No WAN health entries configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      wanHealth.map((entry) => (
                        <TableRow key={entry.interface}>
                          <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                          <TableCell>{entry.nexthop}</TableCell>
                          <TableCell>{entry.failureCount || "-"}</TableCell>
                          <TableCell>{entry.successCount || "-"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeHealthEntry(entry.interface)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Interface Health Tests</CardTitle>
                <CardDescription>
                  Define test probes per WAN interface (`ping`, `ttl`, or custom script).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Interface</Label>
                    <Select
                      value={healthTestDraft.interface || ""}
                      onValueChange={(value) =>
                        setHealthTestDraft((previous) => ({ ...previous, interface: value }))
                      }
                      disabled={!canEdit || interfaceOptions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select interface" />
                      </SelectTrigger>
                      <SelectContent>
                        {interfaceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Test ID</Label>
                    <Input
                      value={healthTestDraft.testId}
                      onChange={(event) =>
                        setHealthTestDraft((previous) => ({ ...previous, testId: event.target.value }))
                      }
                      placeholder="10"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={healthTestDraft.type || ""}
                      onValueChange={(value) =>
                        setHealthTestDraft((previous) => ({ ...previous, type: value }))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ping">ping</SelectItem>
                        <SelectItem value="ttl">ttl</SelectItem>
                        <SelectItem value="script">script</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Target</Label>
                    <Input
                      value={healthTestDraft.target}
                      onChange={(event) =>
                        setHealthTestDraft((previous) => ({ ...previous, target: event.target.value }))
                      }
                      placeholder="8.8.8.8"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Response Time (ms)</Label>
                    <Input
                      value={healthTestDraft.respTime}
                      onChange={(event) =>
                        setHealthTestDraft((previous) => ({ ...previous, respTime: event.target.value }))
                      }
                      placeholder="1000"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>TTL Limit</Label>
                    <Input
                      value={healthTestDraft.ttlLimit}
                      onChange={(event) =>
                        setHealthTestDraft((previous) => ({ ...previous, ttlLimit: event.target.value }))
                      }
                      placeholder="5"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Test Script (optional)</Label>
                    <Input
                      value={healthTestDraft.testScript}
                      onChange={(event) =>
                        setHealthTestDraft((previous) => ({ ...previous, testScript: event.target.value }))
                      }
                      placeholder="/config/scripts/check-isp.sh"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={addHealthTestEntry} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Health Test
                </Button>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Test ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Resp Time</TableHead>
                      <TableHead>TTL</TableHead>
                      <TableHead>Script</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wanHealthTests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-muted-foreground">
                          No WAN health tests configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      wanHealthTests.map((entry) => (
                        <TableRow key={`${entry.interface}-${entry.testId}`}>
                          <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                          <TableCell>{entry.testId}</TableCell>
                          <TableCell>{entry.type || "-"}</TableCell>
                          <TableCell>{entry.target || "-"}</TableCell>
                          <TableCell>{entry.respTime || "-"}</TableCell>
                          <TableCell>{entry.ttlLimit || "-"}</TableCell>
                          <TableCell>{entry.testScript || "-"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeHealthTestEntry(entry.interface, entry.testId)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>WAN Rules</CardTitle>
                <CardDescription>Map inbound traffic to one or more outbound WAN interfaces.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Rule ID</Label>
                    <Input
                      value={ruleDraft.ruleId}
                      onChange={(event) => setRuleDraft((previous) => ({ ...previous, ruleId: event.target.value }))}
                      placeholder="10"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Inbound Interface</Label>
                    <Select
                      value={ruleDraft.inboundInterface || ""}
                      onValueChange={(value) =>
                        setRuleDraft((previous) => ({ ...previous, inboundInterface: value }))
                      }
                      disabled={!canEdit || interfaceOptions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select interface" />
                      </SelectTrigger>
                      <SelectContent>
                        {interfaceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Protocol (optional)</Label>
                    <Input
                      value={ruleDraft.protocol}
                      onChange={(event) =>
                        setRuleDraft((previous) => ({ ...previous, protocol: event.target.value }))
                      }
                      placeholder="tcp"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Outbound Interfaces</Label>
                    <Input
                      value={ruleOutboundInput}
                      onChange={(event) => setRuleOutboundInput(event.target.value)}
                      placeholder="eth1, eth2"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Outbound Weights (optional)</Label>
                    <Input
                      value={ruleOutboundWeightsInput}
                      onChange={(event) => setRuleOutboundWeightsInput(event.target.value)}
                      placeholder="eth1=100, eth2=50"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Source Address</Label>
                    <Input
                      value={ruleDraft.sourceAddress}
                      onChange={(event) =>
                        setRuleDraft((previous) => ({ ...previous, sourceAddress: event.target.value }))
                      }
                      placeholder="192.168.1.0/24"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Source Port</Label>
                    <Input
                      value={ruleDraft.sourcePort}
                      onChange={(event) =>
                        setRuleDraft((previous) => ({ ...previous, sourcePort: event.target.value }))
                      }
                      placeholder="1024-65535"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Destination Address</Label>
                    <Input
                      value={ruleDraft.destinationAddress}
                      onChange={(event) =>
                        setRuleDraft((previous) => ({ ...previous, destinationAddress: event.target.value }))
                      }
                      placeholder="0.0.0.0/0"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Destination Port</Label>
                    <Input
                      value={ruleDraft.destinationPort}
                      onChange={(event) =>
                        setRuleDraft((previous) => ({ ...previous, destinationPort: event.target.value }))
                      }
                      placeholder="443"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Limit Rate</Label>
                    <Input
                      value={ruleDraft.limitRate}
                      onChange={(event) =>
                        setRuleDraft((previous) => ({ ...previous, limitRate: event.target.value }))
                      }
                      placeholder="1000/minute"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Limit Burst</Label>
                    <Input
                      value={ruleDraft.limitBurst}
                      onChange={(event) =>
                        setRuleDraft((previous) => ({ ...previous, limitBurst: event.target.value }))
                      }
                      placeholder="20"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Limit Threshold</Label>
                    <Input
                      value={ruleDraft.limitThreshold}
                      onChange={(event) =>
                        setRuleDraft((previous) => ({ ...previous, limitThreshold: event.target.value }))
                      }
                      placeholder="10"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Limit Period</Label>
                    <Input
                      value={ruleDraft.limitPeriod}
                      onChange={(event) =>
                        setRuleDraft((previous) => ({ ...previous, limitPeriod: event.target.value }))
                      }
                      placeholder="second"
                      disabled={!canEdit}
                    />
                  </div>
                  <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm md:col-span-1">
                    <Checkbox
                      checked={ruleDraft.exclude}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        setRuleDraft((previous) => ({ ...previous, exclude: checked === true }))
                      }
                    />
                    <span>Exclude</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm md:col-span-1">
                    <Checkbox
                      checked={ruleDraft.failover}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        setRuleDraft((previous) => ({ ...previous, failover: checked === true }))
                      }
                    />
                    <span>Failover</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm md:col-span-1">
                    <Checkbox
                      checked={ruleDraft.perPacketBalancing}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        setRuleDraft((previous) => ({ ...previous, perPacketBalancing: checked === true }))
                      }
                    />
                    <span>Per-Packet Balancing</span>
                  </label>
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 p-3">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Quick Select Outbound Interfaces
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {interfaceOptions
                      .filter((option) => option.value !== ruleDraft.inboundInterface)
                      .map((option) => {
                        const isChecked = selectedOutboundInterfaces.has(option.value);
                        return (
                          <label
                            key={option.value}
                            className={`flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm ${
                              canEdit ? "cursor-pointer hover:bg-muted/40" : "cursor-not-allowed opacity-70"
                            }`}
                          >
                            <Checkbox
                              checked={isChecked}
                              disabled={!canEdit}
                              onCheckedChange={(checked) =>
                                toggleRuleOutboundInterface(option.value, checked === true)
                              }
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>

                <Button type="button" variant="outline" onClick={addRuleEntry} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Rule
                </Button>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Inbound</TableHead>
                      <TableHead>Outbound Interfaces</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Source / Destination</TableHead>
                      <TableHead>Options</TableHead>
                      <TableHead>Rate Limit</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wanRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-muted-foreground">
                          No WAN rules configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      wanRules.map((entry) => (
                        <TableRow key={entry.ruleId}>
                          <TableCell>
                            <Badge variant="secondary">{entry.ruleId}</Badge>
                          </TableCell>
                          <TableCell>{interfaceLabelByName[entry.inboundInterface] || entry.inboundInterface}</TableCell>
                          <TableCell>
                            {entry.outboundInterfaces
                              .map((iface) => {
                                const label = interfaceLabelByName[iface] || iface;
                                const weight = normalizeText(entry.outboundWeights[iface] || "");
                                return weight ? `${label} (w:${weight})` : label;
                              })
                              .join(", ")}
                          </TableCell>
                          <TableCell>{entry.protocol || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            src: {entry.sourceAddress || "any"}
                            {entry.sourcePort ? `:${entry.sourcePort}` : ""}
                            <br />
                            dst: {entry.destinationAddress || "any"}
                            {entry.destinationPort ? `:${entry.destinationPort}` : ""}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {[
                              entry.exclude ? "exclude" : null,
                              entry.failover ? "failover" : null,
                              entry.perPacketBalancing ? "per-packet" : null,
                            ]
                              .filter(Boolean)
                              .join(", ") || "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {[
                              entry.limitRate ? `rate:${entry.limitRate}` : null,
                              entry.limitBurst ? `burst:${entry.limitBurst}` : null,
                              entry.limitThreshold ? `threshold:${entry.limitThreshold}` : null,
                              entry.limitPeriod ? `period:${entry.limitPeriod}` : null,
                            ]
                              .filter(Boolean)
                              .join(" | ") || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRuleEntry(entry.ruleId)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="haproxy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>HAProxy Global Parameters</CardTitle>
                <CardDescription>Configure global limits, logging, TLS, and default timeouts.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Max Connections</Label>
                  <Input
                    value={haproxyGlobal.maxConnections}
                    onChange={(event) =>
                      setHaproxyGlobal((previous) => ({ ...previous, maxConnections: event.target.value }))
                    }
                    placeholder="2000"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>TLS Version Minimum</Label>
                  <Select
                    value={haproxyGlobal.tlsVersionMin || "__none__"}
                    onValueChange={(value) =>
                      setHaproxyGlobal((previous) => ({
                        ...previous,
                        tlsVersionMin: value === "__none__" ? "" : value,
                      }))
                    }
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Default</SelectItem>
                      <SelectItem value="1.2">1.2</SelectItem>
                      <SelectItem value="1.3">1.3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>SSL Bind Ciphers</Label>
                  <Input
                    value={haproxyGlobal.sslBindCiphers}
                    onChange={(event) =>
                      setHaproxyGlobal((previous) => ({ ...previous, sslBindCiphers: event.target.value }))
                    }
                    placeholder="ECDHE-ECDSA-AES128-GCM-SHA256:..."
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Logging Facility</Label>
                  <Input
                    value={haproxyGlobal.loggingFacility}
                    onChange={(event) =>
                      setHaproxyGlobal((previous) => ({ ...previous, loggingFacility: event.target.value }))
                    }
                    placeholder="local0"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Logging Level</Label>
                  <Input
                    value={haproxyGlobal.loggingLevel}
                    onChange={(event) =>
                      setHaproxyGlobal((previous) => ({ ...previous, loggingLevel: event.target.value }))
                    }
                    placeholder="info"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timeout Check</Label>
                  <Input
                    value={haproxyGlobal.timeoutCheck}
                    onChange={(event) =>
                      setHaproxyGlobal((previous) => ({ ...previous, timeoutCheck: event.target.value }))
                    }
                    placeholder="5"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timeout Client</Label>
                  <Input
                    value={haproxyGlobal.timeoutClient}
                    onChange={(event) =>
                      setHaproxyGlobal((previous) => ({ ...previous, timeoutClient: event.target.value }))
                    }
                    placeholder="50"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timeout Connect</Label>
                  <Input
                    value={haproxyGlobal.timeoutConnect}
                    onChange={(event) =>
                      setHaproxyGlobal((previous) => ({ ...previous, timeoutConnect: event.target.value }))
                    }
                    placeholder="10"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timeout Server</Label>
                  <Input
                    value={haproxyGlobal.timeoutServer}
                    onChange={(event) =>
                      setHaproxyGlobal((previous) => ({ ...previous, timeoutServer: event.target.value }))
                    }
                    placeholder="50"
                    disabled={!canEdit}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Services</CardTitle>
                <CardDescription>
                  Define listener services, backend targets, headers, compression, and HTTPS redirects.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={serviceDraft.name}
                      onChange={(event) =>
                        setServiceDraft((previous) => ({ ...previous, name: event.target.value }))
                      }
                      placeholder="http-in"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <Select
                      value={serviceDraft.mode || "__none__"}
                      onValueChange={(value) =>
                        setServiceDraft((previous) => ({
                          ...previous,
                          mode: value === "__none__" ? "" : value,
                        }))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unset</SelectItem>
                        <SelectItem value="http">http</SelectItem>
                        <SelectItem value="tcp">tcp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Listen Addresses</Label>
                    <Input
                      value={serviceListenInput}
                      onChange={(event) => setServiceListenInput(event.target.value)}
                      placeholder="0.0.0.0, ::"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input
                      value={serviceDraft.port}
                      onChange={(event) =>
                        setServiceDraft((previous) => ({ ...previous, port: event.target.value }))
                      }
                      placeholder="443"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Backend</Label>
                    <Input
                      value={serviceDraft.backend}
                      onChange={(event) =>
                        setServiceDraft((previous) => ({ ...previous, backend: event.target.value }))
                      }
                      placeholder={backendNames[0] || "backend-main"}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SSL Certificates</Label>
                    <Input
                      value={serviceSslCertificatesInput}
                      onChange={(event) => setServiceSslCertificatesInput(event.target.value)}
                      placeholder="cert-main, cert-alt"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Response Headers (key=value)</Label>
                    <Input
                      value={serviceHeadersInput}
                      onChange={(event) => setServiceHeadersInput(event.target.value)}
                      placeholder="X-Frame-Options=DENY, X-Service=VyManager"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Compression Algorithm</Label>
                    <Select
                      value={serviceDraft.httpCompressionAlgorithm || "__none__"}
                      onValueChange={(value) =>
                        setServiceDraft((previous) => ({
                          ...previous,
                          httpCompressionAlgorithm: value === "__none__" ? "" : value,
                        }))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unset</SelectItem>
                        <SelectItem value="gzip">gzip</SelectItem>
                        <SelectItem value="deflate">deflate</SelectItem>
                        <SelectItem value="identity">identity</SelectItem>
                        <SelectItem value="raw-deflate">raw-deflate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Compression MIME Types</Label>
                    <Input
                      value={serviceMimeTypesInput}
                      onChange={(event) => setServiceMimeTypesInput(event.target.value)}
                      placeholder="text/html, text/css"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Timeout Client</Label>
                    <Input
                      value={serviceDraft.timeoutClient}
                      onChange={(event) =>
                        setServiceDraft((previous) => ({ ...previous, timeoutClient: event.target.value }))
                      }
                      placeholder="50"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Logging Facility</Label>
                    <Input
                      value={serviceDraft.loggingFacility}
                      onChange={(event) =>
                        setServiceDraft((previous) => ({ ...previous, loggingFacility: event.target.value }))
                      }
                      placeholder="local0"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Logging Level</Label>
                    <Input
                      value={serviceDraft.loggingLevel}
                      onChange={(event) =>
                        setServiceDraft((previous) => ({ ...previous, loggingLevel: event.target.value }))
                      }
                      placeholder="info"
                      disabled={!canEdit}
                    />
                  </div>
                  <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
                    <Checkbox
                      checked={serviceDraft.redirectHttpToHttps}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        setServiceDraft((previous) => ({
                          ...previous,
                          redirectHttpToHttps: checked === true,
                        }))
                      }
                    />
                    <span>Redirect HTTP to HTTPS</span>
                  </label>
                </div>

                <Button type="button" variant="outline" onClick={addServiceEntry} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Service
                </Button>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Listeners</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Backend</TableHead>
                      <TableHead>Rules</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground">
                          No HAProxy services configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      services.map((entry) => (
                        <TableRow key={entry.name}>
                          <TableCell className="font-medium">{entry.name}</TableCell>
                          <TableCell>
                            {entry.listenAddresses.length > 0
                              ? `${entry.listenAddresses.join(", ")}${entry.port ? `:${entry.port}` : ""}`
                              : entry.bindLegacy || "-"}
                          </TableCell>
                          <TableCell>{entry.mode || "-"}</TableCell>
                          <TableCell>{entry.backend || entry.defaultBackendLegacy || "-"}</TableCell>
                          <TableCell>{entry.rules.length}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeServiceEntry(entry.name)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <h4 className="text-sm font-semibold">Service Rules</h4>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Service</Label>
                      <Select
                        value={serviceRuleParentName || "__none__"}
                        onValueChange={(value) =>
                          setServiceRuleParentName(value === "__none__" ? "" : value)
                        }
                        disabled={!canEdit || serviceNames.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select service" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select service</SelectItem>
                          {serviceNames.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Rule ID</Label>
                      <Input
                        value={serviceRuleDraft.ruleId}
                        onChange={(event) =>
                          setServiceRuleDraft((previous) => ({ ...previous, ruleId: event.target.value }))
                        }
                        placeholder="10"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Domain Name</Label>
                      <Input
                        value={serviceRuleDraft.domainName}
                        onChange={(event) =>
                          setServiceRuleDraft((previous) => ({ ...previous, domainName: event.target.value }))
                        }
                        placeholder="app.example.com"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SSL SNI Match</Label>
                      <Select
                        value={serviceRuleDraft.sslSni || "__none__"}
                        onValueChange={(value) =>
                          setServiceRuleDraft((previous) => ({
                            ...previous,
                            sslSni: value === "__none__" ? "" : value,
                          }))
                        }
                        disabled={!canEdit}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Unset" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Unset</SelectItem>
                          <SelectItem value="req-ssl-sni">req-ssl-sni</SelectItem>
                          <SelectItem value="ssl-fc-sni">ssl-fc-sni</SelectItem>
                          <SelectItem value="ssl-fc-sni-end">ssl-fc-sni-end</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>URL Path Match</Label>
                      <Select
                        value={serviceRuleDraft.urlPathMatch || "__none__"}
                        onValueChange={(value) =>
                          setServiceRuleDraft((previous) => ({
                            ...previous,
                            urlPathMatch: value === "__none__" ? "" : value,
                          }))
                        }
                        disabled={!canEdit}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Unset" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Unset</SelectItem>
                          <SelectItem value="begin">begin</SelectItem>
                          <SelectItem value="end">end</SelectItem>
                          <SelectItem value="exact">exact</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>URL Path</Label>
                      <Input
                        value={serviceRuleDraft.urlPath}
                        onChange={(event) =>
                          setServiceRuleDraft((previous) => ({ ...previous, urlPath: event.target.value }))
                        }
                        placeholder="/api/"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Set Backend</Label>
                      <Input
                        value={serviceRuleDraft.setBackend}
                        onChange={(event) =>
                          setServiceRuleDraft((previous) => ({ ...previous, setBackend: event.target.value }))
                        }
                        placeholder={backendNames[0] || "backend-main"}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Redirect Location</Label>
                      <Input
                        value={serviceRuleDraft.redirectLocation}
                        onChange={(event) =>
                          setServiceRuleDraft((previous) => ({
                            ...previous,
                            redirectLocation: event.target.value,
                          }))
                        }
                        placeholder="https://example.com/new-path"
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={addServiceRuleEntry} disabled={!canEdit}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Service Rule
                  </Button>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead>Rule</TableHead>
                        <TableHead>Match</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead className="w-[120px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {services.flatMap((service) => service.rules.map((rule) => ({ service, rule }))).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-muted-foreground">
                            No service rules configured.
                          </TableCell>
                        </TableRow>
                      ) : (
                        services.flatMap((service) =>
                          service.rules.map((rule) => (
                            <TableRow key={`${service.name}-${rule.ruleId}`}>
                              <TableCell>{service.name}</TableCell>
                              <TableCell>{rule.ruleId}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {[
                                  rule.domainName ? `domain:${rule.domainName}` : null,
                                  rule.sslSni ? `ssl:${rule.sslSni}` : null,
                                  rule.urlPathMatch && rule.urlPath
                                    ? `path:${rule.urlPathMatch} ${rule.urlPath}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" | ") || "-"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {[
                                  rule.setBackend ? `backend:${rule.setBackend}` : null,
                                  rule.redirectLocation ? `redirect:${rule.redirectLocation}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" | ") || "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeServiceRuleEntry(service.name, rule.ruleId)}
                                  disabled={!canEdit}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Backends</CardTitle>
                <CardDescription>
                  Define backend pools, health checks, SSL options, and backend servers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={backendDraft.name}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({ ...previous, name: event.target.value }))
                      }
                      placeholder="backend-main"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <Select
                      value={backendDraft.mode || "__none__"}
                      onValueChange={(value) =>
                        setBackendDraft((previous) => ({ ...previous, mode: value === "__none__" ? "" : value }))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unset</SelectItem>
                        <SelectItem value="http">http</SelectItem>
                        <SelectItem value="tcp">tcp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Balance</Label>
                    <Select
                      value={backendDraft.balance || "__none__"}
                      onValueChange={(value) =>
                        setBackendDraft((previous) => ({
                          ...previous,
                          balance: value === "__none__" ? "" : value,
                        }))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unset</SelectItem>
                        <SelectItem value="round-robin">round-robin</SelectItem>
                        <SelectItem value="least-connection">least-connection</SelectItem>
                        <SelectItem value="source-address">source-address</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Health Check Protocol</Label>
                    <Select
                      value={backendDraft.healthCheck || "__none__"}
                      onValueChange={(value) =>
                        setBackendDraft((previous) => ({
                          ...previous,
                          healthCheck: value === "__none__" ? "" : value,
                        }))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unset</SelectItem>
                        <SelectItem value="ldap">ldap</SelectItem>
                        <SelectItem value="redis">redis</SelectItem>
                        <SelectItem value="mysql">mysql</SelectItem>
                        <SelectItem value="pgsql">pgsql</SelectItem>
                        <SelectItem value="smtp">smtp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>SSL CA Certificate</Label>
                    <Input
                      value={backendDraft.sslCaCertificate}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({
                          ...previous,
                          sslCaCertificate: event.target.value,
                        }))
                      }
                      placeholder="ca-main"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Response Headers (key=value)</Label>
                    <Input
                      value={backendHeadersInput}
                      onChange={(event) => setBackendHeadersInput(event.target.value)}
                      placeholder="X-Backend=pool-a"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Logging Facility</Label>
                    <Input
                      value={backendDraft.loggingFacility}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({ ...previous, loggingFacility: event.target.value }))
                      }
                      placeholder="local0"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Logging Level</Label>
                    <Input
                      value={backendDraft.loggingLevel}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({ ...previous, loggingLevel: event.target.value }))
                      }
                      placeholder="info"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Timeout Check</Label>
                    <Input
                      value={backendDraft.timeoutCheck}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({ ...previous, timeoutCheck: event.target.value }))
                      }
                      placeholder="5"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Timeout Connect</Label>
                    <Input
                      value={backendDraft.timeoutConnect}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({ ...previous, timeoutConnect: event.target.value }))
                      }
                      placeholder="10"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Timeout Server</Label>
                    <Input
                      value={backendDraft.timeoutServer}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({ ...previous, timeoutServer: event.target.value }))
                      }
                      placeholder="50"
                      disabled={!canEdit}
                    />
                  </div>
                  <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
                    <Checkbox
                      checked={backendDraft.sslNoVerify}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        setBackendDraft((previous) => ({ ...previous, sslNoVerify: checked === true }))
                      }
                    />
                    <span>SSL No Verify</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
                    <Checkbox
                      checked={backendDraft.httpCheckEnabled}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        setBackendDraft((previous) => ({ ...previous, httpCheckEnabled: checked === true }))
                      }
                    />
                    <span>Enable HTTP Check</span>
                  </label>
                  <div className="space-y-2">
                    <Label>HTTP Check Method</Label>
                    <Select
                      value={backendDraft.httpCheckMethod || "__none__"}
                      onValueChange={(value) =>
                        setBackendDraft((previous) => ({
                          ...previous,
                          httpCheckMethod: value === "__none__" ? "" : value,
                        }))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unset</SelectItem>
                        <SelectItem value="option">option</SelectItem>
                        <SelectItem value="get">get</SelectItem>
                        <SelectItem value="post">post</SelectItem>
                        <SelectItem value="put">put</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>HTTP Check URI</Label>
                    <Input
                      value={backendDraft.httpCheckUri}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({ ...previous, httpCheckUri: event.target.value }))
                      }
                      placeholder="/healthz"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>HTTP Check Expect</Label>
                    <Input
                      value={backendDraft.httpCheckExpect}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({ ...previous, httpCheckExpect: event.target.value }))
                      }
                      placeholder="status 200-399"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <h4 className="text-sm font-semibold">Backend Servers</h4>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Server Name</Label>
                      <Input
                        value={backendServerDraft.name}
                        onChange={(event) =>
                          setBackendServerDraft((previous) => ({ ...previous, name: event.target.value }))
                        }
                        placeholder="srv1"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input
                        value={backendServerDraft.address}
                        onChange={(event) =>
                          setBackendServerDraft((previous) => ({ ...previous, address: event.target.value }))
                        }
                        placeholder="10.0.0.11"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input
                        value={backendServerDraft.port}
                        onChange={(event) =>
                          setBackendServerDraft((previous) => ({ ...previous, port: event.target.value }))
                        }
                        placeholder="443"
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Check Port</Label>
                      <Input
                        value={backendServerDraft.checkPort}
                        onChange={(event) =>
                          setBackendServerDraft((previous) => ({ ...previous, checkPort: event.target.value }))
                        }
                        placeholder="8443"
                        disabled={!canEdit}
                      />
                    </div>
                    <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
                      <Checkbox
                        checked={backendServerDraft.check}
                        disabled={!canEdit}
                        onCheckedChange={(checked) =>
                          setBackendServerDraft((previous) => ({ ...previous, check: checked === true }))
                        }
                      />
                      <span>Enable Check</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
                      <Checkbox
                        checked={backendServerDraft.sendProxy}
                        disabled={!canEdit}
                        onCheckedChange={(checked) =>
                          setBackendServerDraft((previous) => ({
                            ...previous,
                            sendProxy: checked === true,
                          }))
                        }
                      />
                      <span>Send Proxy v1</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
                      <Checkbox
                        checked={backendServerDraft.sendProxyV2}
                        disabled={!canEdit}
                        onCheckedChange={(checked) =>
                          setBackendServerDraft((previous) => ({
                            ...previous,
                            sendProxyV2: checked === true,
                          }))
                        }
                      />
                      <span>Send Proxy v2</span>
                    </label>
                  </div>
                  <Button type="button" variant="outline" onClick={addBackendServerDraftEntry} disabled={!canEdit}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Server to Backend Draft
                  </Button>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Address:Port</TableHead>
                        <TableHead>Check</TableHead>
                        <TableHead>Proxy</TableHead>
                        <TableHead className="w-[120px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.keys(backendDraft.servers).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-muted-foreground">
                            No backend servers in draft.
                          </TableCell>
                        </TableRow>
                      ) : (
                        Object.values(backendDraft.servers).map((server) => (
                          <TableRow key={server.name}>
                            <TableCell>{server.name}</TableCell>
                            <TableCell>{server.address}:{server.port}</TableCell>
                            <TableCell>{server.check ? server.checkPort || "enabled" : "-"}</TableCell>
                            <TableCell>
                              {[server.sendProxy ? "v1" : null, server.sendProxyV2 ? "v2" : null]
                                .filter(Boolean)
                                .join(", ") || "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeBackendServerDraftEntry(server.name)}
                                disabled={!canEdit}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <Button type="button" variant="outline" onClick={addBackendEntry} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Backend
                </Button>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Mode / Balance</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Servers</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backends.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          No HAProxy backend configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      backends.map((entry) => (
                        <TableRow key={entry.name}>
                          <TableCell className="font-medium">{entry.name}</TableCell>
                          <TableCell>{[entry.mode, entry.balance].filter(Boolean).join(" / ") || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {[
                              entry.healthCheck ? `proto:${entry.healthCheck}` : null,
                              entry.httpCheckEnabled ? "http-check" : null,
                              entry.sslNoVerify ? "ssl-no-verify" : null,
                            ]
                              .filter(Boolean)
                              .join(" | ") || "-"}
                          </TableCell>
                          <TableCell>{serializeServerList(entry.servers) || "-"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeBackendEntry(entry.name)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
