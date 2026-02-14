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
import { vpnOpenConnectApi } from "@/lib/api/vpn-openconnect";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "@/components/system/serviceTabHelpers";

type OpenConnectMode = "" | "radius" | "certificate" | "local-password" | "local-password-otp" | "local-otp";

interface LocalUserEntry {
  username: string;
  password: string;
  otpKey: string;
  tokenType: string;
  interval: string;
  otpLength: string;
}

interface AccountingServerEntry {
  address: string;
  port: string;
  key: string;
}

interface OpenConnectState {
  enabled: boolean;
  mode: OpenConnectMode;
  certificateUserIdentifierField: string;
  clientSubnet: string;
  nameServers: string[];
  sslCaCertificate: string;
  sslCertificate: string;
  sslPassphrase: string;
  httpSecurityHeaders: boolean;
  identityModeUser: boolean;
  identityDirectory: string;
  identityDefaultConfig: string;
  accountingMode: "" | "radius";
  accountingServers: AccountingServerEntry[];
  localUsers: LocalUserEntry[];
}

const EMPTY_STATE: OpenConnectState = {
  enabled: false,
  mode: "",
  certificateUserIdentifierField: "",
  clientSubnet: "",
  nameServers: [],
  sslCaCertificate: "",
  sslCertificate: "",
  sslPassphrase: "",
  httpSecurityHeaders: false,
  identityModeUser: false,
  identityDirectory: "",
  identityDefaultConfig: "",
  accountingMode: "",
  accountingServers: [],
  localUsers: [],
};

function parseDirectOrKey(value: unknown): string {
  const direct = asString(value);
  if (direct) return direct;
  const root = toRecord(value);
  const first = Object.keys(root)[0];
  return first || "";
}

function parseMode(root: Record<string, unknown>): {
  mode: OpenConnectMode;
  certificateUserIdentifierField: string;
} {
  const modeRoot = toRecord(root.mode);
  const direct = asString(root.mode);

  if (Object.prototype.hasOwnProperty.call(modeRoot, "radius") || direct === "radius") {
    return { mode: "radius", certificateUserIdentifierField: "" };
  }

  if (Object.prototype.hasOwnProperty.call(modeRoot, "certificate") || direct === "certificate") {
    const certRoot = toRecord(modeRoot.certificate);
    return {
      mode: "certificate",
      certificateUserIdentifierField: asString(certRoot["user-identifier-field"]) ?? "",
    };
  }

  const localRoot = toRecord(modeRoot.local);
  const localMode = parseDirectOrKey(localRoot);
  if (direct === "local password") return { mode: "local-password", certificateUserIdentifierField: "" };
  if (direct === "local password-otp") return { mode: "local-password-otp", certificateUserIdentifierField: "" };
  if (direct === "local otp") return { mode: "local-otp", certificateUserIdentifierField: "" };
  if (localMode === "password") return { mode: "local-password", certificateUserIdentifierField: "" };
  if (localMode === "password-otp") return { mode: "local-password-otp", certificateUserIdentifierField: "" };
  if (localMode === "otp") return { mode: "local-otp", certificateUserIdentifierField: "" };

  return { mode: "", certificateUserIdentifierField: "" };
}

function parseLocalUsers(root: Record<string, unknown>): LocalUserEntry[] {
  return Object.keys(root)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((username) => {
      const cfg = toRecord(root[username]);
      const otp = toRecord(cfg.otp);
      return {
        username,
        password: asString(cfg.password) ?? "",
        otpKey: asString(otp.key) ?? "",
        tokenType: asString(cfg["token-type"]) ?? "",
        interval: asString(cfg.interval) ?? "",
        otpLength: asString(cfg["otp-length"]) ?? "",
      };
    });
}

function parseAccountingServers(root: Record<string, unknown>): AccountingServerEntry[] {
  return Object.keys(root)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((address) => {
      const cfg = toRecord(root[address]);
      return {
        address,
        port: asString(cfg.port) ?? "",
        key: asString(cfg.key) ?? "",
      };
    });
}

