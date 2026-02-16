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
  systemIpService,
  type SystemIpConfig,
  type SystemIpImportTableEntry,
  type SystemIpProtocolRouteMapEntry,
} from "@/lib/api/system-ip";

interface ImportTableFormState {
  tableId: string;
  distance: string;
  routeMap: string;
}

interface ProtocolFormState {
  protocol: string;
  routeMap: string;
}

const EMPTY_IMPORT_FORM: ImportTableFormState = {
  tableId: "",
  distance: "",
  routeMap: "",
};

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

function normalizeImportTables(entries: SystemIpImportTableEntry[]): SystemIpImportTableEntry[] {
  const dedupe = new Map<string, SystemIpImportTableEntry>();
  for (const entry of entries) {
    const tableId = entry.tableId.trim();
    if (!tableId) continue;
    dedupe.set(tableId, {
      tableId,
      distance: entry.distance.trim(),
      routeMap: entry.routeMap.trim(),
    });
  }
  return Array.from(dedupe.values()).sort((left, right) => Number(left.tableId) - Number(right.tableId));
}

function normalizeProtocolMaps(entries: SystemIpProtocolRouteMapEntry[]): SystemIpProtocolRouteMapEntry[] {
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
  current: SystemIpConfig | null,
  state: {
    arpTableSize: string;
    disableDirectedBroadcast: boolean;
    disableForwarding: boolean;
    multipathLayer4Hashing: boolean;
    nhtNoResolveViaDefault: boolean;
    importTables: SystemIpImportTableEntry[];
    protocolRouteMaps: SystemIpProtocolRouteMapEntry[];
  },
): string[] {
  const operations: string[] = [];
  const currentSafe = current || {
    arpTableSize: "",
    disableDirectedBroadcast: false,
    disableForwarding: false,
    importTables: [],
    multipathLayer4Hashing: false,
    nhtNoResolveViaDefault: false,
    protocolRouteMaps: [],
  };
  const base = "system ip";

  const syncFlag = (token: string, desired: boolean, existing: boolean) => {
    if (desired === existing) return;
    operations.push(`${desired ? "set" : "delete"} ${base} ${token}`);
  };

  const desiredArp = state.arpTableSize.trim();
  const currentArp = currentSafe.arpTableSize.trim();
  if (desiredArp !== currentArp) {
    if (desiredArp) operations.push(`set ${base} arp table-size ${quoteCliValue(desiredArp)}`);
    else operations.push(`delete ${base} arp table-size`);
  }

  syncFlag("disable-forwarding", state.disableForwarding, currentSafe.disableForwarding);
  syncFlag("disable-directed-broadcast", state.disableDirectedBroadcast, currentSafe.disableDirectedBroadcast);
  syncFlag("multipath layer4-hashing", state.multipathLayer4Hashing, currentSafe.multipathLayer4Hashing);
  syncFlag("nht no-resolve-via-default", state.nhtNoResolveViaDefault, currentSafe.nhtNoResolveViaDefault);

  const desiredImport = normalizeImportTables(state.importTables);
  const currentImport = normalizeImportTables(currentSafe.importTables);
  const desiredImportMap = new Map(desiredImport.map((entry) => [entry.tableId, entry]));
  const currentImportMap = new Map(currentImport.map((entry) => [entry.tableId, entry]));

  for (const [tableId, currentEntry] of currentImportMap.entries()) {
    const wanted = desiredImportMap.get(tableId);
    if (!wanted || wanted.distance !== currentEntry.distance || wanted.routeMap !== currentEntry.routeMap) {
      operations.push(`delete ${base} import-table ${quoteCliValue(tableId)}`);
    }
  }
  for (const [tableId, wanted] of desiredImportMap.entries()) {
    const currentEntry = currentImportMap.get(tableId);
    if (currentEntry && currentEntry.distance === wanted.distance && currentEntry.routeMap === wanted.routeMap) continue;
    operations.push(`set ${base} import-table ${quoteCliValue(tableId)}`);
    if (wanted.distance) {
      operations.push(`set ${base} import-table ${quoteCliValue(tableId)} distance ${quoteCliValue(wanted.distance)}`);
    }
    if (wanted.routeMap) {
      operations.push(`set ${base} import-table ${quoteCliValue(tableId)} route-map ${quoteCliValue(wanted.routeMap)}`);
    }
  }

  const desiredProtocols = normalizeProtocolMaps(state.protocolRouteMaps);
  const currentProtocols = normalizeProtocolMaps(currentSafe.protocolRouteMaps);
  const desiredProtocolMap = new Map(desiredProtocols.map((entry) => [entry.protocol, entry.routeMap]));
  const currentProtocolMap = new Map(currentProtocols.map((entry) => [entry.protocol, entry.routeMap]));

  for (const [protocol, currentRouteMap] of currentProtocolMap.entries()) {
    const wantedRouteMap = desiredProtocolMap.get(protocol);
    if (!wantedRouteMap || wantedRouteMap !== currentRouteMap) {
      operations.push(`delete ${base} protocol ${quoteCliValue(protocol)} route-map`);
    }
  }
  for (const [protocol, wantedRouteMap] of desiredProtocolMap.entries()) {
    const currentRouteMap = currentProtocolMap.get(protocol);
    if (currentRouteMap === wantedRouteMap) continue;
    operations.push(`set ${base} protocol ${quoteCliValue(protocol)} route-map ${quoteCliValue(wantedRouteMap)}`);
  }

  return operations;
}

