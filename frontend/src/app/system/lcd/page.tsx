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
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import { systemLcdService, type SystemLcdConfig } from "@/lib/api/system-lcd";

interface LcdFormState {
  device: string;
  model: string;
}

const EMPTY_FORM: LcdFormState = {
  device: "",
  model: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function toFormState(config: SystemLcdConfig): LcdFormState {
  return {
    device: config.device,
    model: config.model,
  };
}

function buildOperations(current: SystemLcdConfig | null, form: LcdFormState): string[] {
  const base = "system lcd";
  const operations: string[] = [];
  const currentSafe = current || { device: "", model: "" };

  const syncScalar = (token: string, desiredRaw: string, existingRaw: string) => {
    const desired = desiredRaw.trim();
    const existing = existingRaw.trim();
    if (desired === existing) return;
    if (desired) operations.push(`set ${base} ${token} ${quoteCliValue(desired)}`);
    else operations.push(`delete ${base} ${token}`);
  };

  syncScalar("device", form.device, currentSafe.device);
  syncScalar("model", form.model, currentSafe.model);
  return operations;
}

export default function SystemLcdPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemLcdConfig | null>(null);
  const [form, setForm] = useState<LcdFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemLcdService.getConfig(refresh);
      setConfig(response);
      setForm(toFormState(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load LCD settings.");
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
    return JSON.stringify(toFormState(config)) !== JSON.stringify({ device: form.device.trim(), model: form.model.trim() });
  }, [config, form]);

  const saveConfig = async () => {
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
      const response = await systemLcdService.batchConfigure(operations);
      if (!response.success) throw new Error(response.error || "VyOS rejected LCD changes.");
      await loadData(true);
      setSuccess("LCD settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save LCD settings.");
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
            <h1 className="text-3xl font-bold">System LCD</h1>
            <p className="mt-1 text-muted-foreground">Configure LCD model and device under `system lcd`.</p>
          </div>
          <PageGuideDialog guide={pageGuides.systemLcd} />
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
            <CardTitle>LCD Device Configuration</CardTitle>
            <CardDescription>Set the LCD model and backing device path if your platform supports an LCD panel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lcd-model">Model</Label>
                <Input
                  id="lcd-model"
                  value={form.model}
                  onChange={(event) => setForm((previous) => ({ ...previous, model: event.target.value }))}
                  placeholder="CFA635"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lcd-device">Device</Label>
                <Input
                  id="lcd-device"
                  value={form.device}
                  onChange={(event) => setForm((previous) => ({ ...previous, device: event.target.value }))}
                  placeholder="/dev/ttyUSB0"
                  disabled={!canEdit || saving}
                />
              </div>
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
                  Save LCD
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
