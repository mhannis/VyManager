"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { ripService } from "@/lib/api/rip";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { routeMapService } from "@/lib/api/route-map";
import { accessListService } from "@/lib/api/access-list";
import { prefixListService } from "@/lib/api/prefix-list";
import { formatInterfaceDisplayName } from "@/lib/utils";

type InterfaceOption = {
  value: string;
  label: string;
};

type NetworkDistanceEntry = {
  prefix: string;
  distance: string;
  accessList: string;
};

type RedistributeEntry = {
  protocol: string;
  metric: string;
  routeMap: string;
};

type DistributeListType = "access-list" | "prefix-list";
type DistributeDirection = "in" | "out";
type DistributeScope = "global" | "interface";

type DistributeListEntry = {
  scope: DistributeScope;
  interface: string;
  listType: DistributeListType;
  direction: DistributeDirection;
  name: string;
};

type RipState = {
  networks: string[];
  interfaces: string[];
  neighbors: string[];
  routes: string[];
  passiveDefault: boolean;
  passiveInterfaces: string[];
  defaultDistance: string;
  defaultMetric: string;
  defaultInformationOriginate: boolean;
  timersUpdate: string;
  timersTimeout: string;
  timersGarbageCollection: string;
  networkDistances: NetworkDistanceEntry[];
  distributeLists: DistributeListEntry[];
  redistribute: RedistributeEntry[];
};

const EMPTY_STATE: RipState = {
  networks: [],
  interfaces: [],
  neighbors: [],
  routes: [],
  passiveDefault: false,
  passiveInterfaces: [],
  defaultDistance: "",
  defaultMetric: "",
  defaultInformationOriginate: false,
  timersUpdate: "",
  timersTimeout: "",
  timersGarbageCollection: "",
  networkDistances: [],
  distributeLists: [],
  redistribute: [],
};

const REDISTRIBUTE_PROTOCOLS = [
  "connected",
  "kernel",
  "ospf",
  "static",
  "babel",
  "bgp",
  "isis",
  "openfabric",
  "rip",
];

const DISTRIBUTE_TYPES: DistributeListType[] = ["access-list", "prefix-list"];
const DISTRIBUTE_DIRECTIONS: DistributeDirection[] = ["in", "out"];

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
  if (direct) return direct;
  const root = asObject(value);
  const first = Object.keys(root)[0];
  return first || "";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

function parseObjectKeys(value: unknown): string[] {
  return uniqueSorted(Object.keys(asObject(value)));
}

function parseNetworkDistances(root: Record<string, unknown>): NetworkDistanceEntry[] {
  const rows: NetworkDistanceEntry[] = [];
  const networkDistanceRoot = asObject(root["network-distance"]);

  for (const [prefix, cfg] of Object.entries(networkDistanceRoot)) {
    const cfgRoot = asObject(cfg);
    rows.push({
      prefix,
      distance: asString(cfgRoot.distance),
      accessList: asString(cfgRoot["access-list"] ?? cfgRoot.access_list),
    });
  }

  return rows.sort((a, b) => a.prefix.localeCompare(b.prefix, undefined, { numeric: true }));
}

function parseDistributeLists(root: Record<string, unknown>): DistributeListEntry[] {
  const rows: DistributeListEntry[] = [];
  const distRoot = asObject(root["distribute-list"]);

  for (const listType of DISTRIBUTE_TYPES) {
    const typeRoot = asObject(distRoot[listType]);
    for (const direction of DISTRIBUTE_DIRECTIONS) {
      const name = parseDirectOrKey(typeRoot[direction]);
      if (!name) continue;
      rows.push({
        scope: "global",
        interface: "",
        listType,
        direction,
        name,
      });
    }
  }

  const interfaceRoot = asObject(distRoot.interface);
  for (const [iface, ifaceCfg] of Object.entries(interfaceRoot)) {
    const ifaceRoot = asObject(ifaceCfg);
    for (const listType of DISTRIBUTE_TYPES) {
      const typeRoot = asObject(ifaceRoot[listType]);
      for (const direction of DISTRIBUTE_DIRECTIONS) {
        const name = parseDirectOrKey(typeRoot[direction]);
        if (!name) continue;
        rows.push({
          scope: "interface",
          interface: iface,
          listType,
          direction,
          name,
        });
      }
    }
  }

  return rows.sort((a, b) => {
    const scopeCmp = a.scope.localeCompare(b.scope);
    if (scopeCmp !== 0) return scopeCmp;
    const ifaceCmp = a.interface.localeCompare(b.interface, undefined, { numeric: true });
    if (ifaceCmp !== 0) return ifaceCmp;
    const typeCmp = a.listType.localeCompare(b.listType);
    if (typeCmp !== 0) return typeCmp;
    return a.direction.localeCompare(b.direction);
  });
}

