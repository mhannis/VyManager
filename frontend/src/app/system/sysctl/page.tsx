"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import { systemSysctlService, type SysctlParameter } from "@/lib/api/system-sysctl";

interface ParameterFormState {
  key: string;
  value: string;
}

const EMPTY_FORM: ParameterFormState = {
  key: "",
  value: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function isValidParameterKey(value: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(value);
}

export default function SystemSysctlPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [parameters, setParameters] = useState<SysctlParameter[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<ParameterFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemSysctlService.getConfig(refresh);
      setParameters(response.parameters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sysctl parameters.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const editParameter = (parameter: SysctlParameter) => {
    setEditingKey(parameter.key);
    setForm({ key: parameter.key, value: parameter.value });
    setError(null);
    setSuccess(null);
  };

  const resetForm = () => {
    setEditingKey(null);
    setForm(EMPTY_FORM);
    setError(null);
    setSuccess(null);
  };

  const saveParameter = async () => {
    const key = form.key.trim();
    const value = form.value.trim();
    if (!key) {
      setError("Parameter key is required.");
      return;
    }
    if (!isValidParameterKey(key)) {
      setError("Parameter key can only contain letters, numbers, dot, slash, underscore, or dash.");
      return;
    }
    if (!value) {
      setError("Parameter value is required.");
      return;
    }

    if (editingKey && editingKey !== key) {
      setError("Renaming sysctl keys is not supported. Add a new key and delete the old one.");
      return;
    }

    const current = parameters.find((entry) => entry.key === key);
    if (current && current.value === value) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemSysctlService.batchConfigure([
        `set system sysctl parameter ${quoteCliValue(key)} value ${quoteCliValue(value)}`,
      ]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected sysctl changes.");
      }
      await loadData(true);
      setSuccess(current ? `Updated ${key}.` : `Added ${key}.`);
      setEditingKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sysctl parameter.");
    } finally {
      setSaving(false);
    }
  };

  const deleteParameter = async (key: string) => {
    if (!window.confirm(`Delete sysctl parameter '${key}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemSysctlService.batchConfigure([
        `delete system sysctl parameter ${quoteCliValue(key)}`,
      ]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected sysctl delete.");
      }
      await loadData(true);
      if (editingKey === key) {
        resetForm();
      }
      setSuccess(`Deleted ${key}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete sysctl parameter.");
    } finally {
      setSaving(false);
    }
  };

  const parameterCount = useMemo(() => parameters.length, [parameters]);

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
            <h1 className="text-3xl font-bold">System Sysctl</h1>
            <p className="mt-1 text-muted-foreground">
              Configure kernel tuning values under `system sysctl parameter`.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.systemSysctl} />
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

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Configured Parameters</CardTitle>
              <CardDescription>Current sysctl key-value assignments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">Parameters: {parameterCount}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadData(true)}
                  disabled={refreshing || saving}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parameter</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parameters.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                          No sysctl parameters configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      parameters.map((entry) => (
                        <TableRow key={entry.key}>
                          <TableCell className="font-mono text-xs">{entry.key}</TableCell>
                          <TableCell className="font-mono text-xs">{entry.value}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editParameter(entry)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void deleteParameter(entry.key)}
                                disabled={saving || !canEdit}
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
              <CardTitle>{editingKey ? `Edit ${editingKey}` : "Add Sysctl Parameter"}</CardTitle>
              <CardDescription>Set kernel parameter key and value.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="sysctl-key">Parameter Key</Label>
                <Input
                  id="sysctl-key"
                  value={form.key}
                  onChange={(event) => setForm((previous) => ({ ...previous, key: event.target.value }))}
                  placeholder="net.ipv4.ip_forward"
                  className="font-mono"
                  disabled={!canEdit || saving || Boolean(editingKey)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sysctl-value">Value</Label>
                <Input
                  id="sysctl-value"
                  value={form.value}
                  onChange={(event) => setForm((previous) => ({ ...previous, value: event.target.value }))}
                  placeholder="1"
                  className="font-mono"
                  disabled={!canEdit || saving}
                />
              </div>

              {!canEdit && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  You have read-only permissions for System settings.
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={saveParameter}
                  disabled={!canEdit || saving}
                  className="flex-1"
                >
                  {editingKey ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingKey ? "Update Parameter" : "Add Parameter"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

