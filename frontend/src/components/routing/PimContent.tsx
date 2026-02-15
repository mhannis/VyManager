"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
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
import { pimService } from "@/lib/api/pim";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { routingProtocolGuides } from "@/lib/help/routingProtocolGuides";
import { formatInterfaceDisplayName } from "@/lib/utils";

type InterfaceOption = {
  value: string;
  label: string;
};

type PimGlobals = {
  ecmp: boolean;
  ecmpRebalance: boolean;
  joinPruneInterval: string;
  keepAliveTimer: string;
  packets: string;
  registerAcceptList: string;
  registerSuppressTime: string;
  rpKeepAliveTimer: string;
  noV6Secondary: boolean;
  sptInfinityAndBeyond: boolean;
  sptPrefixList: string;
  ssmPrefixList: string;
  igmpWatermarkWarning: string;
};

type PimInterfaceEntry = {
  interface: string;
  bfd: boolean;
  bfdProfile: string;
  drPriority: string;
  hello: string;
  noBsm: boolean;
  noUnicastBsm: boolean;
  passive: boolean;
  sourceAddress: string;
  igmpQueryInterval: string;
  igmpQueryMaxResponseTime: string;
  igmpVersion: string;
};

type PimRpEntry = {
  address: string;
  group: string;
};

type PimIgmpJoinEntry = {
  interface: string;
  group: string;
  sourceAddress: string;
};

type PimState = {
  globals: PimGlobals;
  interfaces: PimInterfaceEntry[];
  rpEntries: PimRpEntry[];
  igmpJoins: PimIgmpJoinEntry[];
};

const EMPTY_GLOBALS: PimGlobals = {
  ecmp: false,
  ecmpRebalance: false,
  joinPruneInterval: "",
  keepAliveTimer: "",
  packets: "",
  registerAcceptList: "",
  registerSuppressTime: "",
  rpKeepAliveTimer: "",
  noV6Secondary: false,
  sptInfinityAndBeyond: false,
  sptPrefixList: "",
  ssmPrefixList: "",
  igmpWatermarkWarning: "",
};

const EMPTY_INTERFACE: PimInterfaceEntry = {
  interface: "",
  bfd: false,
  bfdProfile: "",
  drPriority: "",
  hello: "",
  noBsm: false,
  noUnicastBsm: false,
  passive: false,
  sourceAddress: "",
  igmpQueryInterval: "",
  igmpQueryMaxResponseTime: "",
  igmpVersion: "",
};

const EMPTY_RP: PimRpEntry = {
  address: "",
  group: "",
};

