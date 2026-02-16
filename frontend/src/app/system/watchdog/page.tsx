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
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import { systemWatchdogService, type SystemWatchdogConfig } from "@/lib/api/system-watchdog";

interface FormState {
  enabled: boolean;
  module: string;
  timeout: string;
  shutdownTimeout: string;
  rebootTimeout: string;
  pingTargetsText: string;
  startupDelay: string;
  testInterval: string;
}

const EMPTY_FORM: FormState = {
  enabled: false,
  module: "",
  timeout: "",
  shutdownTimeout: "",
  rebootTimeout: "",
  pingTargetsText: "",
  startupDelay: "",
  testInterval: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:-]+$/.test(trimmed)) return trimmed;
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

function isValidPingTarget(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  if (/^[A-Za-z0-9.-]+$/.test(candidate)) return true;
  if (/^[0-9A-Fa-f:]+$/.test(candidate)) return true;
  return false;
}

function isValidWatchdogModule(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  return /^[A-Za-z0-9._:-]+$/.test(candidate);
}

function toFormState(config: SystemWatchdogConfig): FormState {
  return {
    enabled: config.enabled,
    module: config.module,
    timeout: config.timeout,
    shutdownTimeout: config.shutdownTimeout,
    rebootTimeout: config.rebootTimeout,
    pingTargetsText: config.pingTargets.join("\n"),
    startupDelay: config.startupDelay,
    testInterval: config.testInterval,
  };
}

function buildOperations(current: SystemWatchdogConfig | null, form: FormState): string[] {
  const operations: string[] = [];
  const base = "system watchdog";

  const currentSafe: SystemWatchdogConfig = current || {
    enabled: false,
    module: "",
    timeout: "",
    shutdownTimeout: "",
    rebootTimeout: "",
    pingTargets: [],
    startupDelay: "",
    testInterval: "",
  };

  if (!form.enabled) {
    if (currentSafe.enabled) {
      operations.push(`delete ${base}`);
    }
    return operations;
  }

  if (!currentSafe.enabled) {
    operations.push(`set ${base}`);
  }

  const syncScalar = (
    token:
      | "module"
      | "timeout"
      | "shutdown-timeout"
      | "reboot-timeout"
      | "startup-delay"
      | "test-interval",
    desiredRaw: string,
    currentRaw: string,
  ) => {
    const desired = desiredRaw.trim();
    const existing = currentRaw.trim();
    if (desired === existing) return;
    if (desired) {
      operations.push(`set ${base} ${token} ${quoteCliValue(desired)}`);
    } else {
      operations.push(`delete ${base} ${token}`);
    }
  };

  const desiredTargets = splitUniqueLines(form.pingTargetsText);
  const currentTargets = currentSafe.pingTargets;
  const desiredSet = new Set(desiredTargets);
  const currentSet = new Set(currentTargets);

  for (const target of currentTargets) {
    if (!desiredSet.has(target)) {
      operations.push(`delete ${base} ping ${quoteCliValue(target)}`);
    }
  }
  for (const target of desiredTargets) {
    if (!currentSet.has(target)) {
      operations.push(`set ${base} ping ${quoteCliValue(target)}`);
    }
  }

  syncScalar("module", form.module, currentSafe.module);
  syncScalar("timeout", form.timeout, currentSafe.timeout);
  syncScalar("shutdown-timeout", form.shutdownTimeout, currentSafe.shutdownTimeout);
  syncScalar("reboot-timeout", form.rebootTimeout, currentSafe.rebootTimeout);
  syncScalar("startup-delay", form.startupDelay, currentSafe.startupDelay);
  syncScalar("test-interval", form.testInterval, currentSafe.testInterval);

  return operations;
}