export default function SystemIpPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemIpConfig | null>(null);

  const [arpTableSize, setArpTableSize] = useState("");
  const [disableDirectedBroadcast, setDisableDirectedBroadcast] = useState(false);
  const [disableForwarding, setDisableForwarding] = useState(false);
  const [multipathLayer4Hashing, setMultipathLayer4Hashing] = useState(false);
  const [nhtNoResolveViaDefault, setNhtNoResolveViaDefault] = useState(false);

  const [importTables, setImportTables] = useState<SystemIpImportTableEntry[]>([]);
  const [protocolRouteMaps, setProtocolRouteMaps] = useState<SystemIpProtocolRouteMapEntry[]>([]);

  const [editingImportTableId, setEditingImportTableId] = useState<string | null>(null);
  const [importForm, setImportForm] = useState<ImportTableFormState>(EMPTY_IMPORT_FORM);
  const [editingProtocol, setEditingProtocol] = useState<string | null>(null);
  const [protocolForm, setProtocolForm] = useState<ProtocolFormState>(EMPTY_PROTOCOL_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemIpService.getConfig(refresh);
      setConfig(response);
      setArpTableSize(response.arpTableSize);
      setDisableDirectedBroadcast(response.disableDirectedBroadcast);
      setDisableForwarding(response.disableForwarding);
      setMultipathLayer4Hashing(response.multipathLayer4Hashing);
      setNhtNoResolveViaDefault(response.nhtNoResolveViaDefault);
      setImportTables(normalizeImportTables(response.importTables));
      setProtocolRouteMaps(normalizeProtocolMaps(response.protocolRouteMaps));
      setEditingImportTableId(null);
      setImportForm(EMPTY_IMPORT_FORM);
      setEditingProtocol(null);
      setProtocolForm(EMPTY_PROTOCOL_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system IP settings.");
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
      arpTableSize: arpTableSize.trim(),
      disableDirectedBroadcast,
      disableForwarding,
      multipathLayer4Hashing,
      nhtNoResolveViaDefault,
      importTables: normalizeImportTables(importTables),
      protocolRouteMaps: normalizeProtocolMaps(protocolRouteMaps),
    };
    const currentState = {
      arpTableSize: config.arpTableSize.trim(),
      disableDirectedBroadcast: config.disableDirectedBroadcast,
      disableForwarding: config.disableForwarding,
      multipathLayer4Hashing: config.multipathLayer4Hashing,
      nhtNoResolveViaDefault: config.nhtNoResolveViaDefault,
      importTables: normalizeImportTables(config.importTables),
      protocolRouteMaps: normalizeProtocolMaps(config.protocolRouteMaps),
    };
    return JSON.stringify(desired) !== JSON.stringify(currentState);
  }, [
    arpTableSize,
    config,
    disableDirectedBroadcast,
    disableForwarding,
    importTables,
    multipathLayer4Hashing,
    nhtNoResolveViaDefault,
    protocolRouteMaps,
  ]);

  const upsertImportTable = () => {
    const tableId = importForm.tableId.trim();
    const distance = importForm.distance.trim();
    const routeMap = importForm.routeMap.trim();

    if (!tableId) {
      setError("Import table ID is required.");
      return;
    }
    if (!/^\d+$/.test(tableId)) {
      setError("Import table ID must be a whole number.");
      return;
    }
    if (distance && !/^\d+$/.test(distance)) {
      setError("Import distance must be a whole number.");
      return;
    }

    setImportTables((previous) => {
      const withoutEditing = editingImportTableId
        ? previous.filter((entry) => entry.tableId !== editingImportTableId)
        : previous;
      return normalizeImportTables([...withoutEditing.filter((entry) => entry.tableId !== tableId), { tableId, distance, routeMap }]);
    });
    setEditingImportTableId(tableId);
    setImportForm({ tableId, distance, routeMap });
    setError(null);
    setSuccess(editingImportTableId ? `Updated import table ${tableId}.` : `Added import table ${tableId}.`);
  };

  const editImportTable = (entry: SystemIpImportTableEntry) => {
    setEditingImportTableId(entry.tableId);
    setImportForm({ tableId: entry.tableId, distance: entry.distance, routeMap: entry.routeMap });
    setError(null);
    setSuccess(null);
  };

  const removeImportTable = (tableId: string) => {
    setImportTables((previous) => previous.filter((entry) => entry.tableId !== tableId));
    if (editingImportTableId === tableId) {
      setEditingImportTableId(null);
      setImportForm(EMPTY_IMPORT_FORM);
    }
  };

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

  const editProtocolRouteMap = (entry: SystemIpProtocolRouteMapEntry) => {
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
    if (arpTableSize.trim() && !/^\d+$/.test(arpTableSize.trim())) {
      setError("ARP table size must be a whole number.");
      return;
    }

    const operations = buildOperations(config, {
      arpTableSize,
      disableDirectedBroadcast,
      disableForwarding,
      multipathLayer4Hashing,
      nhtNoResolveViaDefault,
      importTables,
      protocolRouteMaps,
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
      const response = await systemIpService.batchConfigure(operations);
      if (!response.success) throw new Error(response.error || "VyOS rejected system IP changes.");
      await loadData(true);
      setSuccess("System IP settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save system IP settings.");
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
            <h1 className="text-3xl font-bold">System IP</h1>
            <p className="mt-1 text-muted-foreground">Manage IPv4 system behavior under `system ip`.</p>
          </div>
          <PageGuideDialog guide={pageGuides.systemIp} />
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
            <CardTitle>Global IPv4 Behavior</CardTitle>
            <CardDescription>Forwarding and path/neighbor lookup behavior.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="system-ip-arp-size">ARP Table Size</Label>
              <Input
                id="system-ip-arp-size"
                value={arpTableSize}
                onChange={(event) => setArpTableSize(event.target.value)}
                placeholder="8192"
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
                  checked={disableDirectedBroadcast}
                  disabled={!canEdit || saving}
                  onCheckedChange={(value) => setDisableDirectedBroadcast(value === true)}
                />
                Disable directed broadcast
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
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Import Tables</CardTitle>
              <CardDescription>`system ip import-table` entries with optional distance and route-map.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table ID</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Route-Map</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importTables.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No import tables configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      importTables.map((entry) => (
                        <TableRow key={entry.tableId}>
                          <TableCell>{entry.tableId}</TableCell>
                          <TableCell>{entry.distance || "-"}</TableCell>
                          <TableCell>{entry.routeMap || "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editImportTable(entry)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={!canEdit || saving}
                                onClick={() => removeImportTable(entry.tableId)}
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
              <CardTitle>{editingImportTableId ? `Edit ${editingImportTableId}` : "Add Import Table"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="import-table-id">Table ID</Label>
                <Input
                  id="import-table-id"
                  value={importForm.tableId}
                  onChange={(event) => setImportForm((previous) => ({ ...previous, tableId: event.target.value }))}
                  placeholder="100"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-distance">Distance (optional)</Label>
                <Input
                  id="import-distance"
                  value={importForm.distance}
                  onChange={(event) => setImportForm((previous) => ({ ...previous, distance: event.target.value }))}
                  placeholder="220"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-route-map">Route-Map (optional)</Label>
                <Input
                  id="import-route-map"
                  value={importForm.routeMap}
                  onChange={(event) => setImportForm((previous) => ({ ...previous, routeMap: event.target.value }))}
                  placeholder="IMPORT-100"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={upsertImportTable} disabled={!canEdit || saving} className="flex-1">
                  {editingImportTableId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingImportTableId ? "Update" : "Add"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setEditingImportTableId(null);
                    setImportForm(EMPTY_IMPORT_FORM);
                  }}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Protocol Route-Maps</CardTitle>
              <CardDescription>`system ip protocol &lt;protocol&gt; route-map &lt;name&gt;` assignments.</CardDescription>
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
                <Label htmlFor="protocol-name">Protocol</Label>
                <Input
                  id="protocol-name"
                  value={protocolForm.protocol}
                  onChange={(event) =>
                    setProtocolForm((previous) => ({ ...previous, protocol: event.target.value }))
                  }
                  placeholder="connected"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="protocol-route-map">Route-Map</Label>
                <Input
                  id="protocol-route-map"
                  value={protocolForm.routeMap}
                  onChange={(event) =>
                    setProtocolForm((previous) => ({ ...previous, routeMap: event.target.value }))
                  }
                  placeholder="CONNECTED-IN"
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
              Save System IP
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
