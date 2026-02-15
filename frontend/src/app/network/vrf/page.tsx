"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { vrfService } from "@/lib/api/vrf";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";

type VrfEntry = {
  name: string;
  table: string;
  description: string;
};

type VrfRouteEntry = {
  vrf: string;
  destination: string;
  interface: string;
  targetVrf: string;
  nextHop: string;
};

const EMPTY_VRF_DRAFT: VrfEntry = {
  name: "",
  table: "",
  description: "",
};

const EMPTY_ROUTE_DRAFT: VrfRouteEntry = {
  vrf: "",
  destination: "",
  interface: "",
  targetVrf: "",
  nextHop: "",
};

function normalizeText(value: string): string {
  return value.trim();
}

function routeKey(route: VrfRouteEntry): string {
  return `${route.vrf}\u001f${route.destination}\u001f${route.interface}`;
}

function vrfEqual(left: VrfEntry, right: VrfEntry): boolean {
  return (
    left.name === right.name &&
    left.table === right.table &&
    left.description === right.description
  );
}

function routeEqual(left: VrfRouteEntry, right: VrfRouteEntry): boolean {
  return (
    left.vrf === right.vrf &&
    left.destination === right.destination &&
    left.interface === right.interface &&
    left.targetVrf === right.targetVrf &&
    left.nextHop === right.nextHop
  );
}

