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

type VrrpAddress = {
  address: string;
  interface: string;
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
  addresses: VrrpAddress[];
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

type RealServer = {
  address: string;
  port: string;
  connectionTimeout: string;
  healthCheckScript: string;
};

type VirtualServer = {
  name: string;
  algorithm: string;
  delayLoop: string;
  forwardMethod: string;
  fwmark: string;
  port: string;
  persistenceTimeout: string;
  protocol: string;
  realServers: RealServer[];
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

const EMPTY_VIRTUAL_SERVER_DRAFT: VirtualServer = {
  name: "",
  algorithm: "least-connection",
  delayLoop: "",
  forwardMethod: "nat",
  fwmark: "",
  port: "",
  persistenceTimeout: "",
  protocol: "tcp",
  realServers: [],
};

const EMPTY_REAL_SERVER_DRAFT: RealServer = {
  address: "",
  port: "",
  connectionTimeout: "",
  healthCheckScript: "",
};

const VS_ALGORITHM_OPTIONS = [
  "round-robin",
  "weighted-round-robin",
  "least-connection",
  "weighted-least-connection",
  "source-hashing",
  "destination-hashing",
  "locality-based-least-connection",
];

const VS_FORWARD_METHOD_OPTIONS = ["nat", "direct", "tunnel"];
const VS_PROTOCOL_OPTIONS = ["tcp", "udp"];

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

function normalizeAddressEntry(entry: VrrpAddress): VrrpAddress {
  return {
    address: normalizeText(entry.address),
    interface: normalizeText(entry.interface),
  };
}

function normalizeAddressList(entries: VrrpAddress[]): VrrpAddress[] {
  const seen = new Set<string>();
  const output: VrrpAddress[] = [];
  for (const entry of entries) {
    const normalized = normalizeAddressEntry(entry);
    if (!normalized.address) continue;
    const key = `${normalized.address}|${normalized.interface}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function addressListEqual(left: VrrpAddress[], right: VrrpAddress[]): boolean {
  const leftSorted = normalizeAddressList(left).sort((a, b) =>
    `${a.address}|${a.interface}`.localeCompare(`${b.address}|${b.interface}`, undefined, {
      numeric: true,
    })
  );
  const rightSorted = normalizeAddressList(right).sort((a, b) =>
    `${a.address}|${a.interface}`.localeCompare(`${b.address}|${b.interface}`, undefined, {
      numeric: true,
    })
  );
  if (leftSorted.length !== rightSorted.length) return false;
  return leftSorted.every(
    (entry, index) =>
      entry.address === rightSorted[index].address && entry.interface === rightSorted[index].interface
  );
}

function parseAddressInterfaceOverrides(value: string): { overrides: Record<string, string>; error?: string } {
  const overrides: Record<string, string> = {};
  const entries = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      return {
        overrides: {},
        error: `Address interface mapping '${entry}' is invalid. Use address=interface.`,
      };
    }

    const address = normalizeText(entry.slice(0, separatorIndex));
    const interfaceName = normalizeText(entry.slice(separatorIndex + 1));
    if (!address || !interfaceName) {
      return {
        overrides: {},
        error: `Address interface mapping '${entry}' is invalid. Use address=interface.`,
      };
    }

    overrides[address] = interfaceName;
  }

  return { overrides };
}

function getAddressFamily(addressWithPrefix: string): "ipv4" | "ipv6" | null {
  const token = normalizeText(addressWithPrefix).split("/")[0];
  if (!token) return null;
  if (token.includes(":")) return "ipv6";
  if (token.includes(".")) return "ipv4";
  return null;
}

function validateIntegerRange(
  value: string,
  min: number,
  max: number,
  label: string,
  required: boolean = false
): string | null {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return required ? `${label} is required.` : null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return `${label} must be a whole number.`;
  }
  const parsed = Number(trimmed);
  if (parsed < min || parsed > max) {
    return `${label} must be between ${min} and ${max}.`;
  }
  return null;
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
    addressListEqual(left.addresses, right.addresses) &&
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

function realServerEqual(left: RealServer, right: RealServer): boolean {
  return (
    left.address === right.address &&
    left.port === right.port &&
    left.connectionTimeout === right.connectionTimeout &&
    left.healthCheckScript === right.healthCheckScript
  );
}

function virtualServerEqual(left: VirtualServer, right: VirtualServer): boolean {
  const leftRealServers = [...left.realServers].sort((a, b) =>
    a.address.localeCompare(b.address, undefined, { numeric: true })
  );
  const rightRealServers = [...right.realServers].sort((a, b) =>
    a.address.localeCompare(b.address, undefined, { numeric: true })
  );

  return (
    left.name === right.name &&
    left.algorithm === right.algorithm &&
    left.delayLoop === right.delayLoop &&
    left.forwardMethod === right.forwardMethod &&
    left.fwmark === right.fwmark &&
    left.port === right.port &&
    left.persistenceTimeout === right.persistenceTimeout &&
    left.protocol === right.protocol &&
    leftRealServers.length === rightRealServers.length &&
    leftRealServers.every((entry, index) => realServerEqual(entry, rightRealServers[index]))
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
  const [virtualServers, setVirtualServers] = useState<VirtualServer[]>([]);

  const [globalParams, setGlobalParams] = useState<GlobalParams>(EMPTY_GLOBAL_PARAMS);

  const [currentGroups, setCurrentGroups] = useState<VrrpGroup[]>([]);
  const [currentSyncGroups, setCurrentSyncGroups] = useState<SyncGroup[]>([]);
  const [currentGlobalParams, setCurrentGlobalParams] = useState<GlobalParams>(EMPTY_GLOBAL_PARAMS);
  const [currentVirtualServers, setCurrentVirtualServers] = useState<VirtualServer[]>([]);

  const [groupDraft, setGroupDraft] = useState<VrrpGroup>(EMPTY_VRRP_DRAFT);
  const [groupAddressesInput, setGroupAddressesInput] = useState("");
  const [groupAddressInterfaceMapInput, setGroupAddressInterfaceMapInput] = useState("");
  const [groupExcludedInput, setGroupExcludedInput] = useState("");
  const [groupTrackInput, setGroupTrackInput] = useState("");

  const [syncDraft, setSyncDraft] = useState<SyncGroup>(EMPTY_SYNC_DRAFT);
  const [syncMembersInput, setSyncMembersInput] = useState("");
  const [virtualServerDraft, setVirtualServerDraft] = useState<VirtualServer>(EMPTY_VIRTUAL_SERVER_DRAFT);
  const [editingVirtualServerName, setEditingVirtualServerName] = useState<string | null>(null);
  const [selectedVirtualServerName, setSelectedVirtualServerName] = useState("");
  const [realServerDraft, setRealServerDraft] = useState<RealServer>(EMPTY_REAL_SERVER_DRAFT);
  const [editingRealServerAddress, setEditingRealServerAddress] = useState<string | null>(null);

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

  const selectedVirtualServer = useMemo(
    () => virtualServers.find((entry) => entry.name === selectedVirtualServerName) || null,
    [virtualServers, selectedVirtualServerName]
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
          const parsedAddressEntries = normalizeAddressList([
            ...Object.entries(addressRoot).map(([address, addressValue]) => {
              const addressNode = asObject(addressValue);
              const interfaceNode = asObject(addressNode.interface);
              const directInterface =
                typeof addressNode.interface === "string"
                  ? normalizeText(addressNode.interface)
                  : "";
              const interfaceKey = Object.keys(interfaceNode)
                .map((item) => normalizeText(item))
                .find(Boolean);
              return {
                address: normalizeText(address),
                interface: directInterface || interfaceKey || "",
              };
            }),
            ...Object.keys(virtualAddressRoot).map((address) => ({
              address: normalizeText(address),
              interface: "",
            })),
          ]);

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
            addresses: parsedAddressEntries,
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

      const virtualServerRoot = asObject(config["virtual-server"]);
      const parsedVirtualServers: VirtualServer[] = Object.entries(virtualServerRoot)
        .map(([name, value]) => {
          const root = asObject(value);
          const realServerRoot = asObject(root["real-server"]);

          const parsedRealServers: RealServer[] = Object.entries(realServerRoot)
            .map(([address, realValue]) => {
              const realRoot = asObject(realValue);
              const healthRoot = asObject(realRoot["health-check"]);
              return {
                address: normalizeText(address),
                port: normalizeText(asText(realRoot.port)),
                connectionTimeout: normalizeText(asText(realRoot["connection-timeout"])),
                healthCheckScript: normalizeText(asText(healthRoot.script)),
              };
            })
            .filter((entry) => entry.address)
            .sort((left, right) => left.address.localeCompare(right.address, undefined, { numeric: true }));

          return {
            name: normalizeText(name),
            algorithm: normalizeText(asText(root.algorithm || "least-connection")) || "least-connection",
            delayLoop: normalizeText(asText(root["delay-loop"])),
            forwardMethod: normalizeText(asText(root["forward-method"] || "nat")) || "nat",
            fwmark: normalizeText(asText(root.fwmark)),
            port: normalizeText(asText(root.port)),
            persistenceTimeout: normalizeText(asText(root["persistence-timeout"])),
            protocol: normalizeText(asText(root.protocol || "tcp")) || "tcp",
            realServers: parsedRealServers,
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
      setVirtualServers(parsedVirtualServers);
      setCurrentGlobalParams(parsedGlobal);
      setCurrentGroups(parsedGroups);
      setCurrentSyncGroups(parsedSyncGroups);
      setCurrentVirtualServers(parsedVirtualServers);

      setGroupDraft({ ...EMPTY_VRRP_DRAFT, interface: normalizedInterfaces[0]?.value || "" });
      setGroupAddressesInput("");
      setGroupAddressInterfaceMapInput("");
      setGroupExcludedInput("");
      setGroupTrackInput("");
      setSyncDraft(EMPTY_SYNC_DRAFT);
      setSyncMembersInput("");
      setVirtualServerDraft(EMPTY_VIRTUAL_SERVER_DRAFT);
      setEditingVirtualServerName(null);
      setSelectedVirtualServerName(parsedVirtualServers[0]?.name || "");
      setRealServerDraft(EMPTY_REAL_SERVER_DRAFT);
      setEditingRealServerAddress(null);
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

    const parsedAddresses = parseCsvList(groupAddressesInput);
    const { overrides: addressInterfaceOverrides, error: addressMapError } =
      parseAddressInterfaceOverrides(groupAddressInterfaceMapInput);
    if (addressMapError) {
      setError(addressMapError);
      return;
    }

    for (const mappedAddress of Object.keys(addressInterfaceOverrides)) {
      if (!parsedAddresses.includes(mappedAddress)) {
        setError(
          `Address interface mapping references '${mappedAddress}' but it is not in the Addresses field.`
        );
        return;
      }
    }

    const normalizedAddressEntries = normalizeAddressList(
      parsedAddresses.map((address) => ({
        address,
        interface: addressInterfaceOverrides[address] || "",
      }))
    );

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
      addresses: normalizedAddressEntries,
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

    if (entry.addresses.length === 0) {
      setError("VRRP group requires at least one virtual address.");
      return;
    }

    const vridError = validateIntegerRange(entry.vrid, 1, 255, "VRID", true);
    if (vridError) {
      setError(vridError);
      return;
    }

    const priorityError = validateIntegerRange(entry.priority, 1, 255, "Priority");
    if (priorityError) {
      setError(priorityError);
      return;
    }

    const advertiseIntervalError = validateIntegerRange(entry.advertiseInterval, 1, 255, "Advertise Interval");
    if (advertiseIntervalError) {
      setError(advertiseIntervalError);
      return;
    }

    const preemptDelayError = validateIntegerRange(entry.preemptDelay, 0, 3600, "Preempt Delay");
    if (preemptDelayError) {
      setError(preemptDelayError);
      return;
    }

    const healthIntervalError = validateIntegerRange(
      entry.healthCheck.interval,
      1,
      3600,
      "Health Interval"
    );
    if (healthIntervalError) {
      setError(healthIntervalError);
      return;
    }

    const healthFailureError = validateIntegerRange(
      entry.healthCheck.failureCount,
      1,
      20,
      "Health Failure Count"
    );
    if (healthFailureError) {
      setError(healthFailureError);
      return;
    }

    const healthSuccessError = validateIntegerRange(
      entry.healthCheck.successCount,
      1,
      20,
      "Health Success Count"
    );
    if (healthSuccessError) {
      setError(healthSuccessError);
      return;
    }

    const addressFamilies = new Set(
      entry.addresses
        .map((item) => getAddressFamily(item.address))
        .filter((value): value is "ipv4" | "ipv6" => Boolean(value))
    );
    if (addressFamilies.size > 1) {
      setError("VRRP group addresses cannot mix IPv4 and IPv6 in the same group.");
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
    setGroupAddressInterfaceMapInput("");
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

    const unknownMembers = entry.members.filter((member) => !groupNames.includes(member));
    if (unknownMembers.length > 0) {
      setError(`Sync-group members not found in VRRP groups: ${unknownMembers.join(", ")}`);
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

  const resetVirtualServerDraft = () => {
    setVirtualServerDraft(EMPTY_VIRTUAL_SERVER_DRAFT);
    setEditingVirtualServerName(null);
  };

  const saveVirtualServerDraft = () => {
    setError(null);

    const entry: VirtualServer = {
      name: normalizeText(virtualServerDraft.name),
      algorithm: normalizeText(virtualServerDraft.algorithm) || "least-connection",
      delayLoop: normalizeText(virtualServerDraft.delayLoop),
      forwardMethod: normalizeText(virtualServerDraft.forwardMethod) || "nat",
      fwmark: normalizeText(virtualServerDraft.fwmark),
      port: normalizeText(virtualServerDraft.port),
      persistenceTimeout: normalizeText(virtualServerDraft.persistenceTimeout),
      protocol: normalizeText(virtualServerDraft.protocol) || "tcp",
      realServers:
        virtualServers.find((item) => item.name === (editingVirtualServerName || virtualServerDraft.name))
          ?.realServers || [],
    };

    if (!entry.name) {
      setError("Virtual server requires an address or alias name.");
      return;
    }

    if (!entry.port && !entry.fwmark) {
      setError("Virtual server requires either a port or an fwmark.");
      return;
    }

    const portError = validateIntegerRange(entry.port, 1, 65535, "Virtual server port");
    if (portError) {
      setError(portError);
      return;
    }

    const fwmarkError = validateIntegerRange(entry.fwmark, 1, 4294967295, "Virtual server fwmark");
    if (fwmarkError) {
      setError(fwmarkError);
      return;
    }

    const delayLoopError = validateIntegerRange(entry.delayLoop, 1, 3600, "Delay Loop");
    if (delayLoopError) {
      setError(delayLoopError);
      return;
    }

    const persistenceTimeoutError = validateIntegerRange(
      entry.persistenceTimeout,
      1,
      2147483647,
      "Persistence Timeout"
    );
    if (persistenceTimeoutError) {
      setError(persistenceTimeoutError);
      return;
    }

    if (!editingVirtualServerName && virtualServers.some((item) => item.name === entry.name)) {
      setError("Virtual server name already exists.");
      return;
    }

    if (
      editingVirtualServerName &&
      editingVirtualServerName !== entry.name &&
      virtualServers.some((item) => item.name === entry.name)
    ) {
      setError("Another virtual server already uses this name.");
      return;
    }

    setVirtualServers((previous) => {
      const withoutEdited = editingVirtualServerName
        ? previous.filter((item) => item.name !== editingVirtualServerName)
        : previous;
      return [...withoutEdited, entry].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true })
      );
    });

    setSelectedVirtualServerName(entry.name);
    resetVirtualServerDraft();
  };

  const editVirtualServer = (name: string) => {
    const entry = virtualServers.find((item) => item.name === name);
    if (!entry) return;
    setVirtualServerDraft({
      name: entry.name,
      algorithm: entry.algorithm || "least-connection",
      delayLoop: entry.delayLoop,
      forwardMethod: entry.forwardMethod || "nat",
      fwmark: entry.fwmark,
      port: entry.port,
      persistenceTimeout: entry.persistenceTimeout,
      protocol: entry.protocol || "tcp",
      realServers: [],
    });
    setEditingVirtualServerName(name);
    setSelectedVirtualServerName(name);
  };

  const removeVirtualServer = (name: string) => {
    setVirtualServers((previous) => {
      const remaining = previous.filter((item) => item.name !== name);
      if (selectedVirtualServerName === name) {
        setSelectedVirtualServerName(remaining[0]?.name || "");
      }
      return remaining;
    });
    if (editingVirtualServerName === name) {
      resetVirtualServerDraft();
    }
    if (realServerDraft.address || editingRealServerAddress) {
      setRealServerDraft(EMPTY_REAL_SERVER_DRAFT);
      setEditingRealServerAddress(null);
    }
  };

  const resetRealServerDraft = () => {
    setRealServerDraft(EMPTY_REAL_SERVER_DRAFT);
    setEditingRealServerAddress(null);
  };

  const editRealServer = (virtualServerName: string, address: string) => {
    const virtualServer = virtualServers.find((item) => item.name === virtualServerName);
    const realServer = virtualServer?.realServers.find((item) => item.address === address);
    if (!realServer) return;
    setSelectedVirtualServerName(virtualServerName);
    setRealServerDraft({
      address: realServer.address,
      port: realServer.port,
      connectionTimeout: realServer.connectionTimeout,
      healthCheckScript: realServer.healthCheckScript,
    });
    setEditingRealServerAddress(address);
  };

  const saveRealServerDraft = () => {
    setError(null);
    const virtualServerName = normalizeText(selectedVirtualServerName);
    if (!virtualServerName) {
      setError("Select a virtual server before adding real servers.");
      return;
    }

    const entry: RealServer = {
      address: normalizeText(realServerDraft.address),
      port: normalizeText(realServerDraft.port),
      connectionTimeout: normalizeText(realServerDraft.connectionTimeout),
      healthCheckScript: normalizeText(realServerDraft.healthCheckScript),
    };

    if (!entry.address) {
      setError("Real server address is required.");
      return;
    }

    if (!entry.port) {
      setError("Real server port is required (use 0 with fwmark virtual servers).");
      return;
    }

    const portError = validateIntegerRange(entry.port, 0, 65535, "Real server port", true);
    if (portError) {
      setError(portError);
      return;
    }

    const timeoutError = validateIntegerRange(
      entry.connectionTimeout,
      1,
      2147483647,
      "Connection Timeout"
    );
    if (timeoutError) {
      setError(timeoutError);
      return;
    }

    const targetVirtualServer = virtualServers.find((item) => item.name === virtualServerName);
    if (!targetVirtualServer) {
      setError("Selected virtual server no longer exists.");
      return;
    }

    const realServersWithoutEdited = editingRealServerAddress
      ? targetVirtualServer.realServers.filter((item) => item.address !== editingRealServerAddress)
      : targetVirtualServer.realServers;

    if (!editingRealServerAddress && realServersWithoutEdited.some((item) => item.address === entry.address)) {
      setError("Real server address already exists for this virtual server.");
      return;
    }

    if (
      editingRealServerAddress &&
      editingRealServerAddress !== entry.address &&
      realServersWithoutEdited.some((item) => item.address === entry.address)
    ) {
      setError("Another real server already uses this address.");
      return;
    }

    setVirtualServers((previous) =>
      previous.map((server) => {
        if (server.name !== virtualServerName) return server;

        return {
          ...server,
          realServers: [...realServersWithoutEdited, entry].sort((left, right) =>
            left.address.localeCompare(right.address, undefined, { numeric: true })
          ),
        };
      })
    );

    resetRealServerDraft();
  };

  const removeRealServer = (virtualServerName: string, address: string) => {
    setVirtualServers((previous) =>
      previous.map((server) =>
        server.name === virtualServerName
          ? { ...server, realServers: server.realServers.filter((item) => item.address !== address) }
          : server
      )
    );
    if (editingRealServerAddress === address && selectedVirtualServerName === virtualServerName) {
      resetRealServerDraft();
    }
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

        const currentAddresses = normalizeAddressList(current?.addresses || []);
        const desiredAddresses = normalizeAddressList(desired.addresses || []);
        const currentByAddress = new Map(currentAddresses.map((item) => [item.address, item.interface]));
        const desiredByAddress = new Map(desiredAddresses.map((item) => [item.address, item.interface]));

        for (const currentAddress of currentAddresses) {
          if (!desiredByAddress.has(currentAddress.address)) {
            operations.push(`delete high-availability vrrp group ${name} address ${currentAddress.address}`);
            continue;
          }
          const desiredInterface = desiredByAddress.get(currentAddress.address) || "";
          if (desiredInterface !== currentAddress.interface) {
            operations.push(`delete high-availability vrrp group ${name} address ${currentAddress.address}`);
          }
        }

        for (const desiredAddress of desiredAddresses) {
          const existingInterface = currentByAddress.get(desiredAddress.address);
          if (existingInterface === undefined || existingInterface !== desiredAddress.interface) {
            if (desiredAddress.interface) {
              operations.push(
                `set high-availability vrrp group ${name} address ${desiredAddress.address} interface ${desiredAddress.interface}`
              );
            } else {
              operations.push(`set high-availability vrrp group ${name} address ${desiredAddress.address}`);
            }
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

      const currentVirtualMap = new Map(currentVirtualServers.map((entry) => [entry.name, entry]));
      const desiredVirtualMap = new Map(virtualServers.map((entry) => [entry.name, entry]));

      for (const [name] of currentVirtualMap.entries()) {
        if (!desiredVirtualMap.has(name)) {
          operations.push(`delete high-availability virtual-server ${name}`);
        }
      }

      for (const [name, desired] of desiredVirtualMap.entries()) {
        const current = currentVirtualMap.get(name);
        if (current && virtualServerEqual(current, desired)) {
          continue;
        }

        if (desired.algorithm) {
          operations.push(`set high-availability virtual-server ${name} algorithm ${desired.algorithm}`);
        } else if (current?.algorithm) {
          operations.push(`delete high-availability virtual-server ${name} algorithm`);
        }

        if (desired.delayLoop) {
          operations.push(`set high-availability virtual-server ${name} delay-loop ${desired.delayLoop}`);
        } else if (current?.delayLoop) {
          operations.push(`delete high-availability virtual-server ${name} delay-loop`);
        }

        if (desired.forwardMethod) {
          operations.push(`set high-availability virtual-server ${name} forward-method ${desired.forwardMethod}`);
        } else if (current?.forwardMethod) {
          operations.push(`delete high-availability virtual-server ${name} forward-method`);
        }

        if (desired.fwmark) {
          operations.push(`set high-availability virtual-server ${name} fwmark ${desired.fwmark}`);
        } else if (current?.fwmark) {
          operations.push(`delete high-availability virtual-server ${name} fwmark`);
        }

        if (desired.port) {
          operations.push(`set high-availability virtual-server ${name} port ${desired.port}`);
        } else if (current?.port) {
          operations.push(`delete high-availability virtual-server ${name} port`);
        }

        if (desired.persistenceTimeout) {
          operations.push(
            `set high-availability virtual-server ${name} persistence-timeout ${desired.persistenceTimeout}`
          );
        } else if (current?.persistenceTimeout) {
          operations.push(`delete high-availability virtual-server ${name} persistence-timeout`);
        }

        if (desired.protocol) {
          operations.push(`set high-availability virtual-server ${name} protocol ${desired.protocol}`);
        } else if (current?.protocol) {
          operations.push(`delete high-availability virtual-server ${name} protocol`);
        }

        const currentRealMap = new Map((current?.realServers || []).map((entry) => [entry.address, entry]));
        const desiredRealMap = new Map(desired.realServers.map((entry) => [entry.address, entry]));

        for (const [address] of currentRealMap.entries()) {
          if (!desiredRealMap.has(address)) {
            operations.push(`delete high-availability virtual-server ${name} real-server ${address}`);
          }
        }

        for (const [address, desiredReal] of desiredRealMap.entries()) {
          const currentReal = currentRealMap.get(address);
          if (currentReal && realServerEqual(currentReal, desiredReal)) {
            continue;
          }

          if (desiredReal.port) {
            operations.push(`set high-availability virtual-server ${name} real-server ${address} port ${desiredReal.port}`);
          } else if (currentReal?.port) {
            operations.push(`delete high-availability virtual-server ${name} real-server ${address} port`);
          }

          if (desiredReal.connectionTimeout) {
            operations.push(
              `set high-availability virtual-server ${name} real-server ${address} connection-timeout ${desiredReal.connectionTimeout}`
            );
          } else if (currentReal?.connectionTimeout) {
            operations.push(`delete high-availability virtual-server ${name} real-server ${address} connection-timeout`);
          }

          if (desiredReal.healthCheckScript) {
            operations.push(
              `set high-availability virtual-server ${name} real-server ${address} health-check script ${JSON.stringify(desiredReal.healthCheckScript)}`
            );
          } else if (currentReal?.healthCheckScript) {
            operations.push(`delete high-availability virtual-server ${name} real-server ${address} health-check script`);
          }
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

            <div className="grid gap-3 md:grid-cols-6">
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
                <Label>Address Interfaces (optional)</Label>
                <Input
                  value={groupAddressInterfaceMapInput}
                  onChange={(event) => setGroupAddressInterfaceMapInput(event.target.value)}
                  placeholder="203.0.113.22/24=eth2"
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

        <Card>
          <CardHeader>
            <CardTitle>Virtual Servers (IPVS)</CardTitle>
            <CardDescription>
              Configure load-balanced virtual services under <code>high-availability virtual-server</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Virtual Server Name / Address</Label>
                <Input
                  value={virtualServerDraft.name}
                  onChange={(event) =>
                    setVirtualServerDraft((previous) => ({ ...previous, name: event.target.value }))
                  }
                  placeholder="203.0.113.1"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Algorithm</Label>
                <Select
                  value={virtualServerDraft.algorithm || "least-connection"}
                  onValueChange={(value) =>
                    setVirtualServerDraft((previous) => ({ ...previous, algorithm: value }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VS_ALGORITHM_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Forward Method</Label>
                <Select
                  value={virtualServerDraft.forwardMethod || "nat"}
                  onValueChange={(value) =>
                    setVirtualServerDraft((previous) => ({ ...previous, forwardMethod: value }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VS_FORWARD_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Protocol</Label>
                <Select
                  value={virtualServerDraft.protocol || "tcp"}
                  onValueChange={(value) =>
                    setVirtualServerDraft((previous) => ({ ...previous, protocol: value }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VS_PROTOCOL_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  value={virtualServerDraft.port}
                  onChange={(event) =>
                    setVirtualServerDraft((previous) => ({ ...previous, port: event.target.value }))
                  }
                  placeholder="8280"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Fwmark</Label>
                <Input
                  value={virtualServerDraft.fwmark}
                  onChange={(event) =>
                    setVirtualServerDraft((previous) => ({ ...previous, fwmark: event.target.value }))
                  }
                  placeholder="111"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Delay Loop</Label>
                <Input
                  value={virtualServerDraft.delayLoop}
                  onChange={(event) =>
                    setVirtualServerDraft((previous) => ({ ...previous, delayLoop: event.target.value }))
                  }
                  placeholder="10"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Persistence Timeout</Label>
                <Input
                  value={virtualServerDraft.persistenceTimeout}
                  onChange={(event) =>
                    setVirtualServerDraft((previous) => ({
                      ...previous,
                      persistenceTimeout: event.target.value,
                    }))
                  }
                  placeholder="300"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={saveVirtualServerDraft} disabled={!canEdit}>
                <Plus className="mr-2 h-4 w-4" />
                {editingVirtualServerName ? "Update Virtual Server" : "Add Virtual Server"}
              </Button>
              {editingVirtualServerName && (
                <Button type="button" variant="ghost" onClick={resetVirtualServerDraft} disabled={!canEdit}>
                  Cancel Edit
                </Button>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Virtual Server</TableHead>
                  <TableHead>Algorithm</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Port / Fwmark</TableHead>
                  <TableHead>Real Servers</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {virtualServers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No virtual servers configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  virtualServers.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell>{entry.algorithm || "-"}</TableCell>
                      <TableCell>{entry.protocol || "-"}</TableCell>
                      <TableCell>{entry.port ? `port ${entry.port}` : `fwmark ${entry.fwmark}`}</TableCell>
                      <TableCell>{entry.realServers.length}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedVirtualServerName(entry.name);
                              editVirtualServer(entry.name);
                            }}
                            disabled={!canEdit}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeVirtualServer(entry.name)}
                            disabled={!canEdit}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
            <CardTitle>Real Servers</CardTitle>
            <CardDescription>
              Add per-backend real servers with port, timeout, and optional health-check script.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Virtual Server</Label>
                <Select
                  value={selectedVirtualServerName || "__unset__"}
                  onValueChange={(value) => setSelectedVirtualServerName(value === "__unset__" ? "" : value)}
                  disabled={!canEdit || virtualServers.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select virtual server" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">Select virtual server</SelectItem>
                    {virtualServers.map((entry) => (
                      <SelectItem key={entry.name} value={entry.name}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Real Server Address</Label>
                <Input
                  value={realServerDraft.address}
                  onChange={(event) =>
                    setRealServerDraft((previous) => ({ ...previous, address: event.target.value }))
                  }
                  placeholder="192.0.2.11"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  value={realServerDraft.port}
                  onChange={(event) =>
                    setRealServerDraft((previous) => ({ ...previous, port: event.target.value }))
                  }
                  placeholder="80"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Connection Timeout</Label>
                <Input
                  value={realServerDraft.connectionTimeout}
                  onChange={(event) =>
                    setRealServerDraft((previous) => ({
                      ...previous,
                      connectionTimeout: event.target.value,
                    }))
                  }
                  placeholder="30"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Health Script</Label>
                <Input
                  value={realServerDraft.healthCheckScript}
                  onChange={(event) =>
                    setRealServerDraft((previous) => ({
                      ...previous,
                      healthCheckScript: event.target.value,
                    }))
                  }
                  placeholder="/config/scripts/check-real-server.sh"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={saveRealServerDraft} disabled={!canEdit}>
                <Plus className="mr-2 h-4 w-4" />
                {editingRealServerAddress ? "Update Real Server" : "Add Real Server"}
              </Button>
              {editingRealServerAddress && (
                <Button type="button" variant="ghost" onClick={resetRealServerDraft} disabled={!canEdit}>
                  Cancel Edit
                </Button>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Connection Timeout</TableHead>
                  <TableHead>Health Script</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedVirtualServer ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Select a virtual server to manage its real servers.
                    </TableCell>
                  </TableRow>
                ) : selectedVirtualServer.realServers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No real servers configured for {selectedVirtualServer.name}.
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedVirtualServer.realServers.map((entry) => (
                    <TableRow key={entry.address}>
                      <TableCell className="font-medium">{entry.address}</TableCell>
                      <TableCell>{entry.port}</TableCell>
                      <TableCell>{entry.connectionTimeout || "-"}</TableCell>
                      <TableCell>{entry.healthCheckScript || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editRealServer(selectedVirtualServer.name, entry.address)}
                            disabled={!canEdit}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRealServer(selectedVirtualServer.name, entry.address)}
                            disabled={!canEdit}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
