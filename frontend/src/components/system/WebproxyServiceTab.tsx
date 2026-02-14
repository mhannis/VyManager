"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Globe2, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "./serviceTabHelpers";

interface ListenAddressEntry {
  address: string;
  port: string;
  disableTransparent: boolean;
}

interface WebproxyState {
  enabled: boolean;
  appendDomain: string;
  defaultPort: string;
  cacheSize: string;
  replyBodyMaxSize: string;
  urlFilteringDisable: boolean;
  listenAddresses: ListenAddressEntry[];
  safePorts: string[];
  sslSafePorts: string[];
  domainBlock: string[];
  domainNoncache: string[];
  whitelistSource: string[];
  whitelistDestination: string[];
  authEnabled: boolean;
  authChildren: string;
  authCredentialsTtl: string;
  authRealm: string;
  authLdapServer: string;
  authLdapPort: string;
  authLdapBaseDn: string;
  authLdapBindDn: string;
  authLdapPassword: string;
  authLdapUsernameAttribute: string;
  authLdapFilterExpression: string;
  authLdapVersion: "" | "2" | "3";
  authLdapPersistentConnection: boolean;
  authLdapUseSsl: boolean;
}

const EMPTY_STATE: WebproxyState = {
  enabled: false,
  appendDomain: "",
  defaultPort: "",
  cacheSize: "",
  replyBodyMaxSize: "",
  urlFilteringDisable: false,
  listenAddresses: [],
  safePorts: [],
  sslSafePorts: [],
  domainBlock: [],
  domainNoncache: [],
  whitelistSource: [],
  whitelistDestination: [],
  authEnabled: false,
  authChildren: "",
  authCredentialsTtl: "",
  authRealm: "",
  authLdapServer: "",
  authLdapPort: "",
  authLdapBaseDn: "",
  authLdapBindDn: "",
  authLdapPassword: "",
  authLdapUsernameAttribute: "",
  authLdapFilterExpression: "",
  authLdapVersion: "",
  authLdapPersistentConnection: false,
  authLdapUseSsl: false,
};

interface WebproxyServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function parseListenAddresses(value: unknown): ListenAddressEntry[] {
  const root = toRecord(value);
  return Object.keys(root)
    .sort((left, right) => left.localeCompare(right))
    .map((address) => {
      const cfg = toRecord(root[address]);
      return {
        address,
        port: asString(cfg.port) ?? "",
        disableTransparent: Object.prototype.hasOwnProperty.call(cfg, "disable-transparent"),
      };
    });
}

function parseConfig(serviceNode: Record<string, unknown>): WebproxyState {
  const auth = toRecord(serviceNode.authentication);
  const ldap = toRecord(auth.ldap);
  const whitelist = toRecord(serviceNode.whitelist);
  return {
    enabled: Object.keys(serviceNode).length > 0,
    appendDomain: asString(serviceNode["append-domain"]) ?? "",
    defaultPort: asString(serviceNode["default-port"]) ?? "",
    cacheSize: asString(serviceNode["cache-size"]) ?? "",
    replyBodyMaxSize: asString(serviceNode["reply-body-max-size"]) ?? "",
    urlFilteringDisable: Object.prototype.hasOwnProperty.call(
      toRecord(serviceNode["url-filtering"]),
      "disable",
    ),
    listenAddresses: parseListenAddresses(serviceNode["listen-address"]),
    safePorts: objectKeys(serviceNode["safe-ports"]),
    sslSafePorts: objectKeys(serviceNode["ssl-safe-ports"]),
    domainBlock: objectKeys(serviceNode["domain-block"]),
    domainNoncache: objectKeys(serviceNode["domain-noncache"]),
    whitelistSource: objectKeys(whitelist["source-address"]),
    whitelistDestination: objectKeys(whitelist["destination-address"]),
    authEnabled:
      Object.keys(auth).length > 0 ||
      Object.keys(ldap).length > 0 ||
      Object.prototype.hasOwnProperty.call(auth, "method"),
    authChildren: asString(auth.children) ?? "",
    authCredentialsTtl: asString(auth["credentials-ttl"]) ?? "",
    authRealm: asString(auth.realm) ?? "",
    authLdapServer: asString(ldap.server) ?? "",
    authLdapPort: asString(ldap.port) ?? "",
    authLdapBaseDn: asString(ldap["base-dn"]) ?? "",
    authLdapBindDn: asString(ldap["bind-dn"]) ?? "",
    authLdapPassword: asString(ldap.password) ?? "",
    authLdapUsernameAttribute: asString(ldap["username-attribute"]) ?? "",
    authLdapFilterExpression: asString(ldap["filter-expression"]) ?? "",
    authLdapVersion: (asString(ldap.version) as "2" | "3" | null) ?? "",
    authLdapPersistentConnection: Object.prototype.hasOwnProperty.call(ldap, "persistent-connection"),
    authLdapUseSsl: Object.prototype.hasOwnProperty.call(ldap, "use-ssl"),
  };
}

