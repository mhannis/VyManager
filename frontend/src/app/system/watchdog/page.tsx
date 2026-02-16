"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Save } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import { systemWatchdogService, type SystemWatchdogConfig } from "@/lib/api/system-watchdog";

interface FormState {
  pingTargetsText: string;
  startupDelay: string;
  testInterval: string;
}

const EMPTY_FORM: FormState = {
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

function toFormState(config: SystemWatchdogConfig): FormState {
  return {
    pingTargetsText: config.pingTargets.join("\n"),
    startupDelay: config.startupDelay,
    testInterval: config.testInterval,
  };
}

function buildOperations(current: SystemWatchdogConfig | null, form: FormState): string[] {
  const operations: string[] = [];
  const base = "system watchdog";

  const currentSafe: SystemWatchdogConfig = current || {
    pingTargets: [],
    startupDelay: "",
    testInterval: "",
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

  const syncScalar = (token: "startup-delay" | "test-interval", desiredRaw: string, currentRaw: string) => {
    const desired = desiredRaw.trim();
    const existing = currentRaw.trim();
    if (desired === existing) return;
    if (desired) {
      operations.push(`set ${base} ${token} ${quoteCliValue(desired)}`);
    } else {
      operations.push(`delete ${base} ${token}`);
    }
  };

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
      splitUniqueLines(form.pingTargetsText).join("\n") !== config.pingTargets.join("\n") ||
      form.startupDelay.trim() !== config.startupDelay.trim() ||
      form.testInterval.trim() !== config.testInterval.trim()
    );
  }, [config, form]);

  const saveConfig = async () => {
    const pingTargets = splitUniqueLines(form.pingTargetsText);
    for (const target of pingTargets) {
      if (!isValidPingTarget(target)) {
        setError(`Invalid watchdog ping target '${target}'.`);
        setSuccess(null);
        return;
      }
    }

    const numericFields = [
      { label: "Startup delay", value: form.startupDelay },
      { label: "Test interval", value: form.testInterval },
    ];
    for (const field of numericFields) {
      const trimmed = field.value.trim();
      if (!trimmed) continue;
      if (!/^\d+$/.test(trimmed)) {
        setError(`${field.label} must be a whole number.`);
        setSuccess(null);
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
              Configure periodic watchdog pings and timers under `system watchdog`.
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
              Add one or more ping targets so VyOS can detect upstream failures and trigger configured actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="watchdog-ping-targets">Ping Targets</Label>
              <Textarea
                id="watchdog-ping-targets"
                value={form.pingTargetsText}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, pingTargetsText: event.target.value }))
                }
                placeholder={"192.0.2.1\nresolver.example.net"}
                className="min-h-28 font-mono text-sm"
                disabled={!canEdit || saving}
              />
              <p className="text-xs text-muted-foreground">
                Enter one destination per line. Use stable upstream addresses reachable from this system.
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
                  disabled={!canEdit || saving}
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
                  disabled={!canEdit || saving}
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

