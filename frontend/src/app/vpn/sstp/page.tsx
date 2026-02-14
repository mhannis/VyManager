"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Plus, RefreshCw, Save, Shield, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { vpnSstpApi } from "@/lib/api/vpn-sstp";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "@/components/system/serviceTabHelpers";

interface ClientPoolEntry {
  name: string;
  ranges: string[];
  nextPool: string;
}

interface LocalUserEntry {
  username: string;
  password: string;
  disabled: boolean;
  staticIp: string;
  downloadRate: string;
  uploadRate: string;
}

interface SstpState {
  enabled: boolean;
  description: string;
  hostName: string;
  gatewayAddress: string;
  defaultPool: string;
  maxConcurrentSessions: string;
  mtu: string;
  sslCaCertificate: string;
  sslCertificate: string;
  authMode: "" | "local" | "radius";
  authProtocols: string[];
  nameServers: string[];
  winsServers: string[];
  clientPools: ClientPoolEntry[];
  localUsers: LocalUserEntry[];
}

const EMPTY_STATE: SstpState = {
  enabled: false,
  description: "",
  hostName: "",
  gatewayAddress: "",
  defaultPool: "",
  maxConcurrentSessions: "",
  mtu: "",
  sslCaCertificate: "",
  sslCertificate: "",
  authMode: "",
  authProtocols: [],
  nameServers: [],
  winsServers: [],
  clientPools: [],
  localUsers: [],
};

const AUTH_PROTOCOLS = ["pap", "chap", "mschap", "mschap-v2"];

function parseDirectOrKey(value: unknown): string {
  const direct = asString(value);
  if (direct) return direct;
  const root = toRecord(value);
  const first = Object.keys(root)[0];
  return first || "";
}

function parseClientPools(root: Record<string, unknown>): ClientPoolEntry[] {
  return Object.keys(root)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((name) => {
      const cfg = toRecord(root[name]);
      return {
        name,
        ranges: objectKeys(cfg.range),
        nextPool: asString(cfg["next-pool"]) ?? "",
      };
    });
}

function parseLocalUsers(root: Record<string, unknown>): LocalUserEntry[] {
  return Object.keys(root)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((username) => {
      const cfg = toRecord(root[username]);
      const rateLimit = toRecord(cfg["rate-limit"]);
      return {
        username,
        password: asString(cfg.password) ?? "",
        disabled: Object.prototype.hasOwnProperty.call(cfg, "disable"),
        staticIp: asString(cfg["static-ip"]) ?? "",
        downloadRate: asString(rateLimit.download) ?? "",
        uploadRate: asString(rateLimit.upload) ?? "",
      };
    });
}

function parseConfig(root: Record<string, unknown>): SstpState {
  const auth = toRecord(root.authentication);
  const ssl = toRecord(root.ssl);

  return {
    enabled: Object.keys(root).length > 0,
    description: asString(root.description) ?? "",
    hostName: asString(root["host-name"]) ?? "",
    gatewayAddress: asString(root["gateway-address"]) ?? "",
    defaultPool: asString(root["default-pool"]) ?? "",
    maxConcurrentSessions: asString(root["max-concurrent-sessions"]) ?? "",
    mtu: asString(root.mtu) ?? "",
    sslCaCertificate: asString(ssl["ca-certificate"]) ?? "",
    sslCertificate: asString(ssl.certificate) ?? "",
    authMode: (parseDirectOrKey(auth.mode) as "local" | "radius" | "") ?? "",
    authProtocols: objectKeys(auth.protocols),
    nameServers: objectKeys(root["name-server"]),
    winsServers: objectKeys(root["wins-server"]),
    clientPools: parseClientPools(toRecord(root["client-ip-pool"])),
    localUsers: parseLocalUsers(toRecord(toRecord(auth["local-users"]).username)),
  };
}

function updateList(values: string[], index: number, value: string): string[] {
  const next = [...values];
  next[index] = value;
  return next;
}

