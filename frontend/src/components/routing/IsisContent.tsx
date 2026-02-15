"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { isisService } from "@/lib/api/isis";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { routeMapService } from "@/lib/api/route-map";
import { routingProtocolGuides } from "@/lib/help/routingProtocolGuides";
import { formatInterfaceDisplayName } from "@/lib/utils";

type InterfaceOption = {
  value: string;
  label: string;
};

type RedistributeEntry = {
  source: string;
  level: "level-1" | "level-2";
  metric: string;
  routeMap: string;
};

type InterfaceEntry = {
  interface: string;
  circuitType: string;
  helloInterval: string;
  helloMultiplier: string;
  metric: string;
  networkPointToPoint: boolean;
  passive: boolean;
  priority: string;
  psnpInterval: string;
  helloPadding: boolean;
  noThreeWayHandshake: boolean;
};

type IsisGlobals = {
  net: string;
  level: string;
  lspMtu: string;
  metricStyle: string;
  dynamicHostname: boolean;
  purgeOriginator: boolean;
  setAttachedBit: boolean;
  setOverloadBit: boolean;
  ldpSync: boolean;
  ldpSyncHolddown: string;
  lspGenInterval: string;
  lspRefreshInterval: string;
  maxLspLifetime: string;
  spfInterval: string;
};

type IsisState = {
  globals: IsisGlobals;
  interfaces: InterfaceEntry[];
  redistribute: RedistributeEntry[];
};

const REDISTRIBUTE_SOURCES = [
  "babel",
  "bgp",
  "connected",
  "eigrp",
  "isis",
  "kernel",
  "nhrp",
  "openfabric",
  "rip",
  "sharp",
  "static",
  "table",
] as const;

const ISIS_LEVELS = ["level-1", "level-1-2", "level-2"] as const;
const METRIC_STYLES = ["narrow", "transition", "wide"] as const;
const CIRCUIT_TYPES = ["level-1", "level-1-2", "level-2-only"] as const;

const EMPTY_GLOBALS: IsisGlobals = {
  net: "",
  level: "",
  lspMtu: "",
  metricStyle: "",
  dynamicHostname: false,
  purgeOriginator: false,
  setAttachedBit: false,
  setOverloadBit: false,
  ldpSync: false,
  ldpSyncHolddown: "",
  lspGenInterval: "",
  lspRefreshInterval: "",
  maxLspLifetime: "",
  spfInterval: "",
};

const EMPTY_INTERFACE: InterfaceEntry = {
  interface: "",
  circuitType: "",
  helloInterval: "",
  helloMultiplier: "",
  metric: "",
  networkPointToPoint: false,
  passive: false,
  priority: "",
  psnpInterval: "",
  helloPadding: false,
  noThreeWayHandshake: false,
};

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

function parseDirectOrKey(value: unknown): string {
  const direct = asString(value);
  if (direct) {
    return direct;
  }
  const root = asObject(value);
  const first = Object.keys(root)[0];
  return first || "";
}

function parseGlobals(root: Record<string, unknown>): IsisGlobals {
  const ldpSync = asObject(root["ldp-sync"]);
  return {
    net: parseDirectOrKey(root.net),
    level: parseDirectOrKey(root.level),
    lspMtu: asString(root["lsp-mtu"] ?? root.lsp_mtu),
    metricStyle: parseDirectOrKey(root["metric-style"] ?? root.metric_style),
    dynamicHostname: Object.prototype.hasOwnProperty.call(root, "dynamic-hostname"),
    purgeOriginator: Object.prototype.hasOwnProperty.call(root, "purge-originator"),
    setAttachedBit: Object.prototype.hasOwnProperty.call(root, "set-attached-bit"),
    setOverloadBit: Object.prototype.hasOwnProperty.call(root, "set-overload-bit"),
    ldpSync: Object.prototype.hasOwnProperty.call(root, "ldp-sync"),
    ldpSyncHolddown: asString(ldpSync.holddown),
    lspGenInterval: asString(root["lsp-gen-interval"] ?? root.lsp_gen_interval),
    lspRefreshInterval: asString(root["lsp-refresh-interval"] ?? root.lsp_refresh_interval),
    maxLspLifetime: asString(root["max-lsp-lifetime"] ?? root.max_lsp_lifetime),
    spfInterval: asString(root["spf-interval"] ?? root.spf_interval),
  };
}

