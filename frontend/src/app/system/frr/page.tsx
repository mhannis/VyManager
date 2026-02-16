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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import { systemFrrService, type SystemFrrConfig } from "@/lib/api/system-frr";

interface FrrFormState {
  bmp: boolean;
  descriptors: string;
  irdp: boolean;
  profile: string;
  snmpDaemonsText: string;
}

const EMPTY_FORM: FrrFormState = {
  bmp: false,
  descriptors: "",
  irdp: false,
  profile: "",
  snmpDaemonsText: "",
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

function toFormState(config: SystemFrrConfig): FrrFormState {
  return {
    bmp: config.bmp,
    descriptors: config.descriptors,
    irdp: config.irdp,
    profile: config.profile,
    snmpDaemonsText: config.snmpDaemons.join("\n"),
  };
}

function buildOperations(current: SystemFrrConfig | null, form: FrrFormState): string[] {
  const base = "system frr";
  const operations: string[] = [];
  const currentSafe = current || {
    bmp: false,
    descriptors: "",
    irdp: false,
    profile: "",
    snmpDaemons: [],
  };

  const syncFlag = (token: string, desired: boolean, existing: boolean) => {
    if (desired === existing) return;
    operations.push(`${desired ? "set" : "delete"} ${base} ${token}`);
  };
  const syncScalar = (token: string, desiredRaw: string, existingRaw: string) => {
    const desired = desiredRaw.trim();
    const existing = existingRaw.trim();
    if (desired === existing) return;
    if (desired) operations.push(`set ${base} ${token} ${quoteCliValue(desired)}`);
    else operations.push(`delete ${base} ${token}`);
  };

  syncFlag("bmp", form.bmp, currentSafe.bmp);
  syncFlag("irdp", form.irdp, currentSafe.irdp);
  syncScalar("descriptors", form.descriptors, currentSafe.descriptors);
  syncScalar("profile", form.profile, currentSafe.profile);

  const desiredSnmp = splitUniqueLines(form.snmpDaemonsText);
  const desiredSet = new Set(desiredSnmp);
  const currentSet = new Set(currentSafe.snmpDaemons);

  for (const daemon of currentSafe.snmpDaemons) {
    if (!desiredSet.has(daemon)) operations.push(`delete ${base} snmp ${quoteCliValue(daemon)}`);
  }
  for (const daemon of desiredSnmp) {
    if (!currentSet.has(daemon)) operations.push(`set ${base} snmp ${quoteCliValue(daemon)}`);
  }

  return operations;
}

export default function SystemFrrPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemFrrConfig | null>(null);
  const [form, setForm] = useState<FrrFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemFrrService.getConfig(refresh);
      setConfig(response);
      setForm(toFormState(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load FRR settings.");
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
      descriptors: form.descriptors.trim(),
      profile: form.profile.trim(),
      snmpDaemonsText: splitUniqueLines(form.snmpDaemonsText).join("\n"),
    };
    const normalizedConfig = {
      ...toFormState(config),
      snmpDaemonsText: config.snmpDaemons.join("\n"),
    };
    return JSON.stringify(normalizedForm) !== JSON.stringify(normalizedConfig);
  }, [config, form]);

  const saveConfig = async () => {
    if (form.descriptors.trim() && !/^\d+$/.test(form.descriptors.trim())) {
      setError("Descriptors must be a whole number.");
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
      const response = await systemFrrService.batchConfigure(operations);
      if (!response.success) throw new Error(response.error || "VyOS rejected FRR changes.");
      await loadData(true);
      setSuccess("FRR settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save FRR settings.");
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
            <h1 className="text-3xl font-bold">System FRR</h1>
            <p className="mt-1 text-muted-foreground">Configure FRR system-level options under `system frr`.</p>
          </div>
          <PageGuideDialog guide={pageGuides.systemFrr} />
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
            <CardTitle>FRR Core Settings</CardTitle>
            <CardDescription>Profile, descriptors, and protocol integration controls.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="frr-profile">Profile</Label>
              <Select
                value={form.profile || "none"}
                onValueChange={(value) => setForm((previous) => ({ ...previous, profile: value === "none" ? "" : value }))}
              >
                <SelectTrigger id="frr-profile" disabled={!canEdit || saving}>
                  <SelectValue placeholder="Select profile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unset</SelectItem>
                  <SelectItem value="traditional">Traditional</SelectItem>
                  <SelectItem value="datacenter">Datacenter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="frr-descriptors">Descriptors</Label>
              <Input
                id="frr-descriptors"
                value={form.descriptors}
                onChange={(event) => setForm((previous) => ({ ...previous, descriptors: event.target.value }))}
                placeholder="2048"
                disabled={!canEdit || saving}
              />
            </div>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Checkbox
                checked={form.bmp}
                disabled={!canEdit || saving}
                onCheckedChange={(value) => setForm((previous) => ({ ...previous, bmp: value === true }))}
              />
              Enable BMP
            </label>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Checkbox
                checked={form.irdp}
                disabled={!canEdit || saving}
                onCheckedChange={(value) => setForm((previous) => ({ ...previous, irdp: value === true }))}
              />
              Enable IRDP
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SNMP Daemons</CardTitle>
            <CardDescription>Provide one daemon per line (for example: `bgpd`, `zebra`).</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.snmpDaemonsText}
              onChange={(event) => setForm((previous) => ({ ...previous, snmpDaemonsText: event.target.value }))}
              placeholder={"bgpd\nzebra"}
              className="min-h-32 font-mono text-sm"
              disabled={!canEdit || saving}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Badge variant={hasChanges ? "default" : "secondary"}>{hasChanges ? "Unsaved Changes" : "In Sync"}</Badge>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" onClick={saveConfig} disabled={!canEdit || saving || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              Save FRR
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