function updateList(values: string[], index: number, value: string): string[] {
  const next = [...values];
  next[index] = value;
  return next;
}

function updateListen(
  rows: ListenAddressEntry[],
  index: number,
  update: Partial<ListenAddressEntry>,
): ListenAddressEntry[] {
  const next = [...rows];
  next[index] = { ...next[index], ...update };
  return next;
}

function renderListEditor(
  label: string,
  values: string[],
  disabled: boolean,
  onChange: (next: string[]) => void,
) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <Button variant="outline" size="sm" onClick={() => onChange([...values, ""])} disabled={disabled}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>
      {values.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No entries configured.</p>
      ) : (
        <div className="space-y-2">
          {values.map((value, index) => (
            <div key={`${label}-${index}`} className="grid gap-2 xl:grid-cols-[1fr_auto]">
              <Input
                value={value}
                onChange={(event) => onChange(updateList(values, index, event.target.value))}
                disabled={disabled}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WebproxyServiceTab({ canEdit, active, refreshNonce }: WebproxyServiceTabProps) {
  const [config, setConfig] = useState<WebproxyState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getWebproxyConfig(refresh);
      setConfig(parseConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webproxy configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    loadConfig(false);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    loadConfig(true);
  }, [active, refreshNonce]);

  const handleSave = async () => {
    const operations: string[] = ["delete service webproxy"];

    if (config.enabled) {
      operations.push("set service webproxy");

      if (config.appendDomain.trim()) {
        operations.push(`set service webproxy append-domain ${quoteCliValue(config.appendDomain)}`);
      }
      if (config.defaultPort.trim()) {
        operations.push(`set service webproxy default-port ${quoteCliValue(config.defaultPort)}`);
      }
      if (config.cacheSize.trim()) {
        operations.push(`set service webproxy cache-size ${quoteCliValue(config.cacheSize)}`);
      }
      if (config.replyBodyMaxSize.trim()) {
        operations.push(
          `set service webproxy reply-body-max-size ${quoteCliValue(config.replyBodyMaxSize)}`,
        );
      }
      if (config.urlFilteringDisable) {
        operations.push("set service webproxy url-filtering disable");
      }

      for (const entry of config.listenAddresses) {
        const address = entry.address.trim();
        if (!address) continue;
        const base = `set service webproxy listen-address ${quoteCliValue(address)}`;
        operations.push(base);
        if (entry.port.trim()) {
          operations.push(`${base} port ${quoteCliValue(entry.port)}`);
        }
        if (entry.disableTransparent) {
          operations.push(`${base} disable-transparent`);
        }
      }

      for (const value of uniqueNonEmpty(config.safePorts)) {
        operations.push(`set service webproxy safe-ports ${quoteCliValue(value)}`);
      }
      for (const value of uniqueNonEmpty(config.sslSafePorts)) {
        operations.push(`set service webproxy ssl-safe-ports ${quoteCliValue(value)}`);
      }
      for (const value of uniqueNonEmpty(config.domainBlock)) {
        operations.push(`set service webproxy domain-block ${quoteCliValue(value)}`);
      }
      for (const value of uniqueNonEmpty(config.domainNoncache)) {
        operations.push(`set service webproxy domain-noncache ${quoteCliValue(value)}`);
      }
      for (const value of uniqueNonEmpty(config.whitelistSource)) {
        operations.push(`set service webproxy whitelist source-address ${quoteCliValue(value)}`);
      }
      for (const value of uniqueNonEmpty(config.whitelistDestination)) {
        operations.push(
          `set service webproxy whitelist destination-address ${quoteCliValue(value)}`,
        );
      }

      if (config.authEnabled) {
        operations.push("set service webproxy authentication method ldap");
        if (config.authChildren.trim()) {
          operations.push(
            `set service webproxy authentication children ${quoteCliValue(config.authChildren)}`,
          );
        }
        if (config.authCredentialsTtl.trim()) {
          operations.push(
            `set service webproxy authentication credentials-ttl ${quoteCliValue(config.authCredentialsTtl)}`,
          );
        }
        if (config.authRealm.trim()) {
          operations.push(`set service webproxy authentication realm ${quoteCliValue(config.authRealm)}`);
        }

        const ldapPrefix = "set service webproxy authentication ldap";
        if (config.authLdapServer.trim()) {
          operations.push(`${ldapPrefix} server ${quoteCliValue(config.authLdapServer)}`);
        }
        if (config.authLdapPort.trim()) {
          operations.push(`${ldapPrefix} port ${quoteCliValue(config.authLdapPort)}`);
        }
        if (config.authLdapBaseDn.trim()) {
          operations.push(`${ldapPrefix} base-dn ${quoteCliValue(config.authLdapBaseDn)}`);
        }
        if (config.authLdapBindDn.trim()) {
          operations.push(`${ldapPrefix} bind-dn ${quoteCliValue(config.authLdapBindDn)}`);
        }
        if (config.authLdapPassword.trim()) {
          operations.push(`${ldapPrefix} password ${quoteCliValue(config.authLdapPassword)}`);
        }
        if (config.authLdapUsernameAttribute.trim()) {
          operations.push(
            `${ldapPrefix} username-attribute ${quoteCliValue(config.authLdapUsernameAttribute)}`,
          );
        }
        if (config.authLdapFilterExpression.trim()) {
          operations.push(
            `${ldapPrefix} filter-expression ${quoteCliValue(config.authLdapFilterExpression)}`,
          );
        }
        if (config.authLdapVersion) {
          operations.push(`${ldapPrefix} version ${config.authLdapVersion}`);
        }
        if (config.authLdapPersistentConnection) {
          operations.push(`${ldapPrefix} persistent-connection`);
        }
        if (config.authLdapUseSsl) {
          operations.push(`${ldapPrefix} use-ssl`);
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureWebproxy(operations);
      await loadConfig(true);
      setSuccess("Webproxy configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update webproxy configuration.");
    } finally {
      setSaving(false);
    }
  };

  const disableInputs = !canEdit || saving;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-primary" />
          Webproxy
        </CardTitle>
        <CardDescription>
          Configure transparent proxy listener settings, filtering lists, and LDAP authentication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading webproxy configuration...</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={config.enabled}
                onCheckedChange={(checked) =>
                  setConfig((previous) => ({ ...previous, enabled: checked === true }))
                }
                disabled={disableInputs}
              />
              <Label className="text-sm font-medium">Enable webproxy service</Label>
            </div>

            <div className="grid gap-3 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Default Port</Label>
                <Input
                  value={config.defaultPort}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, defaultPort: event.target.value }))
                  }
                  placeholder="8080"
                  disabled={disableInputs || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Cache Size (MB)</Label>
                <Input
                  value={config.cacheSize}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, cacheSize: event.target.value }))
                  }
                  placeholder="1024"
                  disabled={disableInputs || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Append Domain</Label>
                <Input
                  value={config.appendDomain}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, appendDomain: event.target.value }))
                  }
                  placeholder="example.local"
                  disabled={disableInputs || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Reply Body Max Size</Label>
                <Input
                  value={config.replyBodyMaxSize}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, replyBodyMaxSize: event.target.value }))
                  }
                  placeholder="2048"
                  disabled={disableInputs || !config.enabled}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                checked={config.urlFilteringDisable}
                onCheckedChange={(checked) =>
                  setConfig((previous) => ({ ...previous, urlFilteringDisable: checked === true }))
                }
                disabled={disableInputs || !config.enabled}
              />
              <Label className="text-xs font-medium">Disable URL filtering</Label>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Listen Addresses</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      listenAddresses: [
                        ...previous.listenAddresses,
                        { address: "", port: "", disableTransparent: false },
                      ],
                    }))
                  }
                  disabled={disableInputs || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Listener
                </Button>
              </div>
              {config.listenAddresses.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No listen addresses configured.</p>
              ) : (
                <div className="space-y-2">
                  {config.listenAddresses.map((entry, index) => (
                    <div key={`listen-${index}`} className="grid gap-2 xl:grid-cols-[1fr_150px_auto_auto]">
                      <Input
                        value={entry.address}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            listenAddresses: updateListen(previous.listenAddresses, index, {
                              address: event.target.value,
                            }),
                          }))
                        }
                        placeholder="192.168.10.1"
                        disabled={disableInputs || !config.enabled}
                      />
                      <Input
                        value={entry.port}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            listenAddresses: updateListen(previous.listenAddresses, index, {
                              port: event.target.value,
                            }),
                          }))
                        }
                        placeholder="8080"
                        disabled={disableInputs || !config.enabled}
                      />
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={entry.disableTransparent}
                          onCheckedChange={(checked) =>
                            setConfig((previous) => ({
                              ...previous,
                              listenAddresses: updateListen(previous.listenAddresses, index, {
                                disableTransparent: checked === true,
                              }),
                            }))
                          }
                          disabled={disableInputs || !config.enabled}
                        />
                        <Label className="text-xs">Disable transparent</Label>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfig((previous) => ({
                            ...previous,
                            listenAddresses: previous.listenAddresses.filter((_, i) => i !== index),
                          }))
                        }
                        disabled={disableInputs || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {renderListEditor(
                "Safe Ports",
                config.safePorts,
                disableInputs || !config.enabled,
                (next) => setConfig((previous) => ({ ...previous, safePorts: next })),
              )}
              {renderListEditor(
                "SSL Safe Ports",
                config.sslSafePorts,
                disableInputs || !config.enabled,
                (next) => setConfig((previous) => ({ ...previous, sslSafePorts: next })),
              )}
              {renderListEditor(
                "Blocked Domains",
                config.domainBlock,
                disableInputs || !config.enabled,
                (next) => setConfig((previous) => ({ ...previous, domainBlock: next })),
              )}
              {renderListEditor(
                "Non-cached Domains",
                config.domainNoncache,
                disableInputs || !config.enabled,
                (next) => setConfig((previous) => ({ ...previous, domainNoncache: next })),
              )}
              {renderListEditor(
                "Whitelist Source Prefixes",
                config.whitelistSource,
                disableInputs || !config.enabled,
                (next) => setConfig((previous) => ({ ...previous, whitelistSource: next })),
              )}
              {renderListEditor(
                "Whitelist Destination Prefixes",
                config.whitelistDestination,
                disableInputs || !config.enabled,
                (next) => setConfig((previous) => ({ ...previous, whitelistDestination: next })),
              )}
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.authEnabled}
                  onCheckedChange={(checked) =>
                    setConfig((previous) => ({ ...previous, authEnabled: checked === true }))
                  }
                  disabled={disableInputs || !config.enabled}
                />
                <Label className="text-sm font-medium">Enable LDAP authentication</Label>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <div className="space-y-2">
                  <Label>Auth Children</Label>
                  <Input
                    value={config.authChildren}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, authChildren: event.target.value }))
                    }
                    disabled={disableInputs || !config.enabled || !config.authEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Credentials TTL</Label>
                  <Input
                    value={config.authCredentialsTtl}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, authCredentialsTtl: event.target.value }))
                    }
                    disabled={disableInputs || !config.enabled || !config.authEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Realm</Label>
                  <Input
                    value={config.authRealm}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, authRealm: event.target.value }))
                    }
                    disabled={disableInputs || !config.enabled || !config.authEnabled}
                  />
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <Input
                  value={config.authLdapServer}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, authLdapServer: event.target.value }))
                  }
                  placeholder="LDAP server"
                  disabled={disableInputs || !config.enabled || !config.authEnabled}
                />
                <Input
                  value={config.authLdapPort}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, authLdapPort: event.target.value }))
                  }
                  placeholder="LDAP port"
                  disabled={disableInputs || !config.enabled || !config.authEnabled}
                />
                <Input
                  value={config.authLdapVersion}
                  onChange={(event) =>
                    setConfig((previous) => ({
                      ...previous,
                      authLdapVersion:
                        event.target.value === "2" || event.target.value === "3"
                          ? event.target.value
                          : "",
                    }))
                  }
                  placeholder="LDAP version (2 or 3)"
                  disabled={disableInputs || !config.enabled || !config.authEnabled}
                />
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <Input
                  value={config.authLdapBaseDn}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, authLdapBaseDn: event.target.value }))
                  }
                  placeholder="Base DN"
                  disabled={disableInputs || !config.enabled || !config.authEnabled}
                />
                <Input
                  value={config.authLdapBindDn}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, authLdapBindDn: event.target.value }))
                  }
                  placeholder="Bind DN"
                  disabled={disableInputs || !config.enabled || !config.authEnabled}
                />
                <Input
                  type="password"
                  value={config.authLdapPassword}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, authLdapPassword: event.target.value }))
                  }
                  placeholder="Bind password"
                  disabled={disableInputs || !config.enabled || !config.authEnabled}
                />
                <Input
                  value={config.authLdapUsernameAttribute}
                  onChange={(event) =>
                    setConfig((previous) => ({
                      ...previous,
                      authLdapUsernameAttribute: event.target.value,
                    }))
                  }
                  placeholder="Username attribute"
                  disabled={disableInputs || !config.enabled || !config.authEnabled}
                />
              </div>

              <Input
                value={config.authLdapFilterExpression}
                onChange={(event) =>
                  setConfig((previous) => ({
                    ...previous,
                    authLdapFilterExpression: event.target.value,
                  }))
                }
                placeholder="Filter expression"
                disabled={disableInputs || !config.enabled || !config.authEnabled}
              />

              <div className="grid gap-3 xl:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={config.authLdapPersistentConnection}
                    onCheckedChange={(checked) =>
                      setConfig((previous) => ({
                        ...previous,
                        authLdapPersistentConnection: checked === true,
                      }))
                    }
                    disabled={disableInputs || !config.enabled || !config.authEnabled}
                  />
                  <Label className="text-xs">Persistent LDAP connection</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={config.authLdapUseSsl}
                    onCheckedChange={(checked) =>
                      setConfig((previous) => ({ ...previous, authLdapUseSsl: checked === true }))
                    }
                    disabled={disableInputs || !config.enabled || !config.authEnabled}
                  />
                  <Label className="text-xs">Use LDAP SSL</Label>
                </div>
              </div>
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

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={disableInputs}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Webproxy"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