const EMPTY_JOIN: PimIgmpJoinEntry = {
  interface: "",
  group: "",
  sourceAddress: "",
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

function parseGlobals(root: Record<string, unknown>): PimGlobals {
  const ecmp = asObject(root.ecmp);
  const rp = asObject(root.rp);
  const spt = asObject(root["spt-switchover"] ?? root.spt_switchover);
  const infinity = asObject(spt["infinity-and-beyond"] ?? spt.infinity_and_beyond);
  const ssm = asObject(root.ssm);
  const igmp = asObject(root.igmp);

  return {
    ecmp: Object.prototype.hasOwnProperty.call(root, "ecmp"),
    ecmpRebalance: Object.prototype.hasOwnProperty.call(ecmp, "rebalance"),
    joinPruneInterval: asString(root["join-prune-interval"] ?? root.join_prune_interval),
    keepAliveTimer: asString(root["keep-alive-timer"] ?? root.keep_alive_timer),
    packets: asString(root.packets),
    registerAcceptList: asString(root["register-accept-list"] ?? root.register_accept_list),
    registerSuppressTime: asString(root["register-suppress-time"] ?? root.register_suppress_time),
    rpKeepAliveTimer: asString(rp["keep-alive-timer"] ?? rp.keep_alive_timer),
    noV6Secondary: Object.prototype.hasOwnProperty.call(root, "no-v6-secondary"),
    sptInfinityAndBeyond:
      Object.prototype.hasOwnProperty.call(spt, "infinity-and-beyond") ||
      Object.prototype.hasOwnProperty.call(spt, "infinity_and_beyond"),
    sptPrefixList: asString(infinity["prefix-list"] ?? infinity.prefix_list),
    ssmPrefixList: asString(ssm["prefix-list"] ?? ssm.prefix_list),
    igmpWatermarkWarning: asString(igmp["watermark-warning"] ?? igmp.watermark_warning),
  };
}

function parseInterfaces(root: Record<string, unknown>): PimInterfaceEntry[] {
  const rows: PimInterfaceEntry[] = [];
  const interfaceRoot = asObject(root.interface);

  for (const [iface, ifaceConfig] of Object.entries(interfaceRoot)) {
    const cfg = asObject(ifaceConfig);
    const bfd = asObject(cfg.bfd);
    const igmp = asObject(cfg.igmp);

    rows.push({
      interface: iface,
      bfd: Object.prototype.hasOwnProperty.call(cfg, "bfd"),
      bfdProfile: parseDirectOrKey(bfd.profile),
      drPriority: asString(cfg["dr-priority"] ?? cfg.dr_priority),
      hello: asString(cfg.hello),
      noBsm: Object.prototype.hasOwnProperty.call(cfg, "no-bsm"),
      noUnicastBsm: Object.prototype.hasOwnProperty.call(cfg, "no-unicast-bsm"),
      passive: Object.prototype.hasOwnProperty.call(cfg, "passive"),
      sourceAddress: asString(cfg["source-address"] ?? cfg.source_address),
      igmpQueryInterval: asString(igmp["query-interval"] ?? igmp.query_interval),
      igmpQueryMaxResponseTime: asString(
        igmp["query-max-response-time"] ?? igmp.query_max_response_time
      ),
      igmpVersion: parseDirectOrKey(igmp.version),
    });
  }

  return rows.sort((left, right) =>
    left.interface.localeCompare(right.interface, undefined, { numeric: true })
  );
}

function parseRpEntries(root: Record<string, unknown>): PimRpEntry[] {
  const rows: PimRpEntry[] = [];
  const rpRoot = asObject(root.rp);

  for (const [address, cfg] of Object.entries(rpRoot)) {
    if (address === "keep-alive-timer" || address === "keep_alive_timer") {
      continue;
    }

    const groups = asObject(asObject(cfg).group);
    const groupKeys = Object.keys(groups);
    if (groupKeys.length === 0) {
      rows.push({ address, group: "" });
      continue;
    }

    for (const group of groupKeys) {
      rows.push({ address, group });
    }
  }

  return rows.sort((left, right) => {
    const addressOrder = left.address.localeCompare(right.address, undefined, { numeric: true });
    if (addressOrder !== 0) return addressOrder;
    return left.group.localeCompare(right.group, undefined, { numeric: true });
  });
}

function parseIgmpJoins(root: Record<string, unknown>): PimIgmpJoinEntry[] {
  const rows: PimIgmpJoinEntry[] = [];
  const interfaceRoot = asObject(root.interface);

  for (const [iface, ifaceConfig] of Object.entries(interfaceRoot)) {
    const igmp = asObject(asObject(ifaceConfig).igmp);
    const joinRoot = asObject(igmp.join);
    for (const [group, joinCfg] of Object.entries(joinRoot)) {
      const sourceAddress = asString(
        asObject(joinCfg)["source-address"] ?? asObject(joinCfg).source_address
      );
      rows.push({
        interface: iface,
        group,
        sourceAddress,
      });
    }
  }

  return rows.sort((left, right) => {
    const ifaceOrder = left.interface.localeCompare(right.interface, undefined, { numeric: true });
    if (ifaceOrder !== 0) return ifaceOrder;
    return left.group.localeCompare(right.group, undefined, { numeric: true });
  });
}

function normalizeGlobals(globals: PimGlobals): PimGlobals {
  return {
    ecmp: Boolean(globals.ecmp),
    ecmpRebalance: Boolean(globals.ecmpRebalance),
    joinPruneInterval: globals.joinPruneInterval.trim(),
    keepAliveTimer: globals.keepAliveTimer.trim(),
    packets: globals.packets.trim(),
    registerAcceptList: globals.registerAcceptList.trim(),
    registerSuppressTime: globals.registerSuppressTime.trim(),
    rpKeepAliveTimer: globals.rpKeepAliveTimer.trim(),
    noV6Secondary: Boolean(globals.noV6Secondary),
    sptInfinityAndBeyond: Boolean(globals.sptInfinityAndBeyond),
    sptPrefixList: globals.sptPrefixList.trim(),
    ssmPrefixList: globals.ssmPrefixList.trim(),
    igmpWatermarkWarning: globals.igmpWatermarkWarning.trim(),
  };
}

function normalizeInterface(entry: PimInterfaceEntry): PimInterfaceEntry {
  return {
    interface: entry.interface.trim(),
    bfd: Boolean(entry.bfd),
    bfdProfile: entry.bfdProfile.trim(),
    drPriority: entry.drPriority.trim(),
    hello: entry.hello.trim(),
    noBsm: Boolean(entry.noBsm),
    noUnicastBsm: Boolean(entry.noUnicastBsm),
    passive: Boolean(entry.passive),
    sourceAddress: entry.sourceAddress.trim(),
    igmpQueryInterval: entry.igmpQueryInterval.trim(),
    igmpQueryMaxResponseTime: entry.igmpQueryMaxResponseTime.trim(),
    igmpVersion: entry.igmpVersion.trim(),
  };
}

function normalizeRp(entry: PimRpEntry): PimRpEntry {
  return {
    address: entry.address.trim(),
    group: entry.group.trim(),
  };
}

function normalizeJoin(entry: PimIgmpJoinEntry): PimIgmpJoinEntry {
  return {
    interface: entry.interface.trim(),
    group: entry.group.trim(),
    sourceAddress: entry.sourceAddress.trim(),
  };
}

function interfacesEqual(left: PimInterfaceEntry, right: PimInterfaceEntry): boolean {
  return (
    left.interface === right.interface &&
    left.bfd === right.bfd &&
    left.bfdProfile === right.bfdProfile &&
    left.drPriority === right.drPriority &&
    left.hello === right.hello &&
    left.noBsm === right.noBsm &&
    left.noUnicastBsm === right.noUnicastBsm &&
    left.passive === right.passive &&
    left.sourceAddress === right.sourceAddress &&
    left.igmpQueryInterval === right.igmpQueryInterval &&
    left.igmpQueryMaxResponseTime === right.igmpQueryMaxResponseTime &&
    left.igmpVersion === right.igmpVersion
  );
}

function rpKey(entry: PimRpEntry): string {
  return `${entry.address}|${entry.group}`;
}

function joinKey(entry: PimIgmpJoinEntry): string {
  return `${entry.interface}|${entry.group}`;
}

function rpEquals(left: PimRpEntry, right: PimRpEntry): boolean {
  return left.address === right.address && left.group === right.group;
}

function joinEquals(left: PimIgmpJoinEntry, right: PimIgmpJoinEntry): boolean {
  return (
    left.interface === right.interface &&
    left.group === right.group &&
    left.sourceAddress === right.sourceAddress
  );
}

function interfaceSetCommands(entry: PimInterfaceEntry): string[] {
  const iface = entry.interface;
  const base = `protocols pim interface ${iface}`;
  const commands: string[] = [`set ${base}`];

  if (entry.bfd) {
    commands.push(`set ${base} bfd`);
    if (entry.bfdProfile) {
      commands.push(`set ${base} bfd profile ${entry.bfdProfile}`);
    }
  }
  if (entry.drPriority) {
    commands.push(`set ${base} dr-priority ${entry.drPriority}`);
  }
  if (entry.hello) {
    commands.push(`set ${base} hello ${entry.hello}`);
  }
  if (entry.noBsm) {
    commands.push(`set ${base} no-bsm`);
  }
  if (entry.noUnicastBsm) {
    commands.push(`set ${base} no-unicast-bsm`);
  }
  if (entry.passive) {
    commands.push(`set ${base} passive`);
  }
  if (entry.sourceAddress) {
    commands.push(`set ${base} source-address ${entry.sourceAddress}`);
  }
  if (entry.igmpQueryInterval) {
    commands.push(`set ${base} igmp query-interval ${entry.igmpQueryInterval}`);
  }
  if (entry.igmpQueryMaxResponseTime) {
    commands.push(
      `set ${base} igmp query-max-response-time ${entry.igmpQueryMaxResponseTime}`
    );
  }
  if (entry.igmpVersion) {
    commands.push(`set ${base} igmp version ${entry.igmpVersion}`);
  }

  return commands;
}

function joinSetCommand(entry: PimIgmpJoinEntry): string {
  if (entry.sourceAddress) {
    return `set protocols pim interface ${entry.interface} igmp join ${entry.group} source-address ${entry.sourceAddress}`;
  }
  return `set protocols pim interface ${entry.interface} igmp join ${entry.group}`;
}

function applyScalar(
  operations: string[],
  currentValue: string,
  desiredValue: string,
  setCommand: (value: string) => string,
  deleteCommand: string
) {
  if (currentValue === desiredValue) {
    return;
  }
  if (desiredValue) {
    operations.push(setCommand(desiredValue));
  } else {
    operations.push(deleteCommand);
  }
}

function applyToggle(
  operations: string[],
  currentValue: boolean,
  desiredValue: boolean,
  setCommand: string,
  deleteCommand: string
) {
  if (currentValue === desiredValue) {
    return;
  }
  operations.push(desiredValue ? setCommand : deleteCommand);
}

export function PimContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<PimState | null>(null);
  const [globals, setGlobals] = useState<PimGlobals>(EMPTY_GLOBALS);
  const [interfaces, setInterfaces] = useState<PimInterfaceEntry[]>([]);
  const [rpEntries, setRpEntries] = useState<PimRpEntry[]>([]);
  const [igmpJoins, setIgmpJoins] = useState<PimIgmpJoinEntry[]>([]);

  const [interfaceDraft, setInterfaceDraft] = useState<PimInterfaceEntry>(EMPTY_INTERFACE);
  const [rpDraft, setRpDraft] = useState<PimRpEntry>(EMPTY_RP);
  const [joinDraft, setJoinDraft] = useState<PimIgmpJoinEntry>(EMPTY_JOIN);

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

      const [pimConfig, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        pimService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const root = asObject((pimConfig as { pim?: unknown }).pim);
      const parsedInterfaces = parseInterfaces(root);
      const parsedRpEntries = parseRpEntries(root);
      const parsedIgmpJoins = parseIgmpJoins(root);

      const parsedState: PimState = {
        globals: parseGlobals(root),
        interfaces: parsedInterfaces,
        rpEntries: parsedRpEntries,
        igmpJoins: parsedIgmpJoins,
      };

      setCurrentState(parsedState);
      setGlobals(parsedState.globals);
      setInterfaces(parsedState.interfaces);
      setRpEntries(parsedState.rpEntries);
      setIgmpJoins(parsedState.igmpJoins);

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
      parsedInterfaces.forEach((entry) => names.add(entry.interface));
      parsedIgmpJoins.forEach((entry) => names.add(entry.interface));

      const options = [...names]
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setInterfaceOptions(options);
      setInterfaceDraft((prev) => {
        if (prev.interface) return prev;
        return {
          ...prev,
          interface: options[0]?.value || "",
        };
      });
      setJoinDraft((prev) => {
        if (prev.interface) return prev;
        return {
          ...prev,
          interface: options[0]?.value || "",
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PIM configuration");
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
      const next = [...prev.filter((entry) => entry.interface !== normalized.interface), normalized];
      return next.sort((left, right) =>
        left.interface.localeCompare(right.interface, undefined, { numeric: true })
      );
    });
  };

  const handleEditInterface = (entry: PimInterfaceEntry) => {
    setInterfaceDraft(entry);
  };

  const handleDeleteInterface = (entry: PimInterfaceEntry) => {
    setInterfaces((prev) => prev.filter((item) => item.interface !== entry.interface));
    setIgmpJoins((prev) => prev.filter((join) => join.interface !== entry.interface));
    if (interfaceDraft.interface === entry.interface) {
      setInterfaceDraft(EMPTY_INTERFACE);
    }
  };

  const handleAddRp = () => {
    const normalized = normalizeRp(rpDraft);
    if (!normalized.address) {
      setError("RP address is required.");
      return;
    }
    if (!normalized.group) {
      setError("Multicast group/prefix is required.");
      return;
    }

    setError(null);
    setRpEntries((prev) => {
      const next = [...prev.filter((entry) => rpKey(entry) !== rpKey(normalized)), normalized];
      return next.sort((left, right) => {
        const addressOrder = left.address.localeCompare(right.address, undefined, { numeric: true });
        if (addressOrder !== 0) return addressOrder;
        return left.group.localeCompare(right.group, undefined, { numeric: true });
      });
    });
  };

  const handleDeleteRp = (entry: PimRpEntry) => {
    setRpEntries((prev) => prev.filter((item) => rpKey(item) !== rpKey(entry)));
  };

  const handleAddJoin = () => {
    const normalized = normalizeJoin(joinDraft);
    if (!normalized.interface) {
      setError("Join interface is required.");
      return;
    }
    if (!normalized.group) {
      setError("Join group address is required.");
      return;
    }

    setError(null);
    setIgmpJoins((prev) => {
      const next = [...prev.filter((entry) => joinKey(entry) !== joinKey(normalized)), normalized];
      return next.sort((left, right) => {
        const ifaceOrder = left.interface.localeCompare(right.interface, undefined, { numeric: true });
        if (ifaceOrder !== 0) return ifaceOrder;
        return left.group.localeCompare(right.group, undefined, { numeric: true });
      });
    });
  };

  const handleDeleteJoin = (entry: PimIgmpJoinEntry) => {
    setIgmpJoins((prev) => prev.filter((item) => joinKey(item) !== joinKey(entry)));
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const currentGlobals = normalizeGlobals(currentState.globals);
      const desiredGlobals = normalizeGlobals(globals);

      applyToggle(
        operations,
        currentGlobals.ecmp,
        desiredGlobals.ecmp,
        "set protocols pim ecmp",
        "delete protocols pim ecmp"
      );
      if (desiredGlobals.ecmp) {
        applyToggle(
          operations,
          currentGlobals.ecmpRebalance,
          desiredGlobals.ecmpRebalance,
          "set protocols pim ecmp rebalance",
          "delete protocols pim ecmp rebalance"
        );
      }

      applyScalar(
        operations,
        currentGlobals.joinPruneInterval,
        desiredGlobals.joinPruneInterval,
        (value) => `set protocols pim join-prune-interval ${value}`,
        "delete protocols pim join-prune-interval"
      );

      applyScalar(
        operations,
        currentGlobals.keepAliveTimer,
        desiredGlobals.keepAliveTimer,
        (value) => `set protocols pim keep-alive-timer ${value}`,
        "delete protocols pim keep-alive-timer"
      );

      applyScalar(
        operations,
        currentGlobals.packets,
        desiredGlobals.packets,
        (value) => `set protocols pim packets ${value}`,
        "delete protocols pim packets"
      );

      applyScalar(
        operations,
        currentGlobals.registerAcceptList,
        desiredGlobals.registerAcceptList,
        (value) => `set protocols pim register-accept-list ${value}`,
        "delete protocols pim register-accept-list"
      );

      applyScalar(
        operations,
        currentGlobals.registerSuppressTime,
        desiredGlobals.registerSuppressTime,
        (value) => `set protocols pim register-suppress-time ${value}`,
        "delete protocols pim register-suppress-time"
      );

      applyScalar(
        operations,
        currentGlobals.rpKeepAliveTimer,
        desiredGlobals.rpKeepAliveTimer,
        (value) => `set protocols pim rp keep-alive-timer ${value}`,
        "delete protocols pim rp keep-alive-timer"
      );

      applyToggle(
        operations,
        currentGlobals.noV6Secondary,
        desiredGlobals.noV6Secondary,
        "set protocols pim no-v6-secondary",
        "delete protocols pim no-v6-secondary"
      );

      if (currentGlobals.sptInfinityAndBeyond !== desiredGlobals.sptInfinityAndBeyond) {
        if (desiredGlobals.sptInfinityAndBeyond) {
          operations.push("set protocols pim spt-switchover infinity-and-beyond");
        } else {
          operations.push("delete protocols pim spt-switchover");
        }
      }

      if (desiredGlobals.sptInfinityAndBeyond) {
        applyScalar(
          operations,
          currentGlobals.sptPrefixList,
          desiredGlobals.sptPrefixList,
          (value) => `set protocols pim spt-switchover infinity-and-beyond prefix-list ${value}`,
          "delete protocols pim spt-switchover infinity-and-beyond prefix-list"
        );
      }

      applyScalar(
        operations,
        currentGlobals.ssmPrefixList,
        desiredGlobals.ssmPrefixList,
        (value) => `set protocols pim ssm prefix-list ${value}`,
        "delete protocols pim ssm prefix-list"
      );

      applyScalar(
        operations,
        currentGlobals.igmpWatermarkWarning,
        desiredGlobals.igmpWatermarkWarning,
        (value) => `set protocols pim igmp watermark-warning ${value}`,
        "delete protocols pim igmp watermark-warning"
      );

      const currentInterfaceMap = new Map(
        currentState.interfaces.map((entry) => [entry.interface, normalizeInterface(entry)])
      );
      const desiredInterfaceMap = new Map(
        interfaces
          .map(normalizeInterface)
          .filter((entry) => entry.interface)
          .map((entry) => [entry.interface, entry])
      );
      const joinResyncInterfaces = new Set<string>();

      for (const [iface] of currentInterfaceMap) {
        if (!desiredInterfaceMap.has(iface)) {
          operations.push(`delete protocols pim interface ${iface}`);
        }
      }

      for (const [iface, desiredEntry] of desiredInterfaceMap) {
        const currentEntry = currentInterfaceMap.get(iface);
        if (currentEntry && interfacesEqual(currentEntry, desiredEntry)) {
          continue;
        }

        if (currentEntry) {
          operations.push(`delete protocols pim interface ${iface}`);
        }
        operations.push(...interfaceSetCommands(desiredEntry));
        joinResyncInterfaces.add(iface);
      }

      const currentRpMap = new Map(
        currentState.rpEntries.map((entry) => [rpKey(entry), normalizeRp(entry)])
      );
      const desiredRpMap = new Map(
        rpEntries
          .map(normalizeRp)
          .filter((entry) => entry.address && entry.group)
          .map((entry) => [rpKey(entry), entry])
      );

      for (const [key, currentEntry] of currentRpMap) {
        if (!desiredRpMap.has(key)) {
          operations.push(`delete protocols pim rp ${currentEntry.address} group ${currentEntry.group}`);
        }
      }

      for (const [key, desiredEntry] of desiredRpMap) {
        const currentEntry = currentRpMap.get(key);
        if (currentEntry && rpEquals(currentEntry, desiredEntry)) {
          continue;
        }

        operations.push(`set protocols pim rp ${desiredEntry.address} group ${desiredEntry.group}`);
      }

      const currentJoinMap = new Map(
        currentState.igmpJoins.map((entry) => [joinKey(entry), normalizeJoin(entry)])
      );
      const desiredJoinMap = new Map(
        igmpJoins
          .map(normalizeJoin)
          .filter((entry) => entry.interface && entry.group)
          .map((entry) => [joinKey(entry), entry])
      );

      for (const [key, currentEntry] of currentJoinMap) {
        if (!desiredJoinMap.has(key)) {
          operations.push(`delete protocols pim interface ${currentEntry.interface} igmp join ${currentEntry.group}`);
        }
      }

      for (const [key, desiredEntry] of desiredJoinMap) {
        const currentEntry = currentJoinMap.get(key);
        const mustResync = joinResyncInterfaces.has(desiredEntry.interface);
        if (!mustResync && currentEntry && joinEquals(currentEntry, desiredEntry)) {
          continue;
        }

        operations.push(joinSetCommand(desiredEntry));
      }

      const finalOperations = [...new Set(operations.map((item) => item.trim()).filter(Boolean))];

      if (finalOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await pimService.batchConfigure({ operations: finalOperations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply PIM configuration");
      }

      setMessage(`Applied ${finalOperations.length} PIM operation${finalOperations.length === 1 ? "" : "s"}.`);
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save PIM configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>PIM</CardTitle>
          <CardDescription>Loading PIM configuration...</CardDescription>
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
            <CardTitle>PIM (IPv4)</CardTitle>
            <CardDescription>
              Configure global Protocol Independent Multicast parameters, interfaces, rendezvous points, and IGMP joins.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <PageGuideDialog guide={routingProtocolGuides.pim} />
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
        <CardContent className="space-y-6">
          {error && <div className="text-sm text-red-500">{error}</div>}
          {message && <div className="text-sm text-emerald-500">{message}</div>}

          <div className="space-y-3">
            <Label className="text-sm font-medium">Global Settings</Label>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Join/Prune Interval</Label>
                <Input
                  value={globals.joinPruneInterval}
                  placeholder="60"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, joinPruneInterval: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Keep-Alive Timer</Label>
                <Input
                  value={globals.keepAliveTimer}
                  placeholder="210"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, keepAliveTimer: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Packet Threshold</Label>
                <Input
                  value={globals.packets}
                  placeholder="3"
                  onChange={(event) => setGlobals((prev) => ({ ...prev, packets: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Register Accept List</Label>
                <Input
                  value={globals.registerAcceptList}
                  placeholder="PIM-REGISTER-ALLOW"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, registerAcceptList: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Register Suppress Time</Label>
                <Input
                  value={globals.registerSuppressTime}
                  placeholder="60"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, registerSuppressTime: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>RP Keep-Alive Timer</Label>
                <Input
                  value={globals.rpKeepAliveTimer}
                  placeholder="210"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, rpKeepAliveTimer: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>SSM Prefix List</Label>
                <Input
                  value={globals.ssmPrefixList}
                  placeholder="PIM-SSM"
                  onChange={(event) => setGlobals((prev) => ({ ...prev, ssmPrefixList: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>IGMP Watermark Warning</Label>
                <Input
                  value={globals.igmpWatermarkWarning}
                  placeholder="80"
                  onChange={(event) =>
                    setGlobals((prev) => ({ ...prev, igmpWatermarkWarning: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>SPT Prefix List</Label>
                <Input
                  value={globals.sptPrefixList}
                  placeholder="SPT-NO-SWITCH"
                  onChange={(event) => setGlobals((prev) => ({ ...prev, sptPrefixList: event.target.value }))}
                  disabled={!globals.sptInfinityAndBeyond}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={globals.ecmp}
                  onCheckedChange={(value) =>
                    setGlobals((prev) => ({
                      ...prev,
                      ecmp: Boolean(value),
                      ecmpRebalance: Boolean(value) ? prev.ecmpRebalance : false,
                    }))
                  }
                />
                Enable ECMP
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={globals.ecmpRebalance}
                  disabled={!globals.ecmp}
                  onCheckedChange={(value) =>
                    setGlobals((prev) => ({ ...prev, ecmpRebalance: Boolean(value) }))
                  }
                />
                ECMP Rebalance
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={globals.noV6Secondary}
                  onCheckedChange={(value) =>
                    setGlobals((prev) => ({ ...prev, noV6Secondary: Boolean(value) }))
                  }
                />
                No IPv6 Secondary
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={globals.sptInfinityAndBeyond}
                  onCheckedChange={(value) =>
                    setGlobals((prev) => ({ ...prev, sptInfinityAndBeyond: Boolean(value) }))
                  }
                />
                SPT Switchover Infinity-and-Beyond
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Interfaces</Label>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Interface</Label>
                <Select
                  value={interfaceDraft.interface || ""}
                  onValueChange={(value) =>
                    setInterfaceDraft((prev) => ({ ...prev, interface: value }))
                  }
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
                <Label>BFD Profile</Label>
                <Input
                  value={interfaceDraft.bfdProfile}
                  placeholder="fast"
                  onChange={(event) =>
                    setInterfaceDraft((prev) => ({ ...prev, bfdProfile: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>DR Priority</Label>
                <Input
                  value={interfaceDraft.drPriority}
                  placeholder="1"
                  onChange={(event) =>
                    setInterfaceDraft((prev) => ({ ...prev, drPriority: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Hello Interval</Label>
                <Input
                  value={interfaceDraft.hello}
                  placeholder="30"
                  onChange={(event) =>
                    setInterfaceDraft((prev) => ({ ...prev, hello: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Source Address</Label>
                <Input
                  value={interfaceDraft.sourceAddress}
                  placeholder="192.0.2.2"
                  onChange={(event) =>
                    setInterfaceDraft((prev) => ({ ...prev, sourceAddress: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>IGMP Query Interval</Label>
                <Input
                  value={interfaceDraft.igmpQueryInterval}
                  placeholder="125"
                  onChange={(event) =>
                    setInterfaceDraft((prev) => ({ ...prev, igmpQueryInterval: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>IGMP Query Max Response Time</Label>
                <Input
                  value={interfaceDraft.igmpQueryMaxResponseTime}
                  placeholder="10"
                  onChange={(event) =>
                    setInterfaceDraft((prev) => ({ ...prev, igmpQueryMaxResponseTime: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>IGMP Version</Label>
                <Select
                  value={interfaceDraft.igmpVersion || ""}
                  onValueChange={(value) =>
                    setInterfaceDraft((prev) => ({ ...prev, igmpVersion: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">v2</SelectItem>
                    <SelectItem value="3">v3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={interfaceDraft.bfd}
                  onCheckedChange={(value) =>
                    setInterfaceDraft((prev) => ({ ...prev, bfd: Boolean(value) }))
                  }
                />
                Enable BFD
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={interfaceDraft.noBsm}
                  onCheckedChange={(value) =>
                    setInterfaceDraft((prev) => ({ ...prev, noBsm: Boolean(value) }))
                  }
                />
                Disable BSM
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={interfaceDraft.noUnicastBsm}
                  onCheckedChange={(value) =>
                    setInterfaceDraft((prev) => ({ ...prev, noUnicastBsm: Boolean(value) }))
                  }
                />
                Disable Unicast BSM
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={interfaceDraft.passive}
                  onCheckedChange={(value) =>
                    setInterfaceDraft((prev) => ({ ...prev, passive: Boolean(value) }))
                  }
                />
                Passive Interface
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={handleAddOrUpdateInterface}>
                <Plus className="mr-2 h-4 w-4" />
                Add / Update Interface
              </Button>
              <Button type="button" variant="ghost" onClick={() => setInterfaceDraft(EMPTY_INTERFACE)}>
                Clear Draft
              </Button>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interface</TableHead>
                    <TableHead>BFD</TableHead>
                    <TableHead>Hello</TableHead>
                    <TableHead>IGMP</TableHead>
                    <TableHead className="w-[160px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interfaces.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No PIM interfaces configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    interfaces.map((entry) => (
                      <TableRow key={entry.interface}>
                        <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                        <TableCell className="text-xs">
                          {entry.bfd ? (entry.bfdProfile ? `Enabled (${entry.bfdProfile})` : "Enabled") : "Disabled"}
                        </TableCell>
                        <TableCell className="text-xs">{entry.hello || "-"}</TableCell>
                        <TableCell className="text-xs">
                          v{entry.igmpVersion || "-"} / {entry.igmpQueryInterval || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEditInterface(entry)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteInterface(entry)}>
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
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Rendezvous Points</Label>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label>RP Address</Label>
                <Input
                  value={rpDraft.address}
                  placeholder="172.16.255.1"
                  onChange={(event) => setRpDraft((prev) => ({ ...prev, address: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Multicast Group/Prefix</Label>
                <Input
                  value={rpDraft.group}
                  placeholder="224.0.0.0/4"
                  onChange={(event) => setRpDraft((prev) => ({ ...prev, group: event.target.value }))}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="secondary" onClick={handleAddRp}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add / Update RP
                </Button>
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RP Address</TableHead>
                    <TableHead>Group/Prefix</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rpEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        No RP mappings configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rpEntries.map((entry) => (
                      <TableRow key={rpKey(entry)}>
                        <TableCell className="font-mono text-xs">{entry.address}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.group}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteRp(entry)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Interface IGMP Static Joins</Label>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Interface</Label>
                <Select
                  value={joinDraft.interface || ""}
                  onValueChange={(value) => setJoinDraft((prev) => ({ ...prev, interface: value }))}
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
                <Label>Multicast Group</Label>
                <Input
                  value={joinDraft.group}
                  placeholder="239.1.1.1"
                  onChange={(event) => setJoinDraft((prev) => ({ ...prev, group: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Source Address (optional)</Label>
                <Input
                  value={joinDraft.sourceAddress}
                  placeholder="192.0.2.10"
                  onChange={(event) =>
                    setJoinDraft((prev) => ({ ...prev, sourceAddress: event.target.value }))
                  }
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="secondary" onClick={handleAddJoin}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add / Update Join
                </Button>
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interface</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Source Address</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {igmpJoins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No IGMP joins configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    igmpJoins.map((entry) => (
                      <TableRow key={joinKey(entry)}>
                        <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.group}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.sourceAddress || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteJoin(entry)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
