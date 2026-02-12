"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import {
  systemService,
  type NtpConfig,
  type NtpServerConfig,
  type NtpStatus,
} from "@/lib/api/system";
import {
  Clock3,
  Plus,
  RefreshCw,
  Save,
  Server,
  Shield,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

const EMPTY_SERVER: NtpServerConfig = {
  address: "",
  prefer: false,
  pool: false,
  noselect: false,
  nts: false,
  interleave: false,
  ptp: false,
};

function displayOrDash(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export default function SystemServicesPage() {
  const { canWrite } = usePermissions();
  const canEditSystem = canWrite(FeatureGroup.SYSTEM);

  const [config, setConfig] = useState<NtpConfig | null>(null);
  const [status, setStatus] = useState<NtpStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [configData, statusData] = await Promise.all([
        systemService.getNtpConfig(true),
        systemService.getNtpStatus(true),
      ]);

      setConfig(configData);
      setStatus(statusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load NTP service data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const addServer = () => {
    setConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, servers: [...previous.servers, { ...EMPTY_SERVER }] };
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

  const updateServer = <K extends keyof NtpServerConfig>(
    index: number,
    key: K,
    value: NtpServerConfig[K]
  ) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const nextServers = [...previous.servers];
      nextServers[index] = { ...nextServers[index], [key]: value };
      return { ...previous, servers: nextServers };
    });
  };

  const addAllowClient = () => {
    setConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, allow_clients: [...previous.allow_clients, ""] };
    });
  };

  const updateAllowClient = (index: number, value: string) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.allow_clients];
      next[index] = value;
      return { ...previous, allow_clients: next };
    });
  };

  const removeAllowClient = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        allow_clients: previous.allow_clients.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const addListenAddress = () => {
    setConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, listen_addresses: [...previous.listen_addresses, ""] };
    });
  };

  const updateListenAddress = (index: number, value: string) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.listen_addresses];
      next[index] = value;
      return { ...previous, listen_addresses: next };
    });
  };

  const removeListenAddress = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        listen_addresses: previous.listen_addresses.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const handleSave = async () => {
    if (!config) return;

    const payload: NtpConfig = {
      enabled: config.enabled,
      servers: config.servers
        .map((server) => ({ ...server, address: server.address.trim() }))
        .filter((server) => server.address.length > 0),
      allow_clients: config.allow_clients.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
      listen_addresses: config.listen_addresses
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    };

    if (payload.enabled && payload.servers.length === 0) {
      setError("At least one NTP server is required when the NTP service is enabled.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await systemService.updateNtpConfig(payload);
      setConfig(updated);
      const latestStatus = await systemService.getNtpStatus(true);
      setStatus(latestStatus);
      setSuccess("NTP service configuration updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update NTP service configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Server className="h-8 w-8" />
              System Services
            </h1>
            <p className="text-muted-foreground mt-2">
              Configure and monitor system-level services such as NTP.
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={loading || saving}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-primary" />
                NTP Service Configuration
              </CardTitle>
              <CardDescription>
                Manage upstream NTP servers and which client subnets can query this router as an NTP source.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loading || !config ? (
                <div className="text-muted-foreground text-sm">Loading NTP configuration...</div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={config.enabled}
                      onCheckedChange={(checked) => {
                        setConfig((previous) => {
                          if (!previous) return previous;
                          return { ...previous, enabled: checked === true };
                        });
                      }}
                      disabled={!canEditSystem || saving}
                    />
                    <Label className="text-sm font-medium">Enable NTP service</Label>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">NTP Servers</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addServer}
                        disabled={!canEditSystem || saving || !config.enabled}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Server
                      </Button>
                    </div>

                    {config.servers.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No servers configured.</p>
                    ) : (
                      <div className="space-y-3">
                        {config.servers.map((server, index) => (
                          <div key={`server-${index}`} className="rounded-md border p-3 space-y-3">
                            <div className="flex items-center gap-2">
                              <Input
                                value={server.address}
                                placeholder="time.cloudflare.com or 1.1.1.1"
                                onChange={(event) => updateServer(index, "address", event.target.value)}
                                disabled={!canEditSystem || saving || !config.enabled}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeServer(index)}
                                disabled={!canEditSystem || saving || !config.enabled}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <label className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={server.prefer}
                                  onCheckedChange={(checked) => updateServer(index, "prefer", checked === true)}
                                  disabled={!canEditSystem || saving || !config.enabled}
                                />
                                Prefer
                              </label>
                              <label className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={server.pool}
                                  onCheckedChange={(checked) => updateServer(index, "pool", checked === true)}
                                  disabled={!canEditSystem || saving || !config.enabled}
                                />
                                Pool
                              </label>
                              <label className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={server.noselect}
                                  onCheckedChange={(checked) => updateServer(index, "noselect", checked === true)}
                                  disabled={!canEditSystem || saving || !config.enabled}
                                />
                                No Select
                              </label>
                              <label className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={server.nts}
                                  onCheckedChange={(checked) => updateServer(index, "nts", checked === true)}
                                  disabled={!canEditSystem || saving || !config.enabled}
                                />
                                NTS
                              </label>
                              <label className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={server.interleave}
                                  onCheckedChange={(checked) =>
                                    updateServer(index, "interleave", checked === true)
                                  }
                                  disabled={!canEditSystem || saving || !config.enabled}
                                />
                                Interleave
                              </label>
                              <label className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={server.ptp}
                                  onCheckedChange={(checked) => updateServer(index, "ptp", checked === true)}
                                  disabled={!canEditSystem || saving || !config.enabled}
                                />
                                PTP
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Allow-Client Networks</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addAllowClient}
                        disabled={!canEditSystem || saving || !config.enabled}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Network
                      </Button>
                    </div>
                    {config.allow_clients.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No client networks configured.</p>
                    ) : (
                      <div className="space-y-2">
                        {config.allow_clients.map((entry, index) => (
                          <div key={`allow-${index}`} className="flex items-center gap-2">
                            <Input
                              value={entry}
                              placeholder="192.168.1.0/24"
                              onChange={(event) => updateAllowClient(index, event.target.value)}
                              disabled={!canEditSystem || saving || !config.enabled}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeAllowClient(index)}
                              disabled={!canEditSystem || saving || !config.enabled}
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
                      <Label className="text-sm font-medium">Listen Addresses (Optional)</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addListenAddress}
                        disabled={!canEditSystem || saving || !config.enabled}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Address
                      </Button>
                    </div>
                    {config.listen_addresses.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Listening on default interfaces.</p>
                    ) : (
                      <div className="space-y-2">
                        {config.listen_addresses.map((entry, index) => (
                          <div key={`listen-${index}`} className="flex items-center gap-2">
                            <Input
                              value={entry}
                              placeholder="0.0.0.0 or 192.168.1.1"
                              onChange={(event) => updateListenAddress(index, event.target.value)}
                              disabled={!canEditSystem || saving || !config.enabled}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeListenAddress(index)}
                              disabled={!canEditSystem || saving || !config.enabled}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={!canEditSystem || saving || loading}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? "Saving..." : "Save NTP Configuration"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Runtime NTP Status
              </CardTitle>
              <CardDescription>Live synchronization status from chrony.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!status ? (
                <p className="text-muted-foreground">No runtime data available.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={status.enabled ? "default" : "secondary"}>
                      {status.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    {status.enabled && (
                      <Badge
                        variant="outline"
                        className={
                          status.synchronized === true
                            ? "bg-green-500/10 text-green-600 border-green-500/20"
                            : status.synchronized === false
                              ? "bg-red-500/10 text-red-600 border-red-500/20"
                              : "bg-muted text-muted-foreground"
                        }
                      >
                        {status.synchronized === true
                          ? "Synchronized"
                          : status.synchronized === false
                            ? "Not synchronized"
                            : "Sync unknown"}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Reference</span>
                      <span className="font-medium text-right">
                        {displayOrDash(status.reference_name || status.reference_id)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Stratum</span>
                      <span className="font-medium">{displayOrDash(status.stratum)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Leap Status</span>
                      <span className="font-medium text-right">{displayOrDash(status.leap_status)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Online Sources</span>
                      <span className="font-medium">{displayOrDash(status.sources_online)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Offline Sources</span>
                      <span className="font-medium">{displayOrDash(status.sources_offline)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
