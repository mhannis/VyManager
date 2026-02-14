"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Globe, Plus, Save, Trash2 } from "lucide-react";
import {
  systemService,
  type DnsConfig,
  type DnsForwardingDomainOverride,
  type DnsHostOverride,
} from "@/lib/api/system";

interface DnsServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
  mode?: "forwarder" | "resolver";
}

const EMPTY_DOMAIN_OVERRIDE: DnsForwardingDomainOverride = {
  domain: "",
  name_servers: [],
};

const EMPTY_HOST_OVERRIDE: DnsHostOverride = {
  hostname: "",
  addresses: [],
  aliases: [],
};

function toCsv(values: string[]): string {
  return values.join(", ");
}

function fromCsv(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

export function DnsServiceTab({ canEdit, active, refreshNonce, mode = "forwarder" }: DnsServiceTabProps) {
  const [config, setConfig] = useState<DnsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const resolverMode = mode === "resolver";

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await systemService.getDnsConfig(refresh);
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DNS configuration.");
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

  const updateDomainOverride = (index: number, update: Partial<DnsForwardingDomainOverride>) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.domain_overrides];
      next[index] = { ...next[index], ...update };
      return { ...previous, domain_overrides: next };
    });
  };

  const removeDomainOverride = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        domain_overrides: previous.domain_overrides.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const updateHostOverride = (index: number, update: Partial<DnsHostOverride>) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.host_overrides];
      next[index] = { ...next[index], ...update };
      return { ...previous, host_overrides: next };
    });
  };

  const removeHostOverride = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        host_overrides: previous.host_overrides.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const handleSave = async () => {
    if (!config) return;

    const payload: DnsConfig = {
      enabled: config.enabled,
      local_domain_name: config.local_domain_name?.trim() || null,
      listen_addresses: fromCsv(toCsv(config.listen_addresses)),
      allow_from: fromCsv(toCsv(config.allow_from)),
      name_servers: fromCsv(toCsv(config.name_servers)),
      use_system_name_servers: config.use_system_name_servers,
      cache_size: config.cache_size,
      authoritative_domains: fromCsv(toCsv(config.authoritative_domains)),
      domain_overrides: config.domain_overrides
        .map((entry) => ({
          domain: entry.domain.trim(),
          name_servers: fromCsv(toCsv(entry.name_servers)),
        }))
        .filter((entry) => entry.domain.length > 0 && entry.name_servers.length > 0),
      host_overrides: config.host_overrides
        .map((entry) => ({
          hostname: entry.hostname.trim(),
          addresses: fromCsv(toCsv(entry.addresses)),
          aliases: fromCsv(toCsv(entry.aliases)),
        }))
        .filter((entry) => entry.hostname.length > 0 && entry.addresses.length > 0),
    };

    if (payload.cache_size !== null && payload.cache_size !== undefined && payload.cache_size < 0) {
      setError("Cache size must be zero or greater.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await systemService.updateDnsConfig(payload);
      setConfig(updated);
      setSuccess("DNS configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update DNS configuration.");
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
            {resolverMode
              ? "DNS Resolver (VyOS DNS Service)"
              : "DNS Forwarding + Local Authoritative Entries"}
          </CardTitle>
          <CardDescription>
            {resolverMode
              ? "VyOS resolver behavior is configured through the same DNS service. Use this page to configure recursive forwarding, local domain, and authoritative host/domain overrides."
              : "Configure DNS forwarding, domain overrides, and host overrides for local name resolution."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading || !config ? (
            <p className="text-sm text-muted-foreground">Loading DNS configuration...</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.enabled}
                  onCheckedChange={(checked) =>
                    setConfig((previous) =>
                      previous ? { ...previous, enabled: checked === true } : previous
                    )
                  }
                  disabled={!canEdit || saving}
                />
                <Label className="text-sm font-medium">Enable DNS service</Label>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <Label>Local Domain Name</Label>
                  <Input
                    value={config.local_domain_name ?? ""}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, local_domain_name: event.target.value } : previous
                      )
                    }
                    placeholder="lab.local"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cache Size</Label>
                  <Input
                    type="number"
                    min={0}
                    value={config.cache_size ?? ""}
                    onChange={(event) =>
                      setConfig((previous) => {
                        if (!previous) return previous;
                        const parsed = Number.parseInt(event.target.value, 10);
                        return {
                          ...previous,
                          cache_size: Number.isNaN(parsed) ? null : parsed,
                        };
                      })
                    }
                    placeholder="150"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <Label>Listen Addresses (comma separated)</Label>
                  <Input
                    value={toCsv(config.listen_addresses)}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, listen_addresses: fromCsv(event.target.value) } : previous
                      )
                    }
                    placeholder="192.168.1.1, 10.0.0.1"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Allow-From Networks (comma separated)</Label>
                  <Input
                    value={toCsv(config.allow_from)}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, allow_from: fromCsv(event.target.value) } : previous
                      )
                    }
                    placeholder="192.168.1.0/24"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <Label>Upstream Name Servers (comma separated)</Label>
                  <Input
                    value={toCsv(config.name_servers)}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, name_servers: fromCsv(event.target.value) } : previous
                      )
                    }
                    placeholder="1.1.1.1, 9.9.9.9"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Authoritative Domains (comma separated)</Label>
                  <Input
                    value={toCsv(config.authoritative_domains)}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous
                          ? { ...previous, authoritative_domains: fromCsv(event.target.value) }
                          : previous
                      )
                    }
                    placeholder="lab.local, 10.in-addr.arpa"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.use_system_name_servers}
                  onCheckedChange={(checked) =>
                    setConfig((previous) =>
                      previous ? { ...previous, use_system_name_servers: checked === true } : previous
                    )
                  }
                  disabled={!canEdit || saving || !config.enabled}
                />
                <Label className="text-sm font-medium">Use system name servers as upstreams</Label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Domain Overrides</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) =>
                        previous
                          ? { ...previous, domain_overrides: [...previous.domain_overrides, { ...EMPTY_DOMAIN_OVERRIDE }] }
                          : previous
                      )
                    }
                    disabled={!canEdit || saving || !config.enabled}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Override
                  </Button>
                </div>
                {config.domain_overrides.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No domain overrides configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.domain_overrides.map((entry, index) => (
                      <div key={`domain-override-${index}`} className="grid gap-2 xl:grid-cols-[1fr_2fr_auto]">
                        <Input
                          value={entry.domain}
                          onChange={(event) =>
                            updateDomainOverride(index, { domain: event.target.value })
                          }
                          placeholder="corp.example.com"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Input
                          value={toCsv(entry.name_servers)}
                          onChange={(event) =>
                            updateDomainOverride(index, { name_servers: fromCsv(event.target.value) })
                          }
                          placeholder="10.0.0.2, 10.0.0.3"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDomainOverride(index)}
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Host Overrides</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) =>
                        previous ? { ...previous, host_overrides: [...previous.host_overrides, { ...EMPTY_HOST_OVERRIDE }] } : previous
                      )
                    }
                    disabled={!canEdit || saving}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Host
                  </Button>
                </div>
                {config.host_overrides.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No host overrides configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.host_overrides.map((entry, index) => (
                      <div key={`host-override-${index}`} className="grid gap-2 xl:grid-cols-[1fr_1.5fr_1.5fr_auto]">
                        <Input
                          value={entry.hostname}
                          onChange={(event) =>
                            updateHostOverride(index, { hostname: event.target.value })
                          }
                          placeholder="pihole.lab.local"
                          disabled={!canEdit || saving}
                        />
                        <Input
                          value={toCsv(entry.addresses)}
                          onChange={(event) =>
                            updateHostOverride(index, { addresses: fromCsv(event.target.value) })
                          }
                          placeholder="192.168.1.2"
                          disabled={!canEdit || saving}
                        />
                        <Input
                          value={toCsv(entry.aliases)}
                          onChange={(event) =>
                            updateHostOverride(index, { aliases: fromCsv(event.target.value) })
                          }
                          placeholder="dns, resolver"
                          disabled={!canEdit || saving}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeHostOverride(index)}
                          disabled={!canEdit || saving}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
                {saving ? "Saving..." : "Save DNS Settings"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