export default function SystemWatchdogPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemWatchdogConfig | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemWatchdogService.getConfig(refresh);
      setConfig(response);
      setForm(toFormState(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system watchdog settings.");
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
    return (
      form.enabled !== config.enabled ||
      form.module.trim() !== config.module.trim() ||
      form.timeout.trim() !== config.timeout.trim() ||
      form.shutdownTimeout.trim() !== config.shutdownTimeout.trim() ||
      form.rebootTimeout.trim() !== config.rebootTimeout.trim() ||
      splitUniqueLines(form.pingTargetsText).join("\n") !== config.pingTargets.join("\n") ||
      form.startupDelay.trim() !== config.startupDelay.trim() ||
      form.testInterval.trim() !== config.testInterval.trim()
    );
  }, [config, form]);

  const saveConfig = async () => {
    if (form.enabled) {
      if (form.module.trim() && !isValidWatchdogModule(form.module)) {
        setError("Watchdog module name can only contain letters, numbers, dot, underscore, colon, or dash.");
        setSuccess(null);
        return;
      }

      const pingTargets = splitUniqueLines(form.pingTargetsText);
      for (const target of pingTargets) {
        if (!isValidPingTarget(target)) {
          setError(`Invalid watchdog ping target '${target}'.`);
          setSuccess(null);
          return;
        }
      }

      const numericFields = [
        { label: "Watchdog timeout", value: form.timeout, min: 1, max: 65535 },
        { label: "Shutdown timeout", value: form.shutdownTimeout, min: 60, max: 65535 },
        { label: "Reboot timeout", value: form.rebootTimeout, min: 60, max: 65535 },
        { label: "Startup delay", value: form.startupDelay, min: 0, max: 65535 },
        { label: "Test interval", value: form.testInterval, min: 1, max: 65535 },
      ] as const;
      for (const field of numericFields) {
        const trimmed = field.value.trim();
        if (!trimmed) continue;
        if (!/^\d+$/.test(trimmed)) {
          setError(`${field.label} must be a whole number.`);
          setSuccess(null);
          return;
        }
        const parsed = Number.parseInt(trimmed, 10);
        if (parsed < field.min || parsed > field.max) {
          setError(`${field.label} must be between ${field.min} and ${field.max}.`);
          setSuccess(null);
          return;
        }
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
      const response = await systemWatchdogService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected system watchdog changes.");
      }
      await loadData(true);
      setSuccess("System watchdog settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save system watchdog settings.");
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
            <h1 className="text-3xl font-bold">System Watchdog</h1>
            <p className="mt-1 text-muted-foreground">
              Configure hardware watchdog controls and optional ping checks under `system watchdog`.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.systemWatchdog} />
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
            <CardTitle>Watchdog Configuration</CardTitle>
            <CardDescription>
              Enable watchdog support, select the watchdog module, and tune timeout behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((previous) => ({ ...previous, enabled: checked === true }))
                }
                disabled={!canEdit || saving}
              />
              Enable system watchdog
            </label>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="watchdog-module">Module</Label>
                <Input
                  id="watchdog-module"
                  value={form.module}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, module: event.target.value }))
                  }
                  placeholder="iTCO_wdt"
                  disabled={!canEdit || saving || !form.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="watchdog-timeout">Timeout (seconds)</Label>
                <Input
                  id="watchdog-timeout"
                  value={form.timeout}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, timeout: event.target.value }))
                  }
                  placeholder="120"
                  disabled={!canEdit || saving || !form.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="watchdog-shutdown-timeout">Shutdown Timeout (seconds)</Label>
                <Input
                  id="watchdog-shutdown-timeout"
                  value={form.shutdownTimeout}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, shutdownTimeout: event.target.value }))
                  }
                  placeholder="180"
                  disabled={!canEdit || saving || !form.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="watchdog-reboot-timeout">Reboot Timeout (seconds)</Label>
                <Input
                  id="watchdog-reboot-timeout"
                  value={form.rebootTimeout}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, rebootTimeout: event.target.value }))
                  }
                  placeholder="180"
                  disabled={!canEdit || saving || !form.enabled}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="watchdog-ping-targets">Ping Targets (optional)</Label>
              <Textarea
                id="watchdog-ping-targets"
                value={form.pingTargetsText}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, pingTargetsText: event.target.value }))
                }
                placeholder={"192.0.2.1\nresolver.example.net"}
                className="min-h-28 font-mono text-sm"
                disabled={!canEdit || saving || !form.enabled}
              />
              <p className="text-xs text-muted-foreground">
                Optional legacy ping checks; enter one destination per line.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="watchdog-startup-delay">Startup Delay (seconds)</Label>
                <Input
                  id="watchdog-startup-delay"
                  value={form.startupDelay}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, startupDelay: event.target.value }))
                  }
                  placeholder="120"
                  disabled={!canEdit || saving || !form.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="watchdog-test-interval">Test Interval (seconds)</Label>
                <Input
                  id="watchdog-test-interval"
                  value={form.testInterval}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, testInterval: event.target.value }))
                  }
                  placeholder="15"
                  disabled={!canEdit || saving || !form.enabled}
                />
              </div>
            </div>

            {!canEdit && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                You have read-only permissions for System settings.
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <Badge variant={hasChanges ? "default" : "secondary"}>
                {hasChanges ? "Unsaved Changes" : "In Sync"}
              </Badge>
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
                  Save Watchdog
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
