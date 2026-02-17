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
import { pageGuides } from "@/lib/help/pageGuides";
import { type VxlanVlanToVni, vxlanService, type VxlanInterfaceConfig } from "@/lib/api/vxlan";

interface VxlanFormState {
  name: string;
  description: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  vni: string;
  port: string;
  sourceAddress: string;
  sourceInterface: string;
  remote: string;
  group: string;
  mac: string;
  disableFlowControl: boolean;
  disableLinkDetect: boolean;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipArpCacheTimeout: string;
  ipDisableArpFilter: boolean;
  ipDisableForwarding: boolean;
  ipEnableArpAccept: boolean;
  ipEnableArpAnnounce: boolean;
  ipEnableArpIgnore: boolean;
  ipEnableDirectedBroadcast: boolean;
  ipEnableProxyArp: boolean;
  ipProxyArpPvlan: boolean;
  ipSourceValidation: string;
  ipv6AddressAutoconf: boolean;
  ipv6AddressEui64: string;
  ipv6AddressNoDefaultLinkLocal: boolean;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
  ipv6DisableForwarding: boolean;
  gpe: boolean;
  parametersExternal: boolean;
  parametersNeighborSuppress: boolean;
  parametersNolearning: boolean;
  parametersVniFilter: boolean;
  vlanToVni: VxlanVlanToVni[];
}

