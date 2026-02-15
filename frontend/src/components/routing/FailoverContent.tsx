"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { failoverService } from "@/lib/api/failover";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";

type InterfaceOption = {
  value: string;
  label: string;
};

type FailoverRouteEntry = {
  subnet: string;
  nextHop: string;
  checkTarget: string;
  checkTimeout: string;
  checkType: string;
  checkPolicy: string;
  interface: string;
  metric: string;
};

type FailoverState = {
  routes: FailoverRouteEntry[];
};

const EMPTY_ROUTE: FailoverRouteEntry = {
  subnet: "",
  nextHop: "",
  checkTarget: "",
  checkTimeout: "",
  checkType: "",
  checkPolicy: "",
  interface: "",
  metric: "",
};

const CHECK_TYPE_OPTIONS = ["icmp", "tcp", "bfd"];

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseRoutes(root: Record<string, unknown>): FailoverRouteEntry[] {
  const rows: FailoverRouteEntry[] = [];
  const routeRoot = asObject(root.route);

  for (const [subnet, routeCfg] of Object.entries(routeRoot)) {
    const nextHopRoot = asObject(asObject(routeCfg)["next-hop"] ?? asObject(routeCfg).next_hop);
    for (const [nextHop, nextHopCfg] of Object.entries(nextHopRoot)) {
      const cfg = asObject(nextHopCfg);
      const check = asObject(cfg.check);
      rows.push({
        subnet,
        nextHop,
        checkTarget: asString(check.target),
        checkTimeout: asString(check.timeout),
        checkType: asString(check.type),
        checkPolicy: asString(check.policy),
        interface: asString(cfg.interface),
        metric: asString(cfg.metric),
      });
    }
  }

  return rows.sort((left, right) => {
    const subnetOrder = left.subnet.localeCompare(right.subnet, undefined, { numeric: true });
    if (subnetOrder !== 0) return subnetOrder;
    return left.nextHop.localeCompare(right.nextHop, undefined, { numeric: true });
  });
}

function normalizeRoute(entry: FailoverRouteEntry): FailoverRouteEntry {
  return {
    subnet: entry.subnet.trim(),
    nextHop: entry.nextHop.trim(),
    checkTarget: entry.checkTarget.trim(),
    checkTimeout: entry.checkTimeout.trim(),
    checkType: entry.checkType.trim(),
    checkPolicy: entry.checkPolicy.trim(),
    interface: entry.interface.trim(),
    metric: entry.metric.trim(),
  };
}

function routeKey(entry: FailoverRouteEntry): string {
  return `${entry.subnet}|${entry.nextHop}`;
}

function routeEquals(left: FailoverRouteEntry, right: FailoverRouteEntry): boolean {
  return (
    left.subnet === right.subnet &&
    left.nextHop === right.nextHop &&
    left.checkTarget === right.checkTarget &&
    left.checkTimeout === right.checkTimeout &&
    left.checkType === right.checkType &&
    left.checkPolicy === right.checkPolicy &&
    left.interface === right.interface &&
    left.metric === right.metric
  );
}

function routeSetCommands(entry: FailoverRouteEntry): string[] {
  const routeBase = `protocols failover route ${entry.subnet} next-hop ${entry.nextHop}`;
  const commands = [`set ${routeBase}`];

  if (entry.checkTarget) {
    commands.push(`set ${routeBase} check target ${entry.checkTarget}`);
  }
  if (entry.checkTimeout) {
    commands.push(`set ${routeBase} check timeout ${entry.checkTimeout}`);
  }
  if (entry.checkType) {
    commands.push(`set ${routeBase} check type ${entry.checkType}`);
  }
  if (entry.checkPolicy) {
    commands.push(`set ${routeBase} check policy ${entry.checkPolicy}`);
  }
  if (entry.interface) {
    commands.push(`set ${routeBase} interface ${entry.interface}`);
  }
  if (entry.metric) {
    commands.push(`set ${routeBase} metric ${entry.metric}`);
  }

  return commands;
}

