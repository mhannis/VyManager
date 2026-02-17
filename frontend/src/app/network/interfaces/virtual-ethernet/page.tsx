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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  virtualEthernetService,
  type VirtualEthernetInterfaceConfig,
  type VirtualEthernetVifConfig,
} from "@/lib/api/virtual-ethernet";
import { pageGuides } from "@/lib/help/pageGuides";

interface VirtualEthernetVifFormState {
  id: string;
  description: string;
  addressesText: string;
  mtu: string;
  mac: string;
  disable: boolean;
  disableLinkDetect: boolean;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipArpCacheTimeout: string;
  ipDisableArpFilter: boolean;
  ipDisableForwarding: boolean;
  ipEnableArpAccept: boolean;
  ipEnableArpAnnounce: boolean;
  ipEnableDirectedBroadcast: boolean;
}

interface VirtualEthernetFormState {
  name: string;
  description: string;
  peerName: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  vifs: VirtualEthernetVifFormState[];
}

const EMPTY_VIF: VirtualEthernetVifFormState = {
  id: "",
  description: "",
  addressesText: "",
  mtu: "",
  mac: "",
  disable: false,
  disableLinkDetect: false,
  ipAdjustMssClamp: false,
  ipAdjustMssValue: "",
  ipArpCacheTimeout: "",
  ipDisableArpFilter: false,
  ipDisableForwarding: false,
  ipEnableArpAccept: false,
  ipEnableArpAnnounce: false,
  ipEnableDirectedBroadcast: false,
};

