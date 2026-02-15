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
import { highAvailabilityApi } from "@/lib/api/high-availability";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";

type HealthCheck = {
  script: string;
  interval: string;
  failureCount: string;
  successCount: string;
};

type TransitionScripts = {
  master: string;
  backup: string;
  fault: string;
};

type GarpSettings = {
  interval: string;
  masterDelay: string;
  masterRefresh: string;
  masterRefreshRepeat: string;
  masterRepeat: string;
};

type GlobalParams = {
  startupDelay: string;
  version: string;
  garp: GarpSettings;
};

type VrrpGroup = {
  name: string;
  interface: string;
  vrid: string;
  priority: string;
  advertiseInterval: string;
  disabled: boolean;
  noPreempt: boolean;
  rfc3768Compatibility: boolean;
  preemptDelay: string;
  peerAddress: string;
  helloSourceAddress: string;
  addresses: string[];
  excludedAddresses: string[];
  trackInterfaces: string[];
  trackExcludeVrrpInterface: boolean;
  garp: GarpSettings;
  healthCheck: HealthCheck;
  transitionScripts: TransitionScripts;
};

type SyncGroup = {
  name: string;
  members: string[];
  healthCheck: HealthCheck;
};

const EMPTY_HEALTH_CHECK: HealthCheck = {
  script: "",
  interval: "",
  failureCount: "",
  successCount: "",
};

const EMPTY_TRANSITION_SCRIPTS: TransitionScripts = {
  master: "",
  backup: "",
  fault: "",
};

const EMPTY_GARP_SETTINGS: GarpSettings = {
  interval: "",
  masterDelay: "",
  masterRefresh: "",
  masterRefreshRepeat: "",
  masterRepeat: "",
};

const EMPTY_GLOBAL_PARAMS: GlobalParams = {
  startupDelay: "",
  version: "",
  garp: { ...EMPTY_GARP_SETTINGS },
};

const EMPTY_VRRP_DRAFT: VrrpGroup = {
  name: "",
  interface: "",
  vrid: "",
  priority: "",
  advertiseInterval: "",
  disabled: false,
  noPreempt: false,
  rfc3768Compatibility: false,
  preemptDelay: "",
  peerAddress: "",
  helloSourceAddress: "",
  addresses: [],
  excludedAddresses: [],
  trackInterfaces: [],
  trackExcludeVrrpInterface: false,
  garp: { ...EMPTY_GARP_SETTINGS },
  healthCheck: { ...EMPTY_HEALTH_CHECK },
  transitionScripts: { ...EMPTY_TRANSITION_SCRIPTS },
};

const EMPTY_SYNC_DRAFT: SyncGroup = {
  name: "",
  members: [],
  healthCheck: { ...EMPTY_HEALTH_CHECK },
};

function normalizeText(value: string): string {
  return value.trim();
}

