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
import { ospfService } from "@/lib/api/ospf";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { routeMapService } from "@/lib/api/route-map";
import { formatInterfaceDisplayName } from "@/lib/utils";

type AreaNetworkEntry = {
  area: string;
  prefix: string;
};

type AreaTypeEntry = {
  area: string;
  areaType: string;
};

type InterfaceEntry = {
  interface: string;
  area: string;
  networkType: string;
  cost: string;
  priority: string;
  helloInterval: string;
  deadInterval: string;
  retransmitInterval: string;
  transmitDelay: string;
  passive: boolean;
  bfd: boolean;
  mtuIgnore: boolean;
};

type RedistributeEntry = {
  protocol: string;
  routeMap: string;
};

type GlobalSettings = {
  routerId: string;
  abrType: string;
  autoCostReferenceBandwidth: string;
  maximumPaths: string;
  passiveInterfaceDefault: boolean;
  throttleSpfDelay: string;
  throttleSpfInitialHoldtime: string;
  throttleSpfMaxHoldtime: string;
};

type OspfState = {
  globals: GlobalSettings;
  networks: AreaNetworkEntry[];
  areaTypes: AreaTypeEntry[];
  interfaces: InterfaceEntry[];
  redistribute: RedistributeEntry[];
};

type InterfaceOption = {
  value: string;
  label: string;
};

