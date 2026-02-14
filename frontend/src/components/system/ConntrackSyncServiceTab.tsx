"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowRightLeft, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "./serviceTabHelpers";

interface ConntrackInterface {
  name: string;
  peer: string;
  port: string;
}

interface ConntrackSyncState {
  enabled: boolean;
  startupResync: boolean;
  disableExternalCache: boolean;
  disableSyslog: boolean;
  listenAddress: string;
  mcastGroup: string;
  eventListenQueueSize: string;
  syncQueueSize: string;
  vrrpSyncGroup: string;
  interfaces: ConntrackInterface[];
  acceptProtocols: string[];
  expectSync: string[];
  ignoreAddresses: string[];
}

const EMPTY_CONNTRACK_STATE: ConntrackSyncState = {
  enabled: false,
  startupResync: false,
  disableExternalCache: false,
  disableSyslog: false,
  listenAddress: "",
  mcastGroup: "",
  eventListenQueueSize: "",
  syncQueueSize: "",
  vrrpSyncGroup: "",
  interfaces: [],
  acceptProtocols: [],
  expectSync: [],
  ignoreAddresses: [],
};

interface ConntrackSyncServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function toCsv(values: string[]): string {
  return values.join(", ");
}

function fromCsv(value: string): string[] {
  return uniqueNonEmpty(value.split(",").map((entry) => entry.trim()).filter(Boolean));
}

function parseConntrackSyncConfig(serviceNode: Record<string, unknown>): ConntrackSyncState {
  const interfacesNode = toRecord(serviceNode.interface);
  const failoverNode = toRecord(serviceNode["failover-mechanism"]);
  const vrrpNode = toRecord(failoverNode.vrrp);

  return {
    enabled: Object.keys(serviceNode).length > 0,
    startupResync: Object.prototype.hasOwnProperty.call(serviceNode, "startup-resync"),
    disableExternalCache: Object.prototype.hasOwnProperty.call(serviceNode, "disable-external-cache"),
    disableSyslog: Object.prototype.hasOwnProperty.call(serviceNode, "disable-syslog"),
    listenAddress: asString(serviceNode["listen-address"]) ?? "",
    mcastGroup: asString(serviceNode["mcast-group"]) ?? "",
    eventListenQueueSize: asString(serviceNode["event-listen-queue-size"]) ?? "",
    syncQueueSize: asString(serviceNode["sync-queue-size"]) ?? "",
    vrrpSyncGroup: asString(vrrpNode["sync-group"]) ?? "",
    interfaces: Object.keys(interfacesNode)
      .sort((left, right) => left.localeCompare(right))
      .map((name) => {
        const node = toRecord(interfacesNode[name]);
        return {
          name,
          peer: asString(node.peer) ?? "",
          port: asString(node.port) ?? "",
        };
      }),
    acceptProtocols: objectKeys(serviceNode["accept-protocol"]),
    expectSync: objectKeys(serviceNode["expect-sync"]),
    ignoreAddresses: objectKeys(serviceNode["ignore-address"]),
  };
}