function parseInterfaces(root: Record<string, unknown>): InterfaceEntry[] {
  const rows: InterfaceEntry[] = [];
  const interfaceRoot = asObject(root.interface);

  for (const [iface, config] of Object.entries(interfaceRoot)) {
    const cfg = asObject(config);
    const network = asObject(cfg.network);

    rows.push({
      interface: iface,
      circuitType: parseDirectOrKey(cfg["circuit-type"] ?? cfg.circuit_type),
      helloInterval: asString(cfg["hello-interval"] ?? cfg.hello_interval),
      helloMultiplier: asString(cfg["hello-multiplier"] ?? cfg.hello_multiplier),
      metric: asString(cfg.metric),
      networkPointToPoint: parseDirectOrKey(network) === "point-to-point",
      passive: Object.prototype.hasOwnProperty.call(cfg, "passive"),
      priority: asString(cfg.priority),
      psnpInterval: asString(cfg["psnp-interval"] ?? cfg.psnp_interval),
      helloPadding: Object.prototype.hasOwnProperty.call(cfg, "hello-padding"),
      noThreeWayHandshake: Object.prototype.hasOwnProperty.call(cfg, "no-three-way-handshake"),
    });
  }

  return rows.sort((a, b) => a.interface.localeCompare(b.interface, undefined, { numeric: true }));
}

function parseRedistribute(root: Record<string, unknown>): RedistributeEntry[] {
  const rows: RedistributeEntry[] = [];
  const ipv4Root = asObject(asObject(root.redistribute).ipv4);

  for (const [source, sourceCfg] of Object.entries(ipv4Root)) {
    const sourceRoot = asObject(sourceCfg);
    for (const level of ["level-1", "level-2"] as const) {
      if (!Object.prototype.hasOwnProperty.call(sourceRoot, level)) {
        continue;
      }
      const levelRoot = asObject(sourceRoot[level]);
      rows.push({
        source,
        level,
        metric: asString(levelRoot.metric),
        routeMap: asString(levelRoot["route-map"] ?? levelRoot.route_map),
      });
    }
  }

  return rows.sort((a, b) => {
    const s = a.source.localeCompare(b.source);
    if (s !== 0) return s;
    return a.level.localeCompare(b.level);
  });
}

function normalizeInterface(entry: InterfaceEntry): InterfaceEntry {
  return {
    interface: entry.interface.trim(),
    circuitType: entry.circuitType.trim(),
    helloInterval: entry.helloInterval.trim(),
    helloMultiplier: entry.helloMultiplier.trim(),
    metric: entry.metric.trim(),
    networkPointToPoint: Boolean(entry.networkPointToPoint),
    passive: Boolean(entry.passive),
    priority: entry.priority.trim(),
    psnpInterval: entry.psnpInterval.trim(),
    helloPadding: Boolean(entry.helloPadding),
    noThreeWayHandshake: Boolean(entry.noThreeWayHandshake),
  };
}

function normalizeRedistribute(entry: RedistributeEntry): RedistributeEntry {
  return {
    source: entry.source.trim(),
    level: entry.level,
    metric: entry.metric.trim(),
    routeMap: entry.routeMap.trim(),
  };
}

function interfaceEqual(a: InterfaceEntry, b: InterfaceEntry): boolean {
  return (
    a.interface === b.interface &&
    a.circuitType === b.circuitType &&
    a.helloInterval === b.helloInterval &&
    a.helloMultiplier === b.helloMultiplier &&
    a.metric === b.metric &&
    a.networkPointToPoint === b.networkPointToPoint &&
    a.passive === b.passive &&
    a.priority === b.priority &&
    a.psnpInterval === b.psnpInterval &&
    a.helloPadding === b.helloPadding &&
    a.noThreeWayHandshake === b.noThreeWayHandshake
  );
}

