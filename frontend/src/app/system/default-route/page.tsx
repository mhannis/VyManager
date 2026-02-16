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
  systemDefaultRouteService,
  type DefaultRouteNextHop,
  type SystemDefaultRouteConfig,
} from "@/lib/api/system-default-route";

interface NextHopFormState {
  address: string;
  distance: string;
  disable: boolean;
}

const EMPTY_FORM: NextHopFormState = {
  address: "",
  distance: "",
  disable: false,
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function isIpv4(value: string): boolean {
  const parts = value.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function normalizeNextHops(values: DefaultRouteNextHop[]): DefaultRouteNextHop[] {
  const dedupe = new Map<string, DefaultRouteNextHop>();
  for (const entry of values) {
    const address = entry.address.trim();
    if (!address) continue;
    dedupe.set(address, {
      address,
      distance: entry.distance.trim(),
      disable: entry.disable,
    });
  }
  return Array.from(dedupe.values()).sort((left, right) => left.address.localeCompare(right.address));
}

function buildOperations(current: SystemDefaultRouteConfig | null, formEntries: DefaultRouteNextHop[]): string[] {
  const operations: string[] = [];
  const currentSafe = normalizeNextHops(current?.nextHops || []);
  const desired = normalizeNextHops(formEntries);

  const currentMap = new Map(currentSafe.map((entry) => [entry.address, entry]));
  const desiredMap = new Map(desired.map((entry) => [entry.address, entry]));

  for (const [address, existing] of currentMap.entries()) {
    const wanted = desiredMap.get(address);
    if (!wanted || wanted.distance !== existing.distance || wanted.disable !== existing.disable) {
      operations.push(`delete protocols static route 0.0.0.0/0 next-hop ${quoteCliValue(address)}`);
    }
  }

  for (const [address, wanted] of desiredMap.entries()) {
    const existing = currentMap.get(address);
    if (existing && existing.distance === wanted.distance && existing.disable === wanted.disable) continue;

    operations.push(`set protocols static route 0.0.0.0/0 next-hop ${quoteCliValue(address)}`);
    if (wanted.distance) {
      operations.push(
        `set protocols static route 0.0.0.0/0 next-hop ${quoteCliValue(address)} distance ${quoteCliValue(wanted.distance)}`,
      );
    }
    if (wanted.disable) {
      operations.push(`set protocols static route 0.0.0.0/0 next-hop ${quoteCliValue(address)} disable`);
    }
  }

  return operations;
}

export default function SystemDefaultRoutePage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemDefaultRouteConfig | null>(null);
  const [nextHops, setNextHops] = useState<DefaultRouteNextHop[]>([]);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [form, setForm] = useState<NextHopFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemDefaultRouteService.getConfig(refresh);
      setConfig(response);
      setNextHops(normalizeNextHops(response.nextHops));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load default route settings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const hasChanges = useMemo(() => {
    const normalizedCurrent = JSON.stringify(normalizeNextHops(config?.nextHops || []));
    const normalizedCandidate = JSON.stringify(normalizeNextHops(nextHops));
    return normalizedCurrent !== normalizedCandidate;
  }, [config, nextHops]);

  const resetForm = () => {
    setEditingAddress(null);
    setForm(EMPTY_FORM);
    setError(null);
    setSuccess(null);
  };

  const editNextHop = (entry: DefaultRouteNextHop) => {
    setEditingAddress(entry.address);
    setForm({
      address: entry.address,
      distance: entry.distance || "",
      disable: entry.disable,
    });
    setError(null);
    setSuccess(null);
  };

  const upsertNextHop = () => {
    const address = form.address.trim();
    const distance = form.distance.trim();
    if (!address) {
      setError("Next-hop address is required.");
      return;
    }
    if (!isIpv4(address)) {
      setError("Next-hop address must be a valid IPv4 address.");
      return;
    }
    if (distance && !/^\d+$/.test(distance)) {
      setError("Distance must be a whole number.");
      return;
    }
    if (editingAddress && editingAddress !== address) {
      setError("Renaming next-hop addresses is not supported. Add a new one and delete the old one.");
      return;
    }

    setNextHops((previous) => {
      const filtered = previous.filter((entry) => entry.address !== address);
      return normalizeNextHops([...filtered, { address, distance, disable: form.disable }]);
    });
    setSuccess(editingAddress ? `Updated ${address}.` : `Added ${address}.`);
    setError(null);
    setEditingAddress(address);
  };

  const removeNextHop = (address: string) => {
    setNextHops((previous) => previous.filter((entry) => entry.address !== address));
    if (editingAddress === address) resetForm();
  };

  const saveConfig = async () => {
    const operations = buildOperations(config, nextHops);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemDefaultRouteService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected default route changes.");
      }
      await loadData(true);
      setSuccess("Default route settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save default route settings.");
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
            <h1 className="text-3xl font-bold">Default Route</h1>
            <p className="mt-1 text-muted-foreground">
              Manage default gateway next-hops (`0.0.0.0/0`) from a dedicated workflow.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.systemDefaultRoute} />
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

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Configured Next-Hops</CardTitle>
              <CardDescription>Default route entries under `protocols static route 0.0.0.0/0`.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">Next-Hops: {nextHops.length}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadData(true)}
                  disabled={refreshing || saving}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nextHops.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No default route next-hops configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      nextHops.map((entry) => (
                        <TableRow key={entry.address}>
                          <TableCell className="font-mono text-xs">{entry.address}</TableCell>
                          <TableCell>{entry.distance || "-"}</TableCell>
                          <TableCell>{entry.disable ? "Disabled" : "Enabled"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editNextHop(entry)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => removeNextHop(entry.address)}
                                disabled={!canEdit || saving}
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
              <CardTitle>{editingAddress ? `Edit ${editingAddress}` : "Add Next-Hop"}</CardTitle>
              <CardDescription>Configure next-hop and optional distance for the default route.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="default-route-address">Next-Hop Address</Label>
                <Input
                  id="default-route-address"
                  value={form.address}
                  onChange={(event) => setForm((previous) => ({ ...previous, address: event.target.value }))}
                  placeholder="192.168.1.1"
                  className="font-mono"
                  disabled={!canEdit || saving || Boolean(editingAddress)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default-route-distance">Distance</Label>
                <Input
                  id="default-route-distance"
                  value={form.distance}
                  onChange={(event) => setForm((previous) => ({ ...previous, distance: event.target.value }))}
                  placeholder="10"
                  disabled={!canEdit || saving}
                />
              </div>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={form.disable}
                  disabled={!canEdit || saving}
                  onCheckedChange={(value) => setForm((previous) => ({ ...previous, disable: value === true }))}
                />
                Disable this next-hop
              </label>

              {!canEdit && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  You have read-only permissions for System settings.
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" onClick={upsertNextHop} disabled={!canEdit || saving} className="flex-1">
                  {editingAddress ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingAddress ? "Update Next-Hop" : "Add Next-Hop"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Badge variant={hasChanges ? "default" : "secondary"}>
            {hasChanges ? "Unsaved Changes" : "In Sync"}
          </Badge>
          <Button type="button" onClick={saveConfig} disabled={!canEdit || saving || !hasChanges}>
            <Save className="mr-2 h-4 w-4" />
            Save Default Route
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

