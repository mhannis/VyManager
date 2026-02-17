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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { showService } from "@/lib/api/show";
import { type WwanDhcpv6PdRow, type WwanInterfaceConfig, wwanService } from "@/lib/api/wwan";
import { pageGuides } from "@/lib/help/pageGuides";

interface WwanFormState {
  name: string;
  description: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  disableLinkDetect: boolean;
  apn: string;
  ipDisableForwarding: boolean;
  ipArpCacheTimeout: string;
  ipDisableArpFilter: boolean;
  ipEnableDirectedBroadcast: boolean;
  ipEnableArpAccept: boolean;
  ipEnableArpAnnounce: boolean;
  ipEnableArpIgnore: boolean;
  ipEnableProxyArp: boolean;
  ipProxyArpPvlan: boolean;
  ipSourceValidation: string;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipv6AddressesText: string;
  ipv6AddressAutoconf: boolean;
  ipv6AddressEui64: string;
  ipv6AddressNoDefaultLinkLocal: boolean;
  ipv6DisableForwarding: boolean;
  ipv6AcceptDad: string;
  ipv6DupAddrDetectTransmits: string;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
  dhcpClientId: string;
  dhcpHostName: string;
  dhcpVendorClassId: string;
  dhcpNoDefaultRoute: boolean;
  dhcpDefaultRouteDistance: string;
  dhcpRejectText: string;
  dhcpUserClass: string;
  dhcpv6Duid: string;
  dhcpv6NoRelease: boolean;
  dhcpv6ParametersOnly: boolean;
  dhcpv6RapidCommit: boolean;
  dhcpv6Temporary: boolean;
  dhcpv6PdRows: WwanDhcpv6PdRow[];
}

const SOURCE_VALIDATION_OPTIONS = ["disable", "strict", "loose"] as const;
const IPV6_ACCEPT_DAD_OPTIONS = ["0", "1", "2"] as const;

const EMPTY_PD_ROW: WwanDhcpv6PdRow = {
  id: "",
  length: "",
  delegateInterface: "",
  address: "",
  slaId: "",
};

const EMPTY_FORM: WwanFormState = {
  name: "",
  description: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  disable: false,
  disableLinkDetect: false,
  apn: "",
  ipDisableForwarding: false,
  ipArpCacheTimeout: "",
  ipDisableArpFilter: false,
  ipEnableDirectedBroadcast: false,
  ipEnableArpAccept: false,
  ipEnableArpAnnounce: false,
  ipEnableArpIgnore: false,
  ipEnableProxyArp: false,
  ipProxyArpPvlan: false,
  ipSourceValidation: "",
  ipAdjustMssClamp: false,
  ipAdjustMssValue: "",
  ipv6AddressesText: "",
  ipv6AddressAutoconf: false,
  ipv6AddressEui64: "",
  ipv6AddressNoDefaultLinkLocal: false,
  ipv6DisableForwarding: false,
  ipv6AcceptDad: "",
  ipv6DupAddrDetectTransmits: "",
  ipv6AdjustMssClamp: false,
  ipv6AdjustMssValue: "",
  dhcpClientId: "",
  dhcpHostName: "",
  dhcpVendorClassId: "",
  dhcpNoDefaultRoute: false,
  dhcpDefaultRouteDistance: "",
  dhcpRejectText: "",
  dhcpUserClass: "",
  dhcpv6Duid: "",
  dhcpv6NoRelease: false,
  dhcpv6ParametersOnly: false,
  dhcpv6RapidCommit: false,
  dhcpv6Temporary: false,
  dhcpv6PdRows: [],
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseLines(raw: string): string[] {
  return uniqueNonEmpty(raw.split("\n"));
}

function toFormState(value: WwanInterfaceConfig): WwanFormState {
  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
    disableLinkDetect: value.disableLinkDetect,
    apn: value.apn,
    ipDisableForwarding: value.ipDisableForwarding,
    ipArpCacheTimeout: value.ipArpCacheTimeout,
    ipDisableArpFilter: value.ipDisableArpFilter,
    ipEnableDirectedBroadcast: value.ipEnableDirectedBroadcast,
    ipEnableArpAccept: value.ipEnableArpAccept,
    ipEnableArpAnnounce: value.ipEnableArpAnnounce,
    ipEnableArpIgnore: value.ipEnableArpIgnore,
    ipEnableProxyArp: value.ipEnableProxyArp,
    ipProxyArpPvlan: value.ipProxyArpPvlan,
    ipSourceValidation: value.ipSourceValidation,
    ipAdjustMssClamp: value.ipAdjustMssClamp,
    ipAdjustMssValue: value.ipAdjustMssValue,
    ipv6AddressesText: value.ipv6Addresses.join("\n"),
    ipv6AddressAutoconf: value.ipv6AddressAutoconf,
    ipv6AddressEui64: value.ipv6AddressEui64,
    ipv6AddressNoDefaultLinkLocal: value.ipv6AddressNoDefaultLinkLocal,
    ipv6DisableForwarding: value.ipv6DisableForwarding,
    ipv6AcceptDad: value.ipv6AcceptDad,
    ipv6DupAddrDetectTransmits: value.ipv6DupAddrDetectTransmits,
    ipv6AdjustMssClamp: value.ipv6AdjustMssClamp,
    ipv6AdjustMssValue: value.ipv6AdjustMssValue,
    dhcpClientId: value.dhcpClientId,
    dhcpHostName: value.dhcpHostName,
    dhcpVendorClassId: value.dhcpVendorClassId,
    dhcpNoDefaultRoute: value.dhcpNoDefaultRoute,
    dhcpDefaultRouteDistance: value.dhcpDefaultRouteDistance,
    dhcpRejectText: value.dhcpReject.join("\n"),
    dhcpUserClass: value.dhcpUserClass,
    dhcpv6Duid: value.dhcpv6Duid,
    dhcpv6NoRelease: value.dhcpv6NoRelease,
    dhcpv6ParametersOnly: value.dhcpv6ParametersOnly,
    dhcpv6RapidCommit: value.dhcpv6RapidCommit,
    dhcpv6Temporary: value.dhcpv6Temporary,
    dhcpv6PdRows: value.dhcpv6PdRows.length > 0 ? value.dhcpv6PdRows.map((row) => ({ ...row })) : [],
  };
}