function interfaceSetCommands(entry: InterfaceEntry): string[] {
  const iface = entry.interface;
  const commands: string[] = [`set protocols isis interface ${iface}`];

  if (entry.circuitType) {
    commands.push(`set protocols isis interface ${iface} circuit-type ${entry.circuitType}`);
  }
  if (entry.helloInterval) {
    commands.push(`set protocols isis interface ${iface} hello-interval ${entry.helloInterval}`);
  }
  if (entry.helloMultiplier) {
    commands.push(`set protocols isis interface ${iface} hello-multiplier ${entry.helloMultiplier}`);
  }
  if (entry.metric) {
    commands.push(`set protocols isis interface ${iface} metric ${entry.metric}`);
  }
  if (entry.networkPointToPoint) {
    commands.push(`set protocols isis interface ${iface} network point-to-point`);
  }
  if (entry.passive) {
    commands.push(`set protocols isis interface ${iface} passive`);
  }
  if (entry.priority) {
    commands.push(`set protocols isis interface ${iface} priority ${entry.priority}`);
  }
  if (entry.psnpInterval) {
    commands.push(`set protocols isis interface ${iface} psnp-interval ${entry.psnpInterval}`);
  }
  if (entry.helloPadding) {
    commands.push(`set protocols isis interface ${iface} hello-padding`);
  }
  if (entry.noThreeWayHandshake) {
    commands.push(`set protocols isis interface ${iface} no-three-way-handshake`);
  }

  return commands;
}

