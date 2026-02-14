"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Plus, Save, Shield, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "./serviceTabHelpers";

interface SnmpListenAddress {
  address: string;
  port: string;
}

interface SnmpCommunity {
  name: string;
  authorization: "ro" | "rw";
  networks: string[];
  clients: string[];
}

interface SnmpServiceState {
  enabled: boolean;
  contact: string;
  location: string;
  listenAddresses: SnmpListenAddress[];
  trapTargets: string[];
  communities: SnmpCommunity[];
}

const EMPTY_SNMP_STATE: SnmpServiceState = {
  enabled: false,
  contact: "",
  location: "",
  listenAddresses: [],
  trapTargets: [],
  communities: [],
};

interface SnmpServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function toCsv(values: string[]): string {
  return values.join(", ");
}

function fromCsv(value: string): string[] {
  return uniqueNonEmpty(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function parseSnmpState(serviceNode: Record<string, unknown>): SnmpServiceState {
  const listenNode = toRecord(serviceNode["listen-address"]);
  const listenAddresses = Object.keys(listenNode)
    .sort((left, right) => left.localeCompare(right))
    .map((address) => ({
      address,
      port: asString(toRecord(listenNode[address]).port) ?? "",
    }));

  const communitiesNode = toRecord(serviceNode.community);
  const communities: SnmpCommunity[] = Object.keys(communitiesNode)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const communityNode = toRecord(communitiesNode[name]);
      const authorization = asString(communityNode.authorization) === "rw" ? "rw" : "ro";
      return {
        name,
        authorization,
        networks: objectKeys(communityNode.network),
        clients: objectKeys(communityNode.client),
      };
    });

  return {
    enabled: Object.keys(serviceNode).length > 0,
    contact: asString(serviceNode.contact) ?? "",
    location: asString(serviceNode.location) ?? "",
    listenAddresses,
    trapTargets: objectKeys(serviceNode["trap-target"]),
    communities,
  };
}