export function FailoverContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<FailoverState | null>(null);
  const [routes, setRoutes] = useState<FailoverRouteEntry[]>([]);
  const [routeDraft, setRouteDraft] = useState<FailoverRouteEntry>(EMPTY_ROUTE);

  const [interfaceOptions, setInterfaceOptions] = useState<InterfaceOption[]>([]);
  const interfaceLabelByName = useMemo(
    () =>
      interfaceOptions.reduce<Record<string, string>>((acc, option) => {
        acc[option.value] = option.label;
        return acc;
      }, {}),
    [interfaceOptions]
  );

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const [failoverConfig, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        failoverService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const root = asObject((failoverConfig as { failover?: unknown }).failover);
      const parsedRoutes = parseRoutes(root);
      const parsedState: FailoverState = { routes: parsedRoutes };

      setCurrentState(parsedState);
      setRoutes(parsedRoutes);

      const ethernetInterfaces =
        (ethernetConfig as { interfaces?: Array<{ name: string; description?: string | null }> }).interfaces ?? [];
      const descriptionByName = ethernetInterfaces.reduce<Record<string, string | null>>((acc, iface) => {
        acc[iface.name] = iface.description ?? null;
        return acc;
      }, {});

      const names = new Set<string>();
      ethernetInterfaces.forEach((iface) => names.add(iface.name));
      ((physicalConfig as { interfaces?: Array<{ interface: string }> }).interfaces ?? []).forEach((iface) =>
        names.add(iface.interface)
      );
      ((allInterfacesConfig as { interfaces?: Array<{ name: string }> }).interfaces ?? []).forEach((iface) =>
        names.add(iface.name)
      );
      parsedRoutes.forEach((entry) => {
        if (entry.interface) names.add(entry.interface);
      });

      const options = [...names]
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setInterfaceOptions(options);
      setRouteDraft((prev) => {
        if (prev.interface) return prev;
        return {
          ...prev,
          interface: options[0]?.value || "",
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load failover configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddOrUpdateRoute = () => {
    const normalized = normalizeRoute(routeDraft);
    if (!normalized.subnet) {
      setError("Route subnet is required.");
      return;
    }
    if (!normalized.nextHop) {
      setError("Next-hop address is required.");
      return;
    }
    if (!normalized.checkTarget) {
      setError("Check target is required for failover route monitoring.");
      return;
    }

    setError(null);
    setRoutes((prev) => {
      const next = [...prev.filter((item) => routeKey(item) !== routeKey(normalized)), normalized];
      return next.sort((left, right) => {
        const subnetOrder = left.subnet.localeCompare(right.subnet, undefined, { numeric: true });
        if (subnetOrder !== 0) return subnetOrder;
        return left.nextHop.localeCompare(right.nextHop, undefined, { numeric: true });
      });
    });
  };

  const handleEditRoute = (entry: FailoverRouteEntry) => {
    setRouteDraft(entry);
  };

  const handleDeleteRoute = (entry: FailoverRouteEntry) => {
    setRoutes((prev) => prev.filter((item) => routeKey(item) !== routeKey(entry)));
    if (routeKey(routeDraft) === routeKey(entry)) {
      setRouteDraft(EMPTY_ROUTE);
    }
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const currentMap = new Map(currentState.routes.map((entry) => [routeKey(entry), normalizeRoute(entry)]));
      const desiredMap = new Map(
        routes
          .map(normalizeRoute)
          .filter((entry) => entry.subnet && entry.nextHop)
          .map((entry) => [routeKey(entry), entry])
      );

      for (const [key, currentEntry] of currentMap) {
        if (!desiredMap.has(key)) {
          operations.push(
            `delete protocols failover route ${currentEntry.subnet} next-hop ${currentEntry.nextHop}`
          );
        }
      }

      for (const [key, desiredEntry] of desiredMap) {
        const currentEntry = currentMap.get(key);
        if (currentEntry && routeEquals(currentEntry, desiredEntry)) {
          continue;
        }

        if (currentEntry) {
          operations.push(
            `delete protocols failover route ${currentEntry.subnet} next-hop ${currentEntry.nextHop}`
          );
        }
        operations.push(...routeSetCommands(desiredEntry));
      }

      const finalOperations = [...new Set(operations.map((operation) => operation.trim()).filter(Boolean))];
      if (finalOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await failoverService.batchConfigure({ operations: finalOperations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply failover configuration");
      }

      setMessage(`Applied ${finalOperations.length} failover operation${finalOperations.length === 1 ? "" : "s"}.`);
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save failover configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Failover</CardTitle>
          <CardDescription>Loading failover route configuration...</CardDescription>
        </CardHeader>
        <CardContent>
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Failover Routes</CardTitle>
            <CardDescription>
              Configure monitored failover routes for subnet/next-hop pairs.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="text-sm text-red-500">{error}</div>}
          {message && <div className="text-sm text-emerald-500">{message}</div>}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Route Subnet</Label>
              <Input
                value={routeDraft.subnet}
                placeholder="0.0.0.0/0"
                onChange={(event) => setRouteDraft((prev) => ({ ...prev, subnet: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Next-Hop</Label>
              <Input
                value={routeDraft.nextHop}
                placeholder="192.0.2.1"
                onChange={(event) => setRouteDraft((prev) => ({ ...prev, nextHop: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Check Target</Label>
              <Input
                value={routeDraft.checkTarget}
                placeholder="192.0.2.1"
                onChange={(event) => setRouteDraft((prev) => ({ ...prev, checkTarget: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Check Timeout</Label>
              <Input
                value={routeDraft.checkTimeout}
                placeholder="5"
                onChange={(event) => setRouteDraft((prev) => ({ ...prev, checkTimeout: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Check Type</Label>
              <Select
                value={routeDraft.checkType || ""}
                onValueChange={(value) => setRouteDraft((prev) => ({ ...prev, checkType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {CHECK_TYPE_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Check Policy</Label>
              <Input
                value={routeDraft.checkPolicy}
                placeholder="WAN-MONITOR"
                onChange={(event) => setRouteDraft((prev) => ({ ...prev, checkPolicy: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Interface</Label>
              <Select
                value={routeDraft.interface || ""}
                onValueChange={(value) => setRouteDraft((prev) => ({ ...prev, interface: value }))}
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
              <Label>Metric</Label>
              <Input
                value={routeDraft.metric}
                placeholder="10"
                onChange={(event) => setRouteDraft((prev) => ({ ...prev, metric: event.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={handleAddOrUpdateRoute}>
              <Plus className="mr-2 h-4 w-4" />
              Add / Update Route
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRouteDraft(EMPTY_ROUTE)}>
              Clear Draft
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subnet</TableHead>
                  <TableHead>Next-Hop</TableHead>
                  <TableHead>Check</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead className="w-[160px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No failover routes configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  routes.map((entry) => (
                    <TableRow key={routeKey(entry)}>
                      <TableCell className="font-mono text-xs">{entry.subnet}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.nextHop}</TableCell>
                      <TableCell className="text-xs">
                        <div>{entry.checkType || "icmp"}</div>
                        <div className="text-muted-foreground">{entry.checkTarget || "-"}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.interface
                          ? interfaceLabelByName[entry.interface] || entry.interface
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs">{entry.metric || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleEditRoute(entry)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteRoute(entry)}>
                            <Trash2 className="h-4 w-4" />
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
    </div>
  );
}