export function IsisContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<IsisState | null>(null);

  const [globals, setGlobals] = useState<IsisGlobals>(EMPTY_GLOBALS);
  const [interfaces, setInterfaces] = useState<InterfaceEntry[]>([]);
  const [redistribute, setRedistribute] = useState<RedistributeEntry[]>([]);

  const [interfaceDraft, setInterfaceDraft] = useState<InterfaceEntry>(EMPTY_INTERFACE);
  const [redistributeDraft, setRedistributeDraft] = useState<RedistributeEntry>({
    source: REDISTRIBUTE_SOURCES[0],
    level: "level-2",
    metric: "",
    routeMap: "",
  });

  const [interfaceOptions, setInterfaceOptions] = useState<InterfaceOption[]>([]);
  const [routeMapNames, setRouteMapNames] = useState<string[]>([]);

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
      const [isisConfig, ethernetConfig, physicalConfig, allInterfacesConfig, routeMapConfig] =
        await Promise.all([
          isisService.getConfig(refresh),
          ethernetService.getConfig().catch(() => ({ interfaces: [] })),
          showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
          showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
          routeMapService.getConfig().catch(() => ({ route_maps: [], total: 0 })),
        ]);

      const root = asObject((isisConfig as { isis?: unknown }).isis);

      const parsedInterfaces = parseInterfaces(root);
      const parsedState: IsisState = {
        globals: parseGlobals(root),
        interfaces: parsedInterfaces,
        redistribute: parseRedistribute(root),
      };

      setCurrentState(parsedState);
      setGlobals(parsedState.globals);
      setInterfaces(parsedState.interfaces);
      setRedistribute(parsedState.redistribute);

      const ethIfaces = (ethernetConfig as { interfaces?: Array<{ name: string; description?: string | null }> })
        .interfaces ?? [];
      const descriptionByName = ethIfaces.reduce<Record<string, string | null>>((acc, iface) => {
        acc[iface.name] = iface.description ?? null;
        return acc;
      }, {});

      const names = new Set<string>();
      ethIfaces.forEach((iface) => names.add(iface.name));
      ((physicalConfig as { interfaces?: Array<{ interface: string }> }).interfaces ?? []).forEach((iface) =>
        names.add(iface.interface)
      );
      ((allInterfacesConfig as { interfaces?: Array<{ name: string }> }).interfaces ?? []).forEach((iface) =>
        names.add(iface.name)
      );
      parsedInterfaces.forEach((iface) => names.add(iface.interface));

      const options = [...names]
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

      setInterfaceOptions(options);
      setInterfaceDraft((prev) => {
        if (prev.interface) return prev;
        return { ...prev, interface: options[0]?.value || "" };
      });

      setRouteMapNames(
        ((routeMapConfig as { route_maps?: Array<{ name: string }> }).route_maps ?? [])
          .map((item) => item.name)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load IS-IS configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddOrUpdateInterface = () => {
    const normalized = normalizeInterface(interfaceDraft);
    if (!normalized.interface) {
      setError("Interface is required.");
      return;
    }

    setError(null);
    setInterfaces((prev) => {
      const without = prev.filter((item) => item.interface !== normalized.interface);
      return [...without, normalized].sort((a, b) =>
        a.interface.localeCompare(b.interface, undefined, { numeric: true })
      );
    });
  };

  const handleAddOrUpdateRedistribute = () => {
    const normalized = normalizeRedistribute(redistributeDraft);
    if (!normalized.source || !normalized.level) {
      setError("Redistribute source and level are required.");
      return;
    }

    setError(null);
    setRedistribute((prev) => {
      const key = `${normalized.source}|${normalized.level}`;
      const without = prev.filter((item) => `${item.source}|${item.level}` !== key);
      return [...without, normalized].sort((a, b) => {
        const s = a.source.localeCompare(b.source);
        if (s !== 0) return s;
        return a.level.localeCompare(b.level);
      });
    });
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const applyScalar = (
        current: string,
        desired: string,
        setCommand: (value: string) => string,
        deleteCommand: string
      ) => {
        if (current === desired) return;
        if (desired) {
          operations.push(setCommand(desired));
        } else {
          operations.push(deleteCommand);
        }
      };

      applyScalar(
        currentState.globals.net,
        globals.net.trim(),
        (value) => `set protocols isis net ${value}`,
        "delete protocols isis net"
      );

      applyScalar(
        currentState.globals.level,
        globals.level.trim(),
        (value) => `set protocols isis level ${value}`,
        "delete protocols isis level"
      );

      applyScalar(
        currentState.globals.lspMtu,
        globals.lspMtu.trim(),
        (value) => `set protocols isis lsp-mtu ${value}`,
        "delete protocols isis lsp-mtu"
      );

      applyScalar(
        currentState.globals.metricStyle,
        globals.metricStyle.trim(),
        (value) => `set protocols isis metric-style ${value}`,
        "delete protocols isis metric-style"
      );

      applyScalar(
        currentState.globals.ldpSyncHolddown,
        globals.ldpSyncHolddown.trim(),
        (value) => `set protocols isis ldp-sync holddown ${value}`,
        "delete protocols isis ldp-sync holddown"
      );

      applyScalar(
        currentState.globals.lspGenInterval,
        globals.lspGenInterval.trim(),
        (value) => `set protocols isis lsp-gen-interval ${value}`,
        "delete protocols isis lsp-gen-interval"
      );

      applyScalar(
        currentState.globals.lspRefreshInterval,
        globals.lspRefreshInterval.trim(),
        (value) => `set protocols isis lsp-refresh-interval ${value}`,
        "delete protocols isis lsp-refresh-interval"
      );

      applyScalar(
        currentState.globals.maxLspLifetime,
        globals.maxLspLifetime.trim(),
        (value) => `set protocols isis max-lsp-lifetime ${value}`,
        "delete protocols isis max-lsp-lifetime"
      );

      applyScalar(
        currentState.globals.spfInterval,
        globals.spfInterval.trim(),
        (value) => `set protocols isis spf-interval ${value}`,
        "delete protocols isis spf-interval"
      );

      const applyBoolean = (
        current: boolean,
        desired: boolean,
        setCommand: string,
        deleteCommand: string
      ) => {
        if (current === desired) return;
        operations.push(desired ? setCommand : deleteCommand);
      };

      applyBoolean(
        currentState.globals.dynamicHostname,
        globals.dynamicHostname,
        "set protocols isis dynamic-hostname",
        "delete protocols isis dynamic-hostname"
      );
      applyBoolean(
        currentState.globals.purgeOriginator,
        globals.purgeOriginator,
        "set protocols isis purge-originator",
        "delete protocols isis purge-originator"
      );
      applyBoolean(
        currentState.globals.setAttachedBit,
        globals.setAttachedBit,
        "set protocols isis set-attached-bit",
        "delete protocols isis set-attached-bit"
      );
      applyBoolean(
        currentState.globals.setOverloadBit,
        globals.setOverloadBit,
        "set protocols isis set-overload-bit",
        "delete protocols isis set-overload-bit"
      );
      applyBoolean(
        currentState.globals.ldpSync,
        globals.ldpSync,
        "set protocols isis ldp-sync",
        "delete protocols isis ldp-sync"
      );

      const currentInterfaceMap = new Map(
        currentState.interfaces.map((entry) => [entry.interface, entry])
      );
      const desiredInterfaceMap = new Map(
        interfaces
          .map(normalizeInterface)
          .filter((entry) => entry.interface)
          .map((entry) => [entry.interface, entry])
      );

      for (const [iface] of currentInterfaceMap) {
        if (!desiredInterfaceMap.has(iface)) {
          operations.push(`delete protocols isis interface ${iface}`);
        }
      }

      for (const [iface, desiredEntry] of desiredInterfaceMap) {
        const currentEntry = currentInterfaceMap.get(iface);
        if (!currentEntry || !interfaceEqual(currentEntry, desiredEntry)) {
          if (currentEntry) {
            operations.push(`delete protocols isis interface ${iface}`);
          }
          operations.push(...interfaceSetCommands(desiredEntry));
        }
      }

      const currentRedistributeMap = new Map(
        currentState.redistribute.map((entry) => [`${entry.source}|${entry.level}`, entry])
      );
      const desiredRedistributeMap = new Map(
        redistribute
          .map(normalizeRedistribute)
          .filter((entry) => entry.source && entry.level)
          .map((entry) => [`${entry.source}|${entry.level}`, entry])
      );

      for (const [key, currentEntry] of currentRedistributeMap) {
        if (!desiredRedistributeMap.has(key)) {
          operations.push(
            `delete protocols isis redistribute ipv4 ${currentEntry.source} ${currentEntry.level}`
          );
        }
      }

      for (const [key, desiredEntry] of desiredRedistributeMap) {
        const currentEntry = currentRedistributeMap.get(key);
        const changed =
          !currentEntry ||
          currentEntry.metric !== desiredEntry.metric ||
          currentEntry.routeMap !== desiredEntry.routeMap;

        if (!changed) continue;

        if (currentEntry) {
          operations.push(
            `delete protocols isis redistribute ipv4 ${currentEntry.source} ${currentEntry.level}`
          );
        }

        operations.push(
          `set protocols isis redistribute ipv4 ${desiredEntry.source} ${desiredEntry.level}`
        );
        if (desiredEntry.metric) {
          operations.push(
            `set protocols isis redistribute ipv4 ${desiredEntry.source} ${desiredEntry.level} metric ${desiredEntry.metric}`
          );
        }
        if (desiredEntry.routeMap) {
          operations.push(
            `set protocols isis redistribute ipv4 ${desiredEntry.source} ${desiredEntry.level} route-map ${desiredEntry.routeMap}`
          );
        }
      }

      const finalOperations = [...new Set(operations.map((item) => item.trim()).filter(Boolean))];
      if (finalOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await isisService.batchConfigure({ operations: finalOperations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply IS-IS configuration");
      }

      setMessage("IS-IS configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save IS-IS configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">IS-IS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Full-form IS-IS configuration for global settings, interfaces, and redistribution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PageGuideDialog guide={routingProtocolGuides.isis} />
          <Button variant="outline" size="sm" onClick={() => loadData(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {message && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="p-3 text-sm text-emerald-400">{message}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Global Parameters</CardTitle>
            <CardDescription>Core IS-IS identity and process controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>NET</Label>
                <Input
                  value={globals.net}
                  placeholder="49.0001.1921.6800.1001.00"
                  onChange={(event) => setGlobals((prev) => ({ ...prev, net: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Level</Label>
                <Select
                  value={globals.level || "__none__"}
                  onValueChange={(value) =>
                    setGlobals((prev) => ({ ...prev, level: value === "__none__" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {ISIS_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>LSP MTU</Label>
                <Input
                  type="number"
                  value={globals.lspMtu}
                  placeholder="1492"
                  onChange={(event) => setGlobals((prev) => ({ ...prev, lspMtu: event.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Metric Style</Label>
                <Select
                  value={globals.metricStyle || "__none__"}
                  onValueChange={(value) =>
                    setGlobals((prev) => ({
                      ...prev,
                      metricStyle: value === "__none__" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select metric style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {METRIC_STYLES.map((style) => (
                      <SelectItem key={style} value={style}>
                        {style}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>LDP Sync Holddown (s)</Label>
                <Input
                  type="number"
                  value={globals.ldpSyncHolddown}
                  placeholder="30"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, ldpSyncHolddown: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>LSP Gen Interval (s)</Label>
                <Input
                  type="number"
                  value={globals.lspGenInterval}
                  placeholder="10"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, lspGenInterval: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>LSP Refresh Interval (s)</Label>
                <Input
                  type="number"
                  value={globals.lspRefreshInterval}
                  placeholder="900"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, lspRefreshInterval: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>Max LSP Lifetime (s)</Label>
                <Input
                  type="number"
                  value={globals.maxLspLifetime}
                  placeholder="1200"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, maxLspLifetime: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <Label>SPF Interval (s)</Label>
                <Input
                  type="number"
                  value={globals.spfInterval}
                  placeholder="5"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, spfInterval: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                <Checkbox
                  id="isis-dynamic-hostname"
                  checked={globals.dynamicHostname}
                  onCheckedChange={(checked) =>
                    setGlobals((prev) => ({ ...prev, dynamicHostname: Boolean(checked) }))
                  }
                />
                <Label htmlFor="isis-dynamic-hostname">Dynamic hostname</Label>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                <Checkbox
                  id="isis-purge-originator"
                  checked={globals.purgeOriginator}
                  onCheckedChange={(checked) =>
                    setGlobals((prev) => ({ ...prev, purgeOriginator: Boolean(checked) }))
                  }
                />
                <Label htmlFor="isis-purge-originator">Purge originator</Label>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                <Checkbox
                  id="isis-set-attached-bit"
                  checked={globals.setAttachedBit}
                  onCheckedChange={(checked) =>
                    setGlobals((prev) => ({ ...prev, setAttachedBit: Boolean(checked) }))
                  }
                />
                <Label htmlFor="isis-set-attached-bit">Set attached bit</Label>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                <Checkbox
                  id="isis-set-overload-bit"
                  checked={globals.setOverloadBit}
                  onCheckedChange={(checked) =>
                    setGlobals((prev) => ({ ...prev, setOverloadBit: Boolean(checked) }))
                  }
                />
                <Label htmlFor="isis-set-overload-bit">Set overload bit</Label>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/50 p-3 md:col-span-2">
                <Checkbox
                  id="isis-ldp-sync"
                  checked={globals.ldpSync}
                  onCheckedChange={(checked) =>
                    setGlobals((prev) => ({ ...prev, ldpSync: Boolean(checked) }))
                  }
                />
                <Label htmlFor="isis-ldp-sync">Enable LDP sync</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interface Settings</CardTitle>
            <CardDescription>Configure IS-IS behavior per interface.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {interfaceOptions.length === 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
                No interfaces were discovered. Configure interfaces first.
              </div>
            )}

            {interfaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">No IS-IS interfaces configured.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interface</TableHead>
                    <TableHead>Circuit Type</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Hello Int/Mult</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="w-[90px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interfaces.map((row) => (
                    <TableRow key={row.interface}>
                      <TableCell>{interfaceLabelByName[row.interface] || row.interface}</TableCell>
                      <TableCell>{row.circuitType || "-"}</TableCell>
                      <TableCell>{row.metric || "-"}</TableCell>
                      <TableCell>
                        {row.helloInterval || "-"} / {row.helloMultiplier || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.networkPointToPoint && <Badge variant="secondary">p2p</Badge>}
                          {row.passive && <Badge variant="secondary">passive</Badge>}
                          {row.helloPadding && <Badge variant="secondary">hello-padding</Badge>}
                          {row.noThreeWayHandshake && <Badge variant="secondary">no-3way</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setInterfaces((prev) =>
                              prev.filter((entry) => entry.interface !== row.interface)
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <Select
                value={interfaceDraft.interface || "__none__"}
                onValueChange={(value) =>
                  setInterfaceDraft((prev) => ({
                    ...prev,
                    interface: value === "__none__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select interface" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select interface</SelectItem>
                  {interfaceOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={interfaceDraft.circuitType || "__none__"}
                onValueChange={(value) =>
                  setInterfaceDraft((prev) => ({
                    ...prev,
                    circuitType: value === "__none__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Circuit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No circuit-type</SelectItem>
                  {CIRCUIT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                value={interfaceDraft.metric}
                placeholder="Metric"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({ ...prev, metric: event.target.value }))
                }
              />

              <Input
                type="number"
                value={interfaceDraft.helloInterval}
                placeholder="Hello interval"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({ ...prev, helloInterval: event.target.value }))
                }
              />

              <Input
                type="number"
                value={interfaceDraft.helloMultiplier}
                placeholder="Hello multiplier"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({ ...prev, helloMultiplier: event.target.value }))
                }
              />

              <Input
                type="number"
                value={interfaceDraft.priority}
                placeholder="Priority"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({ ...prev, priority: event.target.value }))
                }
              />

              <Input
                type="number"
                value={interfaceDraft.psnpInterval}
                placeholder="PSNP interval"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({ ...prev, psnpInterval: event.target.value }))
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                <Checkbox
                  id="isis-if-p2p"
                  checked={interfaceDraft.networkPointToPoint}
                  onCheckedChange={(checked) =>
                    setInterfaceDraft((prev) => ({
                      ...prev,
                      networkPointToPoint: Boolean(checked),
                    }))
                  }
                />
                <Label htmlFor="isis-if-p2p">Network point-to-point</Label>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                <Checkbox
                  id="isis-if-passive"
                  checked={interfaceDraft.passive}
                  onCheckedChange={(checked) =>
                    setInterfaceDraft((prev) => ({ ...prev, passive: Boolean(checked) }))
                  }
                />
                <Label htmlFor="isis-if-passive">Passive</Label>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                <Checkbox
                  id="isis-if-padding"
                  checked={interfaceDraft.helloPadding}
                  onCheckedChange={(checked) =>
                    setInterfaceDraft((prev) => ({
                      ...prev,
                      helloPadding: Boolean(checked),
                    }))
                  }
                />
                <Label htmlFor="isis-if-padding">Hello padding</Label>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                <Checkbox
                  id="isis-if-no-three-way"
                  checked={interfaceDraft.noThreeWayHandshake}
                  onCheckedChange={(checked) =>
                    setInterfaceDraft((prev) => ({
                      ...prev,
                      noThreeWayHandshake: Boolean(checked),
                    }))
                  }
                />
                <Label htmlFor="isis-if-no-three-way">No three-way handshake</Label>
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleAddOrUpdateInterface}>
                <Plus className="mr-2 h-4 w-4" />
                Add / Update Interface
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Redistribution</CardTitle>
          <CardDescription>
            Redistribute IPv4 route sources into IS-IS by level with optional metric and route-map.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {redistribute.length === 0 ? (
            <p className="text-sm text-muted-foreground">No redistribution entries configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Route-map</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redistribute.map((entry) => (
                  <TableRow key={`${entry.source}|${entry.level}`}>
                    <TableCell className="font-mono text-xs">{entry.source}</TableCell>
                    <TableCell>{entry.level}</TableCell>
                    <TableCell>{entry.metric || "-"}</TableCell>
                    <TableCell>{entry.routeMap || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setRedistribute((prev) =>
                            prev.filter(
                              (item) =>
                                !(item.source === entry.source && item.level === entry.level)
                            )
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            <Select
              value={redistributeDraft.source || "__none__"}
              onValueChange={(value) =>
                setRedistributeDraft((prev) => ({
                  ...prev,
                  source: value === "__none__" ? "" : value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select source</SelectItem>
                {REDISTRIBUTE_SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={redistributeDraft.level}
              onValueChange={(value: "level-1" | "level-2") =>
                setRedistributeDraft((prev) => ({ ...prev, level: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="level-1">level-1</SelectItem>
                <SelectItem value="level-2">level-2</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="number"
              value={redistributeDraft.metric}
              placeholder="Metric (optional)"
              onChange={(event) =>
                setRedistributeDraft((prev) => ({ ...prev, metric: event.target.value }))
              }
            />

            <Select
              value={redistributeDraft.routeMap || "__none__"}
              onValueChange={(value) =>
                setRedistributeDraft((prev) => ({
                  ...prev,
                  routeMap: value === "__none__" ? "" : value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Route-map" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No route-map</SelectItem>
                {routeMapNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={handleAddOrUpdateRedistribute}>
              <Plus className="mr-2 h-4 w-4" />
              Add / Update Redistribution
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