function parseRedistribute(root: Record<string, unknown>): RedistributeEntry[] {
  const rows: RedistributeEntry[] = [];
  const redistributeRoot = asObject(root.redistribute);

  for (const [protocol, cfg] of Object.entries(redistributeRoot)) {
    const cfgRoot = asObject(cfg);
    rows.push({
      protocol,
      metric: asString(cfgRoot.metric),
      routeMap: asString(cfgRoot["route-map"] ?? cfgRoot.route_map),
    });
  }

  return rows.sort((a, b) => a.protocol.localeCompare(b.protocol));
}

function parseState(root: Record<string, unknown>): RipState {
  const passiveConfig = asObject(root["passive-interface"]);
  const passiveInterfaceRoot = asObject(passiveConfig.interface);
  const passiveDirectInterfaces = Object.keys(passiveConfig).filter(
    (key) => key !== "default" && key !== "interface"
  );
  const defaultInfoRoot = asObject(root["default-information"]);
  const timersRoot = asObject(root.timers);

  return {
    networks: parseObjectKeys(root.network),
    interfaces: parseObjectKeys(root.interface),
    neighbors: parseObjectKeys(root.neighbor),
    routes: parseObjectKeys(root.route),
    passiveDefault: Object.prototype.hasOwnProperty.call(passiveConfig, "default"),
    passiveInterfaces: uniqueSorted([...Object.keys(passiveInterfaceRoot), ...passiveDirectInterfaces]),
    defaultDistance: asString(root["default-distance"] ?? root.default_distance),
    defaultMetric: asString(root["default-metric"] ?? root.default_metric),
    defaultInformationOriginate: Object.prototype.hasOwnProperty.call(defaultInfoRoot, "originate"),
    timersUpdate: asString(timersRoot.update),
    timersTimeout: asString(timersRoot.timeout),
    timersGarbageCollection: asString(
      timersRoot["garbage-collection"] ?? timersRoot.garbage_collection
    ),
    networkDistances: parseNetworkDistances(root),
    distributeLists: parseDistributeLists(root),
    redistribute: parseRedistribute(root),
  };
}

function normalizeNetworkDistance(entry: NetworkDistanceEntry): NetworkDistanceEntry {
  return {
    prefix: entry.prefix.trim(),
    distance: entry.distance.trim(),
    accessList: entry.accessList.trim(),
  };
}

function normalizeDistributeEntry(entry: DistributeListEntry): DistributeListEntry {
  return {
    scope: entry.scope,
    interface: entry.interface.trim(),
    listType: entry.listType,
    direction: entry.direction,
    name: entry.name.trim(),
  };
}

function normalizeRedistribute(entry: RedistributeEntry): RedistributeEntry {
  return {
    protocol: entry.protocol.trim(),
    metric: entry.metric.trim(),
    routeMap: entry.routeMap.trim(),
  };
}

function distributeKey(entry: DistributeListEntry): string {
  return [entry.scope, entry.interface, entry.listType, entry.direction].join("|");
}

function buildDistributeSetCommand(entry: DistributeListEntry): string {
  if (entry.scope === "global") {
    return `set protocols rip distribute-list ${entry.listType} ${entry.direction} ${entry.name}`;
  }
  return `set protocols rip distribute-list interface ${entry.interface} ${entry.listType} ${entry.direction} ${entry.name}`;
}

function buildDistributeDeleteCommand(entry: DistributeListEntry): string {
  if (entry.scope === "global") {
    return `delete protocols rip distribute-list ${entry.listType} ${entry.direction}`;
  }
  return `delete protocols rip distribute-list interface ${entry.interface} ${entry.listType} ${entry.direction}`;
}

