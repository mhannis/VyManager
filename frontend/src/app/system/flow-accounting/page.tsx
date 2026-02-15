"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import {
  systemFlowAccountingService,
  type NetflowServerConfig,
  type SystemFlowAccountingConfig,
} from "@/lib/api/system-flow-accounting";
import { pageGuides } from "@/lib/help/pageGuides";
import { formatInterfaceDisplayName } from "@/lib/utils";

interface InterfaceChoice {
  value: string;
  label: string;
}

interface FlowAccountingFormState {
  interfaces: string[];
  disableImt: boolean;
  enableEgress: boolean;
  bufferSize: string;
  syslogFacility: string;
  netflowVersion: string;
  netflowEngineId: string;
  netflowSourceIp: string;
  netflowSamplingRate: string;
  netflowMaxFlows: string;
  netflowExpiryInterval: string;
  netflowServers: NetflowServerConfig[];
  sflowAgentAddress: string;
  sflowSamplingRate: string;
  sflowServers: string[];
}

const EMPTY_FORM: FlowAccountingFormState = {
  interfaces: [],
  disableImt: false,
  enableEgress: false,
  bufferSize: "",
  syslogFacility: "",
  netflowVersion: "",
  netflowEngineId: "",
  netflowSourceIp: "",
  netflowSamplingRate: "",
  netflowMaxFlows: "",
  netflowExpiryInterval: "",
  netflowServers: [],
  sflowAgentAddress: "",
  sflowSamplingRate: "",
  sflowServers: [],
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeNetflowServers(values: NetflowServerConfig[]): NetflowServerConfig[] {
  const dedupe = new Map<string, string>();
  for (const entry of values) {
    const address = entry.address.trim();
    if (!address) continue;
    dedupe.set(address, entry.port.trim());
  }
  return Array.from(dedupe.entries())
    .map(([address, port]) => ({ address, port }))
    .sort((left, right) => left.address.localeCompare(right.address));
}

function toFormState(config: SystemFlowAccountingConfig): FlowAccountingFormState {
  return {
    interfaces: uniqueSorted(config.interfaces),
    disableImt: config.disableImt,
    enableEgress: config.enableEgress,
    bufferSize: config.bufferSize,
    syslogFacility: config.syslogFacility,
    netflowVersion: config.netflowVersion,
    netflowEngineId: config.netflowEngineId,
    netflowSourceIp: config.netflowSourceIp,
    netflowSamplingRate: config.netflowSamplingRate,
    netflowMaxFlows: config.netflowMaxFlows,
    netflowExpiryInterval: config.netflowExpiryInterval,
    netflowServers: normalizeNetflowServers(config.netflowServers),
    sflowAgentAddress: config.sflowAgentAddress,
    sflowSamplingRate: config.sflowSamplingRate,
    sflowServers: uniqueSorted(config.sflowServers),
  };
}

function buildOperations(
  current: SystemFlowAccountingConfig | null,
  candidate: FlowAccountingFormState,
): string[] {
  const operations: string[] = [];
  const base = "system flow-accounting";
  const currentSafe = current || {
    ...EMPTY_FORM,
  };

  const syncScalar = (token: string, desiredRaw: string, currentRaw: string) => {
    const desired = desiredRaw.trim();
    const existing = currentRaw.trim();
    if (desired === existing) return;
    if (desired) {
      operations.push(`set ${base} ${token} ${quoteCliValue(desired)}`);
    } else {
      operations.push(`delete ${base} ${token}`);
    }
  };

  const syncFlag = (token: string, desired: boolean, existing: boolean) => {
    if (desired === existing) return;
    operations.push(desired ? `set ${base} ${token}` : `delete ${base} ${token}`);
  };

  const desiredInterfaces = uniqueSorted(candidate.interfaces);
  const currentInterfaces = uniqueSorted(currentSafe.interfaces);
  const desiredInterfaceSet = new Set(desiredInterfaces);
  const currentInterfaceSet = new Set(currentInterfaces);
  for (const iface of currentInterfaces) {
    if (!desiredInterfaceSet.has(iface)) {
      operations.push(`delete ${base} interface ${quoteCliValue(iface)}`);
    }
  }
  for (const iface of desiredInterfaces) {
    if (!currentInterfaceSet.has(iface)) {
      operations.push(`set ${base} interface ${quoteCliValue(iface)}`);
    }
  }

  syncFlag("disable-imt", candidate.disableImt, currentSafe.disableImt);
  syncFlag("enable-egress", candidate.enableEgress, currentSafe.enableEgress);

  syncScalar("buffer-size", candidate.bufferSize, currentSafe.bufferSize);
  syncScalar("syslog-facility", candidate.syslogFacility, currentSafe.syslogFacility);
  syncScalar("netflow version", candidate.netflowVersion, currentSafe.netflowVersion);
  syncScalar("netflow engine-id", candidate.netflowEngineId, currentSafe.netflowEngineId);
  syncScalar("netflow source-ip", candidate.netflowSourceIp, currentSafe.netflowSourceIp);
  syncScalar(
    "netflow sampling-rate",
    candidate.netflowSamplingRate,
    currentSafe.netflowSamplingRate,
  );
  syncScalar("netflow max-flows", candidate.netflowMaxFlows, currentSafe.netflowMaxFlows);
  syncScalar(
    "netflow timeout expiry-interval",
    candidate.netflowExpiryInterval,
    currentSafe.netflowExpiryInterval,
  );

  const desiredNetflowServers = normalizeNetflowServers(candidate.netflowServers);
  const currentNetflowServers = normalizeNetflowServers(currentSafe.netflowServers);
  const desiredNetflowMap = new Map(desiredNetflowServers.map((entry) => [entry.address, entry.port]));
  const currentNetflowMap = new Map(currentNetflowServers.map((entry) => [entry.address, entry.port]));

  for (const [address, currentPort] of currentNetflowMap.entries()) {
    const desiredPort = desiredNetflowMap.get(address);
    if (desiredPort === undefined || desiredPort !== currentPort) {
      operations.push(`delete ${base} netflow server ${quoteCliValue(address)}`);
    }
  }
  for (const [address, desiredPort] of desiredNetflowMap.entries()) {
    const currentPort = currentNetflowMap.get(address);
    if (currentPort === desiredPort) continue;
    if (desiredPort) {
      operations.push(
        `set ${base} netflow server ${quoteCliValue(address)} port ${quoteCliValue(desiredPort)}`,
      );
    } else {
      operations.push(`set ${base} netflow server ${quoteCliValue(address)}`);
    }
  }

  syncScalar("sflow agent-address", candidate.sflowAgentAddress, currentSafe.sflowAgentAddress);
  syncScalar("sflow sampling-rate", candidate.sflowSamplingRate, currentSafe.sflowSamplingRate);

  const desiredSflowServers = uniqueSorted(candidate.sflowServers);
  const currentSflowServers = uniqueSorted(currentSafe.sflowServers);
  const desiredSflowSet = new Set(desiredSflowServers);
  const currentSflowSet = new Set(currentSflowServers);
  for (const address of currentSflowServers) {
    if (!desiredSflowSet.has(address)) {
      operations.push(`delete ${base} sflow server ${quoteCliValue(address)}`);
    }
  }
  for (const address of desiredSflowServers) {
    if (!currentSflowSet.has(address)) {
      operations.push(`set ${base} sflow server ${quoteCliValue(address)}`);
    }
  }

  return operations;
}

export default function SystemFlowAccountingPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemFlowAccountingConfig | null>(null);
  const [form, setForm] = useState<FlowAccountingFormState>(EMPTY_FORM);
  const [interfaceChoices, setInterfaceChoices] = useState<InterfaceChoice[]>([]);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const [flowConfig, allInterfacesResponse, ethernetConfig] = await Promise.all([
        systemFlowAccountingService.getConfig(refresh),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
        ethernetService.getConfig().catch(() => ({ interfaces: [], total: 0, by_type: {}, by_vrf: {} })),
      ]);

      const descriptionByName = ethernetConfig.interfaces.reduce<Record<string, string | null>>(
        (accumulator, iface) => {
          accumulator[iface.name] = iface.description ?? null;
          return accumulator;
        },
        {},
      );

      const choices = allInterfacesResponse.interfaces
        .filter((entry) => entry.name !== "lo")
        .map((entry) => ({
          value: entry.name,
          label: formatInterfaceDisplayName(entry.name, descriptionByName[entry.name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label));

      setConfig(flowConfig);
      setForm(toFormState(flowConfig));
      setInterfaceChoices(choices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load flow accounting settings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const hasChanges = useMemo(() => {
    if (!config) return false;
    const currentSerialized = JSON.stringify(toFormState(config));
    const candidateSerialized = JSON.stringify({
      ...form,
      interfaces: uniqueSorted(form.interfaces),
      netflowServers: normalizeNetflowServers(form.netflowServers),
      sflowServers: uniqueSorted(form.sflowServers),
    });
    return currentSerialized !== candidateSerialized;
  }, [config, form]);

  const toggleInterface = (value: string, checked: boolean) => {
    setForm((previous) => {
      const current = new Set(previous.interfaces);
      if (checked) current.add(value);
      else current.delete(value);
      return { ...previous, interfaces: Array.from(current).sort((left, right) => left.localeCompare(right)) };
    });
  };

  const addNetflowServer = () => {
    setForm((previous) => ({
      ...previous,
      netflowServers: [...previous.netflowServers, { address: "", port: "" }],
    }));
  };

  const updateNetflowServer = (index: number, patch: Partial<NetflowServerConfig>) => {
    setForm((previous) => {
      const next = [...previous.netflowServers];
      next[index] = { ...next[index], ...patch };
      return { ...previous, netflowServers: next };
    });
  };

  const removeNetflowServer = (index: number) => {
    setForm((previous) => ({
      ...previous,
      netflowServers: previous.netflowServers.filter((_, idx) => idx !== index),
    }));
  };

  const addSflowServer = () => {
    setForm((previous) => ({ ...previous, sflowServers: [...previous.sflowServers, ""] }));
  };

  const updateSflowServer = (index: number, value: string) => {
    setForm((previous) => {
      const next = [...previous.sflowServers];
      next[index] = value;
      return { ...previous, sflowServers: next };
    });
  };

  const removeSflowServer = (index: number) => {
    setForm((previous) => ({
      ...previous,
      sflowServers: previous.sflowServers.filter((_, idx) => idx !== index),
    }));
  };

  const saveConfig = async () => {
    for (const [label, value] of [
      ["Buffer size", form.bufferSize],
      ["Netflow engine-id", form.netflowEngineId],
      ["Netflow sampling-rate", form.netflowSamplingRate],
      ["Netflow max-flows", form.netflowMaxFlows],
      ["Netflow expiry interval", form.netflowExpiryInterval],
      ["sFlow sampling-rate", form.sflowSamplingRate],
    ] as const) {
      const trimmed = value.trim();
      if (trimmed && !/^\d+$/.test(trimmed)) {
        setError(`${label} must be a whole number.`);
        return;
      }
    }

    for (const server of form.netflowServers) {
      const address = server.address.trim();
      const port = server.port.trim();
      if (!address && !port) continue;
      if (!address) {
        setError("Each Netflow server entry requires an address.");
        return;
      }
      if (port && !/^\d+$/.test(port)) {
        setError(`Netflow server port for ${address} must be a whole number.`);
        return;
      }
    }

    for (const server of form.sflowServers) {
      if (!server.trim()) {
        setError("sFlow server entries cannot be blank.");
        return;
      }
    }

    const operations = buildOperations(config, form);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemFlowAccountingService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected flow accounting changes.");
      }
      await loadData(true);
      setSuccess("Flow accounting settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save flow accounting settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Flow Accounting</h1>
            <p className="mt-1 text-muted-foreground">
              Configure NetFlow and sFlow export under `system flow-accounting`.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.systemFlowAccounting} />
        </div>

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {success && (
          <Card className="border-emerald-500/50">
            <CardContent className="pt-6">
              <p className="text-sm text-emerald-300">{success}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>Select export interfaces and global accounting behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {interfaceChoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No interfaces discovered.</p>
              ) : (
                interfaceChoices.map((choice) => {
                  const checked = form.interfaces.includes(choice.value);
                  return (
                    <label
                      key={choice.value}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!canEdit || saving}
                        onCheckedChange={(value) => toggleInterface(choice.value, value === true)}
                      />
                      <span>{choice.label}</span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="flow-buffer-size">Buffer Size</Label>
                <Input
                  id="flow-buffer-size"
                  value={form.bufferSize}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, bufferSize: event.target.value }))
                  }
                  placeholder="10485760"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="flow-syslog-facility">Syslog Facility</Label>
                <Input
                  id="flow-syslog-facility"
                  value={form.syslogFacility}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, syslogFacility: event.target.value }))
                  }
                  placeholder="daemon"
                  disabled={!canEdit || saving}
                />
              </div>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={form.disableImt}
                  disabled={!canEdit || saving}
                  onCheckedChange={(value) =>
                    setForm((previous) => ({ ...previous, disableImt: value === true }))
                  }
                />
                Disable IMT
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={form.enableEgress}
                  disabled={!canEdit || saving}
                  onCheckedChange={(value) =>
                    setForm((previous) => ({ ...previous, enableEgress: value === true }))
                  }
                />
                Enable Egress Export
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>NetFlow</CardTitle>
            <CardDescription>Version, exporter identity, timing, and collector servers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="netflow-version">Version</Label>
                <Input
                  id="netflow-version"
                  value={form.netflowVersion}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, netflowVersion: event.target.value }))
                  }
                  placeholder="9"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="netflow-engine-id">Engine ID</Label>
                <Input
                  id="netflow-engine-id"
                  value={form.netflowEngineId}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, netflowEngineId: event.target.value }))
                  }
                  placeholder="7"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="netflow-source-ip">Source IP</Label>
                <Input
                  id="netflow-source-ip"
                  value={form.netflowSourceIp}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, netflowSourceIp: event.target.value }))
                  }
                  placeholder="192.0.2.10"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="netflow-sampling-rate">Sampling Rate</Label>
                <Input
                  id="netflow-sampling-rate"
                  value={form.netflowSamplingRate}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, netflowSamplingRate: event.target.value }))
                  }
                  placeholder="1000"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="netflow-max-flows">Max Flows</Label>
                <Input
                  id="netflow-max-flows"
                  value={form.netflowMaxFlows}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, netflowMaxFlows: event.target.value }))
                  }
                  placeholder="65536"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="netflow-expiry">Timeout Expiry Interval</Label>
                <Input
                  id="netflow-expiry"
                  value={form.netflowExpiryInterval}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      netflowExpiryInterval: event.target.value,
                    }))
                  }
                  placeholder="60"
                  disabled={!canEdit || saving}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>NetFlow Collectors</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addNetflowServer}
                  disabled={!canEdit || saving}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Collector
                </Button>
              </div>
              {form.netflowServers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No NetFlow collectors configured.</p>
              ) : (
                <div className="space-y-2">
                  {form.netflowServers.map((entry, index) => (
                    <div key={`netflow-server-${index}`} className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
                      <Input
                        value={entry.address}
                        onChange={(event) =>
                          updateNetflowServer(index, { address: event.target.value })
                        }
                        placeholder="192.0.2.50"
                        disabled={!canEdit || saving}
                      />
                      <Input
                        value={entry.port}
                        onChange={(event) => updateNetflowServer(index, { port: event.target.value })}
                        placeholder="2055 (optional)"
                        disabled={!canEdit || saving}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeNetflowServer(index)}
                        disabled={!canEdit || saving}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>sFlow</CardTitle>
            <CardDescription>Configure sFlow exporter identity, rate, and collectors.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sflow-agent-address">Agent Address</Label>
                <Input
                  id="sflow-agent-address"
                  value={form.sflowAgentAddress}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, sflowAgentAddress: event.target.value }))
                  }
                  placeholder="192.0.2.10"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sflow-sampling-rate">Sampling Rate</Label>
                <Input
                  id="sflow-sampling-rate"
                  value={form.sflowSamplingRate}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, sflowSamplingRate: event.target.value }))
                  }
                  placeholder="2048"
                  disabled={!canEdit || saving}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>sFlow Collectors</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSflowServer}
                  disabled={!canEdit || saving}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Collector
                </Button>
              </div>
              {form.sflowServers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sFlow collectors configured.</p>
              ) : (
                <div className="space-y-2">
                  {form.sflowServers.map((server, index) => (
                    <div key={`sflow-server-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto]">
                      <Input
                        value={server}
                        onChange={(event) => updateSflowServer(index, event.target.value)}
                        placeholder="192.0.2.60"
                        disabled={!canEdit || saving}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeSflowServer(index)}
                        disabled={!canEdit || saving}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {!canEdit && (
          <Card className="border-amber-500/40">
            <CardContent className="pt-6 text-xs text-amber-300">
              You have read-only permissions for System settings.
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Interfaces: {form.interfaces.length}</Badge>
            <Badge variant="outline">NetFlow: {form.netflowServers.length}</Badge>
            <Badge variant="outline">sFlow: {form.sflowServers.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadData(true)}
              disabled={refreshing || saving}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" onClick={saveConfig} disabled={!canEdit || saving || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              Save Flow Accounting
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