export default function VRFPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.VRF);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [bindToAll, setBindToAll] = useState(false);
  const [vrfs, setVrfs] = useState<VrfEntry[]>([]);
  const [routes, setRoutes] = useState<VrfRouteEntry[]>([]);

  const [currentBindToAll, setCurrentBindToAll] = useState(false);
  const [currentVrfs, setCurrentVrfs] = useState<VrfEntry[]>([]);
  const [currentRoutes, setCurrentRoutes] = useState<VrfRouteEntry[]>([]);

  const [vrfDraft, setVrfDraft] = useState<VrfEntry>(EMPTY_VRF_DRAFT);
  const [routeDraft, setRouteDraft] = useState<VrfRouteEntry>(EMPTY_ROUTE_DRAFT);

  const [interfaceOptions, setInterfaceOptions] = useState<Array<{ value: string; label: string }>>([]);

  const vrfNames = useMemo(() => vrfs.map((entry) => entry.name).sort((a, b) => a.localeCompare(b)), [vrfs]);

  const interfaceLabelByName = useMemo(
    () =>
      interfaceOptions.reduce<Record<string, string>>((acc, item) => {
        acc[item.value] = item.label;
        return acc;
      }, {}),
    [interfaceOptions]
  );

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const [vrfConfig, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        vrfService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const parsedVrfs: VrfEntry[] = Object.values(vrfConfig.vrfs)
        .map((entry) => ({
          name: normalizeText(entry.name),
          table: normalizeText(entry.table),
          description: normalizeText(entry.description || ""),
        }))
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const parsedRoutes: VrfRouteEntry[] = [];
      for (const [vrfName, vrf] of Object.entries(vrfConfig.vrfs)) {
        const routeEntries = vrf.protocols.static.routes;
        for (const [destination, route] of Object.entries(routeEntries)) {
          for (const [ifaceName, iface] of Object.entries(route.interface)) {
            parsedRoutes.push({
              vrf: normalizeText(vrfName),
              destination: normalizeText(destination),
              interface: normalizeText(ifaceName),
              targetVrf: normalizeText(iface.vrf || ""),
              nextHop: normalizeText(route["next-hop"] || ""),
            });
          }
        }
      }

      parsedRoutes.sort((left, right) => {
        const vrfCompare = left.vrf.localeCompare(right.vrf, undefined, { numeric: true });
        if (vrfCompare !== 0) return vrfCompare;
        const destCompare = left.destination.localeCompare(right.destination, undefined, { numeric: true });
        if (destCompare !== 0) return destCompare;
        return left.interface.localeCompare(right.interface, undefined, { numeric: true });
      });

      const names = new Set<string>();
      const descriptionByName = ethernetConfig.interfaces.reduce<Record<string, string | null>>(
        (acc, iface) => {
          acc[iface.name] = iface.description ?? null;
          return acc;
        },
        {}
      );

      ethernetConfig.interfaces.forEach((iface) => names.add(iface.name));
      physicalConfig.interfaces.forEach((iface) => names.add(iface.interface));
      allInterfacesConfig.interfaces.forEach((iface) => names.add(iface.name));
      parsedRoutes.forEach((route) => {
        if (route.interface) names.add(route.interface);
      });

      const normalizedInterfaceOptions = [...names]
        .filter((name) => name !== "lo")
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setInterfaceOptions(normalizedInterfaceOptions);
      setBindToAll(vrfConfig["bind-to-all"]);
      setVrfs(parsedVrfs);
      setRoutes(parsedRoutes);

      setCurrentBindToAll(vrfConfig["bind-to-all"]);
      setCurrentVrfs(parsedVrfs);
      setCurrentRoutes(parsedRoutes);

      setVrfDraft(EMPTY_VRF_DRAFT);
      setRouteDraft({
        ...EMPTY_ROUTE_DRAFT,
        vrf: parsedVrfs[0]?.name || "",
        interface: normalizedInterfaceOptions[0]?.value || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load VRF configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const addVrf = () => {
    setError(null);

    const draft: VrfEntry = {
      name: normalizeText(vrfDraft.name),
      table: normalizeText(vrfDraft.table),
      description: normalizeText(vrfDraft.description),
    };

    if (!draft.name) {
      setError("VRF name is required.");
      return;
    }

    if (!draft.table) {
      setError("VRF table ID is required.");
      return;
    }

    if (vrfs.some((entry) => entry.name === draft.name)) {
      setError("VRF name already exists.");
      return;
    }

    const nextVrfs = [...vrfs, draft].sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true })
    );

    setVrfs(nextVrfs);
    if (!routeDraft.vrf) {
      setRouteDraft((previous) => ({ ...previous, vrf: draft.name }));
    }
    setVrfDraft(EMPTY_VRF_DRAFT);
  };

  const removeVrf = (name: string) => {
    setVrfs((previous) => previous.filter((entry) => entry.name !== name));
    setRoutes((previous) => previous.filter((route) => route.vrf !== name));
    setRouteDraft((previous) => ({
      ...previous,
      vrf: previous.vrf === name ? "" : previous.vrf,
      targetVrf: previous.targetVrf === name ? "" : previous.targetVrf,
    }));
  };

  const addRoute = () => {
    setError(null);

    const draft: VrfRouteEntry = {
      vrf: normalizeText(routeDraft.vrf),
      destination: normalizeText(routeDraft.destination),
      interface: normalizeText(routeDraft.interface),
      targetVrf: normalizeText(routeDraft.targetVrf),
      nextHop: normalizeText(routeDraft.nextHop),
    };

    if (!draft.vrf || !draft.destination || !draft.interface) {
      setError("Route requires VRF, destination, and interface.");
      return;
    }

    const key = routeKey(draft);
    if (routes.some((entry) => routeKey(entry) === key)) {
      setError("Route for this VRF/destination/interface already exists.");
      return;
    }

    setRoutes((previous) =>
      [...previous, draft].sort((left, right) => {
        const vrfCompare = left.vrf.localeCompare(right.vrf, undefined, { numeric: true });
        if (vrfCompare !== 0) return vrfCompare;
        const destCompare = left.destination.localeCompare(right.destination, undefined, { numeric: true });
        if (destCompare !== 0) return destCompare;
        return left.interface.localeCompare(right.interface, undefined, { numeric: true });
      })
    );

    setRouteDraft((previous) => ({
      ...EMPTY_ROUTE_DRAFT,
      vrf: previous.vrf || vrfNames[0] || "",
      interface: previous.interface || interfaceOptions[0]?.value || "",
    }));
  };

  const removeRoute = (index: number) => {
    setRoutes((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      if (currentBindToAll !== bindToAll) {
        if (bindToAll) {
          operations.push("set vrf bind-to-all");
        } else {
          operations.push("delete vrf bind-to-all");
        }
      }

      const currentVrfMap = new Map(currentVrfs.map((entry) => [entry.name, entry]));
      const desiredVrfMap = new Map(vrfs.map((entry) => [entry.name, entry]));

      for (const [name] of currentVrfMap.entries()) {
        if (!desiredVrfMap.has(name)) {
          operations.push(`delete vrf name ${name}`);
        }
      }

      for (const [name, desiredEntry] of desiredVrfMap.entries()) {
        const currentEntry = currentVrfMap.get(name);
        if (currentEntry && vrfEqual(currentEntry, desiredEntry)) {
          continue;
        }

        operations.push(`set vrf name ${name} table ${desiredEntry.table}`);

        if (desiredEntry.description) {
          operations.push(`set vrf name ${name} description ${JSON.stringify(desiredEntry.description)}`);
        } else if (currentEntry?.description) {
          operations.push(`delete vrf name ${name} description`);
        }
      }

      const currentRouteMap = new Map(currentRoutes.map((entry) => [routeKey(entry), entry]));
      const desiredRouteMap = new Map(routes.map((entry) => [routeKey(entry), entry]));

      for (const [key, currentEntry] of currentRouteMap.entries()) {
        if (!desiredRouteMap.has(key)) {
          operations.push(
            `delete vrf name ${currentEntry.vrf} protocols static route ${currentEntry.destination} interface ${currentEntry.interface}`
          );
        }
      }

      for (const [key, desiredEntry] of desiredRouteMap.entries()) {
        const currentEntry = currentRouteMap.get(key);
        if (currentEntry && routeEqual(currentEntry, desiredEntry)) {
          continue;
        }

        operations.push(
          `set vrf name ${desiredEntry.vrf} protocols static route ${desiredEntry.destination} interface ${desiredEntry.interface}`
        );

        if (desiredEntry.targetVrf) {
          operations.push(
            `set vrf name ${desiredEntry.vrf} protocols static route ${desiredEntry.destination} interface ${desiredEntry.interface} vrf ${desiredEntry.targetVrf}`
          );
        } else if (currentEntry?.targetVrf) {
          operations.push(
            `delete vrf name ${desiredEntry.vrf} protocols static route ${desiredEntry.destination} interface ${desiredEntry.interface} vrf`
          );
        }

        if (desiredEntry.nextHop) {
          operations.push(
            `set vrf name ${desiredEntry.vrf} protocols static route ${desiredEntry.destination} next-hop ${desiredEntry.nextHop}`
          );
        } else if (currentEntry?.nextHop) {
          operations.push(
            `delete vrf name ${desiredEntry.vrf} protocols static route ${desiredEntry.destination} next-hop`
          );
        }
      }

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await vrfService.batchConfigure(operations);
      if (!result.success) {
        throw new Error(result.error || "Failed to save VRF configuration");
      }

      setMessage("VRF configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save VRF configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">VRF</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure virtual routing and forwarding instances and per-VRF static routes.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {message && (
          <Card className="border-primary/40">
            <CardContent className="pt-6 text-sm text-primary">{message}</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Global Options</CardTitle>
            <CardDescription>Apply VRF settings that affect all interfaces.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Checkbox
                id="vrf-bind-to-all"
                checked={bindToAll}
                onCheckedChange={(checked) => setBindToAll(Boolean(checked))}
                disabled={!canEdit}
              />
              <Label htmlFor="vrf-bind-to-all">Bind all interfaces to default VRF behavior</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>VRF Instances</CardTitle>
            <CardDescription>Create and manage VRF instances.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="vrf-name">Name</Label>
                <Input
                  id="vrf-name"
                  value={vrfDraft.name}
                  onChange={(event) => setVrfDraft((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="BLUE"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vrf-table">Table</Label>
                <Input
                  id="vrf-table"
                  value={vrfDraft.table}
                  onChange={(event) => setVrfDraft((previous) => ({ ...previous, table: event.target.value }))}
                  placeholder="10"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="vrf-description">Description</Label>
                <Input
                  id="vrf-description"
                  value={vrfDraft.description}
                  onChange={(event) =>
                    setVrfDraft((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="Tenant VRF"
                  disabled={!canEdit}
                />
              </div>
            </div>
            <div>
              <Button type="button" variant="outline" onClick={addVrf} disabled={!canEdit}>
                <Plus className="mr-2 h-4 w-4" />
                Add VRF
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vrfs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No VRF instances configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  vrfs.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell>{entry.table}</TableCell>
                      <TableCell>{entry.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeVrf(entry.name)}
                          disabled={!canEdit}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per-VRF Static Routes</CardTitle>
            <CardDescription>
              Configure static routes inside VRF instances, including interface VRF lookup and next-hop.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>VRF</Label>
                <Select
                  value={routeDraft.vrf || ""}
                  onValueChange={(value) => setRouteDraft((previous) => ({ ...previous, vrf: value }))}
                  disabled={!canEdit || vrfNames.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select VRF" />
                  </SelectTrigger>
                  <SelectContent>
                    {vrfNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Destination</Label>
                <Input
                  value={routeDraft.destination}
                  onChange={(event) =>
                    setRouteDraft((previous) => ({ ...previous, destination: event.target.value }))
                  }
                  placeholder="10.10.0.0/24"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Interface</Label>
                <Select
                  value={routeDraft.interface || ""}
                  onValueChange={(value) => setRouteDraft((previous) => ({ ...previous, interface: value }))}
                  disabled={!canEdit || interfaceOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select interface" />
                  </SelectTrigger>
                  <SelectContent>
                    {interfaceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target VRF</Label>
                <Input
                  value={routeDraft.targetVrf}
                  onChange={(event) =>
                    setRouteDraft((previous) => ({ ...previous, targetVrf: event.target.value }))
                  }
                  placeholder="BLUE"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Next Hop</Label>
                <Input
                  value={routeDraft.nextHop}
                  onChange={(event) =>
                    setRouteDraft((previous) => ({ ...previous, nextHop: event.target.value }))
                  }
                  placeholder="192.0.2.1"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div>
              <Button type="button" variant="outline" onClick={addRoute} disabled={!canEdit || vrfNames.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Add Route
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>VRF</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>Target VRF</TableHead>
                  <TableHead>Next Hop</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No static routes configured inside VRFs.
                    </TableCell>
                  </TableRow>
                ) : (
                  routes.map((route, index) => (
                    <TableRow key={`${routeKey(route)}:${index}`}>
                      <TableCell>
                        <Badge variant="secondary">{route.vrf}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{route.destination}</TableCell>
                      <TableCell>{interfaceLabelByName[route.interface] || route.interface}</TableCell>
                      <TableCell>{route.targetVrf || "-"}</TableCell>
                      <TableCell>{route.nextHop || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRoute(index)}
                          disabled={!canEdit}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
