"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { zonesService, type FirewallZone, type ZonePolicyUpdate } from "@/lib/api/zones";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import {
  AlertCircle,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Unplug,
} from "lucide-react";

type DefaultAction = "accept" | "drop" | "reject";

function parseCsvList(value: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value.split(",")) {
    const item = entry.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function policyListFromZone(zone: FirewallZone): ZonePolicyUpdate[] {
  return Object.entries(zone.from || {}).map(([from_zone, policy]) => ({
    from_zone,
    firewall_ruleset: policy.firewall?.name || "",
  }));
}

export default function FirewallZonesPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.FIREWALL_ZONES) || canWrite(FeatureGroup.FIREWALL);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [zones, setZones] = useState<Record<string, FirewallZone>>({});
  const [selectedZoneName, setSelectedZoneName] = useState<string>("");
  const [policies, setPolicies] = useState<
    Array<{ from_zone: string; to_zone: string; firewall_ruleset: string; default_action?: string | null }>
  >([]);

  const [createZoneName, setCreateZoneName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createDefaultAction, setCreateDefaultAction] = useState<DefaultAction>("drop");
  const [createInterfaces, setCreateInterfaces] = useState("");
  const [createPolicies, setCreatePolicies] = useState("LAN_FROM:LAN-IN");

  const [editDescription, setEditDescription] = useState("");
  const [editDefaultAction, setEditDefaultAction] = useState<DefaultAction>("drop");
  const [editInterfaces, setEditInterfaces] = useState("");
  const [editPolicies, setEditPolicies] = useState("LAN_FROM:LAN-IN");

  const sortedZoneNames = useMemo(() => Object.keys(zones).sort(), [zones]);
  const selectedZone = zones[selectedZoneName] || null;

  const loadData = async () => {
    try {
      setError(null);
      setRefreshing(true);
      const [configData, policyData] = await Promise.all([
        zonesService.getConfig(),
        zonesService.getPolicies(),
      ]);
      setZones(configData.zones || {});
      setPolicies(policyData || []);

      const names = Object.keys(configData.zones || {}).sort();
      if (names.length === 0) {
        setSelectedZoneName("");
      } else if (!names.includes(selectedZoneName)) {
        setSelectedZoneName(names[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load firewall zones");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedZone) return;

    const policyLines = policyListFromZone(selectedZone)
      .map((policy) => `${policy.from_zone}:${policy.firewall_ruleset}`)
      .join("\n");

    setEditDescription(selectedZone.description || "");
    setEditDefaultAction((selectedZone["default-action"] as DefaultAction) || "drop");
    setEditInterfaces((selectedZone.interfaces || []).join(", "));
    setEditPolicies(policyLines);
  }, [selectedZoneName, selectedZone]);

  const parsePolicyTextarea = (raw: string): ZonePolicyUpdate[] => {
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const parsed: ZonePolicyUpdate[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const [from_zone, firewall_ruleset] = line.split(":").map((item) => item?.trim() || "");
      if (!from_zone || !firewall_ruleset) continue;
      const key = `${from_zone}->${firewall_ruleset}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parsed.push({ from_zone, firewall_ruleset });
    }
    return parsed;
  };

  const createZone = async () => {
    if (!canEdit) return;
    const zoneName = createZoneName.trim();
    if (!zoneName) {
      setError("Zone name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await zonesService.upsertZone(zoneName, {
        description: createDescription.trim() || null,
        default_action: createDefaultAction,
        interfaces: parseCsvList(createInterfaces),
        from_policies: parsePolicyTextarea(createPolicies),
      });
      setSuccess(`Zone '${zoneName}' created/updated.`);
      setCreateZoneName("");
      setCreateDescription("");
      setCreateDefaultAction("drop");
      setCreateInterfaces("");
      setCreatePolicies("LAN_FROM:LAN-IN");
      await loadData();
      setSelectedZoneName(zoneName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create zone");
    } finally {
      setSaving(false);
    }
  };

  const saveSelectedZone = async () => {
    if (!canEdit || !selectedZoneName) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await zonesService.upsertZone(selectedZoneName, {
        description: editDescription.trim() || null,
        default_action: editDefaultAction,
        interfaces: parseCsvList(editInterfaces),
        from_policies: parsePolicyTextarea(editPolicies),
      });
      setSuccess(`Zone '${selectedZoneName}' updated.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update zone");
    } finally {
      setSaving(false);
    }
  };

  const deleteSelectedZone = async () => {
    if (!canEdit || !selectedZoneName) return;
    if (!window.confirm(`Delete zone '${selectedZoneName}'?`)) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await zonesService.deleteZone(selectedZoneName);
      setSuccess(`Zone '${selectedZoneName}' deleted.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete zone");
    } finally {
      setSaving(false);
    }
  };

  const removePolicy = async (toZone: string, fromZone: string) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await zonesService.deleteFromPolicy(toZone, fromZone);
      setSuccess(`Removed policy ${fromZone} -> ${toZone}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete policy mapping");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Firewall Zones</h1>
            <p className="text-muted-foreground mt-1">
              Configure zone-based firewall boundaries and inter-zone policies.
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Zones</p>
              <p className="mt-1 text-2xl font-bold">{Object.keys(zones).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Policies</p>
              <p className="mt-1 text-2xl font-bold">{policies.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Permissions</p>
              <div className="mt-1">
                <Badge variant={canEdit ? "default" : "secondary"}>
                  {canEdit ? "Editable" : "Read-only"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Zone Name</Label>
                <Input
                  value={createZoneName}
                  onChange={(event) => setCreateZoneName(event.target.value)}
                  placeholder="LAN, WAN, DMZ"
                  disabled={!canEdit || saving}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  placeholder="Optional description"
                  disabled={!canEdit || saving}
                />
              </div>
              <div>
                <Label>Default Action</Label>
                <Select
                  value={createDefaultAction}
                  onValueChange={(value) => setCreateDefaultAction(value as DefaultAction)}
                  disabled={!canEdit || saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accept">accept</SelectItem>
                    <SelectItem value="drop">drop</SelectItem>
                    <SelectItem value="reject">reject</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Interfaces (comma-separated)</Label>
                <Input
                  value={createInterfaces}
                  onChange={(event) => setCreateInterfaces(event.target.value)}
                  placeholder="eth1, eth2.10"
                  disabled={!canEdit || saving}
                />
              </div>
              <div>
                <Label>From Policies (one per line: FROM_ZONE:FIREWALL_NAME)</Label>
                <Textarea
                  value={createPolicies}
                  onChange={(event) => setCreatePolicies(event.target.value)}
                  className="min-h-[120px] font-mono text-xs"
                  disabled={!canEdit || saving}
                />
              </div>
              <Button onClick={createZone} disabled={!canEdit || saving}>
                <Plus className="mr-2 h-4 w-4" />
                Create / Upsert Zone
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Edit Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Select Zone</Label>
                <Select value={selectedZoneName || undefined} onValueChange={setSelectedZoneName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedZoneNames.map((zoneName) => (
                      <SelectItem value={zoneName} key={zoneName}>
                        {zoneName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!selectedZone ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  No zones found.
                </div>
              ) : (
                <>
                  <div>
                    <Label>Description</Label>
                    <Input
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div>
                    <Label>Default Action</Label>
                    <Select
                      value={editDefaultAction}
                      onValueChange={(value) => setEditDefaultAction(value as DefaultAction)}
                      disabled={!canEdit || saving}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accept">accept</SelectItem>
                        <SelectItem value="drop">drop</SelectItem>
                        <SelectItem value="reject">reject</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Interfaces (comma-separated)</Label>
                    <Input
                      value={editInterfaces}
                      onChange={(event) => setEditInterfaces(event.target.value)}
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div>
                    <Label>From Policies (one per line: FROM_ZONE:FIREWALL_NAME)</Label>
                    <Textarea
                      value={editPolicies}
                      onChange={(event) => setEditPolicies(event.target.value)}
                      className="min-h-[120px] font-mono text-xs"
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveSelectedZone} disabled={!canEdit || saving}>
                      <Save className="mr-2 h-4 w-4" />
                      Save Zone
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={deleteSelectedZone}
                      disabled={!canEdit || saving}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Zone
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zones Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading zones...</div>
            ) : sortedZoneNames.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No zones configured.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sortedZoneNames.map((zoneName) => {
                  const zone = zones[zoneName];
                  return (
                    <div key={zoneName} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" />
                          <span className="font-semibold">{zoneName}</span>
                        </div>
                        <Badge variant="outline">{zone["default-action"] || "drop"}</Badge>
                      </div>
                      {zone.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{zone.description}</p>
                      )}
                      <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground">Interfaces</p>
                        {zone.interfaces.length === 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
                            <Unplug className="h-3 w-3" />
                            None
                          </p>
                        ) : (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {zone.interfaces.map((iface) => (
                              <Badge variant="secondary" key={`${zoneName}-${iface}`} className="font-mono">
                                {iface}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zone Policies</CardTitle>
          </CardHeader>
          <CardContent>
            {policies.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No zone policies configured.</div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From Zone</TableHead>
                      <TableHead>To Zone</TableHead>
                      <TableHead>Firewall Ruleset</TableHead>
                      <TableHead>Default Action</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.map((policy) => (
                      <TableRow key={`${policy.from_zone}-${policy.to_zone}-${policy.firewall_ruleset}`}>
                        <TableCell className="font-medium">{policy.from_zone}</TableCell>
                        <TableCell className="font-medium">{policy.to_zone}</TableCell>
                        <TableCell className="font-mono">{policy.firewall_ruleset}</TableCell>
                        <TableCell>{policy.default_action || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canEdit || saving}
                            onClick={() => removePolicy(policy.to_zone, policy.from_zone)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
