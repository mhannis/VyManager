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
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import { systemUpdateCheckService, type SystemUpdateCheckConfig } from "@/lib/api/system-update-check";

interface FormState {
  autoCheck: boolean;
  url: string;
}

const EMPTY_FORM: FormState = {
  autoCheck: false,
  url: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+?=&#[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function toFormState(config: SystemUpdateCheckConfig): FormState {
  return {
    autoCheck: config.autoCheck,
    url: config.url,
  };
}

function buildOperations(current: SystemUpdateCheckConfig | null, form: FormState): string[] {
  const operations: string[] = [];
  const desiredAutoCheck = form.autoCheck;
  const currentAutoCheck = Boolean(current?.autoCheck);
  const desiredUrl = form.url.trim();
  const currentUrl = (current?.url || "").trim();

  if (desiredAutoCheck !== currentAutoCheck) {
    operations.push(`${desiredAutoCheck ? "set" : "delete"} system update-check auto-check`);
  }

  if (desiredUrl !== currentUrl) {
    if (desiredUrl) {
      operations.push(`set system update-check url ${quoteCliValue(desiredUrl)}`);
    } else if (currentUrl) {
      operations.push("delete system update-check url");
    }
  }

  return operations;
}

export default function SystemUpdateCheckPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemUpdateCheckConfig | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemUpdateCheckService.getConfig(refresh);
      setConfig(response);
      setForm(toFormState(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system update-check settings.");
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
    return form.autoCheck !== config.autoCheck || form.url.trim() !== config.url.trim();
  }, [config, form.autoCheck, form.url]);

  const saveConfig = async () => {
    const desired = form.url.trim();
    if (desired && !/^https?:\/\/[^\s]+$/i.test(desired)) {
      setError("Update-check URL must be an absolute HTTP/HTTPS URL.");
      setSuccess(null);
      return;
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
      const response = await systemUpdateCheckService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected system update-check changes.");
      }
      await loadData(true);
      setSuccess("System update-check settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save system update-check settings.");
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
            <h1 className="text-3xl font-bold">System Update Check</h1>
            <p className="mt-1 text-muted-foreground">
              Configure automatic checks and optional custom metadata source under `system update-check`.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.systemUpdateCheck} />
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
            <CardTitle>Update Check Settings</CardTitle>
            <CardDescription>
              Configure automatic update checks and optional metadata source URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.autoCheck}
                onCheckedChange={(checked) =>
                  setForm((previous) => ({ ...previous, autoCheck: checked === true }))
                }
                disabled={!canEdit || saving}
              />
              Enable automatic update checks
            </label>

            <div className="space-y-2">
              <Label htmlFor="update-check-url">URL</Label>
              <Input
                id="update-check-url"
                value={form.url}
                onChange={(event) => setForm((previous) => ({ ...previous, url: event.target.value }))}
                placeholder="https://dev.packages.vyos.net/"
                disabled={!canEdit || saving}
              />
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
                  Save Update Check
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
