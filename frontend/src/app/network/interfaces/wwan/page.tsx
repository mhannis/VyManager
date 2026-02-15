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
import { type WwanInterfaceConfig, wwanService } from "@/lib/api/wwan";
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
  ipSourceValidation: string;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipv6AddressesText: string;
  ipv6DisableForwarding: boolean;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
  dhcpClientId: string;
  dhcpHostName: string;
  dhcpVendorClassId: string;
  dhcpNoDefaultRoute: boolean;
  dhcpDefaultRouteDistance: string;
}

const SOURCE_VALIDATION_OPTIONS = ["disable", "strict", "loose"] as const;

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
  ipSourceValidation: "",
  ipAdjustMssClamp: false,
  ipAdjustMssValue: "",
  ipv6AddressesText: "",
  ipv6DisableForwarding: false,
  ipv6AdjustMssClamp: false,
  ipv6AdjustMssValue: "",
  dhcpClientId: "",
  dhcpHostName: "",
  dhcpVendorClassId: "",
  dhcpNoDefaultRoute: false,
  dhcpDefaultRouteDistance: "",
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
    ipSourceValidation: value.ipSourceValidation,
    ipAdjustMssClamp: value.ipAdjustMssClamp,
    ipAdjustMssValue: value.ipAdjustMssValue,
    ipv6AddressesText: value.ipv6Addresses.join("\n"),
    ipv6DisableForwarding: value.ipv6DisableForwarding,
    ipv6AdjustMssClamp: value.ipv6AdjustMssClamp,
    ipv6AdjustMssValue: value.ipv6AdjustMssValue,
    dhcpClientId: value.dhcpClientId,
    dhcpHostName: value.dhcpHostName,
    dhcpVendorClassId: value.dhcpVendorClassId,
    dhcpNoDefaultRoute: value.dhcpNoDefaultRoute,
    dhcpDefaultRouteDistance: value.dhcpDefaultRouteDistance,
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
      ipSourceValidation: "",
      ipAdjustMssClamp: false,
      ipAdjustMssValue: "",
      ipv6Addresses: [],
      ipv6DisableForwarding: false,
      ipv6AdjustMssClamp: false,
      ipv6AdjustMssValue: "",
      dhcpClientId: "",
      dhcpHostName: "",
      dhcpVendorClassId: "",
      dhcpNoDefaultRoute: false,
      dhcpDefaultRouteDistance: "",
    } satisfies WwanInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);
  syncScalar(operations, base, "apn", candidate.apn.trim(), currentSafe.apn);
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
    "dhcp-options no-default-route",
    candidate.dhcpNoDefaultRoute,
    currentSafe.dhcpNoDefaultRoute,
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

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const [config, allInterfaces] = await Promise.all([
        wwanService.getConfig(refresh),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);
      setInterfaces(config.interfaces);
      const names = allInterfaces.interfaces
        .filter((entry) => entry.type === "wwan" || entry.name.toLowerCase().startsWith("wwan"))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
      setDetectedInterfaceNames(names);
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

    const numericFields = [
      { label: "MTU", value: form.mtu },
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

    const current = interfaces.find((entry) => entry.name === name) || null;
    const operations = buildWwanOperations({ ...form, name }, current);
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
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          No WWAN interfaces configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      interfaces.map((entry) => (
                        <TableRow key={entry.name}>
                          <TableCell className="font-medium">{entry.name}</TableCell>
                          <TableCell>{entry.apn || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {entry.addresses.length > 0 ? entry.addresses.join(", ") : "No IPv4 address"}
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
                  <Label htmlFor="wwan-dhcp-distance">DHCP Default Route Distance</Label>
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

              <div className="grid gap-4 sm:grid-cols-2">
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wwan-dhcp-client-id">DHCP Client ID</Label>
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
                  <Label htmlFor="wwan-dhcp-host-name">DHCP Host Name</Label>
                  <Input
                    id="wwan-dhcp-host-name"
                    value={form.dhcpHostName}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, dhcpHostName: event.target.value }))
                    }
                    placeholder="vyos-wwan"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wwan-dhcp-vendor-class">DHCP Vendor Class ID</Label>
                <Input
                  id="wwan-dhcp-vendor-class"
                  value={form.dhcpVendorClassId}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, dhcpVendorClassId: event.target.value }))
                  }
                  placeholder="vyos-wwan-modem"
                />
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
                    checked={form.ipv6DisableForwarding}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, ipv6DisableForwarding: Boolean(checked) }))
                    }
                  />
                  Disable IPv6 forwarding
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipAdjustMssClamp}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, ipAdjustMssClamp: Boolean(checked) }))
                    }
                  />
                  IPv4 Clamp MSS to PMTU
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipv6AdjustMssClamp}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, ipv6AdjustMssClamp: Boolean(checked) }))
                    }
                  />
                  IPv6 Clamp MSS to PMTU
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.dhcpNoDefaultRoute}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, dhcpNoDefaultRoute: Boolean(checked) }))
                    }
                  />
                  DHCP No Default Route
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