function uniqueList(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = normalizeText(value);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function parseCsvList(value: string): string[] {
  return uniqueList(value.split(",").map((item) => item.trim()));
}

function serializeCsvList(values: string[]): string {
  return uniqueList(values).join(", ");
}

function arrayEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function healthCheckEqual(left: HealthCheck, right: HealthCheck): boolean {
  return (
    left.script === right.script &&
    left.interval === right.interval &&
    left.failureCount === right.failureCount &&
    left.successCount === right.successCount
  );
}

function transitionScriptsEqual(left: TransitionScripts, right: TransitionScripts): boolean {
  return left.master === right.master && left.backup === right.backup && left.fault === right.fault;
}

function garpEqual(left: GarpSettings, right: GarpSettings): boolean {
  return (
    left.interval === right.interval &&
    left.masterDelay === right.masterDelay &&
    left.masterRefresh === right.masterRefresh &&
    left.masterRefreshRepeat === right.masterRefreshRepeat &&
    left.masterRepeat === right.masterRepeat
  );
}

function globalEqual(left: GlobalParams, right: GlobalParams): boolean {
  return (
    left.startupDelay === right.startupDelay &&
    left.version === right.version &&
    garpEqual(left.garp, right.garp)
  );
}

function groupEqual(left: VrrpGroup, right: VrrpGroup): boolean {
  return (
    left.name === right.name &&
    left.interface === right.interface &&
    left.vrid === right.vrid &&
    left.priority === right.priority &&
    left.advertiseInterval === right.advertiseInterval &&
    left.disabled === right.disabled &&
    left.noPreempt === right.noPreempt &&
    left.rfc3768Compatibility === right.rfc3768Compatibility &&
    left.preemptDelay === right.preemptDelay &&
    left.peerAddress === right.peerAddress &&
    left.helloSourceAddress === right.helloSourceAddress &&
    left.trackExcludeVrrpInterface === right.trackExcludeVrrpInterface &&
    arrayEquals([...left.addresses].sort(), [...right.addresses].sort()) &&
    arrayEquals([...left.excludedAddresses].sort(), [...right.excludedAddresses].sort()) &&
    arrayEquals([...left.trackInterfaces].sort(), [...right.trackInterfaces].sort()) &&
    garpEqual(left.garp, right.garp) &&
    healthCheckEqual(left.healthCheck, right.healthCheck) &&
    transitionScriptsEqual(left.transitionScripts, right.transitionScripts)
  );
}

function syncGroupEqual(left: SyncGroup, right: SyncGroup): boolean {
  return (
    left.name === right.name &&
    arrayEquals([...left.members].sort(), [...right.members].sort()) &&
    healthCheckEqual(left.healthCheck, right.healthCheck)
  );
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export default function HighAvailabilityPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.NETWORK);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [groups, setGroups] = useState<VrrpGroup[]>([]);
  const [syncGroups, setSyncGroups] = useState<SyncGroup[]>([]);

  const [globalParams, setGlobalParams] = useState<GlobalParams>(EMPTY_GLOBAL_PARAMS);

  const [currentGroups, setCurrentGroups] = useState<VrrpGroup[]>([]);
  const [currentSyncGroups, setCurrentSyncGroups] = useState<SyncGroup[]>([]);
  const [currentGlobalParams, setCurrentGlobalParams] = useState<GlobalParams>(EMPTY_GLOBAL_PARAMS);

  const [groupDraft, setGroupDraft] = useState<VrrpGroup>(EMPTY_VRRP_DRAFT);
  const [groupAddressesInput, setGroupAddressesInput] = useState("");
  const [groupExcludedInput, setGroupExcludedInput] = useState("");
  const [groupTrackInput, setGroupTrackInput] = useState("");

  const [syncDraft, setSyncDraft] = useState<SyncGroup>(EMPTY_SYNC_DRAFT);
  const [syncMembersInput, setSyncMembersInput] = useState("");

  const [interfaceOptions, setInterfaceOptions] = useState<Array<{ value: string; label: string }>>([]);

  const interfaceLabelByName = useMemo(
    () =>
      interfaceOptions.reduce<Record<string, string>>((acc, item) => {
        acc[item.value] = item.label;
        return acc;
      }, {}),
    [interfaceOptions]
  );

  const groupNames = useMemo(
    () => groups.map((group) => group.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [groups]
  );

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const [config, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        highAvailabilityApi.getConfig<Record<string, unknown>>(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const vrrp = asObject(config.vrrp);
      const globalRoot = asObject(vrrp["global-parameters"]);
      const globalGarpRoot = asObject(globalRoot.garp);
      const groupRoot = asObject(vrrp.group);
      const syncRoot = asObject(vrrp["sync-group"]);

      const parsedGlobal: GlobalParams = {
        startupDelay: normalizeText(asText(globalRoot.startup_delay || globalRoot["startup-delay"])),
        version: normalizeText(asText(globalRoot.version)),
        garp: {
          interval: normalizeText(asText(globalGarpRoot.interval)),
          masterDelay: normalizeText(asText(globalGarpRoot["master-delay"])),
          masterRefresh: normalizeText(asText(globalGarpRoot["master-refresh"])),
          masterRefreshRepeat: normalizeText(asText(globalGarpRoot["master-refresh-repeat"])),
          masterRepeat: normalizeText(asText(globalGarpRoot["master-repeat"])),
        },
      };

      const parsedGroups: VrrpGroup[] = Object.entries(groupRoot)
        .map(([name, value]) => {
          const root = asObject(value);
          const trackRoot = asObject(root.track);
          const healthRoot = asObject(root["health-check"]);
          const transitionRoot = asObject(root["transition-script"]);
          const garpRoot = asObject(root.garp);
          const addressRoot = asObject(root.address);
          const virtualAddressRoot = asObject(root["virtual-address"]);
          const excludedAddressRoot = asObject(root["excluded-address"]);

          return {
            name: normalizeText(name),
            interface: normalizeText(asText(root.interface)),
            vrid: normalizeText(asText(root.vrid)),
            priority: normalizeText(asText(root.priority)),
            advertiseInterval: normalizeText(asText(root["advertise-interval"])),
            disabled: Object.prototype.hasOwnProperty.call(root, "disable"),
            noPreempt: Object.prototype.hasOwnProperty.call(root, "no-preempt"),
            rfc3768Compatibility: Object.prototype.hasOwnProperty.call(root, "rfc3768-compatibility"),
            preemptDelay: normalizeText(asText(root["preempt-delay"])),
            peerAddress: normalizeText(asText(root["peer-address"])),
            helloSourceAddress: normalizeText(asText(root["hello-source-address"])),
            addresses: uniqueList([
              ...Object.keys(addressRoot),
              ...Object.keys(virtualAddressRoot),
            ]),
            excludedAddresses: uniqueList(Object.keys(excludedAddressRoot).map((item) => normalizeText(item))),
            trackInterfaces: uniqueList(Object.keys(asObject(trackRoot.interface)).map((item) => normalizeText(item))),
            trackExcludeVrrpInterface: Object.prototype.hasOwnProperty.call(trackRoot, "exclude-vrrp-interface"),
            garp: {
              interval: normalizeText(asText(garpRoot.interval)),
              masterDelay: normalizeText(asText(garpRoot["master-delay"])),
              masterRefresh: normalizeText(asText(garpRoot["master-refresh"])),
              masterRefreshRepeat: normalizeText(asText(garpRoot["master-refresh-repeat"])),
              masterRepeat: normalizeText(asText(garpRoot["master-repeat"])),
            },
            healthCheck: {
              script: normalizeText(asText(healthRoot.script)),
              interval: normalizeText(asText(healthRoot.interval)),
              failureCount: normalizeText(asText(healthRoot["failure-count"])),
              successCount: normalizeText(asText(healthRoot["success-count"])),
            },
            transitionScripts: {
              master: normalizeText(asText(transitionRoot.master)),
              backup: normalizeText(asText(transitionRoot.backup)),
              fault: normalizeText(asText(transitionRoot.fault)),
            },
          };
        })
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const parsedSyncGroups: SyncGroup[] = Object.entries(syncRoot)
        .map(([name, value]) => {
          const root = asObject(value);
          const healthRoot = asObject(root["health-check"]);
          return {
            name: normalizeText(name),
            members: uniqueList(Object.keys(asObject(root.member)).map((item) => normalizeText(item))),
            healthCheck: {
              script: normalizeText(asText(healthRoot.script)),
              interval: normalizeText(asText(healthRoot.interval)),
              failureCount: normalizeText(asText(healthRoot["failure-count"])),
              successCount: normalizeText(asText(healthRoot["success-count"])),
            },
          };
        })
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const interfaceNames = new Set<string>();
      const descriptionByName = ethernetConfig.interfaces.reduce<Record<string, string | null>>(
        (acc, iface) => {
          acc[iface.name] = iface.description ?? null;
          return acc;
        },
        {}
      );
      ethernetConfig.interfaces.forEach((iface) => interfaceNames.add(iface.name));
      physicalConfig.interfaces.forEach((iface) => interfaceNames.add(iface.interface));
      allInterfacesConfig.interfaces.forEach((iface) => interfaceNames.add(iface.name));
      parsedGroups.forEach((group) => {
        if (group.interface) interfaceNames.add(group.interface);
        group.trackInterfaces.forEach((iface) => interfaceNames.add(iface));
      });

      const normalizedInterfaces = [...interfaceNames]
        .filter((name) => name !== "lo")
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setInterfaceOptions(normalizedInterfaces);
      setGlobalParams(parsedGlobal);
      setGroups(parsedGroups);
      setSyncGroups(parsedSyncGroups);
      setCurrentGlobalParams(parsedGlobal);
      setCurrentGroups(parsedGroups);
      setCurrentSyncGroups(parsedSyncGroups);

      setGroupDraft({ ...EMPTY_VRRP_DRAFT, interface: normalizedInterfaces[0]?.value || "" });
      setGroupAddressesInput("");
      setGroupExcludedInput("");
      setGroupTrackInput("");
      setSyncDraft(EMPTY_SYNC_DRAFT);
      setSyncMembersInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load high-availability configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const addGroup = () => {
    setError(null);

    const entry: VrrpGroup = {
      name: normalizeText(groupDraft.name),
      interface: normalizeText(groupDraft.interface),
      vrid: normalizeText(groupDraft.vrid),
      priority: normalizeText(groupDraft.priority),
      advertiseInterval: normalizeText(groupDraft.advertiseInterval),
      disabled: Boolean(groupDraft.disabled),
      noPreempt: Boolean(groupDraft.noPreempt),
      rfc3768Compatibility: Boolean(groupDraft.rfc3768Compatibility),
      preemptDelay: normalizeText(groupDraft.preemptDelay),
      peerAddress: normalizeText(groupDraft.peerAddress),
      helloSourceAddress: normalizeText(groupDraft.helloSourceAddress),
      addresses: parseCsvList(groupAddressesInput),
      excludedAddresses: parseCsvList(groupExcludedInput),
      trackInterfaces: parseCsvList(groupTrackInput),
      trackExcludeVrrpInterface: Boolean(groupDraft.trackExcludeVrrpInterface),
      garp: {
        interval: normalizeText(groupDraft.garp.interval),
        masterDelay: normalizeText(groupDraft.garp.masterDelay),
        masterRefresh: normalizeText(groupDraft.garp.masterRefresh),
        masterRefreshRepeat: normalizeText(groupDraft.garp.masterRefreshRepeat),
        masterRepeat: normalizeText(groupDraft.garp.masterRepeat),
      },
      healthCheck: {
        script: normalizeText(groupDraft.healthCheck.script),
        interval: normalizeText(groupDraft.healthCheck.interval),
        failureCount: normalizeText(groupDraft.healthCheck.failureCount),
        successCount: normalizeText(groupDraft.healthCheck.successCount),
      },
      transitionScripts: {
        master: normalizeText(groupDraft.transitionScripts.master),
        backup: normalizeText(groupDraft.transitionScripts.backup),
        fault: normalizeText(groupDraft.transitionScripts.fault),
      },
    };

    if (!entry.name || !entry.interface || !entry.vrid) {
      setError("VRRP group requires name, interface, and VRID.");
      return;
    }

    if (groups.some((item) => item.name === entry.name)) {
      setError("VRRP group name already exists.");
      return;
    }

    setGroups((previous) =>
      [...previous, entry].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    );

    setGroupDraft({ ...EMPTY_VRRP_DRAFT, interface: interfaceOptions[0]?.value || "" });
    setGroupAddressesInput("");
    setGroupExcludedInput("");
    setGroupTrackInput("");
  };

  const removeGroup = (name: string) => {
    setGroups((previous) => previous.filter((group) => group.name !== name));
    setSyncGroups((previous) =>
      previous
        .map((entry) => ({ ...entry, members: entry.members.filter((member) => member !== name) }))
        .filter((entry) => entry.members.length > 0)
    );
  };

  const addSyncGroup = () => {
    setError(null);

    const entry: SyncGroup = {
      name: normalizeText(syncDraft.name),
      members: parseCsvList(syncMembersInput),
      healthCheck: {
        script: normalizeText(syncDraft.healthCheck.script),
        interval: normalizeText(syncDraft.healthCheck.interval),
        failureCount: normalizeText(syncDraft.healthCheck.failureCount),
        successCount: normalizeText(syncDraft.healthCheck.successCount),
      },
    };

    if (!entry.name) {
      setError("Sync-group name is required.");
      return;
    }

    if (entry.members.length === 0) {
      setError("Sync-group requires at least one member VRRP group.");
      return;
    }

    if (syncGroups.some((item) => item.name === entry.name)) {
      setError("Sync-group already exists.");
      return;
    }

    setSyncGroups((previous) =>
      [...previous, entry].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    );

    setSyncDraft(EMPTY_SYNC_DRAFT);
    setSyncMembersInput("");
  };

  const removeSyncGroup = (name: string) => {
    setSyncGroups((previous) => previous.filter((entry) => entry.name !== name));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];
      const garpFields: Array<{ key: keyof GarpSettings; cliKey: string }> = [
        { key: "interval", cliKey: "interval" },
        { key: "masterDelay", cliKey: "master-delay" },
        { key: "masterRefresh", cliKey: "master-refresh" },
        { key: "masterRefreshRepeat", cliKey: "master-refresh-repeat" },
        { key: "masterRepeat", cliKey: "master-repeat" },
      ];

      if (!globalEqual(currentGlobalParams, globalParams)) {
        if (globalParams.startupDelay) {
          operations.push(
            `set high-availability vrrp global-parameters startup_delay ${globalParams.startupDelay}`
          );
        } else if (currentGlobalParams.startupDelay) {
          operations.push("delete high-availability vrrp global-parameters startup_delay");
        }

        if (globalParams.version) {
          operations.push(`set high-availability vrrp global-parameters version ${globalParams.version}`);
        } else if (currentGlobalParams.version) {
          operations.push("delete high-availability vrrp global-parameters version");
        }

        for (const field of garpFields) {
          const desiredValue = normalizeText(globalParams.garp[field.key]);
          const currentValue = normalizeText(currentGlobalParams.garp[field.key]);
          if (desiredValue) {
            operations.push(`set high-availability vrrp global-parameters garp ${field.cliKey} ${desiredValue}`);
          } else if (currentValue) {
            operations.push(`delete high-availability vrrp global-parameters garp ${field.cliKey}`);
          }
        }
      }

      const currentGroupMap = new Map(currentGroups.map((entry) => [entry.name, entry]));
      const desiredGroupMap = new Map(groups.map((entry) => [entry.name, entry]));

      for (const [name] of currentGroupMap.entries()) {
        if (!desiredGroupMap.has(name)) {
          operations.push(`delete high-availability vrrp group ${name}`);
        }
      }

      for (const [name, desired] of desiredGroupMap.entries()) {
        const current = currentGroupMap.get(name);
        if (current && groupEqual(current, desired)) {
          continue;
        }

        operations.push(`set high-availability vrrp group ${name} interface ${desired.interface}`);
        operations.push(`set high-availability vrrp group ${name} vrid ${desired.vrid}`);

        if (desired.priority) {
          operations.push(`set high-availability vrrp group ${name} priority ${desired.priority}`);
        } else if (current?.priority) {
          operations.push(`delete high-availability vrrp group ${name} priority`);
        }

        if (desired.advertiseInterval) {
          operations.push(`set high-availability vrrp group ${name} advertise-interval ${desired.advertiseInterval}`);
        } else if (current?.advertiseInterval) {
          operations.push(`delete high-availability vrrp group ${name} advertise-interval`);
        }

        if (desired.disabled) {
          operations.push(`set high-availability vrrp group ${name} disable`);
        } else if (current?.disabled) {
          operations.push(`delete high-availability vrrp group ${name} disable`);
        }

        if (desired.noPreempt) {
          operations.push(`set high-availability vrrp group ${name} no-preempt`);
        } else if (current?.noPreempt) {
          operations.push(`delete high-availability vrrp group ${name} no-preempt`);
        }

        if (desired.rfc3768Compatibility) {
          operations.push(`set high-availability vrrp group ${name} rfc3768-compatibility`);
        } else if (current?.rfc3768Compatibility) {
          operations.push(`delete high-availability vrrp group ${name} rfc3768-compatibility`);
        }

        if (desired.preemptDelay) {
          operations.push(`set high-availability vrrp group ${name} preempt-delay ${desired.preemptDelay}`);
        } else if (current?.preemptDelay) {
          operations.push(`delete high-availability vrrp group ${name} preempt-delay`);
        }

        if (desired.peerAddress) {
          operations.push(`set high-availability vrrp group ${name} peer-address ${desired.peerAddress}`);
        } else if (current?.peerAddress) {
          operations.push(`delete high-availability vrrp group ${name} peer-address`);
        }

        if (desired.helloSourceAddress) {
          operations.push(`set high-availability vrrp group ${name} hello-source-address ${desired.helloSourceAddress}`);
        } else if (current?.helloSourceAddress) {
          operations.push(`delete high-availability vrrp group ${name} hello-source-address`);
        }

        const currentAddresses = uniqueList(current?.addresses || []);
        const desiredAddresses = uniqueList(desired.addresses);

        for (const address of currentAddresses) {
          if (!desiredAddresses.includes(address)) {
            operations.push(`delete high-availability vrrp group ${name} address ${address}`);
          }
        }

        for (const address of desiredAddresses) {
          if (!currentAddresses.includes(address)) {
            operations.push(`set high-availability vrrp group ${name} address ${address}`);
          }
        }

        const currentExcludedAddresses = uniqueList(current?.excludedAddresses || []);
        const desiredExcludedAddresses = uniqueList(desired.excludedAddresses);

        for (const excludedAddress of currentExcludedAddresses) {
          if (!desiredExcludedAddresses.includes(excludedAddress)) {
            operations.push(`delete high-availability vrrp group ${name} excluded-address ${excludedAddress}`);
          }
        }

        for (const excludedAddress of desiredExcludedAddresses) {
          if (!currentExcludedAddresses.includes(excludedAddress)) {
            operations.push(`set high-availability vrrp group ${name} excluded-address ${excludedAddress}`);
          }
        }

        const currentTrackInterfaces = uniqueList(current?.trackInterfaces || []);
        const desiredTrackInterfaces = uniqueList(desired.trackInterfaces);

        for (const iface of currentTrackInterfaces) {
          if (!desiredTrackInterfaces.includes(iface)) {
            operations.push(`delete high-availability vrrp group ${name} track interface ${iface}`);
          }
        }

        for (const iface of desiredTrackInterfaces) {
          if (!currentTrackInterfaces.includes(iface)) {
            operations.push(`set high-availability vrrp group ${name} track interface ${iface}`);
          }
        }

        if (desired.trackExcludeVrrpInterface) {
          operations.push(`set high-availability vrrp group ${name} track exclude-vrrp-interface`);
        } else if (current?.trackExcludeVrrpInterface) {
          operations.push(`delete high-availability vrrp group ${name} track exclude-vrrp-interface`);
        }

        const currentGarp = current?.garp || EMPTY_GARP_SETTINGS;
        const desiredGarp = desired.garp;

        for (const field of garpFields) {
          const desiredValue = normalizeText(desiredGarp[field.key]);
          const currentValue = normalizeText(currentGarp[field.key]);
          if (desiredValue) {
            operations.push(`set high-availability vrrp group ${name} garp ${field.cliKey} ${desiredValue}`);
          } else if (currentValue) {
            operations.push(`delete high-availability vrrp group ${name} garp ${field.cliKey}`);
          }
        }

        const currentHealth = current?.healthCheck || EMPTY_HEALTH_CHECK;
        const desiredHealth = desired.healthCheck;

        if (desiredHealth.script) {
          operations.push(`set high-availability vrrp group ${name} health-check script ${JSON.stringify(desiredHealth.script)}`);
        } else if (currentHealth.script) {
          operations.push(`delete high-availability vrrp group ${name} health-check script`);
        }

        if (desiredHealth.interval) {
          operations.push(`set high-availability vrrp group ${name} health-check interval ${desiredHealth.interval}`);
        } else if (currentHealth.interval) {
          operations.push(`delete high-availability vrrp group ${name} health-check interval`);
        }

        if (desiredHealth.failureCount) {
          operations.push(`set high-availability vrrp group ${name} health-check failure-count ${desiredHealth.failureCount}`);
        } else if (currentHealth.failureCount) {
          operations.push(`delete high-availability vrrp group ${name} health-check failure-count`);
        }

        if (desiredHealth.successCount) {
          operations.push(`set high-availability vrrp group ${name} health-check success-count ${desiredHealth.successCount}`);
        } else if (currentHealth.successCount) {
          operations.push(`delete high-availability vrrp group ${name} health-check success-count`);
        }

        const currentTransition = current?.transitionScripts || EMPTY_TRANSITION_SCRIPTS;
        const desiredTransition = desired.transitionScripts;

        const transitionTargets: Array<keyof TransitionScripts> = ["master", "backup", "fault"];
        for (const target of transitionTargets) {
          const desiredScript = normalizeText(desiredTransition[target]);
          const currentScript = normalizeText(currentTransition[target]);

          if (desiredScript) {
            operations.push(`set high-availability vrrp group ${name} transition-script ${target} ${JSON.stringify(desiredScript)}`);
          } else if (currentScript) {
            operations.push(`delete high-availability vrrp group ${name} transition-script ${target}`);
          }
        }
      }

      const currentSyncMap = new Map(currentSyncGroups.map((entry) => [entry.name, entry]));
      const desiredSyncMap = new Map(syncGroups.map((entry) => [entry.name, entry]));

      for (const [name] of currentSyncMap.entries()) {
        if (!desiredSyncMap.has(name)) {
          operations.push(`delete high-availability vrrp sync-group ${name}`);
        }
      }

      for (const [name, desired] of desiredSyncMap.entries()) {
        const current = currentSyncMap.get(name);
        if (current && syncGroupEqual(current, desired)) {
          continue;
        }

        const currentMembers = uniqueList(current?.members || []);
        const desiredMembers = uniqueList(desired.members);

        for (const member of currentMembers) {
          if (!desiredMembers.includes(member)) {
            operations.push(`delete high-availability vrrp sync-group ${name} member ${member}`);
          }
        }

        for (const member of desiredMembers) {
          if (!currentMembers.includes(member)) {
            operations.push(`set high-availability vrrp sync-group ${name} member ${member}`);
          }
        }

        const currentHealth = current?.healthCheck || EMPTY_HEALTH_CHECK;
        const desiredHealth = desired.healthCheck;

        if (desiredHealth.script) {
          operations.push(`set high-availability vrrp sync-group ${name} health-check script ${JSON.stringify(desiredHealth.script)}`);
        } else if (currentHealth.script) {
          operations.push(`delete high-availability vrrp sync-group ${name} health-check script`);
        }

        if (desiredHealth.interval) {
          operations.push(`set high-availability vrrp sync-group ${name} health-check interval ${desiredHealth.interval}`);
        } else if (currentHealth.interval) {
          operations.push(`delete high-availability vrrp sync-group ${name} health-check interval`);
        }

        if (desiredHealth.failureCount) {
          operations.push(`set high-availability vrrp sync-group ${name} health-check failure-count ${desiredHealth.failureCount}`);
        } else if (currentHealth.failureCount) {
          operations.push(`delete high-availability vrrp sync-group ${name} health-check failure-count`);
        }

        if (desiredHealth.successCount) {
          operations.push(`set high-availability vrrp sync-group ${name} health-check success-count ${desiredHealth.successCount}`);
        } else if (currentHealth.successCount) {
          operations.push(`delete high-availability vrrp sync-group ${name} health-check success-count`);
        }
      }

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await highAvailabilityApi.configure(operations);
      if (!result.success) {
        throw new Error(result.error || "Failed to save high-availability configuration");
      }

      setMessage("High-availability configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save high-availability configuration");
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
            <h1 className="text-2xl font-bold text-foreground">High Availability</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure advanced VRRP groups and sync-groups for active/standby high-availability designs.
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
            <CardTitle>Global Parameters</CardTitle>
            <CardDescription>
              Configure global VRRP behavior including startup delay, version, and gratuitous ARP tuning.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Startup Delay</Label>
                <Input
                  value={globalParams.startupDelay}
                  onChange={(event) =>
                    setGlobalParams((previous) => ({ ...previous, startupDelay: event.target.value }))
                  }
                  placeholder="5"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>VRRP Version</Label>
                <Select
                  value={globalParams.version || "__unset__"}
                  onValueChange={(value) =>
                    setGlobalParams((previous) => ({
                      ...previous,
                      version: value === "__unset__" ? "" : value,
                    }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">Default</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>GARP Interval</Label>
                <Input
                  value={globalParams.garp.interval}
                  onChange={(event) =>
                    setGlobalParams((previous) => ({
                      ...previous,
                      garp: { ...previous.garp, interval: event.target.value },
                    }))
                  }
                  placeholder="0.5"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>GARP Master Delay</Label>
                <Input
                  value={globalParams.garp.masterDelay}
                  onChange={(event) =>
                    setGlobalParams((previous) => ({
                      ...previous,
                      garp: { ...previous.garp, masterDelay: event.target.value },
                    }))
                  }
                  placeholder="5"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>GARP Master Refresh</Label>
                <Input
                  value={globalParams.garp.masterRefresh}
                  onChange={(event) =>
                    setGlobalParams((previous) => ({
                      ...previous,
                      garp: { ...previous.garp, masterRefresh: event.target.value },
                    }))
                  }
                  placeholder="60"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>GARP Refresh Repeat</Label>
                <Input
                  value={globalParams.garp.masterRefreshRepeat}
                  onChange={(event) =>
                    setGlobalParams((previous) => ({
                      ...previous,
                      garp: { ...previous.garp, masterRefreshRepeat: event.target.value },
                    }))
                  }
                  placeholder="2"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>GARP Master Repeat</Label>
                <Input
                  value={globalParams.garp.masterRepeat}
                  onChange={(event) =>
                    setGlobalParams((previous) => ({
                      ...previous,
                      garp: { ...previous.garp, masterRepeat: event.target.value },
                    }))
                  }
                  placeholder="2"
                  disabled={!canEdit}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>VRRP Groups</CardTitle>
            <CardDescription>
              Configure interface ownership, preemption, peer settings, tracking, health checks, and transition scripts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-6">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={groupDraft.name}
                  onChange={(event) => setGroupDraft((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="WAN"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Interface</Label>
                <Select
                  value={groupDraft.interface || ""}
                  onValueChange={(value) => setGroupDraft((previous) => ({ ...previous, interface: value }))}
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
                <Label>VRID</Label>
                <Input
                  value={groupDraft.vrid}
                  onChange={(event) => setGroupDraft((previous) => ({ ...previous, vrid: event.target.value }))}
                  placeholder="10"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  value={groupDraft.priority}
                  onChange={(event) => setGroupDraft((previous) => ({ ...previous, priority: event.target.value }))}
                  placeholder="150"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Advertise Interval</Label>
                <Input
                  value={groupDraft.advertiseInterval}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({ ...previous, advertiseInterval: event.target.value }))
                  }
                  placeholder="1"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Preempt Delay</Label>
                <Input
                  value={groupDraft.preemptDelay}
                  onChange={(event) => setGroupDraft((previous) => ({ ...previous, preemptDelay: event.target.value }))}
                  placeholder="180"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Addresses</Label>
                <Input
                  value={groupAddressesInput}
                  onChange={(event) => setGroupAddressesInput(event.target.value)}
                  placeholder="192.0.2.10/24, 2001:db8::10/64"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Track Interfaces</Label>
                <Input
                  value={groupTrackInput}
                  onChange={(event) => setGroupTrackInput(event.target.value)}
                  placeholder="eth0, eth1"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Excluded Addresses</Label>
                <Input
                  value={groupExcludedInput}
                  onChange={(event) => setGroupExcludedInput(event.target.value)}
                  placeholder="192.0.2.254/24"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Peer Address</Label>
                <Input
                  value={groupDraft.peerAddress}
                  onChange={(event) => setGroupDraft((previous) => ({ ...previous, peerAddress: event.target.value }))}
                  placeholder="192.0.2.10"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Hello Source Address</Label>
                <Input
                  value={groupDraft.helloSourceAddress}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({ ...previous, helloSourceAddress: event.target.value }))
                  }
                  placeholder="192.0.2.15"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Health Script</Label>
                <Input
                  value={groupDraft.healthCheck.script}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      healthCheck: { ...previous.healthCheck, script: event.target.value },
                    }))
                  }
                  placeholder="/config/scripts/vrrp-check.sh"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Health Interval</Label>
                <Input
                  value={groupDraft.healthCheck.interval}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      healthCheck: { ...previous.healthCheck, interval: event.target.value },
                    }))
                  }
                  placeholder="60"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Health Failure Count</Label>
                <Input
                  value={groupDraft.healthCheck.failureCount}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      healthCheck: { ...previous.healthCheck, failureCount: event.target.value },
                    }))
                  }
                  placeholder="3"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Health Success Count</Label>
                <Input
                  value={groupDraft.healthCheck.successCount}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      healthCheck: { ...previous.healthCheck, successCount: event.target.value },
                    }))
                  }
                  placeholder="1"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>GARP Interval</Label>
                <Input
                  value={groupDraft.garp.interval}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      garp: { ...previous.garp, interval: event.target.value },
                    }))
                  }
                  placeholder="0.5"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>GARP Master Delay</Label>
                <Input
                  value={groupDraft.garp.masterDelay}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      garp: { ...previous.garp, masterDelay: event.target.value },
                    }))
                  }
                  placeholder="5"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>GARP Master Refresh</Label>
                <Input
                  value={groupDraft.garp.masterRefresh}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      garp: { ...previous.garp, masterRefresh: event.target.value },
                    }))
                  }
                  placeholder="60"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>GARP Refresh Repeat</Label>
                <Input
                  value={groupDraft.garp.masterRefreshRepeat}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      garp: { ...previous.garp, masterRefreshRepeat: event.target.value },
                    }))
                  }
                  placeholder="2"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>GARP Master Repeat</Label>
                <Input
                  value={groupDraft.garp.masterRepeat}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      garp: { ...previous.garp, masterRepeat: event.target.value },
                    }))
                  }
                  placeholder="2"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Transition Master Script</Label>
                <Input
                  value={groupDraft.transitionScripts.master}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      transitionScripts: { ...previous.transitionScripts, master: event.target.value },
                    }))
                  }
                  placeholder="/config/scripts/vrrp-master.sh WAN"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Transition Backup Script</Label>
                <Input
                  value={groupDraft.transitionScripts.backup}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      transitionScripts: { ...previous.transitionScripts, backup: event.target.value },
                    }))
                  }
                  placeholder="/config/scripts/vrrp-backup.sh WAN"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Transition Fault Script</Label>
                <Input
                  value={groupDraft.transitionScripts.fault}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({
                      ...previous,
                      transitionScripts: { ...previous.transitionScripts, fault: event.target.value },
                    }))
                  }
                  placeholder="/config/scripts/vrrp-fault.sh WAN"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="vrrp-disable"
                  checked={groupDraft.disabled}
                  onCheckedChange={(checked) =>
                    setGroupDraft((previous) => ({ ...previous, disabled: Boolean(checked) }))
                  }
                  disabled={!canEdit}
                />
                <Label htmlFor="vrrp-disable">Disable Group</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="vrrp-no-preempt"
                  checked={groupDraft.noPreempt}
                  onCheckedChange={(checked) =>
                    setGroupDraft((previous) => ({ ...previous, noPreempt: Boolean(checked) }))
                  }
                  disabled={!canEdit}
                />
                <Label htmlFor="vrrp-no-preempt">No Preempt</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="vrrp-rfc3768"
                  checked={groupDraft.rfc3768Compatibility}
                  onCheckedChange={(checked) =>
                    setGroupDraft((previous) => ({ ...previous, rfc3768Compatibility: Boolean(checked) }))
                  }
                  disabled={!canEdit}
                />
                <Label htmlFor="vrrp-rfc3768">RFC3768 Compatibility</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="vrrp-track-exclude"
                  checked={groupDraft.trackExcludeVrrpInterface}
                  onCheckedChange={(checked) =>
                    setGroupDraft((previous) => ({ ...previous, trackExcludeVrrpInterface: Boolean(checked) }))
                  }
                  disabled={!canEdit}
                />
                <Label htmlFor="vrrp-track-exclude">Track Exclude VRRP Interface</Label>
              </div>

              <Button type="button" variant="outline" onClick={addGroup} disabled={!canEdit}>
                <Plus className="mr-2 h-4 w-4" />
                Add VRRP Group
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>VRID</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Preempt</TableHead>
                  <TableHead>Track</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      No VRRP groups configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{entry.name}</Badge>
                          {entry.disabled && <Badge variant="destructive">Disabled</Badge>}
                          {entry.noPreempt && <Badge variant="outline">No Preempt</Badge>}
                          {entry.rfc3768Compatibility && <Badge variant="outline">RFC3768</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                      <TableCell>{entry.vrid}</TableCell>
                      <TableCell>{entry.priority || "-"}</TableCell>
                      <TableCell>{entry.preemptDelay ? `delay ${entry.preemptDelay}` : "default"}</TableCell>
                      <TableCell>
                        {entry.trackInterfaces.length > 0 ? `${entry.trackInterfaces.length} iface` : "-"}
                        {entry.excludedAddresses.length > 0 ? ` / ${entry.excludedAddresses.length} excluded` : ""}
                      </TableCell>
                      <TableCell>{entry.healthCheck.interval ? `${entry.healthCheck.interval}s` : "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeGroup(entry.name)}
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
            <CardTitle>Sync Groups</CardTitle>
            <CardDescription>
              Group multiple VRRP groups for synchronized failover behavior, including health checks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={syncDraft.name}
                  onChange={(event) => setSyncDraft((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="WAN-SYNC"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Members</Label>
                <Input
                  value={syncMembersInput}
                  onChange={(event) => setSyncMembersInput(event.target.value)}
                  placeholder="WAN, LAN"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Health Script</Label>
                <Input
                  value={syncDraft.healthCheck.script}
                  onChange={(event) =>
                    setSyncDraft((previous) => ({
                      ...previous,
                      healthCheck: { ...previous.healthCheck, script: event.target.value },
                    }))
                  }
                  placeholder="/config/scripts/sync-check.sh"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Health Interval</Label>
                <Input
                  value={syncDraft.healthCheck.interval}
                  onChange={(event) =>
                    setSyncDraft((previous) => ({
                      ...previous,
                      healthCheck: { ...previous.healthCheck, interval: event.target.value },
                    }))
                  }
                  placeholder="60"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Health Failure Count</Label>
                <Input
                  value={syncDraft.healthCheck.failureCount}
                  onChange={(event) =>
                    setSyncDraft((previous) => ({
                      ...previous,
                      healthCheck: { ...previous.healthCheck, failureCount: event.target.value },
                    }))
                  }
                  placeholder="3"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Health Success Count</Label>
                <Input
                  value={syncDraft.healthCheck.successCount}
                  onChange={(event) =>
                    setSyncDraft((previous) => ({
                      ...previous,
                      healthCheck: { ...previous.healthCheck, successCount: event.target.value },
                    }))
                  }
                  placeholder="1"
                  disabled={!canEdit}
                />
              </div>
            </div>

            {groupNames.length > 0 && (
              <p className="text-xs text-muted-foreground">Available VRRP groups: {groupNames.join(", ")}</p>
            )}

            <Button type="button" variant="outline" onClick={addSyncGroup} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Add Sync Group
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No sync-groups configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  syncGroups.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell>{serializeCsvList(entry.members)}</TableCell>
                      <TableCell>{entry.healthCheck.interval ? `${entry.healthCheck.interval}s` : "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSyncGroup(entry.name)}
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