function syncScalar(
  operations: string[],
  base: string,
  token: string,
  desired: string,
  current: string,
): void {
  if (desired === current) return;
  if (desired) {
    operations.push(`set ${base} ${token} ${quoteCliValue(desired)}`);
  } else {
    operations.push(`delete ${base} ${token}`);
  }
}

function syncFlag(
  operations: string[],
  base: string,
  token: string,
  desired: boolean,
  current: boolean,
): void {
  if (desired === current) return;
  operations.push(desired ? `set ${base} ${token}` : `delete ${base} ${token}`);
}

function syncTagList(
  operations: string[],
  base: string,
  token: string,
  desired: string[],
  current: string[],
): void {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);

  for (const entry of current) {
    if (!desiredSet.has(entry)) {
      operations.push(`delete ${base} ${token} ${quoteCliValue(entry)}`);
    }
  }
  for (const entry of desired) {
    if (!currentSet.has(entry)) {
      operations.push(`set ${base} ${token} ${quoteCliValue(entry)}`);
    }
  }
}

function normalizePdRows(rows: WwanDhcpv6PdRow[]): WwanDhcpv6PdRow[] {
  const normalized: WwanDhcpv6PdRow[] = [];
  const index = new Map<string, number>();

  for (const row of rows) {
    const id = row.id.trim();
    const length = row.length.trim();
    const delegateInterface = row.delegateInterface.trim();
    const address = row.address.trim();
    const slaId = row.slaId.trim();

    if (!id && !length && !delegateInterface && !address && !slaId) continue;

    if (!id) {
      throw new Error("DHCPv6 PD row requires an ID.");
    }
    if (!/^\d+$/.test(id)) {
      throw new Error(`DHCPv6 PD id '${id}' must be a whole number.`);
    }
    if (!length) {
      throw new Error(`DHCPv6 PD id '${id}' requires length.`);
    }
    if (!/^\d+$/.test(length)) {
      throw new Error(`DHCPv6 PD id '${id}' length must be a whole number.`);
    }

    if ((address || slaId) && !delegateInterface) {
      throw new Error(`DHCPv6 PD id '${id}' requires delegate interface when address or SLA ID is set.`);
    }
    if (slaId && !/^\d+$/.test(slaId)) {
      throw new Error(`DHCPv6 PD id '${id}' SLA ID must be a whole number.`);
    }

    const mapKey = `${id}|${delegateInterface || "-"}`;
    if (index.has(mapKey)) {
      const rowIndex = index.get(mapKey)!;
      const existing = normalized[rowIndex];
      if (existing.length !== length) {
        throw new Error(`DHCPv6 PD id '${id}' has conflicting lengths.`);
      }
      normalized[rowIndex] = {
        id,
        length,
        delegateInterface,
        address: address || existing.address,
        slaId: slaId || existing.slaId,
      };
      continue;
    }

    index.set(mapKey, normalized.length);
    normalized.push({ id, length, delegateInterface, address, slaId });
  }

  return normalized.sort((left, right) => {
    const idDelta = Number(left.id) - Number(right.id);
    if (idDelta !== 0) return idDelta;
    return left.delegateInterface.localeCompare(right.delegateInterface);
  });
}

