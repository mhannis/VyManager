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
import { systemProxyService, type SystemProxyConfig } from "@/lib/api/system-proxy";

interface ProxyFormState {
  url: string;
  port: string;
  username: string;
  password: string;
  noProxyText: string;
}

const EMPTY_FORM: ProxyFormState = {
  url: "",
  port: "",
  username: "",
  password: "",
  noProxyText: "",
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

function toFormState(config: SystemProxyConfig): ProxyFormState {
  return {
    url: config.url,
    port: config.port,
    username: config.username,
    password: config.password,
    noProxyText: config.noProxy.join("\n"),
  };
}

function buildOperations(current: SystemProxyConfig | null, form: ProxyFormState): string[] {
  const operations: string[] = [];
  const base = "system proxy";

  const currentSafe = current || {
    url: "",
    port: "",
    username: "",
    password: "",
    noProxy: [],
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

  syncScalar("url", form.url, currentSafe.url);
  syncScalar("port", form.port, currentSafe.port);
  syncScalar("username", form.username, currentSafe.username);
  syncScalar("password", form.password, currentSafe.password);

  const desiredNoProxy = splitUniqueLines(form.noProxyText);
  const desiredSet = new Set(desiredNoProxy);
  const currentSet = new Set(currentSafe.noProxy);

  for (const value of currentSafe.noProxy) {
    if (!desiredSet.has(value)) {
      operations.push(`delete ${base} no-proxy ${quoteCliValue(value)}`);
    }
  }
  for (const value of desiredNoProxy) {
    if (!currentSet.has(value)) {
      operations.push(`set ${base} no-proxy ${quoteCliValue(value)}`);
    }
  }

  return operations;
}

export default function SystemProxyPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemProxyConfig | null>(null);
  const [form, setForm] = useState<ProxyFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemProxyService.getConfig(refresh);
      setConfig(response);
      setForm(toFormState(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system proxy settings.");
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
      form.url.trim() !== config.url.trim() ||
      form.port.trim() !== config.port.trim() ||
      form.username.trim() !== config.username.trim() ||
      form.password.trim() !== config.password.trim() ||
      splitUniqueLines(form.noProxyText).join("\n") !== config.noProxy.join("\n")
    );
  }, [config, form]);

  const saveConfig = async () => {
    if (form.port.trim() && !/^\d+$/.test(form.port.trim())) {
      setError("Proxy port must be a whole number.");
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
      const response = await systemProxyService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected system proxy changes.");
      }
      await loadData(true);
      setSuccess("System proxy settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save system proxy settings.");
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
            <h1 className="text-3xl font-bold">System Proxy</h1>
            <p className="mt-1 text-muted-foreground">
              Configure outbound proxy settings under `system proxy`.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.systemProxy} />
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
            <CardTitle>Proxy Configuration</CardTitle>
            <CardDescription>
              Applies to system-originated services that honor global proxy settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="proxy-url">Proxy URL</Label>
                <Input
                  id="proxy-url"
                  value={form.url}
                  onChange={(event) => setForm((previous) => ({ ...previous, url: event.target.value }))}
                  placeholder="http://proxy.example.net"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proxy-port">Proxy Port</Label>
                <Input
                  id="proxy-port"
                  value={form.port}
                  onChange={(event) => setForm((previous) => ({ ...previous, port: event.target.value }))}
                  placeholder="3128"
                  disabled={!canEdit || saving}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="proxy-username">Username</Label>
                <Input
                  id="proxy-username"
                  value={form.username}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, username: event.target.value }))
                  }
                  placeholder="proxy-user"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proxy-password">Password</Label>
                <Input
                  id="proxy-password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, password: event.target.value }))
                  }
                  placeholder="proxy-password"
                  disabled={!canEdit || saving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proxy-no-proxy">No Proxy Targets</Label>
              <Textarea
                id="proxy-no-proxy"
                value={form.noProxyText}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, noProxyText: event.target.value }))
                }
                placeholder={"localhost\n127.0.0.1\n.lab.local"}
                className="min-h-28 font-mono text-sm"
                disabled={!canEdit || saving}
              />
              <p className="text-xs text-muted-foreground">
                One host, domain suffix, or address per line.
              </p>
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
                  Save Proxy
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

