"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Plus, Save, Shield, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { vpnL2tpApi } from "@/lib/api/vpn-l2tp";
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

interface L2tpState {
  enabled: boolean;
  description: string;
  outsideAddress: string;
  gatewayAddress: string;
  defaultPool: string;
  maxConcurrentSessions: string;
  mtu: string;
  lnsHostName: string;
  lnsSharedSecret: string;
  authMode: "" | "local" | "radius";
  authProtocols: string[];
  ipsecAuthMode: "" | "pre-shared-secret" | "x509";
  ipsecPreSharedSecret: string;
  nameServers: string[];
  clientPools: ClientPoolEntry[];
  localUsers: LocalUserEntry[];
}

const EMPTY_STATE: L2tpState = {
  enabled: false,
  description: "",
  outsideAddress: "",
  gatewayAddress: "",
  defaultPool: "",
  maxConcurrentSessions: "",
  mtu: "",
  lnsHostName: "",
  lnsSharedSecret: "",
  authMode: "",
  authProtocols: [],
  ipsecAuthMode: "",
  ipsecPreSharedSecret: "",
  nameServers: [],
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

function parseConfig(root: Record<string, unknown>): L2tpState {
  const remote = toRecord(root["remote-access"]);
  const auth = toRecord(remote.authentication);
  const ipsecSettings = toRecord(remote["ipsec-settings"]);
  const ipsecAuth = toRecord(ipsecSettings.authentication);
  const lns = toRecord(remote.lns);

  return {
    enabled: Object.keys(remote).length > 0,
    description: asString(remote.description) ?? "",
    outsideAddress: asString(remote["outside-address"]) ?? "",
    gatewayAddress: asString(remote["gateway-address"]) ?? "",
    defaultPool: asString(remote["default-pool"]) ?? "",
    maxConcurrentSessions: asString(remote["max-concurrent-sessions"]) ?? "",
    mtu: asString(remote.mtu) ?? "",
    lnsHostName: asString(lns["host-name"]) ?? "",
    lnsSharedSecret: asString(lns["shared-secret"]) ?? "",
    authMode: (parseDirectOrKey(auth.mode) as "local" | "radius" | "") ?? "",
    authProtocols: objectKeys(auth.protocols),
    ipsecAuthMode: (parseDirectOrKey(ipsecAuth.mode) as "pre-shared-secret" | "x509" | "") ?? "",
    ipsecPreSharedSecret: asString(ipsecAuth["pre-shared-secret"]) ?? "",
    nameServers: objectKeys(remote["name-server"]),
    clientPools: parseClientPools(toRecord(remote["client-ip-pool"])),
    localUsers: parseLocalUsers(toRecord(toRecord(auth["local-users"]).username)),
  };
}

function updateList(values: string[], index: number, value: string): string[] {
  const next = [...values];
  next[index] = value;
  return next;
}

export default function VpnL2tpPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.VPN) || canWrite(FeatureGroup.IPSEC);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<L2tpState>(EMPTY_STATE);

  const loadConfig = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await vpnL2tpApi.getConfig(refresh);
      setConfig(parseConfig(toRecord(payload.vpn)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load L2TP configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig(false);
  }, []);

  const handleSave = async () => {
    const operations: string[] = ["delete vpn l2tp"];

    if (config.enabled) {
      operations.push("set vpn l2tp", "set vpn l2tp remote-access");
      const base = "set vpn l2tp remote-access";

      if (config.description.trim()) operations.push(`${base} description ${quoteCliValue(config.description)}`);
      if (config.outsideAddress.trim()) operations.push(`${base} outside-address ${quoteCliValue(config.outsideAddress)}`);
      if (config.gatewayAddress.trim()) operations.push(`${base} gateway-address ${quoteCliValue(config.gatewayAddress)}`);
      if (config.defaultPool.trim()) operations.push(`${base} default-pool ${quoteCliValue(config.defaultPool)}`);
      if (config.maxConcurrentSessions.trim()) operations.push(`${base} max-concurrent-sessions ${quoteCliValue(config.maxConcurrentSessions)}`);
      if (config.mtu.trim()) operations.push(`${base} mtu ${quoteCliValue(config.mtu)}`);

      for (const server of uniqueNonEmpty(config.nameServers)) {
        operations.push(`${base} name-server ${quoteCliValue(server)}`);
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

      if (config.ipsecAuthMode) {
        operations.push(`${base} ipsec-settings authentication mode ${config.ipsecAuthMode}`);
      }
      if (config.ipsecPreSharedSecret.trim()) {
        operations.push(
          `${base} ipsec-settings authentication pre-shared-secret ${quoteCliValue(config.ipsecPreSharedSecret)}`,
        );
      }

      if (config.lnsHostName.trim()) {
        operations.push(`${base} lns host-name ${quoteCliValue(config.lnsHostName)}`);
      }
      if (config.lnsSharedSecret.trim()) {
        operations.push(`${base} lns shared-secret ${quoteCliValue(config.lnsSharedSecret)}`);
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await vpnL2tpApi.configure(operations);
      await loadConfig(true);
      setSuccess("L2TP configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update L2TP configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">L2TP</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure L2TP remote-access including local user auth, pools, and IPsec settings.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              L2TP Remote Access
            </CardTitle>
            <CardDescription>
              Managed under <code>vpn l2tp remote-access</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading L2TP configuration...</p>
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
                  <Label className="text-sm font-medium">Enable L2TP remote-access</Label>
                </div>

                <div className="grid gap-3 xl:grid-cols-4">
                  <Input value={config.description} onChange={(e) => setConfig((p) => ({ ...p, description: e.target.value }))} placeholder="Description" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.outsideAddress} onChange={(e) => setConfig((p) => ({ ...p, outsideAddress: e.target.value }))} placeholder="Outside address" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.gatewayAddress} onChange={(e) => setConfig((p) => ({ ...p, gatewayAddress: e.target.value }))} placeholder="Gateway address" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.defaultPool} onChange={(e) => setConfig((p) => ({ ...p, defaultPool: e.target.value }))} placeholder="Default pool" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.maxConcurrentSessions} onChange={(e) => setConfig((p) => ({ ...p, maxConcurrentSessions: e.target.value }))} placeholder="Max concurrent sessions" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.mtu} onChange={(e) => setConfig((p) => ({ ...p, mtu: e.target.value }))} placeholder="MTU" disabled={!canEdit || saving || !config.enabled} />
                  <Input value={config.lnsHostName} onChange={(e) => setConfig((p) => ({ ...p, lnsHostName: e.target.value }))} placeholder="LNS host-name" disabled={!canEdit || saving || !config.enabled} />
                  <Input type="password" value={config.lnsSharedSecret} onChange={(e) => setConfig((p) => ({ ...p, lnsSharedSecret: e.target.value }))} placeholder="LNS shared-secret" disabled={!canEdit || saving || !config.enabled} />
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

                  <div className="space-y-2">
                    <Label>IPsec Auth Mode</Label>
                    <Select
                      value={config.ipsecAuthMode || "__unset__"}
                      onValueChange={(value) =>
                        setConfig((previous) => ({
                          ...previous,
                          ipsecAuthMode:
                            value === "__unset__"
                              ? ""
                              : (value as "pre-shared-secret" | "x509"),
                        }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unset__">Default</SelectItem>
                        <SelectItem value="pre-shared-secret">Pre-shared Secret</SelectItem>
                        <SelectItem value="x509">X.509</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>IPsec Pre-shared Secret</Label>
                    <Input
                      type="password"
                      value={config.ipsecPreSharedSecret}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          ipsecPreSharedSecret: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  {AUTH_PROTOCOLS.map((protocol) => (
                    <div key={protocol} className="flex items-center gap-2">
                      <Checkbox
                        checked={config.authProtocols.includes(protocol)}
                        onCheckedChange={(checked) =>
                          setConfig((previous) => ({
                            ...previous,
                            authProtocols:
                              checked === true
                                ? [...new Set([...previous.authProtocols, protocol])]
                                : previous.authProtocols.filter((item) => item !== protocol),
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Label className="text-xs uppercase">{protocol}</Label>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Name Servers</Label>
                    <Button variant="outline" size="sm" onClick={() => setConfig((p) => ({ ...p, nameServers: [...p.nameServers, ""] }))} disabled={!canEdit || saving || !config.enabled}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Add DNS
                    </Button>
                  </div>
                  {config.nameServers.length === 0 ? <p className="text-xs text-muted-foreground">No DNS servers configured.</p> : config.nameServers.map((server, idx) => (
                    <div key={`l2tp-dns-${idx}`} className="grid gap-2 xl:grid-cols-[1fr_auto]">
                      <Input value={server} onChange={(e) => setConfig((p) => ({ ...p, nameServers: updateList(p.nameServers, idx, e.target.value) }))} disabled={!canEdit || saving || !config.enabled} />
                      <Button variant="ghost" size="icon" onClick={() => setConfig((p) => ({ ...p, nameServers: p.nameServers.filter((_, i) => i !== idx) }))} disabled={!canEdit || saving || !config.enabled}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Client Pools</Label>
                      <Button variant="outline" size="sm" onClick={() => setConfig((p) => ({ ...p, clientPools: [...p.clientPools, { name: "", ranges: [], nextPool: "" }] }))} disabled={!canEdit || saving || !config.enabled}><Plus className="h-3.5 w-3.5 mr-1" />Add Pool</Button>
                    </div>
                    {config.clientPools.length === 0 ? <p className="text-xs text-muted-foreground">No client pools configured.</p> : config.clientPools.map((pool, idx) => (
                      <div key={`l2tp-pool-${idx}`} className="rounded border p-2 space-y-2">
                        <div className="grid gap-2 xl:grid-cols-[1fr_1fr_auto]">
                          <Input value={pool.name} onChange={(e) => setConfig((p) => { const next=[...p.clientPools]; next[idx]={...next[idx],name:e.target.value}; return {...p,clientPools:next}; })} placeholder="POOL" disabled={!canEdit || saving || !config.enabled} />
                          <Input value={pool.nextPool} onChange={(e) => setConfig((p) => { const next=[...p.clientPools]; next[idx]={...next[idx],nextPool:e.target.value}; return {...p,clientPools:next}; })} placeholder="Next pool" disabled={!canEdit || saving || !config.enabled} />
                          <Button variant="ghost" size="icon" onClick={() => setConfig((p) => ({ ...p, clientPools: p.clientPools.filter((_, i) => i !== idx) }))} disabled={!canEdit || saving || !config.enabled}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        {(pool.ranges.length === 0 ? [""] : pool.ranges).map((range, rangeIdx) => (
                          <div key={`l2tp-range-${idx}-${rangeIdx}`} className="grid gap-2 xl:grid-cols-[1fr_auto]">
                            <Input value={range} onChange={(e) => setConfig((p) => { const next=[...p.clientPools]; const ranges=pool.ranges.length===0?[""]:[...pool.ranges]; ranges[rangeIdx]=e.target.value; next[idx]={...pool,ranges}; return {...p,clientPools:next}; })} placeholder="192.168.100.10-192.168.100.250" disabled={!canEdit || saving || !config.enabled} />
                            <Button variant="ghost" size="icon" onClick={() => setConfig((p) => { const next=[...p.clientPools]; next[idx]={...pool,ranges:pool.ranges.filter((_,i)=>i!==rangeIdx)}; return {...p,clientPools:next}; })} disabled={!canEdit || saving || !config.enabled}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => setConfig((p) => { const next=[...p.clientPools]; next[idx]={...pool,ranges:[...pool.ranges,""]}; return {...p,clientPools:next}; })} disabled={!canEdit || saving || !config.enabled}><Plus className="h-3.5 w-3.5 mr-1" />Add Range</Button>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Local Users</Label>
                      <Button variant="outline" size="sm" onClick={() => setConfig((p) => ({ ...p, localUsers: [...p.localUsers, { username: "", password: "", disabled: false, staticIp: "", downloadRate: "", uploadRate: "" }] }))} disabled={!canEdit || saving || !config.enabled}><Plus className="h-3.5 w-3.5 mr-1" />Add User</Button>
                    </div>
                    {config.localUsers.length === 0 ? <p className="text-xs text-muted-foreground">No local users configured.</p> : config.localUsers.map((user, idx) => (
                      <div key={`l2tp-user-${idx}`} className="rounded border p-2 space-y-2">
                        <div className="grid gap-2 xl:grid-cols-[1fr_1fr_auto]">
                          <Input value={user.username} onChange={(e) => setConfig((p) => { const next=[...p.localUsers]; next[idx]={...next[idx],username:e.target.value}; return {...p,localUsers:next}; })} placeholder="username" disabled={!canEdit || saving || !config.enabled} />
                          <Input type="password" value={user.password} onChange={(e) => setConfig((p) => { const next=[...p.localUsers]; next[idx]={...next[idx],password:e.target.value}; return {...p,localUsers:next}; })} placeholder="password" disabled={!canEdit || saving || !config.enabled} />
                          <Button variant="ghost" size="icon" onClick={() => setConfig((p) => ({ ...p, localUsers: p.localUsers.filter((_, i) => i !== idx) }))} disabled={!canEdit || saving || !config.enabled}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid gap-2 xl:grid-cols-3">
                          <Input value={user.staticIp} onChange={(e) => setConfig((p) => { const next=[...p.localUsers]; next[idx]={...next[idx],staticIp:e.target.value}; return {...p,localUsers:next}; })} placeholder="Static IP" disabled={!canEdit || saving || !config.enabled} />
                          <Input value={user.downloadRate} onChange={(e) => setConfig((p) => { const next=[...p.localUsers]; next[idx]={...next[idx],downloadRate:e.target.value}; return {...p,localUsers:next}; })} placeholder="Download rate" disabled={!canEdit || saving || !config.enabled} />
                          <Input value={user.uploadRate} onChange={(e) => setConfig((p) => { const next=[...p.localUsers]; next[idx]={...next[idx],uploadRate:e.target.value}; return {...p,localUsers:next}; })} placeholder="Upload rate" disabled={!canEdit || saving || !config.enabled} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={user.disabled} onCheckedChange={(checked) => setConfig((p) => { const next=[...p.localUsers]; next[idx]={...next[idx],disabled:checked===true}; return {...p,localUsers:next}; })} disabled={!canEdit || saving || !config.enabled} />
                          <Label className="text-xs">Disable account</Label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {error ? (
                  <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>{error}</span>
                  </div>
                ) : null}
                {success ? (
                  <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">{success}</div>
                ) : null}

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={!canEdit || saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save L2TP"}
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
