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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import { systemSflowService, type SflowServerEntry, type SystemSflowConfig } from "@/lib/api/system-sflow";

interface ServerFormState {
  address: string;
  port: string;
}

interface SflowFormState {
  agentAddress: string;
  agentInterface: string;
  dropMonitorLimit: string;
  enableEgress: boolean;
  interfacesText: string;
  polling: string;
  samplingRate: string;
}

const EMPTY_SERVER_FORM: ServerFormState = {
  address: "",
  port: "6343",
};

const EMPTY_FORM: SflowFormState = {
  agentAddress: "",
  agentInterface: "",
  dropMonitorLimit: "",
  enableEgress: false,
  interfacesText: "",
  polling: "",
  samplingRate: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function splitUniqueLines(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeServers(servers: SflowServerEntry[]): SflowServerEntry[] {
  const dedupe = new Map<string, string>();
  for (const server of servers) {
    const address = server.address.trim();
    const port = server.port.trim();
    if (!address) continue;
    dedupe.set(address, port);
  }
  return Array.from(dedupe.entries())
    .map(([address, port]) => ({ address, port }))
    .sort((left, right) => left.address.localeCompare(right.address));
}

function toFormState(config: SystemSflowConfig): SflowFormState {
  return {
    agentAddress: config.agentAddress,
    agentInterface: config.agentInterface,
    dropMonitorLimit: config.dropMonitorLimit,
    enableEgress: config.enableEgress,
    interfacesText: config.interfaces.join("\n"),
    polling: config.polling,
    samplingRate: config.samplingRate,
  };
}

function buildOperations(current: SystemSflowConfig | null, form: SflowFormState, servers: SflowServerEntry[]): string[] {
  const base = "system sflow";
  const operations: string[] = [];
  const currentSafe = current || {
    agentAddress: "",
    agentInterface: "",
    dropMonitorLimit: "",
    enableEgress: false,
    interfaces: [],
    polling: "",
    samplingRate: "",
    servers: [],
  };

  const syncScalar = (token: string, desiredRaw: string, existingRaw: string) => {
    const desired = desiredRaw.trim();
    const existing = existingRaw.trim();
    if (desired === existing) return;
    if (desired) operations.push(`set ${base} ${token} ${quoteCliValue(desired)}`);
    else operations.push(`delete ${base} ${token}`);
  };
  const syncFlag = (token: string, desired: boolean, existing: boolean) => {
    if (desired === existing) return;
    operations.push(`${desired ? "set" : "delete"} ${base} ${token}`);
  };

  syncScalar("agent-address", form.agentAddress, currentSafe.agentAddress);
  syncScalar("agent-interface", form.agentInterface, currentSafe.agentInterface);
  syncScalar("drop-monitor-limit", form.dropMonitorLimit, currentSafe.dropMonitorLimit);
  syncScalar("polling", form.polling, currentSafe.polling);
  syncScalar("sampling-rate", form.samplingRate, currentSafe.samplingRate);
  syncFlag("enable-egress", form.enableEgress, currentSafe.enableEgress);

  const desiredInterfaces = splitUniqueLines(form.interfacesText);
  const desiredInterfaceSet = new Set(desiredInterfaces);
  const currentInterfaceSet = new Set(currentSafe.interfaces);
  for (const iface of currentSafe.interfaces) {
    if (!desiredInterfaceSet.has(iface)) operations.push(`delete ${base} interface ${quoteCliValue(iface)}`);
  }
  for (const iface of desiredInterfaces) {
    if (!currentInterfaceSet.has(iface)) operations.push(`set ${base} interface ${quoteCliValue(iface)}`);
  }

  const desiredServers = normalizeServers(servers);
  const currentServers = normalizeServers(currentSafe.servers);
  const desiredServerMap = new Map(desiredServers.map((entry) => [entry.address, entry]));
  const currentServerMap = new Map(currentServers.map((entry) => [entry.address, entry]));

  for (const [address, currentEntry] of currentServerMap.entries()) {
    const wanted = desiredServerMap.get(address);
    if (!wanted || wanted.port !== currentEntry.port) {
      operations.push(`delete ${base} server ${quoteCliValue(address)}`);
    }
  }
  for (const [address, wanted] of desiredServerMap.entries()) {
    const currentEntry = currentServerMap.get(address);
    if (currentEntry && currentEntry.port === wanted.port) continue;
    operations.push(`set ${base} server ${quoteCliValue(address)} port ${quoteCliValue(wanted.port || "6343")}`);
  }

  return operations;
}

export default function SystemSflowPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemSflowConfig | null>(null);
  const [form, setForm] = useState<SflowFormState>(EMPTY_FORM);
  const [servers, setServers] = useState<SflowServerEntry[]>([]);
  const [editingServerAddress, setEditingServerAddress] = useState<string | null>(null);
  const [serverForm, setServerForm] = useState<ServerFormState>(EMPTY_SERVER_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemSflowService.getConfig(refresh);
      setConfig(response);
      setForm(toFormState(response));
      setServers(normalizeServers(response.servers));
      setEditingServerAddress(null);
      setServerForm(EMPTY_SERVER_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sFlow settings.");
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
    const normalizedForm = {
      ...form,
      agentAddress: form.agentAddress.trim(),
      agentInterface: form.agentInterface.trim(),
      dropMonitorLimit: form.dropMonitorLimit.trim(),
      interfacesText: splitUniqueLines(form.interfacesText).join("\n"),
      polling: form.polling.trim(),
      samplingRate: form.samplingRate.trim(),
      servers: normalizeServers(servers),
    };
    const normalizedConfig = {
      ...toFormState(config),
      interfacesText: config.interfaces.join("\n"),
      servers: normalizeServers(config.servers),
    };
    return JSON.stringify(normalizedForm) !== JSON.stringify(normalizedConfig);
  }, [config, form, servers]);

  const upsertServer = () => {
    const address = serverForm.address.trim();
    const port = serverForm.port.trim() || "6343";
    if (!address) {
      setError("Server address is required.");
      return;
    }
    if (!/^\d+$/.test(port)) {
      setError("Server port must be a whole number.");
      return;
    }

    setServers((previous) => {
      const withoutEditing = editingServerAddress
        ? previous.filter((entry) => entry.address !== editingServerAddress)
        : previous;
      return normalizeServers([...withoutEditing.filter((entry) => entry.address !== address), { address, port }]);
    });
    setEditingServerAddress(address);
    setServerForm({ address, port });
    setError(null);
    setSuccess(editingServerAddress ? `Updated server ${address}.` : `Added server ${address}.`);
  };

  const editServer = (entry: SflowServerEntry) => {
    setEditingServerAddress(entry.address);
    setServerForm({ address: entry.address, port: entry.port || "6343" });
    setError(null);
    setSuccess(null);
  };

  const removeServer = (address: string) => {
    setServers((previous) => previous.filter((entry) => entry.address !== address));
    if (editingServerAddress === address) {
      setEditingServerAddress(null);
      setServerForm(EMPTY_SERVER_FORM);
    }
  };

  const saveConfig = async () => {
    for (const [label, value] of [
      ["Drop monitor limit", form.dropMonitorLimit],
      ["Polling interval", form.polling],
      ["Sampling rate", form.samplingRate],
    ] as const) {
      const trimmed = value.trim();
      if (trimmed && !/^\d+$/.test(trimmed)) {
        setError(`${label} must be a whole number.`);
        return;
      }
    }

    const operations = buildOperations(config, form, servers);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemSflowService.batchConfigure(operations);
      if (!response.success) throw new Error(response.error || "VyOS rejected sFlow changes.");
      await loadData(true);
      setSuccess("sFlow settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sFlow settings.");
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
            <h1 className="text-3xl font-bold">System sFlow</h1>
            <p className="mt-1 text-muted-foreground">Configure `system sflow` exporters, sampling, and collectors.</p>
          </div>
          <PageGuideDialog guide={pageGuides.systemSflow} />
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
            <CardTitle>Global sFlow Settings</CardTitle>
            <CardDescription>Agent identity and exporter behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="sflow-agent-address">Agent Address</Label>
                <Input
                  id="sflow-agent-address"
                  value={form.agentAddress}
                  onChange={(event) => setForm((previous) => ({ ...previous, agentAddress: event.target.value }))}
                  placeholder="192.0.2.14"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sflow-agent-interface">Agent Interface</Label>
                <Input
                  id="sflow-agent-interface"
                  value={form.agentInterface}
                  onChange={(event) => setForm((previous) => ({ ...previous, agentInterface: event.target.value }))}
                  placeholder="eth0"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sflow-drop-limit">Drop Monitor Limit</Label>
                <Input
                  id="sflow-drop-limit"
                  value={form.dropMonitorLimit}
                  onChange={(event) => setForm((previous) => ({ ...previous, dropMonitorLimit: event.target.value }))}
                  placeholder="50"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sflow-polling">Polling (sec)</Label>
                <Input
                  id="sflow-polling"
                  value={form.polling}
                  onChange={(event) => setForm((previous) => ({ ...previous, polling: event.target.value }))}
                  placeholder="30"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sflow-sampling-rate">Sampling Rate</Label>
                <Input
                  id="sflow-sampling-rate"
                  value={form.samplingRate}
                  onChange={(event) => setForm((previous) => ({ ...previous, samplingRate: event.target.value }))}
                  placeholder="1000"
                  disabled={!canEdit || saving}
                />
              </div>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm md:mt-7">
                <Checkbox
                  checked={form.enableEgress}
                  disabled={!canEdit || saving}
                  onCheckedChange={(value) => setForm((previous) => ({ ...previous, enableEgress: value === true }))}
                />
                Enable egress export
              </label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sflow-interfaces">Monitored Interfaces</Label>
              <Textarea
                id="sflow-interfaces"
                value={form.interfacesText}
                onChange={(event) => setForm((previous) => ({ ...previous, interfacesText: event.target.value }))}
                placeholder={"eth0\neth1"}
                className="min-h-24 font-mono text-sm"
                disabled={!canEdit || saving}
              />
              <p className="text-xs text-muted-foreground">One interface per line.</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>sFlow Collectors</CardTitle>
              <CardDescription>`system sflow server &lt;address&gt; port &lt;port&gt;` entries.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Port</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {servers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                          No sFlow collectors configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      servers.map((entry) => (
                        <TableRow key={entry.address}>
                          <TableCell>{entry.address}</TableCell>
                          <TableCell>{entry.port || "6343"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editServer(entry)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={!canEdit || saving}
                                onClick={() => removeServer(entry.address)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{editingServerAddress ? `Edit ${editingServerAddress}` : "Add Collector"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="sflow-server-address">Address</Label>
                <Input
                  id="sflow-server-address"
                  value={serverForm.address}
                  onChange={(event) => setServerForm((previous) => ({ ...previous, address: event.target.value }))}
                  placeholder="192.0.2.1"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sflow-server-port">Port</Label>
                <Input
                  id="sflow-server-port"
                  value={serverForm.port}
                  onChange={(event) => setServerForm((previous) => ({ ...previous, port: event.target.value }))}
                  placeholder="6343"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={upsertServer} disabled={!canEdit || saving} className="flex-1">
                  {editingServerAddress ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingServerAddress ? "Update" : "Add"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setEditingServerAddress(null);
                    setServerForm(EMPTY_SERVER_FORM);
                  }}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Badge variant={hasChanges ? "default" : "secondary"}>{hasChanges ? "Unsaved Changes" : "In Sync"}</Badge>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" onClick={saveConfig} disabled={!canEdit || saving || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              Save sFlow
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