function syncDhcpv6PdRows(
  operations: string[],
  base: string,
  desiredRows: WwanDhcpv6PdRow[],
  currentRows: WwanDhcpv6PdRow[],
): void {
  const desired = normalizePdRows(desiredRows);
  const current = normalizePdRows(currentRows);

  if (JSON.stringify(desired) === JSON.stringify(current)) return;

  const currentIds = new Set(current.map((row) => row.id));
  for (const id of currentIds) {
    operations.push(`delete ${base} dhcpv6-options pd ${quoteCliValue(id)}`);
  }

  const grouped = new Map<string, WwanDhcpv6PdRow[]>();
  for (const row of desired) {
    const existing = grouped.get(row.id) || [];
    existing.push(row);
    grouped.set(row.id, existing);
  }

  for (const [id, rows] of Array.from(grouped.entries()).sort((left, right) => Number(left[0]) - Number(right[0]))) {
    const length = rows[0]?.length || "";
    if (length) {
      operations.push(`set ${base} dhcpv6-options pd ${quoteCliValue(id)} length ${quoteCliValue(length)}`);
    }
    for (const row of rows) {
      if (!row.delegateInterface) continue;
      if (row.address) {
        operations.push(
          `set ${base} dhcpv6-options pd ${quoteCliValue(id)} interface ${quoteCliValue(row.delegateInterface)} address ${quoteCliValue(row.address)}`,
        );
      }
      if (row.slaId) {
        operations.push(
          `set ${base} dhcpv6-options pd ${quoteCliValue(id)} interface ${quoteCliValue(row.delegateInterface)} sla-id ${quoteCliValue(row.slaId)}`,
        );
      }
    }
  }
}

function syncAdjustMss(
  operations: string[],
  base: string,
  tokenPrefix: "ip adjust-mss" | "ipv6 adjust-mss",
  desiredClamp: boolean,
  desiredValue: string,
  currentClamp: boolean,
  currentValue: string,
): void {
  const trimmedDesired = desiredValue.trim();
  const trimmedCurrent = currentValue.trim();

  if (desiredClamp) {
    if (currentClamp && !trimmedCurrent) return;
    if (currentClamp || trimmedCurrent) {
      operations.push(`delete ${base} ${tokenPrefix}`);
    }
    operations.push(`set ${base} ${tokenPrefix} clamp-mss-to-pmtu`);
    return;
  }

  if (trimmedDesired) {
    if (currentClamp || trimmedDesired !== trimmedCurrent) {
      if (currentClamp) {
        operations.push(`delete ${base} ${tokenPrefix}`);
      }
      operations.push(`set ${base} ${tokenPrefix} ${quoteCliValue(trimmedDesired)}`);
    }
    return;
  }

  if (currentClamp || trimmedCurrent) {
    operations.push(`delete ${base} ${tokenPrefix}`);
  }
}

