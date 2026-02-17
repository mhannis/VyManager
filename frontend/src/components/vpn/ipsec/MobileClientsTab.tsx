"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, Save, Trash2 } from "lucide-react";
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
import {
  ipsecService,
  type IPsecRemoteAccessConfig,
} from "@/lib/api/ipsec";

interface MobileClientsTabProps {
  canEdit: boolean;
}

const EMPTY_CONFIG: IPsecRemoteAccessConfig = {
  enabled: false,
  connection_method: "ikev2",
  ike_lifetime: "",
  esp_lifetime: "",
  pool_prefix: "",
  server_address: "",
  server_authentication: "",
  client_dns_servers: [],
  client_dhcp_interfaces: [],
  split_include_subnets: [],
  split_exclude_subnets: [],
  authentication_mode: "local",
  local_users: [],
  radius_servers: [],
};

function normalize(value: string | null | undefined): string {
  return (value || "").trim();
}

function withNonEmpty(values: string[]): string[] {
  return values.map((value) => normalize(value)).filter(Boolean);
}

function updateList(values: string[], index: number, value: string): string[] {
  const next = [...values];
  next[index] = value;
  return next;
}

export function MobileClientsTab({ canEdit }: MobileClientsTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<IPsecRemoteAccessConfig>(EMPTY_CONFIG);

  const authMode = useMemo(() => normalize(config.authentication_mode) || "local", [config.authentication_mode]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ipsecService.getRemoteAccess();
      setConfig({
        ...EMPTY_CONFIG,
        ...data,
        connection_method: normalize(data.connection_method) || "ikev2",
        authentication_mode: normalize(data.authentication_mode) || "local",
        server_authentication: normalize(data.server_authentication),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mobile clients configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const payload = {
        enabled: config.enabled,
        connection_method: normalize(config.connection_method) || "ikev2",
        ike_lifetime: normalize(config.ike_lifetime) || null,
        esp_lifetime: normalize(config.esp_lifetime) || null,
        pool_prefix: normalize(config.pool_prefix) || null,
        server_address: normalize(config.server_address) || null,
        server_authentication: normalize(config.server_authentication) || null,
        client_dns_servers: withNonEmpty(config.client_dns_servers),
        client_dhcp_interfaces: withNonEmpty(config.client_dhcp_interfaces),
        split_include_subnets: withNonEmpty(config.split_include_subnets),
        split_exclude_subnets: withNonEmpty(config.split_exclude_subnets),
        authentication_mode: authMode,
        local_users:
          authMode === "local"
            ? config.local_users
                .map((entry) => ({ username: normalize(entry.username), password: normalize(entry.password || "") }))
                .filter((entry) => entry.username)
            : [],
        radius_servers:
          authMode === "radius"
            ? config.radius_servers
                .map((entry) => ({
                  address: normalize(entry.address),
                  key: normalize(entry.key || "") || null,
                  port: normalize(entry.port || "") || null,
                  source_address: normalize(entry.source_address || "") || null,
                }))
                .filter((entry) => entry.address)
            : [],
      };

      const response = await ipsecService.updateRemoteAccess(payload);
      setSuccess(response.message || "IPsec mobile clients configuration saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mobile clients configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-sm text-muted-foreground">Loading mobile clients configuration...</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className="border-primary/40">
          <CardContent className="pt-6 text-sm text-primary">{success}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mobile Clients (Remote Access)</CardTitle>
          <CardDescription>
            Configure IKEv2 remote-access pools, authentication mode, DNS/split networks, and local/RADIUS auth.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
            <Checkbox
              checked={config.enabled}
              disabled={!canEdit || saving}
              onCheckedChange={(checked) =>
                setConfig((previous) => ({ ...previous, enabled: checked === true }))
              }
            />
            <span>Enable IPsec remote-access</span>
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Connection Method</Label>
              <Select
                value={normalize(config.connection_method) || "ikev2"}
                onValueChange={(value) =>
                  setConfig((previous) => ({ ...previous, connection_method: value }))
                }
                disabled={!canEdit || saving || !config.enabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ikev2">ikev2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pool Prefix</Label>
              <Input
                value={config.pool_prefix || ""}
                onChange={(event) => setConfig((previous) => ({ ...previous, pool_prefix: event.target.value }))}
                placeholder="192.168.77.0/24"
                disabled={!canEdit || saving || !config.enabled}
              />
            </div>
            <div className="space-y-2">
              <Label>Server Address</Label>
              <Input
                value={config.server_address || ""}
                onChange={(event) => setConfig((previous) => ({ ...previous, server_address: event.target.value }))}
                placeholder="198.51.100.10"
                disabled={!canEdit || saving || !config.enabled}
              />
            </div>
            <div className="space-y-2">
              <Label>Server Authentication</Label>
              <Select
                value={normalize(config.server_authentication) || "local"}
                onValueChange={(value) =>
                  setConfig((previous) => ({ ...previous, server_authentication: value }))
                }
                disabled={!canEdit || saving || !config.enabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">local</SelectItem>
                  <SelectItem value="radius">radius</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Authentication Mode</Label>
              <Select
                value={authMode}
                onValueChange={(value) =>
                  setConfig((previous) => ({ ...previous, authentication_mode: value }))
                }
                disabled={!canEdit || saving || !config.enabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">local</SelectItem>
                  <SelectItem value="radius">radius</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>IKE Lifetime</Label>
              <Input
                value={config.ike_lifetime || ""}
                onChange={(event) => setConfig((previous) => ({ ...previous, ike_lifetime: event.target.value }))}
                placeholder="28800"
                disabled={!canEdit || saving || !config.enabled}
              />
            </div>
            <div className="space-y-2">
              <Label>ESP Lifetime</Label>
              <Input
                value={config.esp_lifetime || ""}
                onChange={(event) => setConfig((previous) => ({ ...previous, esp_lifetime: event.target.value }))}
                placeholder="3600"
                disabled={!canEdit || saving || !config.enabled}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client DNS Servers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {config.client_dns_servers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No DNS servers configured.</p>
                ) : (
                  config.client_dns_servers.map((entry, index) => (
                    <div key={`dns-${index}`} className="grid gap-2 xl:grid-cols-[1fr_auto]">
                      <Input
                        value={entry}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            client_dns_servers: updateList(previous.client_dns_servers, index, event.target.value),
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfig((previous) => ({
                            ...previous,
                            client_dns_servers: previous.client_dns_servers.filter((_, idx) => idx !== index),
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      client_dns_servers: [...previous.client_dns_servers, ""],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add DNS Server
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client DHCP Interfaces</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {config.client_dhcp_interfaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No DHCP interfaces configured.</p>
                ) : (
                  config.client_dhcp_interfaces.map((entry, index) => (
                    <div key={`dhcp-${index}`} className="grid gap-2 xl:grid-cols-[1fr_auto]">
                      <Input
                        value={entry}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            client_dhcp_interfaces: updateList(
                              previous.client_dhcp_interfaces,
                              index,
                              event.target.value
                            ),
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfig((previous) => ({
                            ...previous,
                            client_dhcp_interfaces: previous.client_dhcp_interfaces.filter((_, idx) => idx !== index),
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      client_dhcp_interfaces: [...previous.client_dhcp_interfaces, ""],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add DHCP Interface
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Split Include Subnets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(config.split_include_subnets.length === 0 ? [""] : config.split_include_subnets).map(
                  (entry, index) => (
                    <div key={`split-include-${index}`} className="grid gap-2 xl:grid-cols-[1fr_auto]">
                      <Input
                        value={entry}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            split_include_subnets: updateList(
                              previous.split_include_subnets.length === 0
                                ? [""]
                                : previous.split_include_subnets,
                              index,
                              event.target.value
                            ),
                          }))
                        }
                        placeholder="10.0.0.0/8"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfig((previous) => ({
                            ...previous,
                            split_include_subnets: previous.split_include_subnets.filter((_, idx) => idx !== index),
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      split_include_subnets: [...previous.split_include_subnets, ""],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Include Subnet
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Split Exclude Subnets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(config.split_exclude_subnets.length === 0 ? [""] : config.split_exclude_subnets).map(
                  (entry, index) => (
                    <div key={`split-exclude-${index}`} className="grid gap-2 xl:grid-cols-[1fr_auto]">
                      <Input
                        value={entry}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            split_exclude_subnets: updateList(
                              previous.split_exclude_subnets.length === 0
                                ? [""]
                                : previous.split_exclude_subnets,
                              index,
                              event.target.value
                            ),
                          }))
                        }
                        placeholder="172.16.0.0/12"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfig((previous) => ({
                            ...previous,
                            split_exclude_subnets: previous.split_exclude_subnets.filter((_, idx) => idx !== index),
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      split_exclude_subnets: [...previous.split_exclude_subnets, ""],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Exclude Subnet
                </Button>
              </CardContent>
            </Card>
          </div>

          {authMode === "local" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Local Users</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {config.local_users.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No local users configured.</p>
                ) : (
                  config.local_users.map((entry, index) => (
                    <div
                      key={`local-user-${index}`}
                      className="grid gap-2 xl:grid-cols-[1fr_1fr_auto]"
                    >
                      <Input
                        value={entry.username}
                        onChange={(event) =>
                          setConfig((previous) => {
                            const next = [...previous.local_users];
                            next[index] = { ...next[index], username: event.target.value };
                            return { ...previous, local_users: next };
                          })
                        }
                        placeholder="username"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Input
                        type="password"
                        value={entry.password || ""}
                        onChange={(event) =>
                          setConfig((previous) => {
                            const next = [...previous.local_users];
                            next[index] = { ...next[index], password: event.target.value };
                            return { ...previous, local_users: next };
                          })
                        }
                        placeholder="password"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfig((previous) => ({
                            ...previous,
                            local_users: previous.local_users.filter((_, idx) => idx !== index),
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      local_users: [...previous.local_users, { username: "", password: "" }],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Local User
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">RADIUS Servers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {config.radius_servers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No RADIUS servers configured.</p>
                ) : (
                  config.radius_servers.map((entry, index) => (
                    <div
                      key={`radius-server-${index}`}
                      className="grid gap-2 xl:grid-cols-[2fr_2fr_1fr_2fr_auto]"
                    >
                      <Input
                        value={entry.address}
                        onChange={(event) =>
                          setConfig((previous) => {
                            const next = [...previous.radius_servers];
                            next[index] = { ...next[index], address: event.target.value };
                            return { ...previous, radius_servers: next };
                          })
                        }
                        placeholder="192.0.2.10"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Input
                        value={entry.key || ""}
                        onChange={(event) =>
                          setConfig((previous) => {
                            const next = [...previous.radius_servers];
                            next[index] = { ...next[index], key: event.target.value };
                            return { ...previous, radius_servers: next };
                          })
                        }
                        placeholder="shared-secret"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Input
                        value={entry.port || ""}
                        onChange={(event) =>
                          setConfig((previous) => {
                            const next = [...previous.radius_servers];
                            next[index] = { ...next[index], port: event.target.value };
                            return { ...previous, radius_servers: next };
                          })
                        }
                        placeholder="1812"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Input
                        value={entry.source_address || ""}
                        onChange={(event) =>
                          setConfig((previous) => {
                            const next = [...previous.radius_servers];
                            next[index] = { ...next[index], source_address: event.target.value };
                            return { ...previous, radius_servers: next };
                          })
                        }
                        placeholder="198.51.100.2"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfig((previous) => ({
                            ...previous,
                            radius_servers: previous.radius_servers.filter((_, idx) => idx !== index),
                          }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      radius_servers: [
                        ...previous.radius_servers,
                        { address: "", key: "", port: "", source_address: "" },
                      ],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add RADIUS Server
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button onClick={save} disabled={!canEdit || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Mobile Clients"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
