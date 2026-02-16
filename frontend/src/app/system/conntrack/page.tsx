"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Save } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import { systemConntrackService, type SystemConntrackConfig } from "@/lib/api/system-conntrack";

interface ConntrackFormState {
  tableSize: string;
  expectTableSize: string;
  hashSize: string;
  modules: string[];
  tcpHalfOpenConnections: string;
  tcpLoose: string;
  tcpMaxRetrans: string;
}

const MODULE_OPTIONS = [
  "ftp",
  "h323",
  "nfs",
  "pptp",
  "sip",
  "sqlnet",
  "tftp",
] as const;

const EMPTY_FORM: ConntrackFormState = {
  tableSize: "",
  expectTableSize: "",
  hashSize: "",
  modules: [],
  tcpHalfOpenConnections: "",
  tcpLoose: "",
  tcpMaxRetrans: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function toFormState(config: SystemConntrackConfig): ConntrackFormState {
  return {
    tableSize: config.tableSize,
    expectTableSize: config.expectTableSize,
    hashSize: config.hashSize,
    modules: uniqueSorted(config.modules),
    tcpHalfOpenConnections: config.tcpHalfOpenConnections,
    tcpLoose: config.tcpLoose,
    tcpMaxRetrans: config.tcpMaxRetrans,
  };
}

function buildOperations(current: SystemConntrackConfig | null, form: ConntrackFormState): string[] {
  const operations: string[] = [];
  const base = "system conntrack";
  const currentSafe = current || {
    tableSize: "",
    expectTableSize: "",
    hashSize: "",
    modules: [],
    tcpHalfOpenConnections: "",
    tcpLoose: "",
    tcpMaxRetrans: "",
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

  syncScalar("table-size", form.tableSize, currentSafe.tableSize);
  syncScalar("expect-table-size", form.expectTableSize, currentSafe.expectTableSize);
  syncScalar("hash-size", form.hashSize, currentSafe.hashSize);
  syncScalar("tcp half-open-connections", form.tcpHalfOpenConnections, currentSafe.tcpHalfOpenConnections);
  syncScalar("tcp loose", form.tcpLoose, currentSafe.tcpLoose);
  syncScalar("tcp max-retrans", form.tcpMaxRetrans, currentSafe.tcpMaxRetrans);

  const desiredModules = uniqueSorted(form.modules);
  const currentModules = uniqueSorted(currentSafe.modules);
  const desiredSet = new Set(desiredModules);
  const currentSet = new Set(currentModules);
  for (const moduleName of currentModules) {
    if (!desiredSet.has(moduleName)) {
      operations.push(`delete ${base} modules ${quoteCliValue(moduleName)}`);
    }
  }
  for (const moduleName of desiredModules) {
    if (!currentSet.has(moduleName)) {
      operations.push(`set ${base} modules ${quoteCliValue(moduleName)}`);
    }
  }

  return operations;
}

export default function SystemConntrackPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemConntrackConfig | null>(null);
  const [form, setForm] = useState<ConntrackFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemConntrackService.getConfig(refresh);
      setConfig(response);
      setForm(toFormState(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conntrack settings.");
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
    return JSON.stringify(toFormState(config)) !== JSON.stringify({ ...form, modules: uniqueSorted(form.modules) });
  }, [config, form]);

  const toggleModule = (moduleName: string, checked: boolean) => {
    setForm((previous) => {
      const next = new Set(previous.modules);
      if (checked) next.add(moduleName);
      else next.delete(moduleName);
      return { ...previous, modules: Array.from(next).sort((left, right) => left.localeCompare(right)) };
    });
  };

  const saveConfig = async () => {
    for (const [label, value] of [
      ["Table Size", form.tableSize],
      ["Expect Table Size", form.expectTableSize],
      ["Hash Size", form.hashSize],
      ["TCP Half Open Connections", form.tcpHalfOpenConnections],
      ["TCP Max Retrans", form.tcpMaxRetrans],
    ] as const) {
      const trimmed = value.trim();
      if (trimmed && !/^\d+$/.test(trimmed)) {
        setError(`${label} must be a whole number.`);
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
      const response = await systemConntrackService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected conntrack changes.");
      }
      await loadData(true);
      setSuccess("Conntrack settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save conntrack settings.");
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
            <h1 className="text-3xl font-bold">System Conntrack</h1>
            <p className="mt-1 text-muted-foreground">
              Configure state tracking behavior under `system conntrack`.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.systemConntrack} />
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
            <CardTitle>Global Conntrack Sizing</CardTitle>
            <CardDescription>Set conntrack table sizing for your traffic profile.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="conntrack-table-size">Table Size</Label>
              <Input
                id="conntrack-table-size"
                value={form.tableSize}
                onChange={(event) => setForm((previous) => ({ ...previous, tableSize: event.target.value }))}
                placeholder="262144"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-expect-table-size">Expect Table Size</Label>
              <Input
                id="conntrack-expect-table-size"
                value={form.expectTableSize}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, expectTableSize: event.target.value }))
                }
                placeholder="4096"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-hash-size">Hash Size</Label>
              <Input
                id="conntrack-hash-size"
                value={form.hashSize}
                onChange={(event) => setForm((previous) => ({ ...previous, hashSize: event.target.value }))}
                placeholder="32768"
                disabled={!canEdit || saving}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TCP Behavior</CardTitle>
            <CardDescription>Adjust TCP conntrack behavior and tolerance settings.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="conntrack-tcp-half-open">Half-Open Connections</Label>
              <Input
                id="conntrack-tcp-half-open"
                value={form.tcpHalfOpenConnections}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    tcpHalfOpenConnections: event.target.value,
                  }))
                }
                placeholder="512"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-tcp-loose">Loose Tracking</Label>
              <Select
                value={form.tcpLoose || "none"}
                onValueChange={(value) =>
                  setForm((previous) => ({ ...previous, tcpLoose: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="conntrack-tcp-loose" disabled={!canEdit || saving}>
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default</SelectItem>
                  <SelectItem value="enable">Enable</SelectItem>
                  <SelectItem value="disable">Disable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-tcp-max-retrans">Max Retrans</Label>
              <Input
                id="conntrack-tcp-max-retrans"
                value={form.tcpMaxRetrans}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    tcpMaxRetrans: event.target.value,
                  }))
                }
                placeholder="3"
                disabled={!canEdit || saving}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conntrack Modules</CardTitle>
            <CardDescription>Enable protocol helpers only as needed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MODULE_OPTIONS.map((moduleName) => (
                <label
                  key={moduleName}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={form.modules.includes(moduleName)}
                    disabled={!canEdit || saving}
                    onCheckedChange={(value) => toggleModule(moduleName, value === true)}
                  />
                  <span>{moduleName}</span>
                </label>
              ))}
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
          <Badge variant={hasChanges ? "default" : "secondary"}>
            {hasChanges ? "Unsaved Changes" : "In Sync"}
          </Badge>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" onClick={saveConfig} disabled={!canEdit || saving || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              Save Conntrack
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

