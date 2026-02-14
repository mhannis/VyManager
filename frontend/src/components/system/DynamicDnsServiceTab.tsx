"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { AlertCircle, Globe, Plus, Save, Trash2 } from "lucide-react";
import { systemService, type DynamicDnsConfig, type DynamicDnsEntry } from "@/lib/api/system";

interface DynamicDnsServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
  interfaces: string[];
  interfaceLabels: Record<string, string>;
  interfacesLoading: boolean;
}

const EMPTY_ENTRY: DynamicDnsEntry = {
  interface: "",
  service: "",
  host_name: null,
  login: null,
  password: null,
  server: null,
  has_password: false,
};

const COMMON_PROVIDERS = [
  "aws",
  "cloudflare",
  "custom",
  "ddns",
  "desec",
  "dnsexit",
  "dnsomatic",
  "dyndns",
  "duckdns",
  "freedns",
  "namecheap",
  "noip",
] as const;

function cleanOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function DynamicDnsServiceTab({
  canEdit,
  active,
  refreshNonce,
  interfaces,
  interfaceLabels,
  interfacesLoading,
}: DynamicDnsServiceTabProps) {
  const [config, setConfig] = useState<DynamicDnsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await systemService.getDynamicDnsConfig(refresh);
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Dynamic DNS configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active || config) return;
    loadConfig(false);
  }, [active, config]);

  useEffect(() => {
    if (!active) return;
    loadConfig(true);
  }, [active, refreshNonce]);

  const updateEntry = (index: number, update: Partial<DynamicDnsEntry>) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.entries];
      next[index] = { ...next[index], ...update };
      return { ...previous, entries: next };
    });
  };

  const removeEntry = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        entries: previous.entries.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const handleSave = async () => {
    if (!config) return;

    const entries: DynamicDnsEntry[] = config.enabled
      ? config.entries
          .map((entry) => ({
            interface: entry.interface.trim(),
            service: entry.service.trim(),
            host_name: cleanOptional(entry.host_name ?? ""),
            login: cleanOptional(entry.login ?? ""),
            password: cleanOptional(entry.password ?? ""),
            server: cleanOptional(entry.server ?? ""),
          }))
          .filter((entry) => entry.interface.length > 0 && entry.service.length > 0)
      : [];

    if (config.enabled) {
      const uniqueServiceBindings = new Set<string>();
      for (const entry of entries) {
        const key = `${entry.interface.toLowerCase()}::${entry.service.toLowerCase()}`;
        if (uniqueServiceBindings.has(key)) {
          setError(
            `Duplicate Dynamic DNS mapping detected for ${entry.interface} / ${entry.service}. Keep one entry per interface + provider.`
          );
          setSuccess(null);
          return;
        }
        uniqueServiceBindings.add(key);
      }
    }

    if (config.enabled && entries.length === 0) {
      setError("Add at least one Dynamic DNS entry when the service is enabled.");
      setSuccess(null);
      return;
    }

    const payload: DynamicDnsConfig = {
      configured: config.configured,
      enabled: config.enabled,
      entries,
    };

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await systemService.updateDynamicDnsConfig(payload);
      setConfig(updated);
      setSuccess("Dynamic DNS configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update Dynamic DNS configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Dynamic DNS
          </CardTitle>
          <CardDescription>
            Configure DDNS providers per interface. Leave password blank to keep the current secret for unchanged entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !config ? (
            <p className="text-sm text-muted-foreground">Loading Dynamic DNS configuration...</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.enabled}
                  onCheckedChange={(checked) =>
                    setConfig((previous) => (previous ? { ...previous, enabled: checked === true } : previous))
                  }
                  disabled={!canEdit || saving}
                />
                <Label className="text-sm font-medium">Enable Dynamic DNS service</Label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Provider Entries</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) =>
                        previous ? { ...previous, entries: [...previous.entries, { ...EMPTY_ENTRY }] } : previous
                      )
                    }
                    disabled={!canEdit || saving || interfacesLoading || interfaces.length === 0}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Entry
                  </Button>
                </div>

                {interfacesLoading && (
                  <p className="text-xs text-muted-foreground">Loading interfaces...</p>
                )}

                {!interfacesLoading && interfaces.length === 0 && (
                  <p className="text-xs text-muted-foreground">No interfaces available.</p>
                )}

                {config.entries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No Dynamic DNS entries configured.</p>
                ) : (
                  <div className="space-y-3">
                    {config.entries.map((entry, index) => (
                      <div key={`ddns-entry-${index}`} className="rounded-md border p-3 space-y-3">
                        <div className="grid gap-3 xl:grid-cols-3">
                          <div className="space-y-2">
                            <Label>Interface</Label>
                            <Select
                              value={entry.interface || "__empty__"}
                              onValueChange={(value) =>
                                updateEntry(index, { interface: value === "__empty__" ? "" : value })
                              }
                              disabled={!canEdit || saving || interfacesLoading || !config.enabled}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select interface" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__empty__">Select interface</SelectItem>
                                {interfaces.map((iface) => (
                                  <SelectItem key={iface} value={iface}>
                                    {interfaceLabels[iface] ?? iface}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Service Provider</Label>
                            <Input
                              list={`ddns-provider-list-${index}`}
                              value={entry.service}
                              onChange={(event) => updateEntry(index, { service: event.target.value })}
                              placeholder="duckdns"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                            <datalist id={`ddns-provider-list-${index}`}>
                              {COMMON_PROVIDERS.map((provider) => (
                                <option key={provider} value={provider} />
                              ))}
                            </datalist>
                          </div>

                          <div className="space-y-2">
                            <Label>Host Name</Label>
                            <Input
                              value={entry.host_name ?? ""}
                              onChange={(event) => updateEntry(index, { host_name: event.target.value })}
                              placeholder="home.example.com"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 xl:grid-cols-3">
                          <div className="space-y-2">
                            <Label>Login</Label>
                            <Input
                              value={entry.login ?? ""}
                              onChange={(event) => updateEntry(index, { login: event.target.value })}
                              placeholder="username"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Password</Label>
                            <Input
                              type="password"
                              value={entry.password ?? ""}
                              onChange={(event) => updateEntry(index, { password: event.target.value })}
                              placeholder={entry.has_password ? "Leave blank to keep existing" : "Password"}
                              disabled={!canEdit || saving || !config.enabled}
                            />
                            {entry.has_password && !entry.password && (
                              <p className="text-[11px] text-muted-foreground">Existing password is set.</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Provider Server (Optional)</Label>
                            <Input
                              value={entry.server ?? ""}
                              onChange={(event) => updateEntry(index, { server: event.target.value })}
                              placeholder="members.dyndns.org"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeEntry(index)}
                            disabled={!canEdit || saving || !config.enabled}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove Entry
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700">
                  {success}
                </div>
              )}

              <Button onClick={handleSave} disabled={!canEdit || saving || loading}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Dynamic DNS"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