function parseConfig(root: Record<string, unknown>): OpenConnectState {
  const auth = toRecord(root.authentication);
  const modeData = parseMode(auth);
  const networkSettings = toRecord(root["network-settings"]);
  const clientIpSettings = toRecord(networkSettings["client-ip-settings"]);
  const ssl = toRecord(root.ssl);
  const identity = toRecord(auth["identity-based-config"]);
  const accounting = toRecord(root.accounting);
  const accountingRadius = toRecord(toRecord(accounting.radius).server);
  const localUsers = toRecord(toRecord(auth["local-users"]).username);

  return {
    enabled: Object.keys(root).length > 0,
    mode: modeData.mode,
    certificateUserIdentifierField: modeData.certificateUserIdentifierField,
    clientSubnet: asString(clientIpSettings.subnet) ?? "",
    nameServers: objectKeys(networkSettings["name-server"]),
    sslCaCertificate: asString(ssl["ca-certificate"]) ?? "",
    sslCertificate: asString(ssl.certificate) ?? "",
    sslPassphrase: asString(ssl.passphrase) ?? "",
    httpSecurityHeaders: Object.prototype.hasOwnProperty.call(root, "http-security-headers"),
    identityModeUser: parseDirectOrKey(toRecord(identity.mode)) === "user",
    identityDirectory: asString(identity.directory) ?? "",
    identityDefaultConfig: asString(identity["default-config"]) ?? "",
    accountingMode: parseDirectOrKey(accounting.mode) === "radius" ? "radius" : "",
    accountingServers: parseAccountingServers(accountingRadius),
    localUsers: parseLocalUsers(localUsers),
  };
}

function updateList(values: string[], index: number, value: string): string[] {
  const next = [...values];
  next[index] = value;
  return next;
}