export function RipContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<RipState | null>(null);

  const [networks, setNetworks] = useState<string[]>([]);
  const [interfaces, setInterfaces] = useState<string[]>([]);
  const [neighbors, setNeighbors] = useState<string[]>([]);
  const [routes, setRoutes] = useState<string[]>([]);

  const [passiveDefault, setPassiveDefault] = useState(false);
  const [passiveInterfaces, setPassiveInterfaces] = useState<string[]>([]);

  const [defaultDistance, setDefaultDistance] = useState("");
  const [defaultMetric, setDefaultMetric] = useState("");
  const [defaultInformationOriginate, setDefaultInformationOriginate] = useState(false);

  const [timersUpdate, setTimersUpdate] = useState("");
  const [timersTimeout, setTimersTimeout] = useState("");
  const [timersGarbageCollection, setTimersGarbageCollection] = useState("");

  const [networkDistances, setNetworkDistances] = useState<NetworkDistanceEntry[]>([]);
  const [distributeLists, setDistributeLists] = useState<DistributeListEntry[]>([]);
  const [redistribute, setRedistribute] = useState<RedistributeEntry[]>([]);

  const [networkDraft, setNetworkDraft] = useState("");
  const [interfaceDraft, setInterfaceDraft] = useState("");
  const [neighborDraft, setNeighborDraft] = useState("");
  const [routeDraft, setRouteDraft] = useState("");
  const [passiveInterfaceDraft, setPassiveInterfaceDraft] = useState("");

  const [networkDistanceDraft, setNetworkDistanceDraft] = useState<NetworkDistanceEntry>({
    prefix: "",
    distance: "",
    accessList: "",
  });
  const [distributeDraft, setDistributeDraft] = useState<DistributeListEntry>({
    scope: "global",
    interface: "",
    listType: "access-list",
    direction: "in",
    name: "",
  });
  const [redistributeDraft, setRedistributeDraft] = useState<RedistributeEntry>({
    protocol: REDISTRIBUTE_PROTOCOLS[0],
    metric: "",
    routeMap: "",
  });

  const [interfaceOptions, setInterfaceOptions] = useState<InterfaceOption[]>([]);
  const [routeMapNames, setRouteMapNames] = useState<string[]>([]);
  const [accessListNames, setAccessListNames] = useState<string[]>([]);
  const [prefixListNames, setPrefixListNames] = useState<string[]>([]);

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

      const [
        ripConfig,
        ethernetConfig,
        physicalConfig,
        allInterfacesConfig,
        routeMapConfig,
        accessListConfig,
        prefixListConfig,
      ] = await Promise.all([
        ripService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
        routeMapService.getConfig().catch(() => ({ route_maps: [], total: 0 })),
        accessListService.getConfig().catch(() => ({ ipv4_lists: [], ipv6_lists: [] })),
        prefixListService.getConfig().catch(() => ({ ipv4_lists: [], ipv6_lists: [] })),
      ]);

      const root = asObject((ripConfig as { rip?: unknown }).rip);
      const parsed = parseState(root);

      setCurrentState(parsed);

      setNetworks(parsed.networks);
      setInterfaces(parsed.interfaces);
      setNeighbors(parsed.neighbors);
      setRoutes(parsed.routes);

      setPassiveDefault(parsed.passiveDefault);
      setPassiveInterfaces(parsed.passiveInterfaces);

      setDefaultDistance(parsed.defaultDistance);
      setDefaultMetric(parsed.defaultMetric);
      setDefaultInformationOriginate(parsed.defaultInformationOriginate);

      setTimersUpdate(parsed.timersUpdate);
      setTimersTimeout(parsed.timersTimeout);
      setTimersGarbageCollection(parsed.timersGarbageCollection);

      setNetworkDistances(parsed.networkDistances);
      setDistributeLists(parsed.distributeLists);
      setRedistribute(parsed.redistribute);

      const ethIfaces = (ethernetConfig as { interfaces?: Array<{ name: string; description?: string | null }> }).interfaces ?? [];
      const descriptionByName = ethIfaces.reduce<Record<string, string | null>>((acc, iface) => {
        acc[iface.name] = iface.description ?? null;
        return acc;
      }, {});

      const interfaceNames = new Set<string>();
      ethIfaces.forEach((iface) => interfaceNames.add(iface.name));
      ((physicalConfig as { interfaces?: Array<{ interface: string }> }).interfaces ?? []).forEach((iface) =>
        interfaceNames.add(iface.interface)
      );
      ((allInterfacesConfig as { interfaces?: Array<{ name: string }> }).interfaces ?? []).forEach((iface) =>
        interfaceNames.add(iface.name)
      );
      parsed.interfaces.forEach((iface) => interfaceNames.add(iface));
      parsed.passiveInterfaces.forEach((iface) => interfaceNames.add(iface));
      parsed.distributeLists
        .filter((entry) => entry.scope === "interface")
        .forEach((entry) => {
          if (entry.interface) interfaceNames.add(entry.interface);
        });

      const parsedInterfaceOptions = [...interfaceNames]
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setInterfaceOptions(parsedInterfaceOptions);

      const firstInterface = parsedInterfaceOptions[0]?.value ?? "";
      setInterfaceDraft((prev) => prev || firstInterface);
      setPassiveInterfaceDraft((prev) => prev || firstInterface);
      setDistributeDraft((prev) => ({
        ...prev,
        interface: prev.interface || firstInterface,
      }));

      const rmNames = uniqueSorted(
        ((routeMapConfig as { route_maps?: Array<{ name: string }> }).route_maps ?? []).map((item) =>
          item.name
        )
      );
      setRouteMapNames(rmNames);

      const acl = accessListConfig as {
        ipv4_lists?: Array<{ number: string }>;
        ipv6_lists?: Array<{ number: string }>;
      };
      const aclNames = uniqueSorted([
        ...(acl.ipv4_lists ?? []).map((item) => String(item.number)),
        ...(acl.ipv6_lists ?? []).map((item) => String(item.number)),
      ]);
      setAccessListNames(aclNames);

      const pfx = prefixListConfig as {
        ipv4_lists?: Array<{ name: string }>;
        ipv6_lists?: Array<{ name: string }>;
      };
      const pfxNames = uniqueSorted([
        ...(pfx.ipv4_lists ?? []).map((item) => item.name),
        ...(pfx.ipv6_lists ?? []).map((item) => item.name),
      ]);
      setPrefixListNames(pfxNames);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load RIP configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addSimpleValue = (
    value: string,
    setter: Dispatch<SetStateAction<string[]>>,
    label: string,
    onReset: () => void
  ) => {
    const normalized = value.trim();
    if (!normalized) {
      setError(`${label} is required.`);
      return;
    }
    setError(null);
    setter((prev) => uniqueSorted([...prev, normalized]));
    onReset();
  };

  const handleAddNetworkDistance = () => {
    const normalized = normalizeNetworkDistance(networkDistanceDraft);
    if (!normalized.prefix || !normalized.distance) {
      setError("Network distance requires both prefix and distance.");
      return;
    }

    setError(null);
    setNetworkDistances((prev) => {
      const without = prev.filter((entry) => entry.prefix !== normalized.prefix);
      return [...without, normalized].sort((a, b) =>
        a.prefix.localeCompare(b.prefix, undefined, { numeric: true })
      );
    });
    setNetworkDistanceDraft((prev) => ({ ...prev, prefix: "", distance: "", accessList: "" }));
  };

  const handleAddDistribute = () => {
    const normalized = normalizeDistributeEntry(distributeDraft);
    if (!normalized.name) {
      setError("Distribute-list name is required.");
      return;
    }
    if (normalized.scope === "interface" && !normalized.interface) {
      setError("Interface distribute-list requires an interface.");
      return;
    }

    setError(null);
    setDistributeLists((prev) => {
      const key = distributeKey(normalized);
      const without = prev.filter((entry) => distributeKey(entry) !== key);
      return [...without, normalized].sort((a, b) => distributeKey(a).localeCompare(distributeKey(b)));
    });
  };

  const handleAddRedistribute = () => {
    const normalized = normalizeRedistribute(redistributeDraft);
    if (!normalized.protocol) {
      setError("Redistribute protocol is required.");
      return;
    }

    setError(null);
    setRedistribute((prev) => {
      const without = prev.filter((entry) => entry.protocol !== normalized.protocol);
      return [...without, normalized].sort((a, b) => a.protocol.localeCompare(b.protocol));
    });
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const desiredState: RipState = {
        networks: uniqueSorted(networks),
        interfaces: uniqueSorted(interfaces),
        neighbors: uniqueSorted(neighbors),
        routes: uniqueSorted(routes),
        passiveDefault,
        passiveInterfaces: uniqueSorted(passiveInterfaces),
        defaultDistance: defaultDistance.trim(),
        defaultMetric: defaultMetric.trim(),
        defaultInformationOriginate,
        timersUpdate: timersUpdate.trim(),
        timersTimeout: timersTimeout.trim(),
        timersGarbageCollection: timersGarbageCollection.trim(),
        networkDistances: networkDistances
          .map(normalizeNetworkDistance)
          .sort((a, b) => a.prefix.localeCompare(b.prefix, undefined, { numeric: true })),
        distributeLists: distributeLists
          .map(normalizeDistributeEntry)
          .sort((a, b) => distributeKey(a).localeCompare(distributeKey(b))),
        redistribute: redistribute
          .map(normalizeRedistribute)
          .sort((a, b) => a.protocol.localeCompare(b.protocol)),
      };

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
        currentState.defaultDistance,
        desiredState.defaultDistance,
        (value) => `set protocols rip default-distance ${value}`,
        "delete protocols rip default-distance"
      );

      applyScalar(
        currentState.defaultMetric,
        desiredState.defaultMetric,
        (value) => `set protocols rip default-metric ${value}`,
        "delete protocols rip default-metric"
      );

      applyScalar(
        currentState.timersUpdate,
        desiredState.timersUpdate,
        (value) => `set protocols rip timers update ${value}`,
        "delete protocols rip timers update"
      );

      applyScalar(
        currentState.timersTimeout,
        desiredState.timersTimeout,
        (value) => `set protocols rip timers timeout ${value}`,
        "delete protocols rip timers timeout"
      );

      applyScalar(
        currentState.timersGarbageCollection,
        desiredState.timersGarbageCollection,
        (value) => `set protocols rip timers garbage-collection ${value}`,
        "delete protocols rip timers garbage-collection"
      );

      if (currentState.defaultInformationOriginate !== desiredState.defaultInformationOriginate) {
        operations.push(
          desiredState.defaultInformationOriginate
            ? "set protocols rip default-information originate"
            : "delete protocols rip default-information originate"
        );
      }

      if (currentState.passiveDefault !== desiredState.passiveDefault) {
        operations.push(
          desiredState.passiveDefault
            ? "set protocols rip passive-interface default"
            : "delete protocols rip passive-interface default"
        );
      }

      const diffList = (
        current: string[],
        desired: string[],
        setCmd: (value: string) => string,
        delCmd: (value: string) => string
      ) => {
        const currentSet = new Set(current);
        const desiredSet = new Set(desired);
        for (const value of currentSet) {
          if (!desiredSet.has(value)) {
            operations.push(delCmd(value));
          }
        }
        for (const value of desiredSet) {
          if (!currentSet.has(value)) {
            operations.push(setCmd(value));
          }
        }
      };

      diffList(
        currentState.networks,
        desiredState.networks,
        (value) => `set protocols rip network ${value}`,
        (value) => `delete protocols rip network ${value}`
      );

      diffList(
        currentState.interfaces,
        desiredState.interfaces,
        (value) => `set protocols rip interface ${value}`,
        (value) => `delete protocols rip interface ${value}`
      );

      diffList(
        currentState.neighbors,
        desiredState.neighbors,
        (value) => `set protocols rip neighbor ${value}`,
        (value) => `delete protocols rip neighbor ${value}`
      );

      diffList(
        currentState.routes,
        desiredState.routes,
        (value) => `set protocols rip route ${value}`,
        (value) => `delete protocols rip route ${value}`
      );

      diffList(
        currentState.passiveInterfaces,
        desiredState.passiveInterfaces,
        (value) => `set protocols rip passive-interface ${value}`,
        (value) => `delete protocols rip passive-interface ${value}`
      );

      const currentNetworkDistanceMap = new Map(
        currentState.networkDistances.map((entry) => [entry.prefix, entry])
      );
      const desiredNetworkDistanceMap = new Map(
        desiredState.networkDistances.map((entry) => [entry.prefix, entry])
      );

      for (const [prefix] of currentNetworkDistanceMap) {
        if (!desiredNetworkDistanceMap.has(prefix)) {
          operations.push(`delete protocols rip network-distance ${prefix}`);
        }
      }

      for (const [prefix, desiredEntry] of desiredNetworkDistanceMap) {
        if (!desiredEntry.distance) {
          throw new Error(`Network distance entry '${prefix}' requires a distance value.`);
        }
        const currentEntry = currentNetworkDistanceMap.get(prefix);
        const changed =
          !currentEntry ||
          currentEntry.distance !== desiredEntry.distance ||
          currentEntry.accessList !== desiredEntry.accessList;

        if (!changed) continue;

        if (currentEntry) {
          operations.push(`delete protocols rip network-distance ${prefix}`);
        }

        operations.push(
          `set protocols rip network-distance ${prefix} distance ${desiredEntry.distance}`
        );
        if (desiredEntry.accessList) {
          operations.push(
            `set protocols rip network-distance ${prefix} access-list ${desiredEntry.accessList}`
          );
        }
      }

      const currentDistributeMap = new Map(
        currentState.distributeLists.map((entry) => [distributeKey(entry), entry])
      );
      const desiredDistributeMap = new Map(
        desiredState.distributeLists.map((entry) => [distributeKey(entry), entry])
      );

      for (const [key, currentEntry] of currentDistributeMap) {
        if (!desiredDistributeMap.has(key)) {
          operations.push(buildDistributeDeleteCommand(currentEntry));
        }
      }

      for (const [key, desiredEntry] of desiredDistributeMap) {
        const currentEntry = currentDistributeMap.get(key);
        if (!currentEntry) {
          operations.push(buildDistributeSetCommand(desiredEntry));
          continue;
        }
        if (currentEntry.name !== desiredEntry.name) {
          operations.push(buildDistributeDeleteCommand(currentEntry));
          operations.push(buildDistributeSetCommand(desiredEntry));
        }
      }

      const currentRedistributeMap = new Map(
        currentState.redistribute.map((entry) => [entry.protocol, entry])
      );
      const desiredRedistributeMap = new Map(
        desiredState.redistribute.map((entry) => [entry.protocol, entry])
      );

      for (const [protocol] of currentRedistributeMap) {
        if (!desiredRedistributeMap.has(protocol)) {
          operations.push(`delete protocols rip redistribute ${protocol}`);
        }
      }

      for (const [protocol, desiredEntry] of desiredRedistributeMap) {
        const currentEntry = currentRedistributeMap.get(protocol);
        const changed =
          !currentEntry ||
          currentEntry.metric !== desiredEntry.metric ||
          currentEntry.routeMap !== desiredEntry.routeMap;

        if (!changed) continue;

        if (currentEntry) {
          operations.push(`delete protocols rip redistribute ${protocol}`);
        }

        operations.push(`set protocols rip redistribute ${protocol}`);
        if (desiredEntry.metric) {
          operations.push(`set protocols rip redistribute ${protocol} metric ${desiredEntry.metric}`);
        }
        if (desiredEntry.routeMap) {
          operations.push(
            `set protocols rip redistribute ${protocol} route-map ${desiredEntry.routeMap}`
          );
        }
      }

      const finalOperations = [...new Set(operations.map((item) => item.trim()).filter(Boolean))];
      if (finalOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await ripService.batchConfigure({ operations: finalOperations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply RIP configuration");
      }

      setMessage("RIP configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save RIP configuration");
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
          <h1 className="text-2xl font-bold text-foreground">RIP</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Full-form RIP configuration for interfaces, networks, timers, filters, and redistribution.
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

      {interfaceOptions.length === 0 && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="p-3 text-xs text-amber-300">
            No interfaces were discovered. Configure interfaces first to use interface-based RIP controls.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Global Parameters</CardTitle>
            <CardDescription>Process-level defaults and timer controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Default Distance</Label>
                <Input
                  type="number"
                  value={defaultDistance}
                  placeholder="120"
                  onChange={(event) => setDefaultDistance(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Default Metric</Label>
                <Input
                  type="number"
                  value={defaultMetric}
                  placeholder="1"
                  onChange={(event) => setDefaultMetric(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Timer: Update</Label>
                <Input
                  type="number"
                  value={timersUpdate}
                  placeholder="30"
                  onChange={(event) => setTimersUpdate(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Timer: Timeout</Label>
                <Input
                  type="number"
                  value={timersTimeout}
                  placeholder="180"
                  onChange={(event) => setTimersTimeout(event.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Timer: Garbage Collection</Label>
                <Input
                  type="number"
                  value={timersGarbageCollection}
                  placeholder="120"
                  onChange={(event) => setTimersGarbageCollection(event.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="rip-default-originate"
                checked={defaultInformationOriginate}
                onCheckedChange={(checked) => setDefaultInformationOriginate(Boolean(checked))}
              />
              <Label htmlFor="rip-default-originate">Originate default information</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Networks and Neighbors</CardTitle>
            <CardDescription>
              Configure participating networks, interfaces, explicit neighbors, and route filters.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Networks</h3>
                <Badge variant="secondary">{networks.length}</Badge>
              </div>
              {networks.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {networks.map((item) => (
                    <Badge key={item} variant="outline" className="gap-1 font-mono text-xs">
                      {item}
                      <button
                        className="ml-1 text-muted-foreground hover:text-destructive"
                        onClick={() => setNetworks((prev) => prev.filter((value) => value !== item))}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={networkDraft}
                  placeholder="10.0.0.0/24"
                  onChange={(event) => setNetworkDraft(event.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    addSimpleValue(networkDraft, setNetworks, "Network prefix", () => setNetworkDraft(""))
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Interfaces</h3>
                <Badge variant="secondary">{interfaces.length}</Badge>
              </div>
              {interfaces.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {interfaces.map((item) => (
                    <Badge key={item} variant="outline" className="gap-1 text-xs">
                      {interfaceLabelByName[item] || item}
                      <button
                        className="ml-1 text-muted-foreground hover:text-destructive"
                        onClick={() => setInterfaces((prev) => prev.filter((value) => value !== item))}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Select value={interfaceDraft || "__none__"} onValueChange={(value) => setInterfaceDraft(value === "__none__" ? "" : value)}>
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
                <Button
                  variant="outline"
                  onClick={() =>
                    addSimpleValue(interfaceDraft, setInterfaces, "Interface", () => setInterfaceDraft(""))
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Neighbors</h3>
                <Badge variant="secondary">{neighbors.length}</Badge>
              </div>
              {neighbors.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {neighbors.map((item) => (
                    <Badge key={item} variant="outline" className="gap-1 font-mono text-xs">
                      {item}
                      <button
                        className="ml-1 text-muted-foreground hover:text-destructive"
                        onClick={() => setNeighbors((prev) => prev.filter((value) => value !== item))}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={neighborDraft}
                  placeholder="192.0.2.1"
                  onChange={(event) => setNeighborDraft(event.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    addSimpleValue(neighborDraft, setNeighbors, "Neighbor address", () => setNeighborDraft(""))
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Route Networks</h3>
                <Badge variant="secondary">{routes.length}</Badge>
              </div>
              {routes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {routes.map((item) => (
                    <Badge key={item} variant="outline" className="gap-1 font-mono text-xs">
                      {item}
                      <button
                        className="ml-1 text-muted-foreground hover:text-destructive"
                        onClick={() => setRoutes((prev) => prev.filter((value) => value !== item))}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={routeDraft}
                  placeholder="10.10.0.0/24"
                  onChange={(event) => setRouteDraft(event.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    addSimpleValue(routeDraft, setRoutes, "Route network", () => setRouteDraft(""))
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Passive Interfaces</CardTitle>
            <CardDescription>Control passive behavior per interface and default mode.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="rip-passive-default"
                checked={passiveDefault}
                onCheckedChange={(checked) => setPassiveDefault(Boolean(checked))}
              />
              <Label htmlFor="rip-passive-default">Passive interface default</Label>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Passive Interface Entries</h3>
              <Badge variant="secondary">{passiveInterfaces.length}</Badge>
            </div>
            {passiveInterfaces.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {passiveInterfaces.map((item) => (
                  <Badge key={item} variant="outline" className="gap-1 text-xs">
                    {interfaceLabelByName[item] || item}
                    <button
                      className="ml-1 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setPassiveInterfaces((prev) => prev.filter((value) => value !== item))
                      }
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Select
                value={passiveInterfaceDraft || "__none__"}
                onValueChange={(value) => setPassiveInterfaceDraft(value === "__none__" ? "" : value)}
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
              <Button
                variant="outline"
                onClick={() =>
                  addSimpleValue(
                    passiveInterfaceDraft,
                    setPassiveInterfaces,
                    "Passive interface",
                    () => setPassiveInterfaceDraft("")
                  )
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Network Distance</CardTitle>
            <CardDescription>
              Configure distance and optional access-list per destination network.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {networkDistances.length === 0 ? (
              <p className="text-sm text-muted-foreground">No network-distance entries configured.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Access-list</TableHead>
                    <TableHead className="w-[90px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {networkDistances.map((entry) => (
                    <TableRow key={entry.prefix}>
                      <TableCell className="font-mono text-xs">{entry.prefix}</TableCell>
                      <TableCell>{entry.distance}</TableCell>
                      <TableCell>{entry.accessList || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setNetworkDistances((prev) =>
                              prev.filter((item) => item.prefix !== entry.prefix)
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
                value={networkDistanceDraft.prefix}
                placeholder="10.0.0.0/24"
                onChange={(event) =>
                  setNetworkDistanceDraft((prev) => ({ ...prev, prefix: event.target.value }))
                }
              />
              <Input
                type="number"
                value={networkDistanceDraft.distance}
                placeholder="120"
                onChange={(event) =>
                  setNetworkDistanceDraft((prev) => ({ ...prev, distance: event.target.value }))
                }
              />
              <Select
                value={networkDistanceDraft.accessList || "__none__"}
                onValueChange={(value) =>
                  setNetworkDistanceDraft((prev) => ({
                    ...prev,
                    accessList: value === "__none__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Access-list (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No access-list</SelectItem>
                  {accessListNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleAddNetworkDistance}>
                <Plus className="mr-2 h-4 w-4" />
                Add / Update Network Distance
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribute Lists</CardTitle>
            <CardDescription>
              Configure access-list or prefix-list filters globally or per interface.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {distributeLists.length === 0 ? (
              <p className="text-sm text-muted-foreground">No distribute-list entries configured.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[90px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distributeLists.map((entry) => (
                    <TableRow key={distributeKey(entry)}>
                      <TableCell>
                        {entry.scope === "global"
                          ? "global"
                          : interfaceLabelByName[entry.interface] || entry.interface}
                      </TableCell>
                      <TableCell>{entry.listType}</TableCell>
                      <TableCell>{entry.direction}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.name}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDistributeLists((prev) =>
                              prev.filter((item) => distributeKey(item) !== distributeKey(entry))
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
                value={distributeDraft.scope}
                onValueChange={(value: DistributeScope) =>
                  setDistributeDraft((prev) => ({ ...prev, scope: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">global</SelectItem>
                  <SelectItem value="interface">interface</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={distributeDraft.listType}
                onValueChange={(value: DistributeListType) =>
                  setDistributeDraft((prev) => ({ ...prev, listType: value, name: "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="List type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="access-list">access-list</SelectItem>
                  <SelectItem value="prefix-list">prefix-list</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={distributeDraft.direction}
                onValueChange={(value: DistributeDirection) =>
                  setDistributeDraft((prev) => ({ ...prev, direction: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">in</SelectItem>
                  <SelectItem value="out">out</SelectItem>
                </SelectContent>
              </Select>

              {distributeDraft.scope === "interface" && (
                <Select
                  value={distributeDraft.interface || "__none__"}
                  onValueChange={(value) =>
                    setDistributeDraft((prev) => ({
                      ...prev,
                      interface: value === "__none__" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Interface" />
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
              )}

              <Select
                value={distributeDraft.name || "__none__"}
                onValueChange={(value) =>
                  setDistributeDraft((prev) => ({
                    ...prev,
                    name: value === "__none__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="List name" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select list</SelectItem>
                  {(distributeDraft.listType === "access-list" ? accessListNames : prefixListNames).map(
                    (name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleAddDistribute}>
                <Plus className="mr-2 h-4 w-4" />
                Add / Update Distribute-list
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Redistribution</CardTitle>
            <CardDescription>
              Redistribute routes from other protocols with optional metric and route-map.
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
                    <TableHead>Metric</TableHead>
                    <TableHead>Route-map</TableHead>
                    <TableHead className="w-[90px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {redistribute.map((entry) => (
                    <TableRow key={entry.protocol}>
                      <TableCell className="font-mono text-xs">{entry.protocol}</TableCell>
                      <TableCell>{entry.metric || "-"}</TableCell>
                      <TableCell>{entry.routeMap || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setRedistribute((prev) =>
                              prev.filter((item) => item.protocol !== entry.protocol)
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
                  <SelectValue placeholder="Route-map (optional)" />
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
              <Button variant="outline" onClick={handleAddRedistribute}>
                <Plus className="mr-2 h-4 w-4" />
                Add / Update Redistribution
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