function buildWwanOperations(candidate: WwanFormState, current: WwanInterfaceConfig | null): string[] {
  const operations: string[] = [];
  const base = `interfaces wwan ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      addresses: [],
      mtu: "",
      vrf: "",
      disable: false,
      disableLinkDetect: false,
      apn: "",
      ipDisableForwarding: false,
      ipArpCacheTimeout: "",
      ipDisableArpFilter: false,
      ipEnableDirectedBroadcast: false,
      ipEnableArpAccept: false,
      ipEnableArpAnnounce: false,
      ipEnableArpIgnore: false,
      ipEnableProxyArp: false,
      ipProxyArpPvlan: false,
      ipSourceValidation: "",
      ipAdjustMssClamp: false,
      ipAdjustMssValue: "",
      ipv6Addresses: [],
      ipv6AddressAutoconf: false,
      ipv6AddressEui64: "",
      ipv6AddressNoDefaultLinkLocal: false,
      ipv6DisableForwarding: false,
      ipv6AcceptDad: "",
      ipv6DupAddrDetectTransmits: "",
      ipv6AdjustMssClamp: false,
      ipv6AdjustMssValue: "",
      dhcpClientId: "",
      dhcpHostName: "",
      dhcpVendorClassId: "",
      dhcpNoDefaultRoute: false,
      dhcpDefaultRouteDistance: "",
      dhcpReject: [],
      dhcpUserClass: "",
      dhcpv6Duid: "",
      dhcpv6NoRelease: false,
      dhcpv6ParametersOnly: false,
      dhcpv6RapidCommit: false,
      dhcpv6Temporary: false,
      dhcpv6PdRows: [],
    } satisfies WwanInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);
  syncScalar(operations, base, "apn", candidate.apn.trim(), currentSafe.apn);
  syncScalar(
    operations,
    base,
    "ip arp-cache-timeout",
    candidate.ipArpCacheTimeout.trim(),
    currentSafe.ipArpCacheTimeout,
  );
  syncScalar(
    operations,
    base,
    "ip source-validation",
    candidate.ipSourceValidation.trim(),
    currentSafe.ipSourceValidation,
  );
  syncScalar(
    operations,
    base,
    "dhcp-options client-id",
    candidate.dhcpClientId.trim(),
    currentSafe.dhcpClientId,
  );
  syncScalar(
    operations,
    base,
    "dhcp-options host-name",
    candidate.dhcpHostName.trim(),
    currentSafe.dhcpHostName,
  );
  syncScalar(
    operations,
    base,
    "dhcp-options vendor-class-id",
    candidate.dhcpVendorClassId.trim(),
    currentSafe.dhcpVendorClassId,
  );
  syncScalar(
    operations,
    base,
    "dhcp-options default-route-distance",
    candidate.dhcpDefaultRouteDistance.trim(),
    currentSafe.dhcpDefaultRouteDistance,
  );
  syncScalar(
    operations,
    base,
    "dhcp-options user-class",
    candidate.dhcpUserClass.trim(),
    currentSafe.dhcpUserClass,
  );
  syncScalar(
    operations,
    base,
    "dhcpv6-options duid",
    candidate.dhcpv6Duid.trim(),
    currentSafe.dhcpv6Duid,
  );
  syncScalar(
    operations,
    base,
    "ipv6 address eui64",
    candidate.ipv6AddressEui64.trim(),
    currentSafe.ipv6AddressEui64,
  );
  syncScalar(
    operations,
    base,
    "ipv6 accept-dad",
    candidate.ipv6AcceptDad.trim(),
    currentSafe.ipv6AcceptDad,
  );
  syncScalar(
    operations,
    base,
    "ipv6 dup-addr-detect-transmits",
    candidate.ipv6DupAddrDetectTransmits.trim(),
    currentSafe.ipv6DupAddrDetectTransmits,
  );

  syncTagList(
    operations,
    base,
    "address",
    parseLines(candidate.addressesText),
    currentSafe.addresses,
  );
  syncTagList(
    operations,
    base,
    "ipv6 address",
    parseLines(candidate.ipv6AddressesText),
    currentSafe.ipv6Addresses,
  );
  syncTagList(
    operations,
    base,
    "dhcp-options reject",
    parseLines(candidate.dhcpRejectText),
    currentSafe.dhcpReject,
  );

  syncFlag(operations, base, "disable", candidate.disable, currentSafe.disable);
  syncFlag(
    operations,
    base,
    "disable-link-detect",
    candidate.disableLinkDetect,
    currentSafe.disableLinkDetect,
  );
  syncFlag(
    operations,
    base,
    "ip disable-forwarding",
    candidate.ipDisableForwarding,
    currentSafe.ipDisableForwarding,
  );
  syncFlag(operations, base, "ip disable-arp-filter", candidate.ipDisableArpFilter, currentSafe.ipDisableArpFilter);
  syncFlag(
    operations,
    base,
    "ip enable-directed-broadcast",
    candidate.ipEnableDirectedBroadcast,
    currentSafe.ipEnableDirectedBroadcast,
  );
  syncFlag(operations, base, "ip enable-arp-accept", candidate.ipEnableArpAccept, currentSafe.ipEnableArpAccept);
  syncFlag(
    operations,
    base,
    "ip enable-arp-announce",
    candidate.ipEnableArpAnnounce,
    currentSafe.ipEnableArpAnnounce,
  );
  syncFlag(operations, base, "ip enable-arp-ignore", candidate.ipEnableArpIgnore, currentSafe.ipEnableArpIgnore);
  syncFlag(operations, base, "ip enable-proxy-arp", candidate.ipEnableProxyArp, currentSafe.ipEnableProxyArp);
  syncFlag(operations, base, "ip proxy-arp-pvlan", candidate.ipProxyArpPvlan, currentSafe.ipProxyArpPvlan);
  syncFlag(
    operations,
    base,
    "ipv6 disable-forwarding",
    candidate.ipv6DisableForwarding,
    currentSafe.ipv6DisableForwarding,
  );
  syncFlag(operations, base, "ipv6 address autoconf", candidate.ipv6AddressAutoconf, currentSafe.ipv6AddressAutoconf);
  syncFlag(
    operations,
    base,
    "ipv6 address no-default-link-local",
    candidate.ipv6AddressNoDefaultLinkLocal,
    currentSafe.ipv6AddressNoDefaultLinkLocal,
  );
  syncFlag(
    operations,
    base,
    "dhcp-options no-default-route",
    candidate.dhcpNoDefaultRoute,
    currentSafe.dhcpNoDefaultRoute,
  );
  syncFlag(
    operations,
    base,
    "dhcpv6-options no-release",
    candidate.dhcpv6NoRelease,
    currentSafe.dhcpv6NoRelease,
  );
  syncFlag(
    operations,
    base,
    "dhcpv6-options parameters-only",
    candidate.dhcpv6ParametersOnly,
    currentSafe.dhcpv6ParametersOnly,
  );
  syncFlag(
    operations,
    base,
    "dhcpv6-options rapid-commit",
    candidate.dhcpv6RapidCommit,
    currentSafe.dhcpv6RapidCommit,
  );
  syncFlag(
    operations,
    base,
    "dhcpv6-options temporary",
    candidate.dhcpv6Temporary,
    currentSafe.dhcpv6Temporary,
  );

  syncAdjustMss(
    operations,
    base,
    "ip adjust-mss",
    candidate.ipAdjustMssClamp,
    candidate.ipAdjustMssValue,
    currentSafe.ipAdjustMssClamp,
    currentSafe.ipAdjustMssValue,
  );
  syncAdjustMss(
    operations,
    base,
    "ipv6 adjust-mss",
    candidate.ipv6AdjustMssClamp,
    candidate.ipv6AdjustMssValue,
    currentSafe.ipv6AdjustMssClamp,
    currentSafe.ipv6AdjustMssValue,
  );

  syncDhcpv6PdRows(operations, base, candidate.dhcpv6PdRows, currentSafe.dhcpv6PdRows);

  return operations;
}

export default function WwanInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<WwanInterfaceConfig[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<WwanFormState>(EMPTY_FORM);
  const [detectedInterfaceNames, setDetectedInterfaceNames] = useState<string[]>([]);
  const [allInterfaceNames, setAllInterfaceNames] = useState<string[]>([]);
  const [runtimeByInterface, setRuntimeByInterface] = useState<
    Record<string, { ipv4: string[]; ipv6: string[] }>
  >({});
  const [physicalByInterface, setPhysicalByInterface] = useState<
    Record<string, { linkUp: boolean | null; speed: string; duplex: string; driver: string; nicModel: string }>
  >({});

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const [config, allInterfaces, runtimeAddresses, physicalDetails] = await Promise.all([
        wwanService.getConfig(refresh),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
        showService.getInterfaceRuntimeAddresses().catch(() => ({ interfaces: [], total: 0 })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
      ]);
      setInterfaces(config.interfaces);
      const names = allInterfaces.interfaces
        .filter((entry) => entry.type === "wwan" || entry.name.toLowerCase().startsWith("wwan"))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
      setDetectedInterfaceNames(names);
      setAllInterfaceNames(
        Array.from(
          new Set(
            allInterfaces.interfaces
              .map((entry) => entry.name)
              .filter((name): name is string => Boolean(name)),
          ),
        ).sort((left, right) => left.localeCompare(right)),
      );

      const nextRuntimeByInterface: Record<string, { ipv4: string[]; ipv6: string[] }> = {};
      for (const runtime of runtimeAddresses.interfaces) {
        nextRuntimeByInterface[runtime.interface] = {
          ipv4: runtime.ipv4_addresses || [],
          ipv6: runtime.ipv6_addresses || [],
        };
      }
      setRuntimeByInterface(nextRuntimeByInterface);

      const nextPhysicalByInterface: Record<
        string,
        { linkUp: boolean | null; speed: string; duplex: string; driver: string; nicModel: string }
      > = {};
      for (const physical of physicalDetails.interfaces) {
        nextPhysicalByInterface[physical.interface] = {
          linkUp: typeof physical.link_up === "boolean" ? physical.link_up : null,
          speed: physical.speed ? String(physical.speed) : "",
          duplex: physical.duplex ? String(physical.duplex) : "",
          driver: physical.driver ? String(physical.driver) : "",
          nicModel: physical.nic_model ? String(physical.nic_model) : "",
        };
      }
      setPhysicalByInterface(nextPhysicalByInterface);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load WWAN interface data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const resetForm = () => {
    setEditingName(null);
    setForm(EMPTY_FORM);
    setError(null);
    setSuccess(null);
  };

  const editInterface = (value: WwanInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete WWAN interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await wwanService.batchConfigure([`delete interfaces wwan ${quoteCliValue(name)}`]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected WWAN deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`WWAN interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete WWAN interface.");
    } finally {
      setSaving(false);
    }
  };

  const updatePdRow = (index: number, patch: Partial<WwanDhcpv6PdRow>) => {
    setForm((previous) => {
      const rows = previous.dhcpv6PdRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      );
      return { ...previous, dhcpv6PdRows: rows };
    });
  };

  const addPdRow = () => {
    setForm((previous) => ({
      ...previous,
      dhcpv6PdRows: [...previous.dhcpv6PdRows, { ...EMPTY_PD_ROW }],
    }));
  };

  const removePdRow = (index: number) => {
    setForm((previous) => ({
      ...previous,
      dhcpv6PdRows: previous.dhcpv6PdRows.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const saveInterface = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Interface name is required.");
      return;
    }
    if (editingName && editingName !== name) {
      setError("Renaming WWAN interfaces is not supported. Create a new one and remove the old interface.");
      return;
    }
    if (
      form.ipSourceValidation.trim() &&
      !SOURCE_VALIDATION_OPTIONS.includes(
        form.ipSourceValidation.trim() as (typeof SOURCE_VALIDATION_OPTIONS)[number],
      )
    ) {
      setError("IPv4 Source Validation must be disable, strict, or loose.");
      return;
    }

    const numericFields = [
      { label: "MTU", value: form.mtu },
      { label: "IPv4 ARP Cache Timeout", value: form.ipArpCacheTimeout },
      { label: "IPv6 DAD Transmits", value: form.ipv6DupAddrDetectTransmits },
      { label: "Max Segment Size (IPv4)", value: form.ipAdjustMssValue, allowClamp: form.ipAdjustMssClamp },
      { label: "Max Segment Size (IPv6)", value: form.ipv6AdjustMssValue, allowClamp: form.ipv6AdjustMssClamp },
      { label: "DHCP Default Route Distance", value: form.dhcpDefaultRouteDistance },
    ];
    for (const field of numericFields) {
      const trimmed = field.value.trim();
      if (!trimmed) continue;
      if ("allowClamp" in field && field.allowClamp) continue;
      if (!/^\d+$/.test(trimmed)) {
        setError(`${field.label} must be a whole number.`);
        return;
      }
    }
    if (form.ipv6AcceptDad.trim() && !IPV6_ACCEPT_DAD_OPTIONS.includes(form.ipv6AcceptDad.trim() as (typeof IPV6_ACCEPT_DAD_OPTIONS)[number])) {
      setError("IPv6 Accept DAD must be 0, 1, or 2.");
      return;
    }

    const current = interfaces.find((entry) => entry.name === name) || null;
    let operations: string[] = [];
    try {
      operations = buildWwanOperations({ ...form, name }, current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid WWAN configuration.");
      return;
    }
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await wwanService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected WWAN configuration.");
      }
      await loadData(true);
      setSuccess(current ? `WWAN interface '${name}' updated.` : `WWAN interface '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save WWAN interface.");
    } finally {
      setSaving(false);
    }
  };

  const disabledCount = useMemo(() => interfaces.filter((entry) => entry.disable).length, [interfaces]);
  const hasDetectedHardware = detectedInterfaceNames.length > 0 || interfaces.length > 0;
  const pdDelegateInterfaceNames = useMemo(
    () =>
      Array.from(new Set([...allInterfaceNames, ...interfaces.map((entry) => entry.name)])).sort((left, right) =>
        left.localeCompare(right),
      ),
    [allInterfaceNames, interfaces],
  );

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
            <h1 className="text-3xl font-bold">WWAN Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure cellular modem interfaces under `interfaces wwan`.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.wwanInterfaces} />
        </div>

        {!hasDetectedHardware && (
          <Card className="border-amber-500/40">
            <CardHeader>
              <CardTitle className="text-base text-amber-300">No WWAN Device Detected</CardTitle>
              <CardDescription>
                No `wwan*` interface is currently visible on this node. You can still pre-stage configuration,
                but it will only become operational when supported hardware is available.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

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

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Configured WWAN Interfaces</CardTitle>
              <CardDescription>
                {interfaces.length} interface{interfaces.length === 1 ? "" : "s"} configured
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Disabled: {disabledCount}</Badge>
                  <Badge variant="outline">Detected: {detectedInterfaceNames.length}</Badge>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadData(true)}
                  disabled={refreshing}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>APN</TableHead>
                      <TableHead>Addressing</TableHead>
                      <TableHead>Runtime / Link</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          No WWAN interfaces configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      interfaces.map((entry) => (
                        <TableRow key={entry.name}>
                          {(() => {
                            const runtime = runtimeByInterface[entry.name];
                            const physical = physicalByInterface[entry.name];
                            const runtimeIpv4 = runtime?.ipv4?.join(", ") || "";
                            const runtimeIpv6 = runtime?.ipv6?.join(", ") || "";
                            const hasRuntime = Boolean(runtimeIpv4 || runtimeIpv6);
                            const linkSummary =
                              physical?.linkUp === null || physical?.linkUp === undefined
                                ? "Unknown"
                                : physical.linkUp
                                  ? "Up"
                                  : "Down";
                            const speedDuplex = [physical?.speed || "", physical?.duplex || ""]
                              .filter((value) => value.length > 0)
                              .join(" / ");

                            return (
                              <>
                          <TableCell className="font-medium">{entry.name}</TableCell>
                          <TableCell>{entry.apn || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {entry.addresses.length > 0 ? entry.addresses.join(", ") : "No IPv4 address"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {hasRuntime ? (
                              <div className="space-y-1">
                                {runtimeIpv4 && <div>IPv4: {runtimeIpv4}</div>}
                                {runtimeIpv6 && <div>IPv6: {runtimeIpv6}</div>}
                                <div>
                                  Link: {linkSummary}
                                  {speedDuplex ? ` (${speedDuplex})` : ""}
                                </div>
                                {(physical?.driver || physical?.nicModel) && (
                                  <div>
                                    {physical?.driver || physical?.nicModel}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span>No runtime data</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry.disable ? (
                              <Badge variant="destructive">Disabled</Badge>
                            ) : (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600">Enabled</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editInterface(entry)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void deleteInterface(entry.name)}
                                disabled={saving}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                              </>
                            );
                          })()}
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create WWAN Interface"}</CardTitle>
              <CardDescription>Manage interface, DHCP, and IP tuning options.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wwan-name">Interface Name</Label>
                  <Input
                    id="wwan-name"
                    value={form.name}
                    onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                    placeholder="wwan0"
                    disabled={Boolean(editingName)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wwan-apn">APN</Label>
                  <Input
                    id="wwan-apn"
                    value={form.apn}
                    onChange={(event) => setForm((previous) => ({ ...previous, apn: event.target.value }))}
                    placeholder="internet.provider"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wwan-description">Description</Label>
                <Input
                  id="wwan-description"
                  value={form.description}
                  onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
                  placeholder="LTE uplink"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wwan-mtu">MTU</Label>
                  <Input
                    id="wwan-mtu"
                    value={form.mtu}
                    onChange={(event) => setForm((previous) => ({ ...previous, mtu: event.target.value }))}
                    placeholder="1500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wwan-vrf">VRF</Label>
                  <Input
                    id="wwan-vrf"
                    value={form.vrf}
                    onChange={(event) => setForm((previous) => ({ ...previous, vrf: event.target.value }))}
                    placeholder="BLUE"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wwan-addresses">IPv4 Addresses / DHCP</Label>
                  <Textarea
                    id="wwan-addresses"
                    value={form.addressesText}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, addressesText: event.target.value }))
                    }
                    placeholder={"dhcp\n198.51.100.2/30"}
                    className="min-h-[92px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wwan-ipv6-addresses">IPv6 Addresses / DHCPv6</Label>
                  <Textarea
                    id="wwan-ipv6-addresses"
                    value={form.ipv6AddressesText}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, ipv6AddressesText: event.target.value }))
                    }
                    placeholder={"dhcpv6\n2001:db8:100::2/64"}
                    className="min-h-[92px]"
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <p className="text-sm font-semibold">IPv4 Settings</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="wwan-source-validation">IPv4 Source Validation</Label>
                    <Select
                      value={form.ipSourceValidation || "none"}
                      onValueChange={(value) =>
                        setForm((previous) => ({
                          ...previous,
                          ipSourceValidation: value === "none" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger id="wwan-source-validation">
                        <SelectValue placeholder="Default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Default</SelectItem>
                        {SOURCE_VALIDATION_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wwan-ip-arp-timeout">ARP Cache Timeout (seconds)</Label>
                    <Input
                      id="wwan-ip-arp-timeout"
                      value={form.ipArpCacheTimeout}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, ipArpCacheTimeout: event.target.value }))
                      }
                      placeholder="120"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wwan-ip-mss">IPv4 Adjust MSS</Label>
                    <Input
                      id="wwan-ip-mss"
                      value={form.ipAdjustMssValue}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, ipAdjustMssValue: event.target.value }))
                      }
                      placeholder="1360"
                      disabled={form.ipAdjustMssClamp}
                    />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipDisableForwarding}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipDisableForwarding: Boolean(checked) }))
                      }
                    />
                    Disable IPv4 forwarding
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipDisableArpFilter}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipDisableArpFilter: Boolean(checked) }))
                      }
                    />
                    Disable ARP filter
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipEnableDirectedBroadcast}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({
                          ...previous,
                          ipEnableDirectedBroadcast: Boolean(checked),
                        }))
                      }
                    />
                    Enable directed broadcast
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipEnableArpAccept}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipEnableArpAccept: Boolean(checked) }))
                      }
                    />
                    Enable ARP accept
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipEnableArpAnnounce}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipEnableArpAnnounce: Boolean(checked) }))
                      }
                    />
                    Enable ARP announce
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipEnableArpIgnore}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipEnableArpIgnore: Boolean(checked) }))
                      }
                    />
                    Enable ARP ignore
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipEnableProxyArp}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipEnableProxyArp: Boolean(checked) }))
                      }
                    />
                    Enable proxy ARP
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipProxyArpPvlan}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipProxyArpPvlan: Boolean(checked) }))
                      }
                    />
                    Proxy ARP PVLAN mode
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipAdjustMssClamp}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipAdjustMssClamp: Boolean(checked) }))
                      }
                    />
                    Clamp MSS to PMTU
                  </label>
                </div>
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <p className="text-sm font-semibold">IPv6 Settings</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="wwan-ipv6-accept-dad">Accept DAD</Label>
                    <Select
                      value={form.ipv6AcceptDad || "default"}
                      onValueChange={(value) =>
                        setForm((previous) => ({
                          ...previous,
                          ipv6AcceptDad: value === "default" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger id="wwan-ipv6-accept-dad">
                        <SelectValue placeholder="Default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        {IPV6_ACCEPT_DAD_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wwan-ipv6-dad-transmits">DAD Transmits</Label>
                    <Input
                      id="wwan-ipv6-dad-transmits"
                      value={form.ipv6DupAddrDetectTransmits}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          ipv6DupAddrDetectTransmits: event.target.value,
                        }))
                      }
                      placeholder="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wwan-ipv6-eui64">EUI-64 Prefix</Label>
                    <Input
                      id="wwan-ipv6-eui64"
                      value={form.ipv6AddressEui64}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, ipv6AddressEui64: event.target.value }))
                      }
                      placeholder="2001:db8:100::/64"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wwan-ipv6-mss">IPv6 Adjust MSS</Label>
                    <Input
                      id="wwan-ipv6-mss"
                      value={form.ipv6AdjustMssValue}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, ipv6AdjustMssValue: event.target.value }))
                      }
                      placeholder="1360"
                      disabled={form.ipv6AdjustMssClamp}
                    />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipv6DisableForwarding}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipv6DisableForwarding: Boolean(checked) }))
                      }
                    />
                    Disable IPv6 forwarding
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipv6AddressAutoconf}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipv6AddressAutoconf: Boolean(checked) }))
                      }
                    />
                    Enable autoconf
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipv6AddressNoDefaultLinkLocal}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({
                          ...previous,
                          ipv6AddressNoDefaultLinkLocal: Boolean(checked),
                        }))
                      }
                    />
                    No default link-local
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.ipv6AdjustMssClamp}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, ipv6AdjustMssClamp: Boolean(checked) }))
                      }
                    />
                    Clamp MSS to PMTU
                  </label>
                </div>
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <p className="text-sm font-semibold">DHCPv4 Client Options</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="wwan-dhcp-client-id">Client ID</Label>
                    <Input
                      id="wwan-dhcp-client-id"
                      value={form.dhcpClientId}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, dhcpClientId: event.target.value }))
                      }
                      placeholder="cell-uplink-1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wwan-dhcp-host-name">Host Name</Label>
                    <Input
                      id="wwan-dhcp-host-name"
                      value={form.dhcpHostName}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, dhcpHostName: event.target.value }))
                      }
                      placeholder="vyos-wwan"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wwan-dhcp-vendor-class">Vendor Class ID</Label>
                    <Input
                      id="wwan-dhcp-vendor-class"
                      value={form.dhcpVendorClassId}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, dhcpVendorClassId: event.target.value }))
                      }
                      placeholder="vyos-wwan-modem"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wwan-dhcp-user-class">User Class</Label>
                    <Input
                      id="wwan-dhcp-user-class"
                      value={form.dhcpUserClass}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, dhcpUserClass: event.target.value }))
                      }
                      placeholder="mobile-edge"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wwan-dhcp-distance">Default Route Distance</Label>
                    <Input
                      id="wwan-dhcp-distance"
                      value={form.dhcpDefaultRouteDistance}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, dhcpDefaultRouteDistance: event.target.value }))
                      }
                      placeholder="210"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wwan-dhcp-reject">Reject Prefixes/IPs (one per line)</Label>
                  <Textarea
                    id="wwan-dhcp-reject"
                    value={form.dhcpRejectText}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, dhcpRejectText: event.target.value }))
                    }
                    placeholder={"198.51.100.0/24\n203.0.113.2"}
                    className="min-h-[84px]"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.dhcpNoDefaultRoute}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, dhcpNoDefaultRoute: Boolean(checked) }))
                    }
                  />
                  Do not install DHCP default route
                </label>
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <p className="text-sm font-semibold">DHCPv6 Client / Prefix Delegation</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="wwan-dhcpv6-duid">DUID</Label>
                    <Input
                      id="wwan-dhcpv6-duid"
                      value={form.dhcpv6Duid}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, dhcpv6Duid: event.target.value }))
                      }
                      placeholder="00:03:00:01:aa:bb:cc:dd:ee:ff"
                    />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.dhcpv6NoRelease}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, dhcpv6NoRelease: Boolean(checked) }))
                      }
                    />
                    No release
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.dhcpv6ParametersOnly}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({
                          ...previous,
                          dhcpv6ParametersOnly: Boolean(checked),
                        }))
                      }
                    />
                    Parameters only
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.dhcpv6RapidCommit}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, dhcpv6RapidCommit: Boolean(checked) }))
                      }
                    />
                    Rapid commit
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.dhcpv6Temporary}
                      onCheckedChange={(checked) =>
                        setForm((previous) => ({ ...previous, dhcpv6Temporary: Boolean(checked) }))
                      }
                    />
                    Temporary addresses
                  </label>
                </div>

                <div className="space-y-3 rounded-md border border-dashed p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">DHCPv6 Prefix Delegation Rows</p>
                      <p className="text-xs text-muted-foreground">
                        Define `pd &lt;id&gt;`, prefix length, and delegate interfaces.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addPdRow}>
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      Add Row
                    </Button>
                  </div>

                  {form.dhcpv6PdRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No PD rows configured.</p>
                  ) : (
                    <div className="space-y-2">
                      {form.dhcpv6PdRows.map((row, index) => (
                        <div
                          key={`${index}-${row.id}-${row.delegateInterface}`}
                          className="grid gap-2 rounded border p-2 md:grid-cols-[72px_92px_minmax(120px,1fr)_minmax(140px,1fr)_92px_auto]"
                        >
                          <div className="space-y-1">
                            <Label className="text-xs">PD ID</Label>
                            <Input
                              value={row.id}
                              onChange={(event) => updatePdRow(index, { id: event.target.value })}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Length</Label>
                            <Input
                              value={row.length}
                              onChange={(event) => updatePdRow(index, { length: event.target.value })}
                              placeholder="56"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Delegate Interface</Label>
                            <Input
                              list="wwan-pd-delegate-interfaces"
                              value={row.delegateInterface}
                              onChange={(event) =>
                                updatePdRow(index, { delegateInterface: event.target.value })
                              }
                              placeholder="eth1"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Address</Label>
                            <Input
                              value={row.address}
                              onChange={(event) => updatePdRow(index, { address: event.target.value })}
                              placeholder="2001:db8:200::/64"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">SLA ID</Label>
                            <Input
                              value={row.slaId}
                              onChange={(event) => updatePdRow(index, { slaId: event.target.value })}
                              placeholder="0"
                            />
                          </div>
                          <div className="flex items-end justify-end">
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              onClick={() => removePdRow(index)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <datalist id="wwan-pd-delegate-interfaces">
                    {pdDelegateInterfaceNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disable}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, disable: Boolean(checked) }))
                    }
                  />
                  Disable interface
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disableLinkDetect}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, disableLinkDetect: Boolean(checked) }))
                    }
                  />
                  Disable link detect
                </label>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" onClick={() => void saveInterface()} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Saving..." : editingName ? "Save Changes" : "Create Interface"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                  <Plus className="mr-2 h-4 w-4" />
                  New
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