const EMPTY_FORM: VirtualEthernetFormState = {
  name: "",
  description: "",
  peerName: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  disable: false,
  vifs: [],
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

function toVifFormState(value: VirtualEthernetVifConfig): VirtualEthernetVifFormState {
  return {
    id: value.id,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    mac: value.mac,
    disable: value.disable,
    disableLinkDetect: value.disableLinkDetect,
    ipAdjustMssClamp: value.ipAdjustMssClamp,
    ipAdjustMssValue: value.ipAdjustMssValue,
    ipArpCacheTimeout: value.ipArpCacheTimeout,
    ipDisableArpFilter: value.ipDisableArpFilter,
    ipDisableForwarding: value.ipDisableForwarding,
    ipEnableArpAccept: value.ipEnableArpAccept,
    ipEnableArpAnnounce: value.ipEnableArpAnnounce,
    ipEnableDirectedBroadcast: value.ipEnableDirectedBroadcast,
  };
}

function toFormState(value: VirtualEthernetInterfaceConfig): VirtualEthernetFormState {
  return {
    name: value.name,
    description: value.description,
    peerName: value.peerName,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
    vifs: value.vifs.map(toVifFormState),
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
  desiredClamp: boolean,
  desiredValue: string,
  currentClamp: boolean,
  currentValue: string,
): void {
  const token = "ip adjust-mss";
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

function buildVirtualEthernetOperations(
  candidate: VirtualEthernetFormState,
  current: VirtualEthernetInterfaceConfig | null,
): string[] {
  const operations: string[] = [];
  const base = `interfaces virtual-ethernet ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      peerName: "",
      addresses: [],
      mtu: "",
      vrf: "",
      disable: false,
      vifs: [],
    } satisfies VirtualEthernetInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "peer-name", candidate.peerName.trim(), currentSafe.peerName);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);

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

  if (candidate.disable !== currentSafe.disable) {
    operations.push(candidate.disable ? `set ${base} disable` : `delete ${base} disable`);
  }

  const currentVifMap = new Map(currentSafe.vifs.map((vif) => [vif.id, vif]));
  const desiredVifs = candidate.vifs
    .map((vif) => ({
      ...vif,
      id: vif.id.trim(),
      description: vif.description.trim(),
      mtu: vif.mtu.trim(),
      mac: vif.mac.trim(),
      ipAdjustMssValue: vif.ipAdjustMssValue.trim(),
      ipArpCacheTimeout: vif.ipArpCacheTimeout.trim(),
      addresses: parseAddressLines(vif.addressesText),
    }))
    .filter((vif) => vif.id.length > 0);
  const desiredVifMap = new Map(desiredVifs.map((vif) => [vif.id, vif]));

  for (const currentVifId of currentVifMap.keys()) {
    if (!desiredVifMap.has(currentVifId)) {
      operations.push(`delete ${base} vif ${quoteCliValue(currentVifId)}`);
    }
  }

  for (const vif of desiredVifs) {
    const existing = currentVifMap.get(vif.id);
    const vifBase = `${base} vif ${quoteCliValue(vif.id)}`;
    syncScalar(operations, vifBase, "description", vif.description, existing?.description || "");
    syncScalar(operations, vifBase, "mtu", vif.mtu, existing?.mtu || "");
    syncScalar(operations, vifBase, "mac", vif.mac, existing?.mac || "");
    syncScalar(
      operations,
      vifBase,
      "ip arp-cache-timeout",
      vif.ipArpCacheTimeout,
      existing?.ipArpCacheTimeout || "",
    );
    syncFlag(operations, vifBase, "disable", vif.disable, Boolean(existing?.disable));
    syncFlag(
      operations,
      vifBase,
      "disable-link-detect",
      vif.disableLinkDetect,
      Boolean(existing?.disableLinkDetect),
    );
    syncFlag(
      operations,
      vifBase,
      "ip disable-arp-filter",
      vif.ipDisableArpFilter,
      Boolean(existing?.ipDisableArpFilter),
    );
    syncFlag(
      operations,
      vifBase,
      "ip disable-forwarding",
      vif.ipDisableForwarding,
      Boolean(existing?.ipDisableForwarding),
    );
    syncFlag(
      operations,
      vifBase,
      "ip enable-arp-accept",
      vif.ipEnableArpAccept,
      Boolean(existing?.ipEnableArpAccept),
    );
    syncFlag(
      operations,
      vifBase,
      "ip enable-arp-announce",
      vif.ipEnableArpAnnounce,
      Boolean(existing?.ipEnableArpAnnounce),
    );
    syncFlag(
      operations,
      vifBase,
      "ip enable-directed-broadcast",
      vif.ipEnableDirectedBroadcast,
      Boolean(existing?.ipEnableDirectedBroadcast),
    );
    syncAdjustMss(
      operations,
      vifBase,
      vif.ipAdjustMssClamp,
      vif.ipAdjustMssValue,
      Boolean(existing?.ipAdjustMssClamp),
      existing?.ipAdjustMssValue || "",
    );

    const currentVifAddresses = existing?.addresses || [];
    const currentVifAddressSet = new Set(currentVifAddresses);
    const desiredVifAddressSet = new Set(vif.addresses);
    for (const address of currentVifAddresses) {
      if (!desiredVifAddressSet.has(address)) {
        operations.push(`delete ${vifBase} address ${quoteCliValue(address)}`);
      }
    }
    for (const address of vif.addresses) {
      if (!currentVifAddressSet.has(address)) {
        operations.push(`set ${vifBase} address ${quoteCliValue(address)}`);
      }
    }
  }

  return operations;
}

export default function VirtualEthernetInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<VirtualEthernetInterfaceConfig[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<VirtualEthernetFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const config = await virtualEthernetService.getConfig(refresh);
      setInterfaces(config.interfaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load virtual-ethernet interfaces.");
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

  const editInterface = (value: VirtualEthernetInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const addVifRow = () => {
    setForm((prev) => ({ ...prev, vifs: [...prev.vifs, { ...EMPTY_VIF }] }));
  };

  const removeVifRow = (index: number) => {
    setForm((prev) => ({ ...prev, vifs: prev.vifs.filter((_, rowIndex) => rowIndex !== index) }));
  };

  const updateVifRow = (
    index: number,
    updater: (previous: VirtualEthernetVifFormState) => VirtualEthernetVifFormState,
  ) => {
    setForm((prev) => ({
      ...prev,
      vifs: prev.vifs.map((row, rowIndex) => (rowIndex === index ? updater(row) : row)),
    }));
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete virtual-ethernet interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await virtualEthernetService.batchConfigure([
        `delete interfaces virtual-ethernet ${quoteCliValue(name)}`,
      ]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected virtual-ethernet deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`Virtual-ethernet interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete virtual-ethernet interface.");
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
      setError("Renaming virtual-ethernet interfaces is not supported. Create a new one and delete the old one.");
      return;
    }
    if (!form.peerName.trim()) {
      setError("Peer name is required.");
      return;
    }
    if (form.peerName.trim() === name) {
      setError("Peer name must be different from interface name.");
      return;
    }
    if (form.mtu.trim() && !/^\d+$/.test(form.mtu.trim())) {
      setError("MTU must be a whole number.");
      return;
    }

    const vifIds = new Set<string>();
    for (const [index, vif] of form.vifs.entries()) {
      const vifId = vif.id.trim();
      if (!vifId) continue;
      if (!/^\d+$/.test(vifId)) {
        setError(`VIF row ${index + 1}: VLAN ID must be numeric.`);
        return;
      }
      const vifIdNumber = Number(vifId);
      if (!Number.isInteger(vifIdNumber) || vifIdNumber < 1 || vifIdNumber > 4094) {
        setError(`VIF row ${index + 1}: VLAN ID must be between 1 and 4094.`);
        return;
      }
      if (vifIds.has(vifId)) {
        setError(`Duplicate VIF VLAN ID '${vifId}'.`);
        return;
      }
      vifIds.add(vifId);

      if (vif.mtu.trim() && !/^\d+$/.test(vif.mtu.trim())) {
        setError(`VIF ${vifId}: MTU must be a whole number.`);
        return;
      }
      if (vif.ipArpCacheTimeout.trim() && !/^\d+$/.test(vif.ipArpCacheTimeout.trim())) {
        setError(`VIF ${vifId}: ARP cache timeout must be a whole number.`);
        return;
      }
      if (
        !vif.ipAdjustMssClamp &&
        vif.ipAdjustMssValue.trim() &&
        !/^\d+$/.test(vif.ipAdjustMssValue.trim())
      ) {
        setError(`VIF ${vifId}: IPv4 MSS must be a whole number.`);
        return;
      }
      if (vif.mac.trim() && !/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(vif.mac.trim())) {
        setError(`VIF ${vifId}: MAC must be in format aa:bb:cc:dd:ee:ff.`);
        return;
      }
    }

    const current = interfaces.find((entry) => entry.name === name) || null;
    const operations = buildVirtualEthernetOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await virtualEthernetService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected virtual-ethernet update.");
      }
      await loadData(true);
      setSuccess(current ? `Virtual-ethernet '${name}' updated.` : `Virtual-ethernet '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save virtual-ethernet interface.");
    } finally {
      setSaving(false);
    }
  };

  const disabledCount = useMemo(() => interfaces.filter((entry) => entry.disable).length, [interfaces]);

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
            <h1 className="text-3xl font-bold">Virtual Ethernet Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces virtual-ethernet` pairs with peer mapping and addressing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New Veth
            </Button>
            <PageGuideDialog guide={pageGuides.virtualEthernetInterfaces} />
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
              <p className="text-xs text-muted-foreground">Paired</p>
              <p className="mt-1 text-2xl font-bold">
                {interfaces.filter((entry) => Boolean(entry.peerName)).length}
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
              <CardTitle>Configured Virtual-Ethernet Interfaces</CardTitle>
              <CardDescription>Select an interface to edit or delete.</CardDescription>
            </CardHeader>
            <CardContent>
              {interfaces.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No virtual-ethernet interfaces configured.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Peer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.map((entry) => (
                      <TableRow key={entry.name}>
                        <TableCell className="font-medium">{entry.name}</TableCell>
                        <TableCell>{entry.peerName || "-"}</TableCell>
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create Virtual-Ethernet Interface"}</CardTitle>
              <CardDescription>Pair each veth with a peer and apply addressing/VRF controls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="veth-name">Interface Name</Label>
                  <Input
                    id="veth-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="veth10"
                    disabled={Boolean(editingName)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="veth-peer-name">Peer Name</Label>
                  <Input
                    id="veth-peer-name"
                    value={form.peerName}
                    onChange={(event) => setForm((prev) => ({ ...prev, peerName: event.target.value }))}
                    placeholder="veth11"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="veth-description">Description</Label>
                  <Input
                    id="veth-description"
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="VRF interconnect"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="veth-vrf">VRF</Label>
                  <Input
                    id="veth-vrf"
                    value={form.vrf}
                    onChange={(event) => setForm((prev) => ({ ...prev, vrf: event.target.value }))}
                    placeholder="RED"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="veth-mtu">MTU</Label>
                  <Input
                    id="veth-mtu"
                    value={form.mtu}
                    onChange={(event) => setForm((prev) => ({ ...prev, mtu: event.target.value }))}
                    placeholder="1500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="veth-addresses">IPv4/IPv6 Addresses</Label>
                  <Textarea
                    id="veth-addresses"
                    value={form.addressesText}
                    onChange={(event) => setForm((prev) => ({ ...prev, addressesText: event.target.value }))}
                    placeholder={"100.64.0.0/31\n2001:db8:100::1/64"}
                    rows={3}
                  />
                </div>
              </div>

              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">VLAN Subinterfaces (VIF)</CardTitle>
                      <CardDescription>
                        Configure `vif` VLAN subinterfaces and per-VIF IP/ARP behavior.
                      </CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addVifRow}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add VIF
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {form.vifs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No VIF entries configured. Add a row to define VLAN subinterfaces.
                    </p>
                  ) : (
                    form.vifs.map((vif, index) => (
                      <Card key={`vif-${index}`} className="border-muted/60">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm">VIF Row {index + 1}</CardTitle>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeVifRow(index)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label>VLAN ID</Label>
                              <Input
                                value={vif.id}
                                onChange={(event) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    id: event.target.value,
                                  }))
                                }
                                placeholder="10"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>MTU</Label>
                              <Input
                                value={vif.mtu}
                                onChange={(event) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    mtu: event.target.value,
                                  }))
                                }
                                placeholder="1500"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>MAC</Label>
                              <Input
                                value={vif.mac}
                                onChange={(event) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    mac: event.target.value,
                                  }))
                                }
                                placeholder="00:53:01:02:03:04"
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Description</Label>
                              <Input
                                value={vif.description}
                                onChange={(event) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    description: event.target.value,
                                  }))
                                }
                                placeholder="Users VLAN"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>ARP Cache Timeout (seconds)</Label>
                              <Input
                                value={vif.ipArpCacheTimeout}
                                onChange={(event) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    ipArpCacheTimeout: event.target.value,
                                  }))
                                }
                                placeholder="180"
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>IPv4 Adjust MSS</Label>
                              <Input
                                value={vif.ipAdjustMssValue}
                                onChange={(event) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    ipAdjustMssValue: event.target.value,
                                  }))
                                }
                                placeholder="1452"
                                disabled={vif.ipAdjustMssClamp}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Addresses (one per line)</Label>
                              <Textarea
                                value={vif.addressesText}
                                onChange={(event) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    addressesText: event.target.value,
                                  }))
                                }
                                rows={3}
                                placeholder={"192.0.2.1/24\ndhcp"}
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={vif.disable}
                                onCheckedChange={(checked) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    disable: checked === true,
                                  }))
                                }
                              />
                              Disable
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={vif.disableLinkDetect}
                                onCheckedChange={(checked) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    disableLinkDetect: checked === true,
                                  }))
                                }
                              />
                              Disable Link Detect
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={vif.ipAdjustMssClamp}
                                onCheckedChange={(checked) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    ipAdjustMssClamp: checked === true,
                                  }))
                                }
                              />
                              Clamp MSS to PMTU
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={vif.ipDisableArpFilter}
                                onCheckedChange={(checked) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    ipDisableArpFilter: checked === true,
                                  }))
                                }
                              />
                              Disable ARP Filter
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={vif.ipDisableForwarding}
                                onCheckedChange={(checked) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    ipDisableForwarding: checked === true,
                                  }))
                                }
                              />
                              Disable IP Forwarding
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={vif.ipEnableArpAccept}
                                onCheckedChange={(checked) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    ipEnableArpAccept: checked === true,
                                  }))
                                }
                              />
                              Enable ARP Accept
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={vif.ipEnableArpAnnounce}
                                onCheckedChange={(checked) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    ipEnableArpAnnounce: checked === true,
                                  }))
                                }
                              />
                              Enable ARP Announce
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={vif.ipEnableDirectedBroadcast}
                                onCheckedChange={(checked) =>
                                  updateVifRow(index, (previous) => ({
                                    ...previous,
                                    ipEnableDirectedBroadcast: checked === true,
                                  }))
                                }
                              />
                              Enable Directed Broadcast
                            </label>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </CardContent>
              </Card>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.disable}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, disable: checked === true }))}
                />
                Disable interface
              </label>

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