export function ConntrackSyncServiceTab({
  canEdit,
  active,
  refreshNonce,
}: ConntrackSyncServiceTabProps) {
  const [config, setConfig] = useState<ConntrackSyncState>(EMPTY_CONNTRACK_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getConntrackSyncConfig(refresh);
      setConfig(parseConntrackSyncConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conntrack sync configuration.");
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

  const updateInterface = (index: number, update: Partial<ConntrackInterface>) => {
    setConfig((previous) => {
      const next = [...previous.interfaces];
      next[index] = { ...next[index], ...update };
      return { ...previous, interfaces: next };
    });
  };

  const removeInterface = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      interfaces: previous.interfaces.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSave = async () => {
    const numericFields: Array<{ label: string; value: string }> = [
      { label: "Event listen queue size", value: config.eventListenQueueSize },
      { label: "Sync queue size", value: config.syncQueueSize },
    ];
    for (const field of numericFields) {
      if (!field.value.trim()) continue;
      const parsed = Number.parseInt(field.value, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        setError(`${field.label} must be a positive integer.`);
        setSuccess(null);
        return;
      }
    }

    for (const item of config.interfaces) {
      if (!item.name.trim()) {
        setError("Each conntrack interface row requires an interface name.");
        setSuccess(null);
        return;
      }
      if (item.port.trim()) {
        const parsed = Number.parseInt(item.port, 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
          setError("Conntrack interface port must be between 1 and 65535.");
          setSuccess(null);
          return;
        }
      }
    }

    const operations: string[] = ["delete service conntrack-sync"];
    if (config.enabled) {
      operations.push("set service conntrack-sync");

      if (config.startupResync) operations.push("set service conntrack-sync startup-resync");
      if (config.disableExternalCache) operations.push("set service conntrack-sync disable-external-cache");
      if (config.disableSyslog) operations.push("set service conntrack-sync disable-syslog");
      if (config.listenAddress.trim()) {
        operations.push(`set service conntrack-sync listen-address ${quoteCliValue(config.listenAddress)}`);
      }
      if (config.mcastGroup.trim()) {
        operations.push(`set service conntrack-sync mcast-group ${quoteCliValue(config.mcastGroup)}`);
      }
      if (config.eventListenQueueSize.trim()) {
        operations.push(`set service conntrack-sync event-listen-queue-size ${config.eventListenQueueSize.trim()}`);
      }
      if (config.syncQueueSize.trim()) {
        operations.push(`set service conntrack-sync sync-queue-size ${config.syncQueueSize.trim()}`);
      }
      if (config.vrrpSyncGroup.trim()) {
        operations.push(
          `set service conntrack-sync failover-mechanism vrrp sync-group ${quoteCliValue(config.vrrpSyncGroup)}`,
        );
      }

      const seenInterfaces = new Set<string>();
      for (const item of config.interfaces) {
        const name = item.name.trim();
        if (!name || seenInterfaces.has(name)) continue;
        seenInterfaces.add(name);
        const ifName = quoteCliValue(name);
        operations.push(`set service conntrack-sync interface ${ifName}`);
        if (item.peer.trim()) {
          operations.push(`set service conntrack-sync interface ${ifName} peer ${quoteCliValue(item.peer)}`);
        }
        if (item.port.trim()) {
          operations.push(`set service conntrack-sync interface ${ifName} port ${item.port.trim()}`);
        }
      }

      for (const protocol of uniqueNonEmpty(config.acceptProtocols)) {
        operations.push(`set service conntrack-sync accept-protocol ${quoteCliValue(protocol)}`);
      }
      for (const expect of uniqueNonEmpty(config.expectSync)) {
        operations.push(`set service conntrack-sync expect-sync ${quoteCliValue(expect)}`);
      }
      for (const address of uniqueNonEmpty(config.ignoreAddresses)) {
        operations.push(`set service conntrack-sync ignore-address ${quoteCliValue(address)}`);
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureConntrackSync(operations);
      await loadConfig(true);
      setSuccess("Conntrack sync configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update conntrack sync configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-primary" />
          Conntrack Sync
        </CardTitle>
        <CardDescription>
          Configure connection-state synchronization for HA failover peers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading conntrack sync configuration...</p>
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
              <Label className="text-sm font-medium">Enable conntrack sync</Label>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={config.startupResync}
                  onCheckedChange={(checked) =>
                    setConfig((previous) => ({ ...previous, startupResync: checked === true }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                />
                Startup resync
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={config.disableExternalCache}
                  onCheckedChange={(checked) =>
                    setConfig((previous) => ({ ...previous, disableExternalCache: checked === true }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                />
                Disable external cache
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={config.disableSyslog}
                  onCheckedChange={(checked) =>
                    setConfig((previous) => ({ ...previous, disableSyslog: checked === true }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                />
                Disable syslog
              </label>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="space-y-2">
                <Label>Listen Address</Label>
                <Input
                  value={config.listenAddress}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, listenAddress: event.target.value }))
                  }
                  placeholder="192.0.2.10"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Multicast Group</Label>
                <Input
                  value={config.mcastGroup}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, mcastGroup: event.target.value }))
                  }
                  placeholder="225.0.0.50"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>VRRP Sync Group</Label>
                <Input
                  value={config.vrrpSyncGroup}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, vrrpSyncGroup: event.target.value }))
                  }
                  placeholder="syncgrp"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <Label>Event Listen Queue Size</Label>
                <Input
                  type="number"
                  min={1}
                  value={config.eventListenQueueSize}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, eventListenQueueSize: event.target.value }))
                  }
                  placeholder="10000"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Sync Queue Size</Label>
                <Input
                  type="number"
                  min={1}
                  value={config.syncQueueSize}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, syncQueueSize: event.target.value }))
                  }
                  placeholder="10000"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Sync Interfaces</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      interfaces: [...previous.interfaces, { name: "", peer: "", port: "" }],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Interface
                </Button>
              </div>
              {config.interfaces.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sync interfaces configured.</p>
              ) : (
                <div className="space-y-2">
                  {config.interfaces.map((item, index) => (
                    <div key={`conntrack-iface-${index}`} className="grid gap-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
                      <Input
                        value={item.name}
                        onChange={(event) => updateInterface(index, { name: event.target.value })}
                        placeholder="eth1"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Input
                        value={item.peer}
                        onChange={(event) => updateInterface(index, { peer: event.target.value })}
                        placeholder="192.0.2.11"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={item.port}
                        onChange={(event) => updateInterface(index, { port: event.target.value })}
                        placeholder="3780"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeInterface(index)}
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="space-y-2">
                <Label>Accept Protocols (comma separated)</Label>
                <Input
                  value={toCsv(config.acceptProtocols)}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, acceptProtocols: fromCsv(event.target.value) }))
                  }
                  placeholder="tcp, udp, icmp"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Expect Sync Helpers</Label>
                <Input
                  value={toCsv(config.expectSync)}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, expectSync: fromCsv(event.target.value) }))
                  }
                  placeholder="all, ftp, sip"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Ignore Addresses</Label>
                <Input
                  value={toCsv(config.ignoreAddresses)}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, ignoreAddresses: fromCsv(event.target.value) }))
                  }
                  placeholder="192.0.2.254"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
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

            <Button onClick={handleSave} disabled={!canEdit || saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Conntrack Sync Settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
