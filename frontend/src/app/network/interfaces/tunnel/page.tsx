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
import {
  tunnelInterfaceService,
  type TunnelInterfaceConfig,
} from "@/lib/api/tunnel-interface";

const ENCAPSULATION_OPTIONS = [
  "gre",
  "gretap",
  "ip6gre",
  "ipip",
  "ipip6",
  "ip6ip6",
  "sit",
] as const;

interface TunnelFormState {
  name: string;
  description: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  encapsulation: string;
  sourceAddress: string;
  remote: string;
  ipKey: string;
  disableFlowControl: boolean;
  disableLinkDetect: boolean;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipArpCacheTimeout: string;
  ipDisableArpFilter: boolean;
  ipEnableArpAccept: boolean;
  ipEnableArpAnnounce: boolean;
  ipEnableArpIgnore: boolean;
  ipEnableDirectedBroadcast: boolean;
  ipEnableProxyArp: boolean;
  ipProxyArpPvlan: boolean;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
  ipSourceValidation: string;
  ipDisableForwarding: boolean;
  ipv6DisableForwarding: boolean;
}

const EMPTY_FORM: TunnelFormState = {
  name: "",
  description: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  disable: false,
  encapsulation: "gre",
  sourceAddress: "",
  remote: "",
  ipKey: "",
  disableFlowControl: false,
  disableLinkDetect: false,
  ipAdjustMssClamp: false,
  ipAdjustMssValue: "",
  ipArpCacheTimeout: "",
  ipDisableArpFilter: false,
  ipEnableArpAccept: false,
  ipEnableArpAnnounce: false,
  ipEnableArpIgnore: false,
  ipEnableDirectedBroadcast: false,
  ipEnableProxyArp: false,
  ipProxyArpPvlan: false,
  ipv6AdjustMssClamp: false,
  ipv6AdjustMssValue: "",
  ipSourceValidation: "",
  ipDisableForwarding: false,
  ipv6DisableForwarding: false,
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

function toFormState(value: TunnelInterfaceConfig): TunnelFormState {
  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
    encapsulation: value.encapsulation || "gre",
    sourceAddress: value.sourceAddress,
    remote: value.remote,
    ipKey: value.ipKey,
    disableFlowControl: value.disableFlowControl,
    disableLinkDetect: value.disableLinkDetect,
    ipAdjustMssClamp: value.ipAdjustMssClamp,
    ipAdjustMssValue: value.ipAdjustMssValue,
    ipArpCacheTimeout: value.ipArpCacheTimeout,
    ipDisableArpFilter: value.ipDisableArpFilter,
    ipEnableArpAccept: value.ipEnableArpAccept,
    ipEnableArpAnnounce: value.ipEnableArpAnnounce,
    ipEnableArpIgnore: value.ipEnableArpIgnore,
    ipEnableDirectedBroadcast: value.ipEnableDirectedBroadcast,
    ipEnableProxyArp: value.ipEnableProxyArp,
    ipProxyArpPvlan: value.ipProxyArpPvlan,
    ipv6AdjustMssClamp: value.ipv6AdjustMssClamp,
    ipv6AdjustMssValue: value.ipv6AdjustMssValue,
    ipSourceValidation: value.ipSourceValidation,
    ipDisableForwarding: value.ipDisableForwarding,
    ipv6DisableForwarding: value.ipv6DisableForwarding,
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

function buildTunnelOperations(candidate: TunnelFormState, current: TunnelInterfaceConfig | null): string[] {
  const operations: string[] = [];
  const base = `interfaces tunnel ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      addresses: [],
      mtu: "",
      vrf: "",
      disable: false,
      encapsulation: "",
      sourceAddress: "",
      remote: "",
      ipKey: "",
      disableFlowControl: false,
      disableLinkDetect: false,
      ipAdjustMssClamp: false,
      ipAdjustMssValue: "",
      ipArpCacheTimeout: "",
      ipDisableArpFilter: false,
      ipEnableArpAccept: false,
      ipEnableArpAnnounce: false,
      ipEnableArpIgnore: false,
      ipEnableDirectedBroadcast: false,
      ipEnableProxyArp: false,
      ipProxyArpPvlan: false,
      ipv6AdjustMssClamp: false,
      ipv6AdjustMssValue: "",
      ipSourceValidation: "",
      ipDisableForwarding: false,
      ipv6DisableForwarding: false,
    } satisfies TunnelInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);
  syncScalar(operations, base, "encapsulation", candidate.encapsulation.trim(), currentSafe.encapsulation);
  syncScalar(
    operations,
    base,
    "source-address",
    candidate.sourceAddress.trim(),
    currentSafe.sourceAddress,
  );
  syncScalar(operations, base, "remote", candidate.remote.trim(), currentSafe.remote);
  syncScalar(operations, base, "parameters ip key", candidate.ipKey.trim(), currentSafe.ipKey);
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
    "ip arp-cache-timeout",
    candidate.ipArpCacheTimeout.trim(),
    currentSafe.ipArpCacheTimeout,
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
    "ip disable-forwarding",
    candidate.ipDisableForwarding,
    currentSafe.ipDisableForwarding,
  );
  syncFlag(
    operations,
    base,
    "ipv6 disable-forwarding",
    candidate.ipv6DisableForwarding,
    currentSafe.ipv6DisableForwarding,
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

  return operations;
}

export default function TunnelInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<TunnelInterfaceConfig[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<TunnelFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const config = await tunnelInterfaceService.getConfig(refresh);
      setInterfaces(config.interfaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tunnel interfaces.");
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

  const editInterface = (value: TunnelInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete tunnel interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await tunnelInterfaceService.batchConfigure([
        `delete interfaces tunnel ${quoteCliValue(name)}`,
      ]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected tunnel interface deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`Tunnel interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tunnel interface.");
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
      setError("Renaming tunnel interfaces is not supported. Create a new interface and delete the old one.");
      return;
    }
    if (!form.sourceAddress.trim()) {
      setError("Source address is required.");
      return;
    }
    if (!form.remote.trim()) {
      setError("Remote endpoint is required.");
      return;
    }

    const numericFields = [
      { label: "MTU", value: form.mtu },
      { label: "IP Key", value: form.ipKey },
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

    const current = interfaces.find((entry) => entry.name === name) || null;
    const operations = buildTunnelOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await tunnelInterfaceService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected tunnel interface update.");
      }
      await loadData(true);
      setSuccess(current ? `Tunnel '${name}' updated.` : `Tunnel '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tunnel interface.");
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
            <h1 className="text-3xl font-bold">Tunnel Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces tunnel` for GRE/IPIP/SIT and related classic tunnel protocols.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New Tunnel
            </Button>
            <PageGuideDialog guide={pageGuides.tunnelInterfaces} />
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
              <p className="text-xs text-muted-foreground">Encapsulation Types</p>
              <p className="mt-1 text-2xl font-bold">{new Set(interfaces.map((entry) => entry.encapsulation)).size}</p>
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
              <CardTitle>Configured Tunnel Interfaces</CardTitle>
              <CardDescription>Select an interface to edit or delete.</CardDescription>
            </CardHeader>
            <CardContent>
              {interfaces.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No tunnel interfaces configured.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Encapsulation</TableHead>
                      <TableHead>Remote</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.map((entry) => (
                      <TableRow key={entry.name}>
                        <TableCell className="font-medium">{entry.name}</TableCell>
                        <TableCell>{entry.encapsulation || "-"}</TableCell>
                        <TableCell>{entry.remote || "-"}</TableCell>
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create Tunnel Interface"}</CardTitle>
              <CardDescription>Core tunnel controls for encapsulation, endpoint, and interface behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tunnel-name">Interface Name</Label>
                  <Input
                    id="tunnel-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="tun100"
                    disabled={Boolean(editingName)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Encapsulation</Label>
                  <Select
                    value={form.encapsulation}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, encapsulation: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENCAPSULATION_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tunnel-source">Source Address</Label>
                  <Input
                    id="tunnel-source"
                    value={form.sourceAddress}
                    onChange={(event) => setForm((prev) => ({ ...prev, sourceAddress: event.target.value }))}
                    placeholder="198.51.100.2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tunnel-remote">Remote Endpoint</Label>
                  <Input
                    id="tunnel-remote"
                    value={form.remote}
                    onChange={(event) => setForm((prev) => ({ ...prev, remote: event.target.value }))}
                    placeholder="203.0.113.10"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="tunnel-ip-key">GRE IP Key</Label>
                  <Input
                    id="tunnel-ip-key"
                    value={form.ipKey}
                    onChange={(event) => setForm((prev) => ({ ...prev, ipKey: event.target.value }))}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tunnel-mtu">MTU</Label>
                  <Input
                    id="tunnel-mtu"
                    value={form.mtu}
                    onChange={(event) => setForm((prev) => ({ ...prev, mtu: event.target.value }))}
                    placeholder="1476"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tunnel-vrf">VRF</Label>
                  <Input
                    id="tunnel-vrf"
                    value={form.vrf}
                    onChange={(event) => setForm((prev) => ({ ...prev, vrf: event.target.value }))}
                    placeholder="BLUE"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tunnel-addresses">Interface Addresses</Label>
                <Textarea
                  id="tunnel-addresses"
                  value={form.addressesText}
                  onChange={(event) => setForm((prev) => ({ ...prev, addressesText: event.target.value }))}
                  placeholder={"10.0.0.1/30\n2001:db8:feed:beef::1/126"}
                  rows={3}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>IP Source Validation</Label>
                  <Select
                    value={form.ipSourceValidation || "__empty__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, ipSourceValidation: value === "__empty__" ? "" : value }))
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
                <div className="space-y-2">
                  <Label htmlFor="tunnel-ip-arp-cache-timeout">ARP Cache Timeout (seconds)</Label>
                  <Input
                    id="tunnel-ip-arp-cache-timeout"
                    value={form.ipArpCacheTimeout}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, ipArpCacheTimeout: event.target.value }))
                    }
                    placeholder="180"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tunnel-ip-mss">IPv4 Adjust MSS</Label>
                  <Input
                    id="tunnel-ip-mss"
                    value={form.ipAdjustMssValue}
                    onChange={(event) => setForm((prev) => ({ ...prev, ipAdjustMssValue: event.target.value }))}
                    placeholder="1452"
                    disabled={form.ipAdjustMssClamp}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tunnel-ipv6-mss">IPv6 Adjust MSS</Label>
                  <Input
                    id="tunnel-ipv6-mss"
                    value={form.ipv6AdjustMssValue}
                    onChange={(event) => setForm((prev) => ({ ...prev, ipv6AdjustMssValue: event.target.value }))}
                    placeholder="1432"
                    disabled={form.ipv6AdjustMssClamp}
                  />
                </div>
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
                    checked={form.ipDisableForwarding}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipDisableForwarding: checked === true }))
                    }
                  />
                  IP Disable Forwarding
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipDisableArpFilter}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipDisableArpFilter: checked === true }))
                    }
                  />
                  IP Disable ARP Filter
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipEnableArpAccept}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipEnableArpAccept: checked === true }))
                    }
                  />
                  IP Enable ARP Accept
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipEnableArpAnnounce}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipEnableArpAnnounce: checked === true }))
                    }
                  />
                  IP Enable ARP Announce
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipEnableArpIgnore}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipEnableArpIgnore: checked === true }))
                    }
                  />
                  IP Enable ARP Ignore
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipEnableDirectedBroadcast}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipEnableDirectedBroadcast: checked === true }))
                    }
                  />
                  IP Enable Directed Broadcast
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipEnableProxyArp}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipEnableProxyArp: checked === true }))
                    }
                  />
                  IP Enable Proxy ARP
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipProxyArpPvlan}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipProxyArpPvlan: checked === true }))
                    }
                  />
                  IP Proxy ARP PVLAN
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipv6DisableForwarding}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipv6DisableForwarding: checked === true }))
                    }
                  />
                  IPv6 Disable Forwarding
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