const REDISTRIBUTE_PROTOCOLS = [
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

const ABR_TYPES = ["cisco", "ibm", "shortcut", "standard"] as const;
const OSPF_NETWORK_TYPES = ["broadcast", "non-broadcast", "point-to-multipoint"] as const;

const EMPTY_GLOBALS: GlobalSettings = {
  routerId: "",
  abrType: "",
  autoCostReferenceBandwidth: "",
  maximumPaths: "",
  passiveInterfaceDefault: false,
  throttleSpfDelay: "",
  throttleSpfInitialHoldtime: "",
  throttleSpfMaxHoldtime: "",
};

const EMPTY_INTERFACE: InterfaceEntry = {
  interface: "",
  area: "",
  networkType: "",
  cost: "",
  priority: "",
  helloInterval: "",
  deadInterval: "",
  retransmitInterval: "",
  transmitDelay: "",
  passive: false,
  bfd: false,
  mtuIgnore: false,
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeOptionalText(value: string): string {
  return value.trim();
}

function parseDirectOrKey(value: unknown): string {
  const direct = asString(value);
  if (direct) {
    return direct;
  }
  const root = asRecord(value);
  const first = Object.keys(root)[0];
  return first || "";
}

function parseGlobals(root: Record<string, unknown>): GlobalSettings {
  const parameters = asRecord(root.parameters);
  const autoCost = asRecord(root["auto-cost"]);
  const passiveInterface = asRecord(root["passive-interface"]);
  const timers = asRecord(root.timers);
  const throttle = asRecord(timers.throttle);
  const spf = asRecord(throttle.spf);

  return {
    routerId: asString(parameters["router-id"] ?? parameters.router_id),
    abrType: asString(parameters["abr-type"] ?? parameters.abr_type),
    autoCostReferenceBandwidth: asString(
      autoCost["reference-bandwidth"] ?? autoCost.reference_bandwidth
    ),
    maximumPaths: asString(root["maximum-paths"] ?? root.maximum_paths),
    passiveInterfaceDefault: Object.prototype.hasOwnProperty.call(passiveInterface, "default"),
    throttleSpfDelay: asString(spf.delay),
    throttleSpfInitialHoldtime: asString(
      spf["initial-holdtime"] ?? spf.initial_holdtime
    ),
    throttleSpfMaxHoldtime: asString(spf["max-holdtime"] ?? spf.max_holdtime),
  };
}

function parseAreaNetworks(root: Record<string, unknown>): AreaNetworkEntry[] {
  const rows: AreaNetworkEntry[] = [];
  const areaRoot = asRecord(root.area);

  for (const [area, areaConfig] of Object.entries(areaRoot)) {
    const areaObj = asRecord(areaConfig);
    const networkRoot = asRecord(areaObj.network);
    for (const prefix of Object.keys(networkRoot)) {
      rows.push({ area, prefix });
    }
  }

  return rows.sort((left, right) => {
    const areaCompare = left.area.localeCompare(right.area, undefined, { numeric: true });
    if (areaCompare !== 0) return areaCompare;
    return left.prefix.localeCompare(right.prefix, undefined, { numeric: true });
  });
}

function parseAreaTypes(root: Record<string, unknown>, interfaces: InterfaceEntry[] = []): AreaTypeEntry[] {
  const areaTypeMap = new Map<string, string>();
  const areaRoot = asRecord(root.area);

  for (const [area, areaConfig] of Object.entries(areaRoot)) {
    const areaType = parseDirectOrKey(asRecord(areaConfig)["area-type"]);
    if (areaType) {
      areaTypeMap.set(area, areaType);
    }
  }

  // With interface-based OSPF style, area-type can be omitted; infer areas from
  // interface entries so active areas are still visible in this section.
  for (const iface of interfaces) {
    const area = iface.area.trim();
    if (!area || areaTypeMap.has(area)) continue;
    areaTypeMap.set(area, "");
  }

  return [...areaTypeMap.entries()]
    .map(([area, areaType]) => ({ area, areaType }))
    .sort((left, right) => left.area.localeCompare(right.area, undefined, { numeric: true }));
}

function parseInterfaces(root: Record<string, unknown>): InterfaceEntry[] {
  const rows: InterfaceEntry[] = [];
  const interfaceRoot = asRecord(root.interface);

  for (const [ifaceName, ifaceConfig] of Object.entries(interfaceRoot)) {
    const ifaceRoot = asRecord(ifaceConfig);
    rows.push({
      interface: ifaceName,
      area: parseDirectOrKey(ifaceRoot.area),
      networkType: parseDirectOrKey(ifaceRoot.network),
      cost: asString(ifaceRoot.cost),
      priority: asString(ifaceRoot.priority),
      helloInterval: asString(ifaceRoot["hello-interval"] ?? ifaceRoot.hello_interval),
      deadInterval: asString(ifaceRoot["dead-interval"] ?? ifaceRoot.dead_interval),
      retransmitInterval: asString(
        ifaceRoot["retransmit-interval"] ?? ifaceRoot.retransmit_interval
      ),
      transmitDelay: asString(ifaceRoot["transmit-delay"] ?? ifaceRoot.transmit_delay),
      passive: Object.prototype.hasOwnProperty.call(ifaceRoot, "passive"),
      bfd: Object.prototype.hasOwnProperty.call(ifaceRoot, "bfd"),
      mtuIgnore: Object.prototype.hasOwnProperty.call(ifaceRoot, "mtu-ignore"),
    });
  }

  return rows.sort((left, right) => left.interface.localeCompare(right.interface, undefined, { numeric: true }));
}

function parseRedistribute(root: Record<string, unknown>): RedistributeEntry[] {
  const rows: RedistributeEntry[] = [];
  const redistributeRoot = asRecord(root.redistribute);

  for (const [protocol, protocolConfig] of Object.entries(redistributeRoot)) {
    const routeMap = asString(asRecord(protocolConfig)["route-map"]);
    rows.push({ protocol, routeMap });
  }

  return rows.sort((left, right) => left.protocol.localeCompare(right.protocol));
}

function normalizeNetworkEntry(entry: AreaNetworkEntry): AreaNetworkEntry {
  return {
    area: entry.area.trim(),
    prefix: entry.prefix.trim(),
  };
}

function normalizeAreaTypeEntry(entry: AreaTypeEntry): AreaTypeEntry {
  return {
    area: entry.area.trim(),
    areaType: entry.areaType.trim(),
  };
}

function normalizeInterfaceEntry(entry: InterfaceEntry): InterfaceEntry {
  return {
    interface: entry.interface.trim(),
    area: entry.area.trim(),
    networkType: entry.networkType.trim(),
    cost: entry.cost.trim(),
    priority: entry.priority.trim(),
    helloInterval: entry.helloInterval.trim(),
    deadInterval: entry.deadInterval.trim(),
    retransmitInterval: entry.retransmitInterval.trim(),
    transmitDelay: entry.transmitDelay.trim(),
    passive: Boolean(entry.passive),
    bfd: Boolean(entry.bfd),
    mtuIgnore: Boolean(entry.mtuIgnore),
  };
}

function normalizeRedistributeEntry(entry: RedistributeEntry): RedistributeEntry {
  return {
    protocol: entry.protocol.trim(),
    routeMap: entry.routeMap.trim(),
  };
}

function interfaceEntriesEqual(left: InterfaceEntry, right: InterfaceEntry): boolean {
  return (
    left.interface === right.interface &&
    left.area === right.area &&
    left.networkType === right.networkType &&
    left.cost === right.cost &&
    left.priority === right.priority &&
    left.helloInterval === right.helloInterval &&
    left.deadInterval === right.deadInterval &&
    left.retransmitInterval === right.retransmitInterval &&
    left.transmitDelay === right.transmitDelay &&
    left.passive === right.passive &&
    left.bfd === right.bfd &&
    left.mtuIgnore === right.mtuIgnore
  );
}

function getInterfaceSetOperations(entry: InterfaceEntry): string[] {
  const commands: string[] = [];
  const iface = entry.interface;

  if (entry.area) commands.push(`set protocols ospf interface ${iface} area ${entry.area}`);
  if (entry.networkType) commands.push(`set protocols ospf interface ${iface} network ${entry.networkType}`);
  if (entry.cost) commands.push(`set protocols ospf interface ${iface} cost ${entry.cost}`);
  if (entry.priority) commands.push(`set protocols ospf interface ${iface} priority ${entry.priority}`);
  if (entry.helloInterval) {
    commands.push(`set protocols ospf interface ${iface} hello-interval ${entry.helloInterval}`);
  }
  if (entry.deadInterval) {
    commands.push(`set protocols ospf interface ${iface} dead-interval ${entry.deadInterval}`);
  }
  if (entry.retransmitInterval) {
    commands.push(
      `set protocols ospf interface ${iface} retransmit-interval ${entry.retransmitInterval}`
    );
  }
  if (entry.transmitDelay) {
    commands.push(`set protocols ospf interface ${iface} transmit-delay ${entry.transmitDelay}`);
  }
  if (entry.passive) commands.push(`set protocols ospf interface ${iface} passive`);
  if (entry.bfd) commands.push(`set protocols ospf interface ${iface} bfd`);
  if (entry.mtuIgnore) commands.push(`set protocols ospf interface ${iface} mtu-ignore`);

  return commands;
}

export function OspfContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<OspfState | null>(null);
  const [globals, setGlobals] = useState<GlobalSettings>(EMPTY_GLOBALS);
  const [networks, setNetworks] = useState<AreaNetworkEntry[]>([]);
  const [areaTypes, setAreaTypes] = useState<AreaTypeEntry[]>([]);
  const [interfaces, setInterfaces] = useState<InterfaceEntry[]>([]);
  const [redistribute, setRedistribute] = useState<RedistributeEntry[]>([]);

  const [networkDraft, setNetworkDraft] = useState<AreaNetworkEntry>({ area: "0.0.0.0", prefix: "" });
  const [areaTypeDraft, setAreaTypeDraft] = useState<AreaTypeEntry>({ area: "0.0.0.0", areaType: "" });
  const [interfaceDraft, setInterfaceDraft] = useState<InterfaceEntry>(EMPTY_INTERFACE);
  const [redistributeDraft, setRedistributeDraft] = useState<RedistributeEntry>({
    protocol: REDISTRIBUTE_PROTOCOLS[0],
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
      const [ospfConfig, ethernetConfig, physicalConfig, allInterfacesConfig, routeMapConfig] = await Promise.all([
        ospfService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
        routeMapService.getConfig().catch(() => ({ route_maps: [], total: 0 })),
      ]);

      const root = asRecord(ospfConfig.ospf);

      const parsedInterfaces = parseInterfaces(root);

      const parsedState: OspfState = {
        globals: parseGlobals(root),
        networks: parseAreaNetworks(root),
        areaTypes: parseAreaTypes(root, parsedInterfaces),
        interfaces: parsedInterfaces,
        redistribute: parseRedistribute(root),
      };

      setCurrentState(parsedState);
      setGlobals(parsedState.globals);
      setNetworks(parsedState.networks);
      setAreaTypes(parsedState.areaTypes);
      setInterfaces(parsedState.interfaces);
      setRedistribute(parsedState.redistribute);

      const descriptionByName = ethernetConfig.interfaces.reduce<Record<string, string | null>>(
        (acc, iface) => {
          acc[iface.name] = iface.description ?? null;
          return acc;
        },
        {}
      );

      const interfaceNames = new Set<string>();
      ethernetConfig.interfaces.forEach((iface) => interfaceNames.add(iface.name));
      physicalConfig.interfaces.forEach((iface) => interfaceNames.add(iface.interface));
      allInterfacesConfig.interfaces.forEach((iface) => interfaceNames.add(iface.name));
      parsedState.interfaces.forEach((iface) => interfaceNames.add(iface.interface));

      const parsedInterfaceOptions = [...interfaceNames]
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
      setInterfaceOptions(parsedInterfaceOptions);

      setRouteMapNames(
        routeMapConfig.route_maps
          .map((item) => item.name)
          .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      );

      setInterfaceDraft((prev) => {
        if (prev.interface) {
          return prev;
        }
        return {
          ...prev,
          interface: parsedInterfaceOptions[0]?.value || "",
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load OSPF configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddNetwork = () => {
    const normalized = normalizeNetworkEntry(networkDraft);
    if (!normalized.area || !normalized.prefix) {
      setError("Area and network prefix are required.");
      return;
    }

    const key = `${normalized.area}|${normalized.prefix}`;
    const exists = networks.some((row) => `${row.area}|${row.prefix}` === key);
    if (exists) {
      setError("That OSPF network entry already exists.");
      return;
    }

    setError(null);
    setNetworks((prev) => [...prev, normalized]);
    setNetworkDraft((prev) => ({ ...prev, prefix: "" }));
  };

  const handleAddOrUpdateAreaType = () => {
    const normalized = normalizeAreaTypeEntry(areaTypeDraft);
    if (!normalized.area || !normalized.areaType) {
      setError("Area and area type are required.");
      return;
    }

    setError(null);
    setAreaTypes((prev) => {
      const without = prev.filter((row) => row.area !== normalized.area);
      return [...without, normalized].sort((left, right) =>
        left.area.localeCompare(right.area, undefined, { numeric: true })
      );
    });
  };

  const handleAddOrUpdateInterface = () => {
    const normalized = normalizeInterfaceEntry(interfaceDraft);
    if (!normalized.interface) {
      setError("Interface is required.");
      return;
    }

    setError(null);
    setInterfaces((prev) => {
      const without = prev.filter((row) => row.interface !== normalized.interface);
      return [...without, normalized].sort((left, right) =>
        left.interface.localeCompare(right.interface, undefined, { numeric: true })
      );
    });
  };

  const handleAddOrUpdateRedistribute = () => {
    const normalized = normalizeRedistributeEntry(redistributeDraft);
    if (!normalized.protocol) {
      setError("Redistribute protocol is required.");
      return;
    }

    setError(null);
    setRedistribute((prev) => {
      const without = prev.filter((row) => row.protocol !== normalized.protocol);
      return [...without, normalized].sort((left, right) => left.protocol.localeCompare(right.protocol));
    });
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const queueText = (
        currentValue: string,
        desiredValue: string,
        setCommand: (value: string) => string,
        deleteCommand?: string
      ) => {
        const currentText = normalizeOptionalText(currentValue);
        const desiredText = normalizeOptionalText(desiredValue);
        if (currentText === desiredText) {
          return;
        }
        if (!desiredText) {
          if (deleteCommand) {
            operations.push(deleteCommand);
          }
          return;
        }
        operations.push(setCommand(desiredText));
      };

      const queueToggle = (
        currentValue: boolean,
        desiredValue: boolean,
        setCommand: string,
        deleteCommand?: string
      ) => {
        if (currentValue === desiredValue) {
          return;
        }
        if (desiredValue) {
          operations.push(setCommand);
        } else if (deleteCommand) {
          operations.push(deleteCommand);
        }
      };

      queueText(
        currentState.globals.routerId,
        globals.routerId,
        (value) => `set protocols ospf parameters router-id ${value}`,
        "delete protocols ospf parameters router-id"
      );
      queueText(
        currentState.globals.abrType,
        globals.abrType,
        (value) => `set protocols ospf parameters abr-type ${value}`,
        "delete protocols ospf parameters abr-type"
      );
      queueText(
        currentState.globals.autoCostReferenceBandwidth,
        globals.autoCostReferenceBandwidth,
        (value) => `set protocols ospf auto-cost reference-bandwidth ${value}`,
        "delete protocols ospf auto-cost reference-bandwidth"
      );
      queueText(
        currentState.globals.maximumPaths,
        globals.maximumPaths,
        (value) => `set protocols ospf maximum-paths ${value}`,
        "delete protocols ospf maximum-paths"
      );
      queueToggle(
        currentState.globals.passiveInterfaceDefault,
        globals.passiveInterfaceDefault,
        "set protocols ospf passive-interface default",
        "delete protocols ospf passive-interface default"
      );
      queueText(
        currentState.globals.throttleSpfDelay,
        globals.throttleSpfDelay,
        (value) => `set protocols ospf timers throttle spf delay ${value}`,
        "delete protocols ospf timers throttle spf delay"
      );
      queueText(
        currentState.globals.throttleSpfInitialHoldtime,
        globals.throttleSpfInitialHoldtime,
        (value) => `set protocols ospf timers throttle spf initial-holdtime ${value}`,
        "delete protocols ospf timers throttle spf initial-holdtime"
      );
      queueText(
        currentState.globals.throttleSpfMaxHoldtime,
        globals.throttleSpfMaxHoldtime,
        (value) => `set protocols ospf timers throttle spf max-holdtime ${value}`,
        "delete protocols ospf timers throttle spf max-holdtime"
      );

      const currentNetworks = new Map(
        currentState.networks.map((entry) => [`${entry.area}|${entry.prefix}`, entry])
      );
      const desiredNetworks = new Map(networks.map((entry) => [`${entry.area}|${entry.prefix}`, entry]));

      for (const [key, entry] of currentNetworks.entries()) {
        if (!desiredNetworks.has(key)) {
          operations.push(`delete protocols ospf area ${entry.area} network ${entry.prefix}`);
        }
      }
      for (const [key, entry] of desiredNetworks.entries()) {
        if (!currentNetworks.has(key)) {
          operations.push(`set protocols ospf area ${entry.area} network ${entry.prefix}`);
        }
      }

      const currentAreaTypeMap = new Map(currentState.areaTypes.map((entry) => [entry.area, entry.areaType]));
      const desiredAreaTypeMap = new Map(areaTypes.map((entry) => [entry.area, entry.areaType]));
      const allAreaTypeKeys = new Set([...currentAreaTypeMap.keys(), ...desiredAreaTypeMap.keys()]);

      for (const area of allAreaTypeKeys) {
        const currentType = currentAreaTypeMap.get(area) || "";
        const desiredType = desiredAreaTypeMap.get(area) || "";
        if (currentType === desiredType) {
          continue;
        }

        if (!desiredType) {
          operations.push(`delete protocols ospf area ${area} area-type`);
        } else {
          operations.push(`set protocols ospf area ${area} area-type ${desiredType}`);
        }
      }

      const currentInterfaceMap = new Map(currentState.interfaces.map((entry) => [entry.interface, entry]));
      const desiredInterfaceMap = new Map(interfaces.map((entry) => [entry.interface, entry]));

      for (const [iface] of currentInterfaceMap.entries()) {
        if (!desiredInterfaceMap.has(iface)) {
          operations.push(`delete protocols ospf interface ${iface}`);
        }
      }

      for (const [iface, desiredEntry] of desiredInterfaceMap.entries()) {
        const currentEntry = currentInterfaceMap.get(iface);
        if (!currentEntry) {
          operations.push(...getInterfaceSetOperations(desiredEntry));
          continue;
        }

        if (!interfaceEntriesEqual(currentEntry, desiredEntry)) {
          operations.push(`delete protocols ospf interface ${iface}`);
          operations.push(...getInterfaceSetOperations(desiredEntry));
        }
      }

      const currentRedistributeMap = new Map(
        currentState.redistribute.map((entry) => [entry.protocol, entry])
      );
      const desiredRedistributeMap = new Map(redistribute.map((entry) => [entry.protocol, entry]));

      for (const [protocol] of currentRedistributeMap.entries()) {
        if (!desiredRedistributeMap.has(protocol)) {
          operations.push(`delete protocols ospf redistribute ${protocol}`);
        }
      }

      for (const [protocol, desiredEntry] of desiredRedistributeMap.entries()) {
        const currentEntry = currentRedistributeMap.get(protocol);
        if (!currentEntry) {
          operations.push(`set protocols ospf redistribute ${protocol}`);
          if (desiredEntry.routeMap) {
            operations.push(
              `set protocols ospf redistribute ${protocol} route-map ${desiredEntry.routeMap}`
            );
          }
          continue;
        }

        if (currentEntry.routeMap !== desiredEntry.routeMap) {
          operations.push(`delete protocols ospf redistribute ${protocol}`);
          operations.push(`set protocols ospf redistribute ${protocol}`);
          if (desiredEntry.routeMap) {
            operations.push(
              `set protocols ospf redistribute ${protocol} route-map ${desiredEntry.routeMap}`
            );
          }
        }
      }

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await ospfService.batchConfigure({ operations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply OSPF configuration");
      }

      setMessage("OSPF configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save OSPF configuration");
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
          <h1 className="text-2xl font-bold text-foreground">OSPF</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Full-form OSPF configuration for global parameters, areas, interfaces, and redistribution.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            <CardDescription>Core OSPF process settings and path selection controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Router ID</Label>
                <Input
                  value={globals.routerId}
                  placeholder="1.1.1.1"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, routerId: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>ABR Type</Label>
                <Select
                  value={globals.abrType || "__none__"}
                  onValueChange={(value) =>
                    setGlobals((prev) => ({ ...prev, abrType: value === "__none__" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ABR type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {ABR_TYPES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Auto-cost Reference Bandwidth (Mbps)</Label>
                <Input
                  type="number"
                  value={globals.autoCostReferenceBandwidth}
                  placeholder="10000"
                  onChange={(event) =>
                    setGlobals((prev) => ({
                      ...prev,
                      autoCostReferenceBandwidth: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>Maximum Paths</Label>
                <Input
                  type="number"
                  value={globals.maximumPaths}
                  placeholder="4"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, maximumPaths: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="ospf-passive-default"
                checked={globals.passiveInterfaceDefault}
                onCheckedChange={(checked) =>
                  setGlobals((prev) => ({ ...prev, passiveInterfaceDefault: Boolean(checked) }))
                }
              />
              <div className="space-y-1">
                <Label htmlFor="ospf-passive-default">Passive Interface Default</Label>
                <p className="text-xs text-muted-foreground">
                  Make interfaces passive by default; explicitly configured interface behavior is handled in the
                  interfaces section.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">SPF Throttle Timers</CardTitle>
            <CardDescription>Tune SPF delay and hold timers for convergence behavior.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Delay (ms)</Label>
              <Input
                type="number"
                value={globals.throttleSpfDelay}
                placeholder="200"
                onChange={(event) =>
                  setGlobals((prev) => ({ ...prev, throttleSpfDelay: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Initial Holdtime (ms)</Label>
              <Input
                type="number"
                value={globals.throttleSpfInitialHoldtime}
                placeholder="1000"
                onChange={(event) =>
                  setGlobals((prev) => ({
                    ...prev,
                    throttleSpfInitialHoldtime: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Max Holdtime (ms)</Label>
              <Input
                type="number"
                value={globals.throttleSpfMaxHoldtime}
                placeholder="10000"
                onChange={(event) =>
                  setGlobals((prev) => ({ ...prev, throttleSpfMaxHoldtime: event.target.value }))
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Areas and Network Advertisements</CardTitle>
          <CardDescription>Define area type and advertised networks per area.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Area Types</h3>
              <Badge variant="secondary">{areaTypes.length}</Badge>
            </div>

            {areaTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No area types set. OSPF defaults apply.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead>Area Type</TableHead>
                    <TableHead className="w-[90px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {areaTypes.map((row) => (
                    <TableRow key={row.area}>
                      <TableCell className="font-mono text-xs">{row.area}</TableCell>
                      <TableCell>{row.areaType || <span className="text-muted-foreground">default</span>}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setAreaTypes((prev) => prev.filter((entry) => entry.area !== row.area))
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
              <Input
                value={areaTypeDraft.area}
                placeholder="Area (e.g. 0.0.0.0)"
                onChange={(event) =>
                  setAreaTypeDraft((prev) => ({ ...prev, area: event.target.value }))
                }
              />
              <Select
                value={areaTypeDraft.areaType || "__none__"}
                onValueChange={(value) =>
                  setAreaTypeDraft((prev) => ({
                    ...prev,
                    areaType: value === "__none__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select area type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select type</SelectItem>
                  <SelectItem value="normal">normal</SelectItem>
                  <SelectItem value="nssa">nssa</SelectItem>
                  <SelectItem value="stub">stub</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleAddOrUpdateAreaType}>
                <Plus className="mr-2 h-4 w-4" />
                Add / Update Area Type
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Area Networks</h3>
              <Badge variant="secondary">{networks.length}</Badge>
            </div>

            {networks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No OSPF area networks configured. This is expected when using interface-based area assignment.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead>Network Prefix</TableHead>
                    <TableHead className="w-[90px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {networks.map((row) => (
                    <TableRow key={`${row.area}|${row.prefix}`}>
                      <TableCell className="font-mono text-xs">{row.area}</TableCell>
                      <TableCell className="font-mono text-xs">{row.prefix}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setNetworks((prev) =>
                              prev.filter(
                                (entry) => !(entry.area === row.area && entry.prefix === row.prefix)
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

            <div className="grid gap-3 md:grid-cols-3">
              <Input
                value={networkDraft.area}
                placeholder="Area (e.g. 0.0.0.0)"
                onChange={(event) =>
                  setNetworkDraft((prev) => ({ ...prev, area: event.target.value }))
                }
              />
              <Input
                value={networkDraft.prefix}
                placeholder="Network Prefix (e.g. 10.0.0.0/24)"
                onChange={(event) =>
                  setNetworkDraft((prev) => ({ ...prev, prefix: event.target.value }))
                }
              />
              <Button variant="outline" onClick={handleAddNetwork}>
                <Plus className="mr-2 h-4 w-4" />
                Add Network
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interface Settings</CardTitle>
          <CardDescription>
            Configure per-interface OSPF behavior including timers, passive mode, and BFD.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {interfaceOptions.length === 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
              No interfaces were discovered. Configure or expose interfaces in the instance first.
            </div>
          )}
          {interfaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No OSPF interface settings configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interface</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Hello / Dead</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interfaces.map((row) => (
                  <TableRow key={row.interface}>
                    <TableCell>{interfaceLabelByName[row.interface] || row.interface}</TableCell>
                    <TableCell className="font-mono text-xs">{row.area || "-"}</TableCell>
                    <TableCell>{row.networkType || "-"}</TableCell>
                    <TableCell>{row.cost || "-"}</TableCell>
                    <TableCell>{row.priority || "-"}</TableCell>
                    <TableCell>
                      {row.helloInterval || "-"} / {row.deadInterval || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.passive && <Badge variant="secondary">passive</Badge>}
                        {row.bfd && <Badge variant="secondary">bfd</Badge>}
                        {row.mtuIgnore && <Badge variant="secondary">mtu-ignore</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setInterfaces((prev) => prev.filter((entry) => entry.interface !== row.interface))
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
            <div className="space-y-1">
              <Label>Interface</Label>
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
            </div>

            <div className="space-y-1">
              <Label>Area</Label>
              <Input
                value={interfaceDraft.area}
                placeholder="0.0.0.0"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({ ...prev, area: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Network Type</Label>
              <Select
                value={interfaceDraft.networkType || "__none__"}
                onValueChange={(value) =>
                  setInterfaceDraft((prev) => ({
                    ...prev,
                    networkType: value === "__none__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select network type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {OSPF_NETWORK_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Cost</Label>
              <Input
                type="number"
                value={interfaceDraft.cost}
                placeholder="10"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({ ...prev, cost: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Priority</Label>
              <Input
                type="number"
                value={interfaceDraft.priority}
                placeholder="1"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({ ...prev, priority: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Hello Interval</Label>
              <Input
                type="number"
                value={interfaceDraft.helloInterval}
                placeholder="10"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({
                    ...prev,
                    helloInterval: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Dead Interval</Label>
              <Input
                type="number"
                value={interfaceDraft.deadInterval}
                placeholder="40"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({ ...prev, deadInterval: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Retransmit Interval</Label>
              <Input
                type="number"
                value={interfaceDraft.retransmitInterval}
                placeholder="5"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({
                    ...prev,
                    retransmitInterval: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Transmit Delay</Label>
              <Input
                type="number"
                value={interfaceDraft.transmitDelay}
                placeholder="1"
                onChange={(event) =>
                  setInterfaceDraft((prev) => ({
                    ...prev,
                    transmitDelay: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="ospf-if-passive"
                checked={interfaceDraft.passive}
                onCheckedChange={(checked) =>
                  setInterfaceDraft((prev) => ({ ...prev, passive: Boolean(checked) }))
                }
              />
              <Label htmlFor="ospf-if-passive">Passive</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="ospf-if-bfd"
                checked={interfaceDraft.bfd}
                onCheckedChange={(checked) =>
                  setInterfaceDraft((prev) => ({ ...prev, bfd: Boolean(checked) }))
                }
              />
              <Label htmlFor="ospf-if-bfd">Enable BFD</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="ospf-if-mtu-ignore"
                checked={interfaceDraft.mtuIgnore}
                onCheckedChange={(checked) =>
                  setInterfaceDraft((prev) => ({ ...prev, mtuIgnore: Boolean(checked) }))
                }
              />
              <Label htmlFor="ospf-if-mtu-ignore">MTU Ignore</Label>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Redistribution</CardTitle>
          <CardDescription>
            Control redistribution of routes from other protocols into OSPF with optional route-maps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {redistribute.length === 0 ? (
            <p className="text-sm text-muted-foreground">No redistribution configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Route-map</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redistribute.map((row) => (
                  <TableRow key={row.protocol}>
                    <TableCell className="font-mono text-xs">{row.protocol}</TableCell>
                    <TableCell>{row.routeMap || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setRedistribute((prev) =>
                            prev.filter((entry) => entry.protocol !== row.protocol)
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
              value={redistributeDraft.protocol || "__none__"}
              onValueChange={(value) =>
                setRedistributeDraft((prev) => ({
                  ...prev,
                  protocol: value === "__none__" ? "" : value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Protocol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select protocol</SelectItem>
                {REDISTRIBUTE_PROTOCOLS.map((protocol) => (
                  <SelectItem key={protocol} value={protocol}>
                    {protocol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
                <SelectValue placeholder="Route-map (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {routeMapNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