export function SnmpServiceTab({ canEdit, active, refreshNonce }: SnmpServiceTabProps) {
  const [config, setConfig] = useState<SnmpServiceState>(EMPTY_SNMP_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getSnmpConfig(refresh);
      setConfig(parseSnmpState(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SNMP configuration.");
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

  const updateListenAddress = (index: number, update: Partial<SnmpListenAddress>) => {
    setConfig((previous) => {
      const next = [...previous.listenAddresses];
      next[index] = { ...next[index], ...update };
      return { ...previous, listenAddresses: next };
    });
  };

  const removeListenAddress = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      listenAddresses: previous.listenAddresses.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const updateCommunity = (index: number, update: Partial<SnmpCommunity>) => {
    setConfig((previous) => {
      const next = [...previous.communities];
      next[index] = { ...next[index], ...update };
      return { ...previous, communities: next };
    });
  };

  const removeCommunity = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      communities: previous.communities.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const updateTrapTarget = (index: number, value: string) => {
    setConfig((previous) => {
      const next = [...previous.trapTargets];
      next[index] = value;
      return { ...previous, trapTargets: next };
    });
  };

  const removeTrapTarget = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      trapTargets: previous.trapTargets.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSave = async () => {
    for (const listener of config.listenAddresses) {
      if (!listener.address.trim()) {
        setError("Each SNMP listen-address row requires an address.");
        setSuccess(null);
        return;
      }
      if (listener.port.trim()) {
        const parsed = Number.parseInt(listener.port, 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
          setError("SNMP listen port must be between 1 and 65535.");
          setSuccess(null);
          return;
        }
      }
    }

    const normalizedCommunities = config.communities
      .map((entry) => ({
        name: entry.name.trim(),
        authorization: entry.authorization === "rw" ? "rw" : "ro",
        networks: uniqueNonEmpty(entry.networks),
        clients: uniqueNonEmpty(entry.clients),
      }))
      .filter((entry) => entry.name.length > 0);

    if (config.enabled && normalizedCommunities.length === 0) {
      setError("Add at least one SNMP community when SNMP is enabled.");
      setSuccess(null);
      return;
    }

    const communityNames = new Set<string>();
    for (const community of normalizedCommunities) {
      const normalizedName = community.name.toLowerCase();
      if (communityNames.has(normalizedName)) {
        setError(`Duplicate SNMP community name: ${community.name}`);
        setSuccess(null);
        return;
      }
      communityNames.add(normalizedName);
    }

    const operations: string[] = ["delete service snmp"];
    if (config.enabled) {
      operations.push("set service snmp");

      if (config.contact.trim()) {
        operations.push(`set service snmp contact ${quoteCliValue(config.contact)}`);
      }
      if (config.location.trim()) {
        operations.push(`set service snmp location ${quoteCliValue(config.location)}`);
      }

      const listenSeen = new Set<string>();
      for (const listener of config.listenAddresses) {
        const address = listener.address.trim();
        const port = listener.port.trim();
        const key = `${address}::${port}`;
        if (!address || listenSeen.has(key)) continue;
        listenSeen.add(key);

        let command = `set service snmp listen-address ${quoteCliValue(address)}`;
        if (port) {
          command += ` port ${port}`;
        }
        operations.push(command);
      }

      for (const target of uniqueNonEmpty(config.trapTargets)) {
        operations.push(`set service snmp trap-target ${quoteCliValue(target)}`);
      }

      for (const community of normalizedCommunities) {
        const communityName = quoteCliValue(community.name);
        operations.push(
          `set service snmp community ${communityName} authorization ${community.authorization}`,
        );

        for (const network of community.networks) {
          operations.push(
            `set service snmp community ${communityName} network ${quoteCliValue(network)}`,
          );
        }
        for (const client of community.clients) {
          operations.push(
            `set service snmp community ${communityName} client ${quoteCliValue(client)}`,
          );
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureSnmp(operations);
      await loadConfig(true);
      setSuccess("SNMP configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update SNMP configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          SNMP
        </CardTitle>
        <CardDescription>
          Configure SNMP v2 communities, traps, and listener addresses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading SNMP configuration...</p>
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
              <Label className="text-sm font-medium">Enable SNMP service</Label>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <Label>Contact</Label>
                <Input
                  value={config.contact}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, contact: event.target.value }))
                  }
                  placeholder="noc@example.com"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={config.location}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, location: event.target.value }))
                  }
                  placeholder="Datacenter A"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Listen Addresses</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      listenAddresses: [...previous.listenAddresses, { address: "", port: "" }],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Listener
                </Button>
              </div>
              {config.listenAddresses.length === 0 ? (
                <p className="text-xs text-muted-foreground">No explicit SNMP listener addresses set.</p>
              ) : (
                <div className="space-y-2">
                  {config.listenAddresses.map((entry, index) => (
                    <div key={`snmp-listen-${index}`} className="grid gap-2 xl:grid-cols-[2fr_1fr_auto]">
                      <Input
                        value={entry.address}
                        onChange={(event) =>
                          updateListenAddress(index, { address: event.target.value })
                        }
                        placeholder="192.168.10.242"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={entry.port}
                        onChange={(event) =>
                          updateListenAddress(index, { port: event.target.value })
                        }
                        placeholder="161"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeListenAddress(index)}
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
                <Label className="text-sm font-medium">Trap Targets</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      trapTargets: [...previous.trapTargets, ""],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Target
                </Button>
              </div>
              {config.trapTargets.length === 0 ? (
                <p className="text-xs text-muted-foreground">No trap targets configured.</p>
              ) : (
                <div className="space-y-2">
                  {config.trapTargets.map((target, index) => (
                    <div key={`snmp-trap-${index}`} className="flex items-center gap-2">
                      <Input
                        value={target}
                        onChange={(event) => updateTrapTarget(index, event.target.value)}
                        placeholder="192.0.2.50"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTrapTarget(index)}
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
                <Label className="text-sm font-medium">Communities</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      communities: [
                        ...previous.communities,
                        {
                          name: "",
                          authorization: "ro",
                          networks: [],
                          clients: [],
                        },
                      ],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Community
                </Button>
              </div>

              {config.communities.length === 0 ? (
                <p className="text-xs text-muted-foreground">No communities configured.</p>
              ) : (
                <div className="space-y-3">
                  {config.communities.map((community, index) => (
                    <div key={`snmp-community-${index}`} className="rounded-md border p-3 space-y-3">
                      <div className="grid gap-3 xl:grid-cols-[2fr_1fr_auto]">
                        <Input
                          value={community.name}
                          onChange={(event) =>
                            updateCommunity(index, { name: event.target.value })
                          }
                          placeholder="public"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Select
                          value={community.authorization}
                          onValueChange={(value) =>
                            updateCommunity(index, {
                              authorization: value === "rw" ? "rw" : "ro",
                            })
                          }
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ro">Read-only</SelectItem>
                            <SelectItem value="rw">Read-write</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCommunity(index)}
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-3 xl:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs">Allowed Networks (comma separated)</Label>
                          <Input
                            value={toCsv(community.networks)}
                            onChange={(event) =>
                              updateCommunity(index, { networks: fromCsv(event.target.value) })
                            }
                            placeholder="192.168.10.0/24, 10.0.0.0/8"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Allowed Clients (comma separated)</Label>
                          <Input
                            value={toCsv(community.clients)}
                            onChange={(event) =>
                              updateCommunity(index, { clients: fromCsv(event.target.value) })
                            }
                            placeholder="192.168.10.50, 192.168.10.51"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              SNMPv3 users/groups/views and script extensions are not yet exposed in this tab.
            </p>

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

            <Button onClick={handleSave} disabled={!canEdit || saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save SNMP Settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
