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

type HaproxyFrontendEntry = {
  name: string;
  bind: string;
  defaultBackend: string;
};

type HaproxyBackendEntry = {
  name: string;
  mode: string;
  balance: string;
  servers: Record<string, { address: string; port: string }>;
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

const EMPTY_FRONTEND_DRAFT: HaproxyFrontendEntry = {
  name: "",
  bind: "",
  defaultBackend: "",
};

const EMPTY_BACKEND_DRAFT: HaproxyBackendEntry = {
  name: "",
  mode: "",
  balance: "",
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

function weightMapEquals(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftNames = Object.keys(left).sort();
  const rightNames = Object.keys(right).sort();
  if (!arrayEquals(leftNames, rightNames)) return false;
  return leftNames.every((name) => left[name] === right[name]);
}

function parseServerListInput(
  value: string
): Record<string, { address: string; port: string }> {
  const output: Record<string, { address: string; port: string }> = {};
  const chunks = value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const [rawName, rawEndpoint] = chunk.split("=");
    const name = normalizeText(rawName || "");
    const endpoint = normalizeText(rawEndpoint || "");
    if (!name || !endpoint) continue;

    const [address, port] = endpoint.split(":");
    const cleanAddress = normalizeText(address || "");
    const cleanPort = normalizeText(port || "");
    if (!cleanAddress || !cleanPort) continue;

    output[name] = { address: cleanAddress, port: cleanPort };
  }

  return output;
}

function serializeServerList(
  servers: Record<string, { address: string; port: string }>
): string {
  return Object.entries(servers)
    .map(([name, value]) => `${name}=${value.address}:${value.port}`)
    .join(", ");
}

function arrayEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function serverMapEquals(
  left: Record<string, { address: string; port: string }>,
  right: Record<string, { address: string; port: string }>
): boolean {
  const leftNames = Object.keys(left).sort();
  const rightNames = Object.keys(right).sort();
  if (!arrayEquals(leftNames, rightNames)) return false;
  for (const name of leftNames) {
    if (left[name].address !== right[name].address || left[name].port !== right[name].port) {
      return false;
    }
  }
  return true;
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
  const [frontends, setFrontends] = useState<HaproxyFrontendEntry[]>([]);
  const [backends, setBackends] = useState<HaproxyBackendEntry[]>([]);

  const [currentWanGlobal, setCurrentWanGlobal] = useState<WanGlobalSettings>(EMPTY_WAN_GLOBAL_DRAFT);
  const [currentWanHealth, setCurrentWanHealth] = useState<WanHealthEntry[]>([]);
  const [currentWanHealthTests, setCurrentWanHealthTests] = useState<WanHealthTestEntry[]>([]);
  const [currentWanRules, setCurrentWanRules] = useState<WanRuleEntry[]>([]);
  const [currentFrontends, setCurrentFrontends] = useState<HaproxyFrontendEntry[]>([]);
  const [currentBackends, setCurrentBackends] = useState<HaproxyBackendEntry[]>([]);

  const [healthDraft, setHealthDraft] = useState<WanHealthEntry>(EMPTY_HEALTH_DRAFT);
  const [healthTestDraft, setHealthTestDraft] = useState<WanHealthTestEntry>(EMPTY_HEALTH_TEST_DRAFT);
  const [ruleDraft, setRuleDraft] = useState<WanRuleEntry>(EMPTY_RULE_DRAFT);
  const [ruleOutboundInput, setRuleOutboundInput] = useState("");
  const [ruleOutboundWeightsInput, setRuleOutboundWeightsInput] = useState("");
  const [frontendDraft, setFrontendDraft] = useState<HaproxyFrontendEntry>(EMPTY_FRONTEND_DRAFT);
  const [backendDraft, setBackendDraft] = useState<HaproxyBackendEntry>(EMPTY_BACKEND_DRAFT);
  const [backendServersInput, setBackendServersInput] = useState("");

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

      const parsedFrontends = Object.entries(config.haproxy.frontends)
        .map(([name, entry]) => ({
          name: normalizeText(name),
          bind: normalizeText(entry.bind),
          defaultBackend: normalizeText(entry.default_backend),
        }))
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const parsedBackends = Object.entries(config.haproxy.backends)
        .map(([name, entry]) => ({
          name: normalizeText(name),
          mode: normalizeText(entry.mode),
          balance: normalizeText(entry.balance),
          servers: entry.servers,
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
      setFrontends(parsedFrontends);
      setBackends(parsedBackends);

      setCurrentWanGlobal(parsedWanGlobal);
      setCurrentWanHealth(parsedWanHealth);
      setCurrentWanHealthTests(parsedWanHealthTests);
      setCurrentWanRules(parsedWanRules);
      setCurrentFrontends(parsedFrontends);
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
      setFrontendDraft(EMPTY_FRONTEND_DRAFT);
      setBackendDraft(EMPTY_BACKEND_DRAFT);
      setBackendServersInput("");
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

  const addFrontendEntry = () => {
    setError(null);

    const entry: HaproxyFrontendEntry = {
      name: normalizeText(frontendDraft.name),
      bind: normalizeText(frontendDraft.bind),
      defaultBackend: normalizeText(frontendDraft.defaultBackend),
    };

    if (!entry.name || !entry.bind || !entry.defaultBackend) {
      setError("HAProxy frontend requires name, bind, and default backend.");
      return;
    }

    if (frontends.some((item) => item.name === entry.name)) {
      setError("Frontend name already exists.");
      return;
    }

    setFrontends((previous) =>
      [...previous, entry].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    );
    setFrontendDraft(EMPTY_FRONTEND_DRAFT);
  };

  const removeFrontendEntry = (name: string) => {
    setFrontends((previous) => previous.filter((item) => item.name !== name));
  };

  const addBackendEntry = () => {
    setError(null);

    const entry: HaproxyBackendEntry = {
      name: normalizeText(backendDraft.name),
      mode: normalizeText(backendDraft.mode),
      balance: normalizeText(backendDraft.balance),
      servers: parseServerListInput(backendServersInput),
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
    setBackendServersInput("");
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

      const currentFrontendMap = new Map(currentFrontends.map((entry) => [entry.name, entry]));
      const desiredFrontendMap = new Map(frontends.map((entry) => [entry.name, entry]));

      for (const [name] of currentFrontendMap.entries()) {
        if (!desiredFrontendMap.has(name)) {
          operations.push(`delete load-balancing haproxy frontend ${name}`);
        }
      }

      for (const [name, desired] of desiredFrontendMap.entries()) {
        const current = currentFrontendMap.get(name);
        if (
          current &&
          current.bind === desired.bind &&
          current.defaultBackend === desired.defaultBackend
        ) {
          continue;
        }

        operations.push(`set load-balancing haproxy frontend ${name} bind ${desired.bind}`);
        operations.push(
          `set load-balancing haproxy frontend ${name} default-backend ${desired.defaultBackend}`
        );
      }

      const currentBackendMap = new Map(currentBackends.map((entry) => [entry.name, entry]));
      const desiredBackendMap = new Map(backends.map((entry) => [entry.name, entry]));

      for (const [name] of currentBackendMap.entries()) {
        if (!desiredBackendMap.has(name)) {
          operations.push(`delete load-balancing haproxy backend ${name}`);
        }
      }

      for (const [name, desired] of desiredBackendMap.entries()) {
        const current = currentBackendMap.get(name);
        if (
          current &&
          current.mode === desired.mode &&
          current.balance === desired.balance &&
          serverMapEquals(current.servers, desired.servers)
        ) {
          continue;
        }

        if (desired.mode) {
          operations.push(`set load-balancing haproxy backend ${name} mode ${desired.mode}`);
        } else if (current?.mode) {
          operations.push(`delete load-balancing haproxy backend ${name} mode`);
        }

        if (desired.balance) {
          operations.push(`set load-balancing haproxy backend ${name} balance ${desired.balance}`);
        } else if (current?.balance) {
          operations.push(`delete load-balancing haproxy backend ${name} balance`);
        }

        const currentServers = current?.servers || {};
        const desiredServers = desired.servers;

        for (const serverName of Object.keys(currentServers)) {
          if (!Object.prototype.hasOwnProperty.call(desiredServers, serverName)) {
            operations.push(`delete load-balancing haproxy backend ${name} server ${serverName}`);
          }
        }

        for (const [serverName, server] of Object.entries(desiredServers)) {
          const currentServer = currentServers[serverName];
          if (currentServer && currentServer.address === server.address && currentServer.port === server.port) {
            continue;
          }

          operations.push(
            `set load-balancing haproxy backend ${name} server ${serverName} address ${server.address}`
          );
          operations.push(
            `set load-balancing haproxy backend ${name} server ${serverName} port ${server.port}`
          );
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
                <CardTitle>Frontends</CardTitle>
                <CardDescription>Define listener bindings and default backends.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={frontendDraft.name}
                      onChange={(event) =>
                        setFrontendDraft((previous) => ({ ...previous, name: event.target.value }))
                      }
                      placeholder="http-in"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bind</Label>
                    <Input
                      value={frontendDraft.bind}
                      onChange={(event) =>
                        setFrontendDraft((previous) => ({ ...previous, bind: event.target.value }))
                      }
                      placeholder="0.0.0.0:80"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Default Backend</Label>
                    <Input
                      value={frontendDraft.defaultBackend}
                      onChange={(event) =>
                        setFrontendDraft((previous) => ({ ...previous, defaultBackend: event.target.value }))
                      }
                      placeholder="backend-main"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <Button type="button" variant="outline" onClick={addFrontendEntry} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Frontend
                </Button>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Bind</TableHead>
                      <TableHead>Default Backend</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {frontends.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          No HAProxy frontend configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      frontends.map((entry) => (
                        <TableRow key={entry.name}>
                          <TableCell className="font-medium">{entry.name}</TableCell>
                          <TableCell>{entry.bind}</TableCell>
                          <TableCell>{entry.defaultBackend}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFrontendEntry(entry.name)}
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
                <CardTitle>Backends</CardTitle>
                <CardDescription>
                  Define backend pools. Server format: <code>name=ip:port</code>.
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
                    <Input
                      value={backendDraft.mode}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({ ...previous, mode: event.target.value }))
                      }
                      placeholder="http"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Balance</Label>
                    <Input
                      value={backendDraft.balance}
                      onChange={(event) =>
                        setBackendDraft((previous) => ({ ...previous, balance: event.target.value }))
                      }
                      placeholder="roundrobin"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Servers</Label>
                    <Input
                      value={backendServersInput}
                      onChange={(event) => setBackendServersInput(event.target.value)}
                      placeholder="app1=10.0.0.11:80, app2=10.0.0.12:80"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <Button type="button" variant="outline" onClick={addBackendEntry} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Backend
                </Button>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Balance</TableHead>
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
                          <TableCell>{entry.mode || "-"}</TableCell>
                          <TableCell>{entry.balance || "-"}</TableCell>
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

                {backendNames.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Existing backend names: {backendNames.join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
