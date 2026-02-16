"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import {
  systemIpv6Service,
  type SystemIpv6Config,
  type SystemIpv6ProtocolRouteMapEntry,
} from "@/lib/api/system-ipv6";

interface ProtocolFormState {
  protocol: string;
  routeMap: string;
}

const EMPTY_PROTOCOL_FORM: ProtocolFormState = {
  protocol: "",
  routeMap: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeProtocolMaps(entries: SystemIpv6ProtocolRouteMapEntry[]): SystemIpv6ProtocolRouteMapEntry[] {
  const dedupe = new Map<string, string>();
  for (const entry of entries) {
    const protocol = entry.protocol.trim().toLowerCase();
    const routeMap = entry.routeMap.trim();
    if (!protocol || !routeMap) continue;
    dedupe.set(protocol, routeMap);
  }
  return Array.from(dedupe.entries())
    .map(([protocol, routeMap]) => ({ protocol, routeMap }))
    .sort((left, right) => left.protocol.localeCompare(right.protocol));
}

function buildOperations(
  current: SystemIpv6Config | null,
  state: {
    disableForwarding: boolean;
    multipathLayer4Hashing: boolean;
    neighborTableSize: string;
    nhtNoResolveViaDefault: boolean;
    protocolRouteMaps: SystemIpv6ProtocolRouteMapEntry[];
    strictDad: boolean;
  },
): string[] {
  const operations: string[] = [];
  const currentSafe = current || {
    disableForwarding: false,
    multipathLayer4Hashing: false,
    neighborTableSize: "",
    nhtNoResolveViaDefault: false,
    protocolRouteMaps: [],
    strictDad: false,
  };
  const base = "system ipv6";

  const syncFlag = (token: string, desired: boolean, existing: boolean) => {
    if (desired === existing) return;
    operations.push(`${desired ? "set" : "delete"} ${base} ${token}`);
  };

  syncFlag("disable-forwarding", state.disableForwarding, currentSafe.disableForwarding);
  syncFlag("multipath layer4-hashing", state.multipathLayer4Hashing, currentSafe.multipathLayer4Hashing);
  syncFlag("nht no-resolve-via-default", state.nhtNoResolveViaDefault, currentSafe.nhtNoResolveViaDefault);
  syncFlag("strict-dad", state.strictDad, currentSafe.strictDad);

  const desiredNeighborSize = state.neighborTableSize.trim();
  const currentNeighborSize = currentSafe.neighborTableSize.trim();
  if (desiredNeighborSize !== currentNeighborSize) {
    if (desiredNeighborSize) operations.push(`set ${base} neighbor table-size ${quoteCliValue(desiredNeighborSize)}`);
    else operations.push(`delete ${base} neighbor table-size`);
  }

  const desiredProtocols = normalizeProtocolMaps(state.protocolRouteMaps);
  const currentProtocols = normalizeProtocolMaps(currentSafe.protocolRouteMaps);
  const desiredMap = new Map(desiredProtocols.map((entry) => [entry.protocol, entry.routeMap]));
  const currentMap = new Map(currentProtocols.map((entry) => [entry.protocol, entry.routeMap]));

  for (const [protocol, currentRouteMap] of currentMap.entries()) {
    const wantedRouteMap = desiredMap.get(protocol);
    if (!wantedRouteMap || wantedRouteMap !== currentRouteMap) {
      operations.push(`delete ${base} protocol ${quoteCliValue(protocol)} route-map`);
    }
  }
  for (const [protocol, wantedRouteMap] of desiredMap.entries()) {
    const currentRouteMap = currentMap.get(protocol);
    if (currentRouteMap === wantedRouteMap) continue;
    operations.push(`set ${base} protocol ${quoteCliValue(protocol)} route-map ${quoteCliValue(wantedRouteMap)}`);
  }

  return operations;
}

export default function SystemIpv6Page() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemIpv6Config | null>(null);

  const [disableForwarding, setDisableForwarding] = useState(false);
  const [multipathLayer4Hashing, setMultipathLayer4Hashing] = useState(false);
  const [neighborTableSize, setNeighborTableSize] = useState("");
  const [nhtNoResolveViaDefault, setNhtNoResolveViaDefault] = useState(false);
  const [strictDad, setStrictDad] = useState(false);
  const [protocolRouteMaps, setProtocolRouteMaps] = useState<SystemIpv6ProtocolRouteMapEntry[]>([]);
  const [editingProtocol, setEditingProtocol] = useState<string | null>(null);
  const [protocolForm, setProtocolForm] = useState<ProtocolFormState>(EMPTY_PROTOCOL_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemIpv6Service.getConfig(refresh);
      setConfig(response);
      setDisableForwarding(response.disableForwarding);
      setMultipathLayer4Hashing(response.multipathLayer4Hashing);
      setNeighborTableSize(response.neighborTableSize);
      setNhtNoResolveViaDefault(response.nhtNoResolveViaDefault);
      setStrictDad(response.strictDad);
      setProtocolRouteMaps(normalizeProtocolMaps(response.protocolRouteMaps));
      setEditingProtocol(null);
      setProtocolForm(EMPTY_PROTOCOL_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system IPv6 settings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const hasChanges = useMemo(() => {
    if (!config) return false;
    const desired = {
      disableForwarding,
      multipathLayer4Hashing,
      neighborTableSize: neighborTableSize.trim(),
      nhtNoResolveViaDefault,
      strictDad,
      protocolRouteMaps: normalizeProtocolMaps(protocolRouteMaps),
    };
    const currentState = {
      disableForwarding: config.disableForwarding,
      multipathLayer4Hashing: config.multipathLayer4Hashing,
      neighborTableSize: config.neighborTableSize.trim(),
      nhtNoResolveViaDefault: config.nhtNoResolveViaDefault,
      strictDad: config.strictDad,
      protocolRouteMaps: normalizeProtocolMaps(config.protocolRouteMaps),
    };
    return JSON.stringify(desired) !== JSON.stringify(currentState);
  }, [
    config,
    disableForwarding,
    multipathLayer4Hashing,
    neighborTableSize,
    nhtNoResolveViaDefault,
    protocolRouteMaps,
    strictDad,
  ]);

  const upsertProtocolRouteMap = () => {
    const protocol = protocolForm.protocol.trim().toLowerCase();
    const routeMap = protocolForm.routeMap.trim();
    if (!protocol) {
      setError("Protocol name is required.");
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(protocol)) {
      setError("Protocol can only contain lowercase letters, numbers, dot, underscore, or dash.");
      return;
    }
    if (!routeMap) {
      setError("Route-map name is required.");
      return;
    }

    setProtocolRouteMaps((previous) => {
      const withoutEditing = editingProtocol ? previous.filter((entry) => entry.protocol !== editingProtocol) : previous;
      return normalizeProtocolMaps([...withoutEditing.filter((entry) => entry.protocol !== protocol), { protocol, routeMap }]);
    });
    setEditingProtocol(protocol);
    setProtocolForm({ protocol, routeMap });
    setError(null);
    setSuccess(editingProtocol ? `Updated protocol ${protocol}.` : `Added protocol ${protocol}.`);
  };

  const editProtocolRouteMap = (entry: SystemIpv6ProtocolRouteMapEntry) => {
    setEditingProtocol(entry.protocol);
    setProtocolForm({ protocol: entry.protocol, routeMap: entry.routeMap });
    setError(null);
    setSuccess(null);
  };

  const removeProtocolRouteMap = (protocol: string) => {
    setProtocolRouteMaps((previous) => previous.filter((entry) => entry.protocol !== protocol));
    if (editingProtocol === protocol) {
      setEditingProtocol(null);
      setProtocolForm(EMPTY_PROTOCOL_FORM);
    }
  };

  const saveConfig = async () => {
    if (neighborTableSize.trim() && !/^\d+$/.test(neighborTableSize.trim())) {
      setError("Neighbor table size must be a whole number.");
      return;
    }

    const operations = buildOperations(config, {
      disableForwarding,
      multipathLayer4Hashing,
      neighborTableSize,
      nhtNoResolveViaDefault,
      protocolRouteMaps,
      strictDad,
    });
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemIpv6Service.batchConfigure(operations);
      if (!response.success) throw new Error(response.error || "VyOS rejected system IPv6 changes.");
      await loadData(true);
      setSuccess("System IPv6 settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save system IPv6 settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">System IPv6</h1>
            <p className="mt-1 text-muted-foreground">Manage IPv6 system behavior under `system ipv6`.</p>
          </div>
          <PageGuideDialog guide={pageGuides.systemIpv6} />
        </div>

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {success && (
          <Card className="border-emerald-500/50">
            <CardContent className="pt-6">
              <p className="text-sm text-emerald-300">{success}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Global IPv6 Behavior</CardTitle>
            <CardDescription>Forwarding, neighbor lookup, and path behavior for IPv6 control plane.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="system-ipv6-neighbor-size">Neighbor Table Size</Label>
              <Input
                id="system-ipv6-neighbor-size"
                value={neighborTableSize}
                onChange={(event) => setNeighborTableSize(event.target.value)}
                placeholder="4096"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={disableForwarding}
                  disabled={!canEdit || saving}
                  onCheckedChange={(value) => setDisableForwarding(value === true)}
                />
                Disable forwarding
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={multipathLayer4Hashing}
                  disabled={!canEdit || saving}
                  onCheckedChange={(value) => setMultipathLayer4Hashing(value === true)}
                />
                Multipath layer4 hashing
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={nhtNoResolveViaDefault}
                  disabled={!canEdit || saving}
                  onCheckedChange={(value) => setNhtNoResolveViaDefault(value === true)}
                />
                NHT no resolve via default
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={strictDad}
                  disabled={!canEdit || saving}
                  onCheckedChange={(value) => setStrictDad(value === true)}
                />
                Strict DAD
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Protocol Route-Maps</CardTitle>
              <CardDescription>`system ipv6 protocol &lt;protocol&gt; route-map &lt;name&gt;` assignments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Route-Map</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {protocolRouteMaps.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                          No protocol route-maps configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      protocolRouteMaps.map((entry) => (
                        <TableRow key={entry.protocol}>
                          <TableCell>{entry.protocol}</TableCell>
                          <TableCell>{entry.routeMap}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editProtocolRouteMap(entry)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={!canEdit || saving}
                                onClick={() => removeProtocolRouteMap(entry.protocol)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{editingProtocol ? `Edit ${editingProtocol}` : "Add Protocol Route-Map"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="ipv6-protocol-name">Protocol</Label>
                <Input
                  id="ipv6-protocol-name"
                  value={protocolForm.protocol}
                  onChange={(event) =>
                    setProtocolForm((previous) => ({ ...previous, protocol: event.target.value }))
                  }
                  placeholder="bgp"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipv6-protocol-route-map">Route-Map</Label>
                <Input
                  id="ipv6-protocol-route-map"
                  value={protocolForm.routeMap}
                  onChange={(event) =>
                    setProtocolForm((previous) => ({ ...previous, routeMap: event.target.value }))
                  }
                  placeholder="BGP6-IN"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={upsertProtocolRouteMap} disabled={!canEdit || saving} className="flex-1">
                  {editingProtocol ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingProtocol ? "Update" : "Add"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setEditingProtocol(null);
                    setProtocolForm(EMPTY_PROTOCOL_FORM);
                  }}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Badge variant={hasChanges ? "default" : "secondary"}>{hasChanges ? "Unsaved Changes" : "In Sync"}</Badge>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" onClick={saveConfig} disabled={!canEdit || saving || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              Save System IPv6
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
