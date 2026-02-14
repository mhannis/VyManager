"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, ArrowRightLeft, Plus, Save, Trash2 } from "lucide-react";
import { systemService, type DhcpRelayConfig } from "@/lib/api/system";

interface DhcpRelayServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
  interfaces: string[];
  interfaceLabels: Record<string, string>;
  interfacesLoading: boolean;
}

function normalizeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function DhcpRelayServiceTab({
  canEdit,
  active,
  refreshNonce,
  interfaces,
  interfaceLabels,
  interfacesLoading,
}: DhcpRelayServiceTabProps) {
  const [config, setConfig] = useState<DhcpRelayConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await systemService.getDhcpRelayConfig(refresh);
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DHCP relay configuration.");
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

  const selectedInterfaces = useMemo(() => {
    if (!config) return [];
    return [...new Set(config.interfaces)].filter(Boolean).sort((left, right) => left.localeCompare(right));
  }, [config]);

  const toggleInterface = (interfaceName: string, checked: boolean) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const current = new Set(previous.interfaces);
      if (checked) current.add(interfaceName);
      else current.delete(interfaceName);
      return { ...previous, interfaces: Array.from(current).sort() };
    });
  };

  const addServer = () => {
    setConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, servers: [...previous.servers, ""] };
    });
  };

  const updateServer = (index: number, value: string) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.servers];
      next[index] = value;
      return { ...previous, servers: next };
    });
  };

  const removeServer = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        servers: previous.servers.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const handleSave = async () => {
    if (!config) return;

    const payload: DhcpRelayConfig = {
      configured: config.configured,
      enabled: config.enabled,
      interfaces: config.enabled ? normalizeStringList(config.interfaces) : [],
      servers: config.enabled ? normalizeStringList(config.servers) : [],
    };

    if (payload.enabled && payload.interfaces.length === 0) {
      setError("Select at least one interface when DHCP relay is enabled.");
      setSuccess(null);
      return;
    }

    if (payload.enabled && payload.servers.length === 0) {
      setError("Add at least one DHCP server address when DHCP relay is enabled.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await systemService.updateDhcpRelayConfig(payload);
      setConfig(updated);
      setSuccess("DHCP relay configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update DHCP relay configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            DHCP Relay
          </CardTitle>
          <CardDescription>
            Forward DHCP requests received on selected interfaces to upstream DHCP server addresses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !config ? (
            <p className="text-sm text-muted-foreground">Loading DHCP relay configuration...</p>
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
                <Label className="text-sm font-medium">Enable DHCP relay service</Label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Interfaces</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canEdit || saving || interfacesLoading || interfaces.length === 0 || !config.enabled}
                      >
                        Select Interfaces
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel>DHCP Relay Interfaces</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {interfacesLoading ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading interfaces...</div>
                      ) : interfaces.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No interfaces found.</div>
                      ) : (
                        interfaces.map((iface) => (
                          <DropdownMenuCheckboxItem
                            key={iface}
                            checked={selectedInterfaces.includes(iface)}
                            onCheckedChange={(checked) => toggleInterface(iface, checked)}
                          >
                            {interfaceLabels[iface] ?? iface}
                          </DropdownMenuCheckboxItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-xs text-muted-foreground">
                  Selected:{" "}
                  {selectedInterfaces.length > 0
                    ? selectedInterfaces.map((iface) => interfaceLabels[iface] ?? iface).join(", ")
                    : "none"}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">DHCP Server Addresses</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addServer}
                    disabled={!canEdit || saving || !config.enabled}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Server
                  </Button>
                </div>
                {config.servers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No DHCP relay servers configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.servers.map((entry, index) => (
                      <div key={`dhcp-relay-server-${index}`} className="flex items-center gap-2">
                        <Input
                          value={entry}
                          onChange={(event) => updateServer(index, event.target.value)}
                          placeholder="192.168.10.10"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeServer(index)}
                          disabled={!canEdit || saving || !config.enabled}
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
                {saving ? "Saving..." : "Save DHCP Relay"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
