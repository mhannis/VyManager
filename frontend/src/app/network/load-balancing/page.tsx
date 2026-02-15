"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
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

type WanRuleEntry = {
  ruleId: string;
  inboundInterface: string;
  outboundInterfaces: string[];
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

const EMPTY_RULE_DRAFT: WanRuleEntry = {
  ruleId: "",
  inboundInterface: "",
  outboundInterfaces: [],
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

  const [wanHealth, setWanHealth] = useState<WanHealthEntry[]>([]);
  const [wanRules, setWanRules] = useState<WanRuleEntry[]>([]);
  const [frontends, setFrontends] = useState<HaproxyFrontendEntry[]>([]);
  const [backends, setBackends] = useState<HaproxyBackendEntry[]>([]);

  const [currentWanHealth, setCurrentWanHealth] = useState<WanHealthEntry[]>([]);
  const [currentWanRules, setCurrentWanRules] = useState<WanRuleEntry[]>([]);
  const [currentFrontends, setCurrentFrontends] = useState<HaproxyFrontendEntry[]>([]);
  const [currentBackends, setCurrentBackends] = useState<HaproxyBackendEntry[]>([]);

  const [healthDraft, setHealthDraft] = useState<WanHealthEntry>(EMPTY_HEALTH_DRAFT);
  const [ruleDraft, setRuleDraft] = useState<WanRuleEntry>(EMPTY_RULE_DRAFT);
  const [ruleOutboundInput, setRuleOutboundInput] = useState("");
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

      const parsedWanHealth = Object.values(config.wan["interface-health"])
        .map((entry) => ({
          interface: normalizeText(entry.interface_name),
          nexthop: normalizeText(entry.nexthop),
          failureCount: normalizeText(entry["failure-count"] || ""),
          successCount: normalizeText(entry["success-count"] || ""),
        }))
        .filter((entry) => entry.interface)
        .sort((left, right) => left.interface.localeCompare(right.interface, undefined, { numeric: true }));

      const parsedWanRules = Object.values(config.wan.rules)
        .map((entry) => ({
          ruleId: normalizeText(entry.rule_id),
          inboundInterface: normalizeText(entry["inbound-interface"]),
          outboundInterfaces: Object.keys(entry.interfaces).map((name) => normalizeText(name)),
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
      setWanHealth(parsedWanHealth);
      setWanRules(parsedWanRules);
      setFrontends(parsedFrontends);
      setBackends(parsedBackends);

      setCurrentWanHealth(parsedWanHealth);
      setCurrentWanRules(parsedWanRules);
      setCurrentFrontends(parsedFrontends);
      setCurrentBackends(parsedBackends);

      setHealthDraft({ ...EMPTY_HEALTH_DRAFT, interface: normalizedOptions[0]?.value || "" });
      setRuleDraft({
        ...EMPTY_RULE_DRAFT,
        inboundInterface: normalizedOptions[0]?.value || "",
      });
      setRuleOutboundInput("");
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
  };

  const addRuleEntry = () => {
    setError(null);

    const entry: WanRuleEntry = {
      ruleId: normalizeText(ruleDraft.ruleId),
      inboundInterface: normalizeText(ruleDraft.inboundInterface),
      outboundInterfaces: parseCsvList(ruleOutboundInput),
    };

    if (!entry.ruleId || !entry.inboundInterface) {
      setError("Rule requires ID and inbound interface.");
      return;
    }

    if (entry.outboundInterfaces.length === 0) {
      setError("Rule requires at least one outbound interface.");
      return;
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
  };

  const removeRuleEntry = (ruleId: string) => {
    setWanRules((previous) => previous.filter((item) => item.ruleId !== ruleId));
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
          )
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
                <CardTitle>WAN Rules</CardTitle>
                <CardDescription>Map inbound traffic to one or more outbound WAN interfaces.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
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
                    <Label>Outbound Interfaces</Label>
                    <Input
                      value={ruleOutboundInput}
                      onChange={(event) => setRuleOutboundInput(event.target.value)}
                      placeholder="eth1, eth2"
                      disabled={!canEdit}
                    />
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
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wanRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
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
                          <TableCell>{entry.outboundInterfaces.join(", ")}</TableCell>
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