export default function VpnOpenConnectPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.VPN) || canWrite(FeatureGroup.IPSEC);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<OpenConnectState>(EMPTY_STATE);

  const loadConfig = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await vpnOpenConnectApi.getConfig(refresh);
      setConfig(parseConfig(toRecord(payload.vpn)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load OpenConnect configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig(false);
  }, []);

  const handleSave = async () => {
    const operations: string[] = ["delete vpn openconnect"];

    if (config.enabled) {
      operations.push("set vpn openconnect");
      const base = "set vpn openconnect";

      if (config.mode === "radius") {
        operations.push(`${base} authentication mode radius`);
      } else if (config.mode === "certificate") {
        operations.push(`${base} authentication mode certificate`);
        if (config.certificateUserIdentifierField.trim()) {
          operations.push(
            `${base} authentication mode certificate user-identifier-field ${quoteCliValue(config.certificateUserIdentifierField)}`,
          );
        }
      } else if (config.mode === "local-password") {
        operations.push(`${base} authentication mode local password`);
      } else if (config.mode === "local-password-otp") {
        operations.push(`${base} authentication mode local password-otp`);
      } else if (config.mode === "local-otp") {
        operations.push(`${base} authentication mode local otp`);
      }

      for (const user of config.localUsers) {
        const username = user.username.trim();
        if (!username) continue;
        const userBase = `${base} authentication local-users username ${quoteCliValue(username)}`;
        if (user.password.trim()) operations.push(`${userBase} password ${quoteCliValue(user.password)}`);
        if (user.otpKey.trim()) operations.push(`${userBase} otp key ${quoteCliValue(user.otpKey)}`);
        if (user.tokenType.trim()) operations.push(`${userBase} token-type ${quoteCliValue(user.tokenType)}`);
        if (user.interval.trim()) operations.push(`${userBase} interval ${quoteCliValue(user.interval)}`);
        if (user.otpLength.trim()) operations.push(`${userBase} otp-length ${quoteCliValue(user.otpLength)}`);
      }

      if (config.clientSubnet.trim()) {
        operations.push(`${base} network-settings client-ip-settings subnet ${quoteCliValue(config.clientSubnet)}`);
      }

      for (const server of uniqueNonEmpty(config.nameServers)) {
        operations.push(`${base} network-settings name-server ${quoteCliValue(server)}`);
      }

      if (config.sslCaCertificate.trim()) {
        operations.push(`${base} ssl ca-certificate ${quoteCliValue(config.sslCaCertificate)}`);
      }
      if (config.sslCertificate.trim()) {
        operations.push(`${base} ssl certificate ${quoteCliValue(config.sslCertificate)}`);
      }
      if (config.sslPassphrase.trim()) {
        operations.push(`${base} ssl passphrase ${quoteCliValue(config.sslPassphrase)}`);
      }

      if (config.httpSecurityHeaders) {
        operations.push(`${base} http-security-headers`);
      }

      if (config.identityModeUser) {
        operations.push(`${base} authentication identity-based-config mode user`);
        if (config.identityDirectory.trim()) {
          operations.push(
            `${base} authentication identity-based-config directory ${quoteCliValue(config.identityDirectory)}`,
          );
        }
        if (config.identityDefaultConfig.trim()) {
          operations.push(
            `${base} authentication identity-based-config default-config ${quoteCliValue(config.identityDefaultConfig)}`,
          );
        }
      }

      if (config.accountingMode === "radius") {
        operations.push(`${base} accounting mode radius`);
        for (const server of config.accountingServers) {
          const address = server.address.trim();
          if (!address) continue;
          const serverBase = `${base} accounting radius server ${quoteCliValue(address)}`;
          operations.push(serverBase);
          if (server.port.trim()) operations.push(`${serverBase} port ${quoteCliValue(server.port)}`);
          if (server.key.trim()) operations.push(`${serverBase} key ${quoteCliValue(server.key)}`);
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await vpnOpenConnectApi.configure(operations);
      await loadConfig(true);
      setSuccess("OpenConnect configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update OpenConnect configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">OpenConnect</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure OpenConnect SSL VPN authentication, client subnet, DNS, and accounting.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              OpenConnect VPN
            </CardTitle>
            <CardDescription>Managed under <code>vpn openconnect</code>.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading OpenConnect configuration...</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={config.enabled}
                    onCheckedChange={(checked) => setConfig((previous) => ({ ...previous, enabled: checked === true }))}
                    disabled={!canEdit || saving}
                  />
                  <Label className="text-sm font-medium">Enable OpenConnect service</Label>
                </div>

                <div className="grid gap-3 xl:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Authentication Mode</Label>
                    <Select
                      value={config.mode || "__unset__"}
                      onValueChange={(value) =>
                        setConfig((previous) => ({
                          ...previous,
                          mode: value === "__unset__" ? "" : (value as OpenConnectMode),
                        }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unset__">Default</SelectItem>
                        <SelectItem value="local-password">Local Password</SelectItem>
                        <SelectItem value="local-password-otp">Local Password + OTP</SelectItem>
                        <SelectItem value="local-otp">Local OTP</SelectItem>
                        <SelectItem value="radius">RADIUS</SelectItem>
                        <SelectItem value="certificate">Certificate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={config.clientSubnet}
                    onChange={(event) => setConfig((previous) => ({ ...previous, clientSubnet: event.target.value }))}
                    placeholder="Client subnet (e.g. 172.20.20.0/24)"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  <Input
                    value={config.certificateUserIdentifierField}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, certificateUserIdentifierField: event.target.value }))
                    }
                    placeholder="Certificate user identifier field (e.g. cn)"
                    disabled={!canEdit || saving || !config.enabled || config.mode !== "certificate"}
                  />
                  <Input
                    value={config.sslCaCertificate}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, sslCaCertificate: event.target.value }))
                    }
                    placeholder="SSL CA certificate name"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  <Input
                    value={config.sslCertificate}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, sslCertificate: event.target.value }))
                    }
                    placeholder="SSL server certificate name"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  <Input
                    type="password"
                    value={config.sslPassphrase}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, sslPassphrase: event.target.value }))
                    }
                    placeholder="SSL key passphrase"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={config.httpSecurityHeaders}
                      onCheckedChange={(checked) =>
                        setConfig((previous) => ({ ...previous, httpSecurityHeaders: checked === true }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    />
                    <Label className="text-sm">Enable HTTP security headers</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={config.identityModeUser}
                      onCheckedChange={(checked) =>
                        setConfig((previous) => ({ ...previous, identityModeUser: checked === true }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    />
                    <Label className="text-sm">Enable identity-based per-user config</Label>
                  </div>
                  <Input
                    value={config.identityDirectory}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, identityDirectory: event.target.value }))
                    }
                    placeholder="/config/auth/ocserv/config-per-user"
                    disabled={!canEdit || saving || !config.enabled || !config.identityModeUser}
                  />
                  <Input
                    value={config.identityDefaultConfig}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, identityDefaultConfig: event.target.value }))
                    }
                    placeholder="/config/auth/ocserv/default-user.conf"
                    disabled={!canEdit || saving || !config.enabled || !config.identityModeUser}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Name Servers</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfig((previous) => ({ ...previous, nameServers: [...previous.nameServers, ""] }))}
                      disabled={!canEdit || saving || !config.enabled}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add DNS
                    </Button>
                  </div>
                  {config.nameServers.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No DNS server configured.</p>
                  ) : (
                    <div className="space-y-2">
                      {config.nameServers.map((server, index) => (
                        <div key={`dns-${index}`} className="flex items-center gap-2">
                          <Input
                            value={server}
                            onChange={(event) =>
                              setConfig((previous) => ({
                                ...previous,
                                nameServers: updateList(previous.nameServers, index, event.target.value),
                              }))
                            }
                            placeholder="DNS server IP"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setConfig((previous) => ({
                                ...previous,
                                nameServers: previous.nameServers.filter((_, currentIndex) => currentIndex !== index),
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
                            { username: "", password: "", otpKey: "", tokenType: "", interval: "", otpLength: "" },
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
                      {config.localUsers.map((user, index) => (
                        <div key={`oc-user-${index}`} className="rounded border p-3 grid gap-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto]">
                          <Input
                            value={user.username}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.localUsers];
                                next[index] = { ...next[index], username: event.target.value };
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
                                next[index] = { ...next[index], password: event.target.value };
                                return { ...previous, localUsers: next };
                              })
                            }
                            placeholder="Password"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Input
                            value={user.otpKey}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.localUsers];
                                next[index] = { ...next[index], otpKey: event.target.value };
                                return { ...previous, localUsers: next };
                              })
                            }
                            placeholder="OTP key (optional)"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Input
                            value={user.tokenType}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.localUsers];
                                next[index] = { ...next[index], tokenType: event.target.value };
                                return { ...previous, localUsers: next };
                              })
                            }
                            placeholder="Token type"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Input
                            value={user.interval}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.localUsers];
                                next[index] = { ...next[index], interval: event.target.value };
                                return { ...previous, localUsers: next };
                              })
                            }
                            placeholder="Interval"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Input
                            value={user.otpLength}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.localUsers];
                                next[index] = { ...next[index], otpLength: event.target.value };
                                return { ...previous, localUsers: next };
                              })
                            }
                            placeholder="OTP length"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setConfig((previous) => ({
                                ...previous,
                                localUsers: previous.localUsers.filter((_, currentIndex) => currentIndex !== index),
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

                <div className="space-y-2">
                  <div className="grid gap-3 xl:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Accounting Mode</Label>
                      <Select
                        value={config.accountingMode || "__unset__"}
                        onValueChange={(value) =>
                          setConfig((previous) => ({
                            ...previous,
                            accountingMode: value === "__unset__" ? "" : "radius",
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unset__">Disabled</SelectItem>
                          <SelectItem value="radius">RADIUS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {config.accountingMode === "radius" ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">RADIUS Accounting Servers</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setConfig((previous) => ({
                              ...previous,
                              accountingServers: [...previous.accountingServers, { address: "", port: "", key: "" }],
                            }))
                          }
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Server
                        </Button>
                      </div>
                      {config.accountingServers.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No accounting servers configured.</p>
                      ) : (
                        <div className="space-y-2">
                          {config.accountingServers.map((server, index) => (
                            <div key={`acct-server-${index}`} className="rounded border p-3 grid gap-2 xl:grid-cols-[2fr_1fr_2fr_auto]">
                              <Input
                                value={server.address}
                                onChange={(event) =>
                                  setConfig((previous) => {
                                    const next = [...previous.accountingServers];
                                    next[index] = { ...next[index], address: event.target.value };
                                    return { ...previous, accountingServers: next };
                                  })
                                }
                                placeholder="Server IP"
                                disabled={!canEdit || saving || !config.enabled}
                              />
                              <Input
                                value={server.port}
                                onChange={(event) =>
                                  setConfig((previous) => {
                                    const next = [...previous.accountingServers];
                                    next[index] = { ...next[index], port: event.target.value };
                                    return { ...previous, accountingServers: next };
                                  })
                                }
                                placeholder="Port"
                                disabled={!canEdit || saving || !config.enabled}
                              />
                              <Input
                                type="password"
                                value={server.key}
                                onChange={(event) =>
                                  setConfig((previous) => {
                                    const next = [...previous.accountingServers];
                                    next[index] = { ...next[index], key: event.target.value };
                                    return { ...previous, accountingServers: next };
                                  })
                                }
                                placeholder="Shared secret"
                                disabled={!canEdit || saving || !config.enabled}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setConfig((previous) => ({
                                    ...previous,
                                    accountingServers: previous.accountingServers.filter(
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
                  ) : null}
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
                    {saving ? "Saving..." : "Save OpenConnect"}
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