export default function VpnSstpPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.VPN) || canWrite(FeatureGroup.IPSEC);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SstpState>(EMPTY_STATE);

  const loadConfig = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await vpnSstpApi.getConfig(refresh);
      setConfig(parseConfig(toRecord(payload.vpn)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SSTP configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig(false);
  }, []);

  const handleSave = async () => {
    const operations: string[] = ["delete vpn sstp"];

    if (config.enabled) {
      operations.push("set vpn sstp");
      const base = "set vpn sstp";

      if (config.description.trim()) operations.push(`${base} description ${quoteCliValue(config.description)}`);
      if (config.hostName.trim()) operations.push(`${base} host-name ${quoteCliValue(config.hostName)}`);
      if (config.gatewayAddress.trim()) operations.push(`${base} gateway-address ${quoteCliValue(config.gatewayAddress)}`);
      if (config.defaultPool.trim()) operations.push(`${base} default-pool ${quoteCliValue(config.defaultPool)}`);
      if (config.maxConcurrentSessions.trim()) operations.push(`${base} max-concurrent-sessions ${quoteCliValue(config.maxConcurrentSessions)}`);
      if (config.mtu.trim()) operations.push(`${base} mtu ${quoteCliValue(config.mtu)}`);
      if (config.sslCaCertificate.trim()) operations.push(`${base} ssl ca-certificate ${quoteCliValue(config.sslCaCertificate)}`);
      if (config.sslCertificate.trim()) operations.push(`${base} ssl certificate ${quoteCliValue(config.sslCertificate)}`);

      for (const server of uniqueNonEmpty(config.nameServers)) {
        operations.push(`${base} name-server ${quoteCliValue(server)}`);
      }
      for (const server of uniqueNonEmpty(config.winsServers)) {
        operations.push(`${base} wins-server ${quoteCliValue(server)}`);
      }

      for (const pool of config.clientPools) {
        const name = pool.name.trim();
        if (!name) continue;
        const poolBase = `${base} client-ip-pool ${quoteCliValue(name)}`;
        operations.push(poolBase);
        for (const range of uniqueNonEmpty(pool.ranges)) {
          operations.push(`${poolBase} range ${quoteCliValue(range)}`);
        }
        if (pool.nextPool.trim()) {
          operations.push(`${poolBase} next-pool ${quoteCliValue(pool.nextPool)}`);
        }
      }

      if (config.authMode) {
        operations.push(`${base} authentication mode ${config.authMode}`);
      }
      for (const protocol of uniqueNonEmpty(config.authProtocols)) {
        operations.push(`${base} authentication protocols ${protocol}`);
      }

      for (const user of config.localUsers) {
        const username = user.username.trim();
        if (!username) continue;
        const userBase = `${base} authentication local-users username ${quoteCliValue(username)}`;
        if (user.password.trim()) operations.push(`${userBase} password ${quoteCliValue(user.password)}`);
        if (user.disabled) operations.push(`${userBase} disable`);
        if (user.staticIp.trim()) operations.push(`${userBase} static-ip ${quoteCliValue(user.staticIp)}`);
        if (user.downloadRate.trim()) operations.push(`${userBase} rate-limit download ${quoteCliValue(user.downloadRate)}`);
        if (user.uploadRate.trim()) operations.push(`${userBase} rate-limit upload ${quoteCliValue(user.uploadRate)}`);
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await vpnSstpApi.configure(operations);
      await loadConfig(true);
      setSuccess("SSTP configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update SSTP configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SSTP Server</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure SSTP server authentication, SSL certificates, and client address pools.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              SSTP Configuration
            </CardTitle>
            <CardDescription>Managed under <code>vpn sstp</code>.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading SSTP configuration...</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={config.enabled}
                    onCheckedChange={(checked) =>
                      setConfig((previous) => ({ ...previous, enabled: checked === true }))
                    }
                    disabled={!canEdit || saving}
                  />
                  <Label className="text-sm font-medium">Enable SSTP server</Label>
                </div>

                <div className="grid gap-3 xl:grid-cols-4">
                  <Input value={config.description} onChange={(event) => setConfig((previous) => ({ ...previous, description: event.target.value }))} placeholder="Description" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.hostName} onChange={(event) => setConfig((previous) => ({ ...previous, hostName: event.target.value }))} placeholder="Host name (SNI)" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.gatewayAddress} onChange={(event) => setConfig((previous) => ({ ...previous, gatewayAddress: event.target.value }))} placeholder="Gateway address" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.defaultPool} onChange={(event) => setConfig((previous) => ({ ...previous, defaultPool: event.target.value }))} placeholder="Default pool" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.maxConcurrentSessions} onChange={(event) => setConfig((previous) => ({ ...previous, maxConcurrentSessions: event.target.value }))} placeholder="Max concurrent sessions" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.mtu} onChange={(event) => setConfig((previous) => ({ ...previous, mtu: event.target.value }))} placeholder="MTU" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.sslCaCertificate} onChange={(event) => setConfig((previous) => ({ ...previous, sslCaCertificate: event.target.value }))} placeholder="SSL CA certificate" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.sslCertificate} onChange={(event) => setConfig((previous) => ({ ...previous, sslCertificate: event.target.value }))} placeholder="SSL server certificate" disabled={!canEdit || saving || !config.enabled} />
                </div>

                <div className="grid gap-3 xl:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Authentication Mode</Label>
                    <Select
                      value={config.authMode || "__unset__"}
                      onValueChange={(value) =>
                        setConfig((previous) => ({
                          ...previous,
                          authMode: value === "__unset__" ? "" : (value as "local" | "radius"),
                        }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unset__">Default</SelectItem>
                        <SelectItem value="local">Local</SelectItem>
                        <SelectItem value="radius">RADIUS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Authentication Protocols</Label>
                  <div className="flex flex-wrap gap-3">
                    {AUTH_PROTOCOLS.map((protocol) => {
                      const checked = config.authProtocols.includes(protocol);
                      return (
                        <label key={protocol} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(state) =>
                              setConfig((previous) => {
                                const exists = previous.authProtocols.includes(protocol);
                                return {
                                  ...previous,
                                  authProtocols: state === true
                                    ? exists
                                      ? previous.authProtocols
                                      : [...previous.authProtocols, protocol]
                                    : previous.authProtocols.filter((item) => item !== protocol),
                                };
                              })
                            }
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          {protocol}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {([
                  { key: "nameServers", label: "Name Servers", placeholder: "DNS server IP" },
                  { key: "winsServers", label: "WINS Servers", placeholder: "WINS server IP" },
                ] as const).map((listConfig) => (
                  <div key={listConfig.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">{listConfig.label}</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfig((previous) => ({
                            ...previous,
                            [listConfig.key]: [...previous[listConfig.key], ""],
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add
                      </Button>
                    </div>
                    {config[listConfig.key].length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No entries configured.</p>
                    ) : (
                      <div className="space-y-2">
                        {config[listConfig.key].map((entry, index) => (
                          <div key={`${listConfig.key}-${index}`} className="flex items-center gap-2">
                            <Input
                              value={entry}
                              onChange={(event) =>
                                setConfig((previous) => ({
                                  ...previous,
                                  [listConfig.key]: updateList(previous[listConfig.key], index, event.target.value),
                                }))
                              }
                              placeholder={listConfig.placeholder}
                              disabled={!canEdit || saving || !config.enabled}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setConfig((previous) => ({
                                  ...previous,
                                  [listConfig.key]: previous[listConfig.key].filter(
                                    (_, currentIndex) => currentIndex !== index,
                                  ),
                                }))
                              }
                              disabled={!canEdit || saving || !config.enabled}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Client IP Pools</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfig((previous) => ({
                          ...previous,
                          clientPools: [...previous.clientPools, { name: "", ranges: [""], nextPool: "" }],
                        }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Pool
                    </Button>
                  </div>
                  {config.clientPools.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No client pools configured.</p>
                  ) : (
                    <div className="space-y-2">
                      {config.clientPools.map((pool, poolIndex) => (
                        <div key={`pool-${poolIndex}`} className="rounded border p-3 space-y-2">
                          <div className="grid gap-2 xl:grid-cols-[1fr_1fr_auto]">
                            <Input
                              value={pool.name}
                              onChange={(event) =>
                                setConfig((previous) => {
                                  const next = [...previous.clientPools];
                                  next[poolIndex] = { ...next[poolIndex], name: event.target.value };
                                  return { ...previous, clientPools: next };
                                })
                              }
                              placeholder="Pool name"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                            <Input
                              value={pool.nextPool}
                              onChange={(event) =>
                                setConfig((previous) => {
                                  const next = [...previous.clientPools];
                                  next[poolIndex] = { ...next[poolIndex], nextPool: event.target.value };
                                  return { ...previous, clientPools: next };
                                })
                              }
                              placeholder="Next pool (optional)"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setConfig((previous) => ({
                                  ...previous,
                                  clientPools: previous.clientPools.filter((_, index) => index !== poolIndex),
                                }))
                              }
                              disabled={!canEdit || saving || !config.enabled}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {pool.ranges.map((range, rangeIndex) => (
                              <div key={`pool-${poolIndex}-range-${rangeIndex}`} className="flex items-center gap-2">
                                <Input
                                  value={range}
                                  onChange={(event) =>
                                    setConfig((previous) => {
                                      const next = [...previous.clientPools];
                                      next[poolIndex] = {
                                        ...next[poolIndex],
                                        ranges: updateList(next[poolIndex].ranges, rangeIndex, event.target.value),
                                      };
                                      return { ...previous, clientPools: next };
                                    })
                                  }
                                  placeholder="Range (e.g. 10.0.0.2-10.0.0.100)"
                                  disabled={!canEdit || saving || !config.enabled}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setConfig((previous) => {
                                      const next = [...previous.clientPools];
                                      next[poolIndex] = {
                                        ...next[poolIndex],
                                        ranges: next[poolIndex].ranges.filter((_, index) => index !== rangeIndex),
                                      };
                                      return { ...previous, clientPools: next };
                                    })
                                  }
                                  disabled={!canEdit || saving || !config.enabled}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setConfig((previous) => {
                                  const next = [...previous.clientPools];
                                  next[poolIndex] = {
                                    ...next[poolIndex],
                                    ranges: [...next[poolIndex].ranges, ""],
                                  };
                                  return { ...previous, clientPools: next };
                                })
                              }
                              disabled={!canEdit || saving || !config.enabled}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add Range
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Local Users</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfig((previous) => ({
                          ...previous,
                          localUsers: [
                            ...previous.localUsers,
                            {
                              username: "",
                              password: "",
                              disabled: false,
                              staticIp: "",
                              downloadRate: "",
                              uploadRate: "",
                            },
                          ],
                        }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add User
                    </Button>
                  </div>
                  {config.localUsers.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No local users configured.</p>
                  ) : (
                    <div className="space-y-2">
                      {config.localUsers.map((user, userIndex) => (
                        <div key={`user-${userIndex}`} className="rounded border p-3 space-y-2">
                          <div className="grid gap-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                            <Input
                              value={user.username}
                              onChange={(event) =>
                                setConfig((previous) => {
                                  const next = [...previous.localUsers];
                                  next[userIndex] = { ...next[userIndex], username: event.target.value };
                                  return { ...previous, localUsers: next };
                                })
                              }
                              placeholder="Username"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                            <Input
                              type="password"
                              value={user.password}
                              onChange={(event) =>
                                setConfig((previous) => {
                                  const next = [...previous.localUsers];
                                  next[userIndex] = { ...next[userIndex], password: event.target.value };
                                  return { ...previous, localUsers: next };
                                })
                              }
                              placeholder="Password"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                            <Input
                              value={user.staticIp}
                              onChange={(event) =>
                                setConfig((previous) => {
                                  const next = [...previous.localUsers];
                                  next[userIndex] = { ...next[userIndex], staticIp: event.target.value };
                                  return { ...previous, localUsers: next };
                                })
                              }
                              placeholder="Static IP"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={user.disabled}
                                onCheckedChange={(checked) =>
                                  setConfig((previous) => {
                                    const next = [...previous.localUsers];
                                    next[userIndex] = { ...next[userIndex], disabled: checked === true };
                                    return { ...previous, localUsers: next };
                                  })
                                }
                                disabled={!canEdit || saving || !config.enabled}
                              />
                              <Label className="text-sm">Disabled</Label>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setConfig((previous) => ({
                                  ...previous,
                                  localUsers: previous.localUsers.filter((_, index) => index !== userIndex),
                                }))
                              }
                              disabled={!canEdit || saving || !config.enabled}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid gap-2 xl:grid-cols-2">
                            <Input
                              value={user.downloadRate}
                              onChange={(event) =>
                                setConfig((previous) => {
                                  const next = [...previous.localUsers];
                                  next[userIndex] = { ...next[userIndex], downloadRate: event.target.value };
                                  return { ...previous, localUsers: next };
                                })
                              }
                              placeholder="Download rate kbit/s"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                            <Input
                              value={user.uploadRate}
                              onChange={(event) =>
                                setConfig((previous) => {
                                  const next = [...previous.localUsers];
                                  next[userIndex] = { ...next[userIndex], uploadRate: event.target.value };
                                  return { ...previous, localUsers: next };
                                })
                              }
                              placeholder="Upload rate kbit/s"
                              disabled={!canEdit || saving || !config.enabled}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {error ? (
                  <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>{error}</span>
                  </div>
                ) : null}

                {success ? (
                  <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                    {success}
                  </div>
                ) : null}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => loadConfig(true)} disabled={saving}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  <Button onClick={handleSave} disabled={!canEdit || saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save SSTP"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