const EMPTY_FORM: VxlanFormState = {
  name: "",
  description: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  disable: false,
  vni: "",
  port: "",
  sourceAddress: "",
  sourceInterface: "",
  remote: "",
  group: "",
  mac: "",
  disableFlowControl: false,
  disableLinkDetect: false,
  ipAdjustMssClamp: false,
  ipAdjustMssValue: "",
  ipArpCacheTimeout: "",
  ipDisableArpFilter: false,
  ipDisableForwarding: false,
  ipEnableArpAccept: false,
  ipEnableArpAnnounce: false,
  ipEnableArpIgnore: false,
  ipEnableDirectedBroadcast: false,
  ipEnableProxyArp: false,
  ipProxyArpPvlan: false,
  ipSourceValidation: "",
  ipv6AddressAutoconf: false,
  ipv6AddressEui64: "",
  ipv6AddressNoDefaultLinkLocal: false,
  ipv6AdjustMssClamp: false,
  ipv6AdjustMssValue: "",
  ipv6DisableForwarding: false,
  gpe: false,
  parametersExternal: false,
  parametersNeighborSuppress: false,
  parametersNolearning: false,
  parametersVniFilter: false,
  vlanToVni: [],
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

function parseAddressLines(raw: string): string[] {
  return uniqueNonEmpty(raw.split("\n"));
}

function normalizeVlanToVni(entries: VxlanVlanToVni[]): VxlanVlanToVni[] {
  const pairs = entries
    .map((entry) => ({
      vlan: entry.vlan.trim(),
      vni: entry.vni.trim(),
    }))
    .filter((entry) => entry.vlan && entry.vni);

  const seen = new Set<string>();
  const out: VxlanVlanToVni[] = [];
  for (const entry of pairs) {
    if (seen.has(entry.vlan)) continue;
    seen.add(entry.vlan);
    out.push(entry);
  }
  return out.sort((left, right) => Number(left.vlan) - Number(right.vlan));
}

function toFormState(value: VxlanInterfaceConfig): VxlanFormState {
  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
    vni: value.vni,
    port: value.port,
    sourceAddress: value.sourceAddress,
    sourceInterface: value.sourceInterface,
    remote: value.remote,
    group: value.group,
    mac: value.mac,
    disableFlowControl: value.disableFlowControl,
    disableLinkDetect: value.disableLinkDetect,
    ipAdjustMssClamp: value.ipAdjustMssClamp,
    ipAdjustMssValue: value.ipAdjustMssValue,
    ipArpCacheTimeout: value.ipArpCacheTimeout,
    ipDisableArpFilter: value.ipDisableArpFilter,
    ipDisableForwarding: value.ipDisableForwarding,
    ipEnableArpAccept: value.ipEnableArpAccept,
    ipEnableArpAnnounce: value.ipEnableArpAnnounce,
    ipEnableArpIgnore: value.ipEnableArpIgnore,
    ipEnableDirectedBroadcast: value.ipEnableDirectedBroadcast,
    ipEnableProxyArp: value.ipEnableProxyArp,
    ipProxyArpPvlan: value.ipProxyArpPvlan,
    ipSourceValidation: value.ipSourceValidation,
    ipv6AddressAutoconf: value.ipv6AddressAutoconf,
    ipv6AddressEui64: value.ipv6AddressEui64,
    ipv6AddressNoDefaultLinkLocal: value.ipv6AddressNoDefaultLinkLocal,
    ipv6AdjustMssClamp: value.ipv6AdjustMssClamp,
    ipv6AdjustMssValue: value.ipv6AdjustMssValue,
    ipv6DisableForwarding: value.ipv6DisableForwarding,
    gpe: value.gpe,
    parametersExternal: value.parametersExternal,
    parametersNeighborSuppress: value.parametersNeighborSuppress,
    parametersNolearning: value.parametersNolearning,
    parametersVniFilter: value.parametersVniFilter,
    vlanToVni: value.vlanToVni,
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

function syncAdjustMss(
  operations: string[],
  base: string,
  family: "ip" | "ipv6",
  desiredClamp: boolean,
  desiredValue: string,
  currentClamp: boolean,
  currentValue: string,
): void {
  const token = `${family} adjust-mss`;
  const trimmedDesired = desiredValue.trim();
  const trimmedCurrent = currentValue.trim();

  if (desiredClamp) {
    if (currentClamp && !trimmedCurrent) return;
    if (currentClamp || trimmedCurrent) {
      operations.push(`delete ${base} ${token}`);
    }
    operations.push(`set ${base} ${token} clamp-mss-to-pmtu`);
    return;
  }

  if (trimmedDesired) {
    if (currentClamp || trimmedDesired !== trimmedCurrent) {
      if (currentClamp) {
        operations.push(`delete ${base} ${token}`);
      }
      operations.push(`set ${base} ${token} ${quoteCliValue(trimmedDesired)}`);
    }
    return;
  }

  if (currentClamp || trimmedCurrent) {
    operations.push(`delete ${base} ${token}`);
  }
}

function buildVxlanOperations(candidate: VxlanFormState, current: VxlanInterfaceConfig | null): string[] {
  const operations: string[] = [];
  const base = `interfaces vxlan ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      addresses: [],
      mtu: "",
      vrf: "",
      disable: false,
      vni: "",
      port: "",
      sourceAddress: "",
      sourceInterface: "",
      remote: "",
      group: "",
      mac: "",
      disableFlowControl: false,
      disableLinkDetect: false,
      ipAdjustMssClamp: false,
      ipAdjustMssValue: "",
      ipArpCacheTimeout: "",
      ipDisableArpFilter: false,
      ipDisableForwarding: false,
      ipEnableArpAccept: false,
      ipEnableArpAnnounce: false,
      ipEnableArpIgnore: false,
      ipEnableDirectedBroadcast: false,
      ipEnableProxyArp: false,
      ipProxyArpPvlan: false,
      ipSourceValidation: "",
      ipv6AddressAutoconf: false,
      ipv6AddressEui64: "",
      ipv6AddressNoDefaultLinkLocal: false,
      ipv6AdjustMssClamp: false,
      ipv6AdjustMssValue: "",
      ipv6DisableForwarding: false,
      gpe: false,
      parametersExternal: false,
      parametersNeighborSuppress: false,
      parametersNolearning: false,
      parametersVniFilter: false,
      vlanToVni: [],
    } satisfies VxlanInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);
  syncScalar(operations, base, "vni", candidate.vni.trim(), currentSafe.vni);
  syncScalar(operations, base, "port", candidate.port.trim(), currentSafe.port);
  syncScalar(
    operations,
    base,
    "source-address",
    candidate.sourceAddress.trim(),
    currentSafe.sourceAddress,
  );
  syncScalar(
    operations,
    base,
    "source-interface",
    candidate.sourceInterface.trim(),
    currentSafe.sourceInterface,
  );
  syncScalar(operations, base, "remote", candidate.remote.trim(), currentSafe.remote);
  syncScalar(operations, base, "group", candidate.group.trim(), currentSafe.group);
  syncScalar(operations, base, "mac", candidate.mac.trim(), currentSafe.mac);
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
    "ipv6 address eui64",
    candidate.ipv6AddressEui64.trim(),
    currentSafe.ipv6AddressEui64,
  );

  const desiredAddresses = parseAddressLines(candidate.addressesText);
  const currentAddressSet = new Set(currentSafe.addresses);
  const desiredAddressSet = new Set(desiredAddresses);
  for (const address of currentSafe.addresses) {
    if (!desiredAddressSet.has(address)) {
      operations.push(`delete ${base} address ${quoteCliValue(address)}`);
    }
  }
  for (const address of desiredAddresses) {
    if (!currentAddressSet.has(address)) {
      operations.push(`set ${base} address ${quoteCliValue(address)}`);
    }
  }

  syncFlag(operations, base, "disable", candidate.disable, currentSafe.disable);
  syncFlag(
    operations,
    base,
    "disable-flow-control",
    candidate.disableFlowControl,
    currentSafe.disableFlowControl,
  );
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
    "ip disable-arp-filter",
    candidate.ipDisableArpFilter,
    currentSafe.ipDisableArpFilter,
  );
  syncFlag(
    operations,
    base,
    "ip disable-forwarding",
    candidate.ipDisableForwarding,
    currentSafe.ipDisableForwarding,
  );
  syncFlag(
    operations,
    base,
    "ip enable-arp-accept",
    candidate.ipEnableArpAccept,
    currentSafe.ipEnableArpAccept,
  );
  syncFlag(
    operations,
    base,
    "ip enable-arp-announce",
    candidate.ipEnableArpAnnounce,
    currentSafe.ipEnableArpAnnounce,
  );
  syncFlag(
    operations,
    base,
    "ip enable-arp-ignore",
    candidate.ipEnableArpIgnore,
    currentSafe.ipEnableArpIgnore,
  );
  syncFlag(
    operations,
    base,
    "ip enable-directed-broadcast",
    candidate.ipEnableDirectedBroadcast,
    currentSafe.ipEnableDirectedBroadcast,
  );
  syncFlag(
    operations,
    base,
    "ip enable-proxy-arp",
    candidate.ipEnableProxyArp,
    currentSafe.ipEnableProxyArp,
  );
  syncFlag(
    operations,
    base,
    "ip proxy-arp-pvlan",
    candidate.ipProxyArpPvlan,
    currentSafe.ipProxyArpPvlan,
  );
  syncFlag(
    operations,
    base,
    "ipv6 address autoconf",
    candidate.ipv6AddressAutoconf,
    currentSafe.ipv6AddressAutoconf,
  );
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
    "ipv6 disable-forwarding",
    candidate.ipv6DisableForwarding,
    currentSafe.ipv6DisableForwarding,
  );
  syncFlag(operations, base, "gpe", candidate.gpe, currentSafe.gpe);
  syncFlag(
    operations,
    base,
    "parameters external",
    candidate.parametersExternal,
    currentSafe.parametersExternal,
  );
  syncFlag(
    operations,
    base,
    "parameters neighbor-suppress",
    candidate.parametersNeighborSuppress,
    currentSafe.parametersNeighborSuppress,
  );
  syncFlag(
    operations,
    base,
    "parameters nolearning",
    candidate.parametersNolearning,
    currentSafe.parametersNolearning,
  );
  syncFlag(
    operations,
    base,
    "parameters vni-filter",
    candidate.parametersVniFilter,
    currentSafe.parametersVniFilter,
  );
  syncAdjustMss(
    operations,
    base,
    "ip",
    candidate.ipAdjustMssClamp,
    candidate.ipAdjustMssValue,
    currentSafe.ipAdjustMssClamp,
    currentSafe.ipAdjustMssValue,
  );
  syncAdjustMss(
    operations,
    base,
    "ipv6",
    candidate.ipv6AdjustMssClamp,
    candidate.ipv6AdjustMssValue,
    currentSafe.ipv6AdjustMssClamp,
    currentSafe.ipv6AdjustMssValue,
  );

  const currentVlanMap = new Map(currentSafe.vlanToVni.map((entry) => [entry.vlan, entry.vni]));
  const desiredVlanToVni = normalizeVlanToVni(candidate.vlanToVni);
  const desiredVlanMap = new Map(desiredVlanToVni.map((entry) => [entry.vlan, entry.vni]));

  for (const [vlan, vni] of currentVlanMap.entries()) {
    if (!desiredVlanMap.has(vlan)) {
      operations.push(`delete ${base} vlan-to-vni ${quoteCliValue(vlan)}`);
      continue;
    }
    const desiredVni = desiredVlanMap.get(vlan) || "";
    if (desiredVni !== vni) {
      operations.push(`set ${base} vlan-to-vni ${quoteCliValue(vlan)} vni ${quoteCliValue(desiredVni)}`);
    }
  }
  for (const [vlan, vni] of desiredVlanMap.entries()) {
    if (!currentVlanMap.has(vlan)) {
      operations.push(`set ${base} vlan-to-vni ${quoteCliValue(vlan)} vni ${quoteCliValue(vni)}`);
    }
  }

  return operations;
}

export default function VxlanInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<VxlanInterfaceConfig[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<VxlanFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const config = await vxlanService.getConfig(refresh);
      setInterfaces(config.interfaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load VXLAN interfaces.");
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

  const editInterface = (value: VxlanInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete VXLAN interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await vxlanService.batchConfigure([`delete interfaces vxlan ${quoteCliValue(name)}`]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected VXLAN interface deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`VXLAN interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete VXLAN interface.");
    } finally {
      setSaving(false);
    }
  };

  const saveInterface = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Interface name is required.");
      return;
    }
    if (editingName && editingName !== name) {
      setError("Renaming VXLAN interfaces is not supported. Create a new interface and delete the old one.");
      return;
    }
    if (!form.vni.trim()) {
      setError("VNI is required.");
      return;
    }
    if (!form.remote.trim() && !form.group.trim()) {
      setError("Set either remote (unicast) or group (multicast).");
      return;
    }
    if (form.remote.trim() && form.group.trim()) {
      setError("Use either remote or group, not both.");
      return;
    }

    const numericFields = [
      { label: "VNI", value: form.vni },
      { label: "Port", value: form.port },
      { label: "MTU", value: form.mtu },
      { label: "ARP Cache Timeout", value: form.ipArpCacheTimeout },
      { label: "IPv4 MSS", value: form.ipAdjustMssValue, clamp: form.ipAdjustMssClamp },
      { label: "IPv6 MSS", value: form.ipv6AdjustMssValue, clamp: form.ipv6AdjustMssClamp },
    ];
    for (const field of numericFields) {
      const trimmed = field.value.trim();
      if (!trimmed) continue;
      if ("clamp" in field && field.clamp) continue;
      if (!/^\d+$/.test(trimmed)) {
        setError(`${field.label} must be a whole number.`);
        return;
      }
    }

    if (form.mac.trim() && !/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(form.mac.trim())) {
      setError("MAC must be in format aa:bb:cc:dd:ee:ff.");
      return;
    }
    if (
      form.ipSourceValidation.trim() &&
      !["strict", "loose", "disable"].includes(form.ipSourceValidation.trim())
    ) {
      setError("IP source validation must be one of: strict, loose, disable.");
      return;
    }

    for (const pair of normalizeVlanToVni(form.vlanToVni)) {
      if (!/^\d+$/.test(pair.vlan) || !/^\d+$/.test(pair.vni)) {
        setError("VLAN-to-VNI mapping values must be numeric.");
        return;
      }
    }

    const current = interfaces.find((entry) => entry.name === name) || null;
    const operations = buildVxlanOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await vxlanService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected VXLAN interface update.");
      }
      await loadData(true);
      setSuccess(current ? `VXLAN '${name}' updated.` : `VXLAN '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save VXLAN interface.");
    } finally {
      setSaving(false);
    }
  };

  const disabledCount = useMemo(() => interfaces.filter((entry) => entry.disable).length, [interfaces]);

  const addVlanToVniRow = () => {
    setForm((prev) => ({
      ...prev,
      vlanToVni: [...prev.vlanToVni, { vlan: "", vni: "" }],
    }));
  };

  const removeVlanToVniRow = (index: number) => {
    setForm((prev) => ({
      ...prev,
      vlanToVni: prev.vlanToVni.filter((_, idx) => idx !== index),
    }));
  };

  const updateVlanToVniRow = (index: number, key: "vlan" | "vni", value: string) => {
    setForm((prev) => ({
      ...prev,
      vlanToVni: prev.vlanToVni.map((row, idx) => (idx === index ? { ...row, [key]: value } : row)),
    }));
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
            <h1 className="text-3xl font-bold">VXLAN Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces vxlan` for unicast/multicast overlays and VLAN-to-VNI mappings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New VXLAN
            </Button>
            <PageGuideDialog guide={pageGuides.vxlanInterfaces} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-bold">{interfaces.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Disabled</p>
              <p className="mt-1 text-2xl font-bold">{disabledCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">With VLAN-to-VNI Maps</p>
              <p className="mt-1 text-2xl font-bold">
                {interfaces.filter((entry) => entry.vlanToVni.length > 0).length}
              </p>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Configured VXLAN Interfaces</CardTitle>
              <CardDescription>Select an interface to edit or delete.</CardDescription>
            </CardHeader>
            <CardContent>
              {interfaces.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No VXLAN interfaces configured.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>VNI</TableHead>
                      <TableHead>Transport</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.map((entry) => (
                      <TableRow key={entry.name}>
                        <TableCell className="font-medium">{entry.name}</TableCell>
                        <TableCell>{entry.vni || "-"}</TableCell>
                        <TableCell>{entry.remote || entry.group || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={entry.disable ? "destructive" : "default"}>
                            {entry.disable ? "Disabled" : "Enabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => editInterface(entry)} disabled={saving}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteInterface(entry.name)}
                              disabled={saving}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create VXLAN Interface"}</CardTitle>
              <CardDescription>Core VXLAN underlay and behavior controls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vxlan-name">Interface Name</Label>
                  <Input
                    id="vxlan-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="vxlan241"
                    disabled={Boolean(editingName)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vxlan-description">Description</Label>
                  <Input
                    id="vxlan-description"
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="DC overlay segment"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="vxlan-vni">VNI</Label>
                  <Input
                    id="vxlan-vni"
                    value={form.vni}
                    onChange={(event) => setForm((prev) => ({ ...prev, vni: event.target.value }))}
                    placeholder="241"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vxlan-port">Port</Label>
                  <Input
                    id="vxlan-port"
                    value={form.port}
                    onChange={(event) => setForm((prev) => ({ ...prev, port: event.target.value }))}
                    placeholder="8472"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vxlan-mtu">MTU</Label>
                  <Input
                    id="vxlan-mtu"
                    value={form.mtu}
                    onChange={(event) => setForm((prev) => ({ ...prev, mtu: event.target.value }))}
                    placeholder="1450"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vxlan-vrf">VRF</Label>
                  <Input
                    id="vxlan-vrf"
                    value={form.vrf}
                    onChange={(event) => setForm((prev) => ({ ...prev, vrf: event.target.value }))}
                    placeholder="BLUE"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vxlan-source-address">Source Address</Label>
                  <Input
                    id="vxlan-source-address"
                    value={form.sourceAddress}
                    onChange={(event) => setForm((prev) => ({ ...prev, sourceAddress: event.target.value }))}
                    placeholder="10.1.2.2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vxlan-source-interface">Source Interface</Label>
                  <Input
                    id="vxlan-source-interface"
                    value={form.sourceInterface}
                    onChange={(event) => setForm((prev) => ({ ...prev, sourceInterface: event.target.value }))}
                    placeholder="eth0"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vxlan-remote">Remote (Unicast)</Label>
                  <Input
                    id="vxlan-remote"
                    value={form.remote}
                    onChange={(event) => setForm((prev) => ({ ...prev, remote: event.target.value }))}
                    placeholder="10.1.3.3"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vxlan-group">Group (Multicast)</Label>
                  <Input
                    id="vxlan-group"
                    value={form.group}
                    onChange={(event) => setForm((prev) => ({ ...prev, group: event.target.value }))}
                    placeholder="239.0.0.241"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="vxlan-mac">MAC Address</Label>
                  <Input
                    id="vxlan-mac"
                    value={form.mac}
                    onChange={(event) => setForm((prev) => ({ ...prev, mac: event.target.value }))}
                    placeholder="00:53:01:02:03:04"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vxlan-ip-arp-cache-timeout">ARP Cache Timeout</Label>
                  <Input
                    id="vxlan-ip-arp-cache-timeout"
                    value={form.ipArpCacheTimeout}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, ipArpCacheTimeout: event.target.value }))
                    }
                    placeholder="180"
                  />
                </div>
                <div className="space-y-2">
                  <Label>IP Source Validation</Label>
                  <Select
                    value={form.ipSourceValidation || "__empty__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        ipSourceValidation: value === "__empty__" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">Default</SelectItem>
                      <SelectItem value="strict">strict</SelectItem>
                      <SelectItem value="loose">loose</SelectItem>
                      <SelectItem value="disable">disable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="vxlan-ip-adjust-mss">IPv4 Adjust MSS</Label>
                  <Input
                    id="vxlan-ip-adjust-mss"
                    value={form.ipAdjustMssValue}
                    onChange={(event) => setForm((prev) => ({ ...prev, ipAdjustMssValue: event.target.value }))}
                    placeholder="1452"
                    disabled={form.ipAdjustMssClamp}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vxlan-ipv6-address-eui64">IPv6 EUI64 Prefix</Label>
                  <Input
                    id="vxlan-ipv6-address-eui64"
                    value={form.ipv6AddressEui64}
                    onChange={(event) => setForm((prev) => ({ ...prev, ipv6AddressEui64: event.target.value }))}
                    placeholder="2001:db8:beef::/64"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vxlan-ipv6-adjust-mss">IPv6 Adjust MSS</Label>
                  <Input
                    id="vxlan-ipv6-adjust-mss"
                    value={form.ipv6AdjustMssValue}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, ipv6AdjustMssValue: event.target.value }))
                    }
                    placeholder="1432"
                    disabled={form.ipv6AdjustMssClamp}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vxlan-addresses">Interface Addresses</Label>
                <Textarea
                  id="vxlan-addresses"
                  value={form.addressesText}
                  onChange={(event) => setForm((prev) => ({ ...prev, addressesText: event.target.value }))}
                  placeholder={"172.16.241.1/24\n2001:db8:241::1/64"}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>VLAN-to-VNI Mapping</Label>
                  <Button size="sm" variant="outline" onClick={addVlanToVniRow}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Mapping
                  </Button>
                </div>
                {form.vlanToVni.length === 0 ? (
                  <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
                    No VLAN-to-VNI mappings configured.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.vlanToVni.map((entry, index) => (
                      <div key={`vlan-vni-${index}`} className="grid grid-cols-12 gap-2">
                        <Input
                          className="col-span-5"
                          value={entry.vlan}
                          onChange={(event) => updateVlanToVniRow(index, "vlan", event.target.value)}
                          placeholder="VLAN ID"
                        />
                        <Input
                          className="col-span-5"
                          value={entry.vni}
                          onChange={(event) => updateVlanToVniRow(index, "vni", event.target.value)}
                          placeholder="VNI"
                        />
                        <Button
                          className="col-span-2"
                          size="icon"
                          variant="destructive"
                          onClick={() => removeVlanToVniRow(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disable}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, disable: checked === true }))}
                  />
                  Disable
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disableFlowControl}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, disableFlowControl: checked === true }))
                    }
                  />
                  Disable Flow Control
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disableLinkDetect}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, disableLinkDetect: checked === true }))
                    }
                  />
                  Disable Link Detect
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.gpe}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, gpe: checked === true }))}
                  />
                  Enable GPE
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipAdjustMssClamp}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipAdjustMssClamp: checked === true }))
                    }
                  />
                  Clamp IPv4 MSS to PMTU
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipv6AdjustMssClamp}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipv6AdjustMssClamp: checked === true }))
                    }
                  />
                  Clamp IPv6 MSS to PMTU
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipDisableArpFilter}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipDisableArpFilter: checked === true }))
                    }
                  />
                  Disable ARP Filter
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipDisableForwarding}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipDisableForwarding: checked === true }))
                    }
                  />
                  Disable IPv4 Forwarding
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipEnableArpAccept}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipEnableArpAccept: checked === true }))
                    }
                  />
                  Enable ARP Accept
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipEnableArpAnnounce}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipEnableArpAnnounce: checked === true }))
                    }
                  />
                  Enable ARP Announce
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipEnableArpIgnore}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipEnableArpIgnore: checked === true }))
                    }
                  />
                  Enable ARP Ignore
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipEnableDirectedBroadcast}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipEnableDirectedBroadcast: checked === true }))
                    }
                  />
                  Enable Directed Broadcast
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipEnableProxyArp}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipEnableProxyArp: checked === true }))
                    }
                  />
                  Enable Proxy ARP
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipProxyArpPvlan}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipProxyArpPvlan: checked === true }))
                    }
                  />
                  Proxy ARP PVLAN
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipv6AddressAutoconf}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipv6AddressAutoconf: checked === true }))
                    }
                  />
                  IPv6 Address Autoconf
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipv6AddressNoDefaultLinkLocal}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipv6AddressNoDefaultLinkLocal: checked === true }))
                    }
                  />
                  IPv6 No Default Link-Local
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipv6DisableForwarding}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipv6DisableForwarding: checked === true }))
                    }
                  />
                  Disable IPv6 Forwarding
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.parametersExternal}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, parametersExternal: checked === true }))
                    }
                  />
                  Parameters: External
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.parametersNeighborSuppress}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, parametersNeighborSuppress: checked === true }))
                    }
                  />
                  Neighbor Suppress
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.parametersNolearning}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, parametersNolearning: checked === true }))
                    }
                  />
                  No Learning
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.parametersVniFilter}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, parametersVniFilter: checked === true }))
                    }
                  />
                  VNI Filter
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={saveInterface} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {editingName ? "Save Changes" : "Create Interface"}
                </Button>
                <Button variant="outline" onClick={resetForm} disabled={saving}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
