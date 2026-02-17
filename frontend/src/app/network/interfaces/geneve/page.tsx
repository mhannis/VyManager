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
import { ethernetService } from "@/lib/api/ethernet";
import { geneveService, type GeneveInterfaceConfig } from "@/lib/api/geneve";
import type { EthernetInterface } from "@/lib/api/types/ethernet";
import { pageGuides } from "@/lib/help/pageGuides";
import { formatInterfaceDisplayName } from "@/lib/utils";

interface InterfaceChoice {
  name: string;
  label: string;
}

interface GeneveFormState {
  name: string;
  description: string;
  addressesText: string;
  mac: string;
  mtu: string;
  remote: string;
  sourceAddress: string;
  sourceInterface: string;
  vni: string;
  port: string;
  disable: boolean;
  disableFlowControl: boolean;
  disableLinkDetect: boolean;
  ipSourceValidation: string;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
}

const EMPTY_FORM: GeneveFormState = {
  name: "",
  description: "",
  addressesText: "",
  mac: "",
  mtu: "",
  remote: "",
  sourceAddress: "",
  sourceInterface: "",
  vni: "",
  port: "",
  disable: false,
  disableFlowControl: false,
  disableLinkDetect: false,
  ipSourceValidation: "",
  ipAdjustMssClamp: false,
  ipAdjustMssValue: "",
  ipv6AdjustMssClamp: false,
  ipv6AdjustMssValue: "",
};

const SOURCE_VALIDATION_OPTIONS = ["strict", "loose", "disable"] as const;

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@+-]+$/.test(trimmed)) return trimmed;
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

function isValidMacAddress(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return true;
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(candidate);
}

function getInterfaceChoices(interfaces: EthernetInterface[]): InterfaceChoice[] {
  return interfaces
    .map((iface) => ({
      name: iface.name,
      label: formatInterfaceDisplayName(iface.name, iface.description ?? null),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function toFormState(value: GeneveInterfaceConfig): GeneveFormState {
  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mac: value.mac,
    mtu: value.mtu,
    remote: value.remote,
    sourceAddress: value.sourceAddress,
    sourceInterface: value.sourceInterface,
    vni: value.vni,
    port: value.port,
    disable: value.disable,
    disableFlowControl: value.disableFlowControl,
    disableLinkDetect: value.disableLinkDetect,
    ipSourceValidation: value.ipSourceValidation,
    ipAdjustMssClamp: value.ipAdjustMssClamp,
    ipAdjustMssValue: value.ipAdjustMssValue,
    ipv6AdjustMssClamp: value.ipv6AdjustMssClamp,
    ipv6AdjustMssValue: value.ipv6AdjustMssValue,
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

function syncAdjustMss(
  operations: string[],
  base: string,
  family: "ip" | "ipv6",
  desiredClamp: boolean,
  desiredValue: string,
  currentClamp: boolean,
  currentValue: string,
) {
  const token = `${family} adjust-mss`;
  const trimmedDesiredValue = desiredValue.trim();
  const trimmedCurrentValue = currentValue.trim();

  if (desiredClamp) {
    if (currentClamp && !trimmedCurrentValue) return;
    if (currentClamp || trimmedCurrentValue) {
      operations.push(`delete ${base} ${token}`);
    }
    operations.push(`set ${base} ${token} clamp-mss-to-pmtu`);
    return;
  }

  if (trimmedDesiredValue) {
    if (currentClamp) {
      operations.push(`delete ${base} ${token}`);
    }
    if (trimmedDesiredValue !== trimmedCurrentValue || currentClamp) {
      operations.push(`set ${base} ${token} ${quoteCliValue(trimmedDesiredValue)}`);
    }
    return;
  }

  if (currentClamp || trimmedCurrentValue) {
    operations.push(`delete ${base} ${token}`);
  }
}

function buildGeneveOperations(candidate: GeneveFormState, current: GeneveInterfaceConfig | null): string[] {
  const operations: string[] = [];
  const base = `interfaces geneve ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      addresses: [],
      mac: "",
      mtu: "",
      remote: "",
      sourceAddress: "",
      sourceInterface: "",
      vni: "",
      port: "",
      disable: false,
      disableFlowControl: false,
      disableLinkDetect: false,
      ipSourceValidation: "",
      ipAdjustMssClamp: false,
      ipAdjustMssValue: "",
      ipv6AdjustMssClamp: false,
      ipv6AdjustMssValue: "",
    } satisfies GeneveInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mac", candidate.mac.trim(), currentSafe.mac);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "remote", candidate.remote.trim(), currentSafe.remote);
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
  syncScalar(operations, base, "vni", candidate.vni.trim(), currentSafe.vni);
  syncScalar(operations, base, "port", candidate.port.trim(), currentSafe.port);
  syncScalar(
    operations,
    base,
    "ip source-validation",
    candidate.ipSourceValidation.trim(),
    currentSafe.ipSourceValidation,
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

  if (candidate.disable !== currentSafe.disable) {
    operations.push(candidate.disable ? `set ${base} disable` : `delete ${base} disable`);
  }
  if (candidate.disableFlowControl !== currentSafe.disableFlowControl) {
    operations.push(
      candidate.disableFlowControl
        ? `set ${base} disable-flow-control`
        : `delete ${base} disable-flow-control`,
    );
  }
  if (candidate.disableLinkDetect !== currentSafe.disableLinkDetect) {
    operations.push(
      candidate.disableLinkDetect
        ? `set ${base} disable-link-detect`
        : `delete ${base} disable-link-detect`,
    );
  }

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

export default function GeneveInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<GeneveInterfaceConfig[]>([]);
  const [sourceChoices, setSourceChoices] = useState<InterfaceChoice[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<GeneveFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const [geneveConfig, ethernetConfig] = await Promise.all([
        geneveService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] as EthernetInterface[] })),
      ]);
      setInterfaces(geneveConfig.interfaces);
      setSourceChoices(getInterfaceChoices(ethernetConfig.interfaces || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Geneve interfaces.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const resetForm = () => {
    setEditingName(null);
    setForm(EMPTY_FORM);
    setError(null);
    setSuccess(null);
  };

  const editInterface = (value: GeneveInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete Geneve interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await geneveService.batchConfigure([`delete interfaces geneve ${quoteCliValue(name)}`]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected Geneve interface deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`Geneve interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete Geneve interface.");
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
      setError("Renaming Geneve interfaces is not supported. Create a new interface and delete the old one.");
      return;
    }
    if (!isValidMacAddress(form.mac)) {
      setError("MAC must use canonical format (aa:bb:cc:dd:ee:ff).");
      return;
    }
    if (!form.remote.trim()) {
      setError("Remote endpoint is required.");
      return;
    }
    if (!form.vni.trim()) {
      setError("VNI is required.");
      return;
    }
    if (!form.sourceAddress.trim() && !form.sourceInterface.trim()) {
      setError("Set either source address or source interface.");
      return;
    }
    if (
      form.ipSourceValidation.trim() &&
      !SOURCE_VALIDATION_OPTIONS.includes(form.ipSourceValidation.trim() as (typeof SOURCE_VALIDATION_OPTIONS)[number])
    ) {
      setError("IP source validation must be one of strict, loose, or disable.");
      return;
    }

    const numericFields = [
      { label: "MTU", value: form.mtu },
      { label: "VNI", value: form.vni },
      { label: "Port", value: form.port },
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

    const current = interfaces.find((value) => value.name === name) || null;
    const operations = buildGeneveOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await geneveService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected Geneve interface update.");
      }
      await loadData(true);
      setSuccess(current ? `Geneve '${name}' updated.` : `Geneve '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Geneve interface.");
    } finally {
      setSaving(false);
    }
  };

  const disabledCount = useMemo(() => interfaces.filter((item) => item.disable).length, [interfaces]);

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Geneve Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces geneve` tunnels with source selection, VNI, and MSS controls.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New Geneve
            </Button>
            <PageGuideDialog guide={pageGuides.geneveInterfaces} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Interfaces</p>
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
              <p className="text-xs text-muted-foreground">With Addresses</p>
              <p className="mt-1 text-2xl font-bold">
                {interfaces.filter((item) => item.addresses.length > 0).length}
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
              <CardTitle>Configured Geneve Interfaces</CardTitle>
              <CardDescription>Choose an interface to edit tunnel endpoint settings.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading Geneve interfaces...</div>
              ) : interfaces.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No Geneve interfaces configured.</div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Remote</TableHead>
                        <TableHead>VNI</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {interfaces.map((item) => (
                        <TableRow key={item.name}>
                          <TableCell>
                            <div className="font-mono text-xs">{item.name}</div>
                            {item.description && (
                              <div className="mt-1 text-xs text-muted-foreground">{item.description}</div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{item.remote || "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{item.vni || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={item.disable ? "secondary" : "default"}>
                              {item.disable ? "Disabled" : "Enabled"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editInterface(item)} disabled={saving}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteInterface(item.name)}
                                disabled={saving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create Geneve Interface"}</CardTitle>
              <CardDescription>
                Define remote/source endpoints, VNI, optional addresses, and MSS behavior.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="gnv0"
                  disabled={saving || Boolean(editingName)}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Overlay tunnel to branch"
                  disabled={saving}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Remote Endpoint</Label>
                  <Input
                    value={form.remote}
                    onChange={(event) => setForm((prev) => ({ ...prev, remote: event.target.value }))}
                    placeholder="203.0.113.50"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>VNI</Label>
                  <Input
                    value={form.vni}
                    onChange={(event) => setForm((prev) => ({ ...prev, vni: event.target.value }))}
                    placeholder="1000"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Source Address</Label>
                  <Input
                    value={form.sourceAddress}
                    onChange={(event) => setForm((prev) => ({ ...prev, sourceAddress: event.target.value }))}
                    placeholder="192.0.2.10"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source Interface</Label>
                  <Select
                    value={form.sourceInterface || "none"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, sourceInterface: value === "none" ? "" : value }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source interface" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {sourceChoices.map((choice) => (
                        <SelectItem key={choice.name} value={choice.name}>
                          {choice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>IP Source Validation</Label>
                <Select
                  value={form.ipSourceValidation || "none"}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, ipSourceValidation: value === "none" ? "" : value }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
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

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>MTU</Label>
                  <Input
                    value={form.mtu}
                    onChange={(event) => setForm((prev) => ({ ...prev, mtu: event.target.value }))}
                    placeholder="1450"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>UDP Port</Label>
                  <Input
                    value={form.port}
                    onChange={(event) => setForm((prev) => ({ ...prev, port: event.target.value }))}
                    placeholder="6081"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>MAC</Label>
                  <Input
                    value={form.mac}
                    onChange={(event) => setForm((prev) => ({ ...prev, mac: event.target.value }))}
                    placeholder="02:00:00:00:10:10"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Addresses (one CIDR per line)</Label>
                <Textarea
                  value={form.addressesText}
                  onChange={(event) => setForm((prev) => ({ ...prev, addressesText: event.target.value }))}
                  placeholder={"10.250.0.1/30\n2001:db8:250::1/64"}
                  className="min-h-[90px] font-mono text-xs"
                  disabled={saving}
                />
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">IPv4 MSS Adjustment</p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipAdjustMssClamp}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipAdjustMssClamp: Boolean(checked), ipAdjustMssValue: "" }))
                    }
                    disabled={saving}
                  />
                  Clamp MSS to PMTU
                </label>
                <Input
                  value={form.ipAdjustMssValue}
                  onChange={(event) => setForm((prev) => ({ ...prev, ipAdjustMssValue: event.target.value }))}
                  placeholder="1360"
                  disabled={saving || form.ipAdjustMssClamp}
                />
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">IPv6 MSS Adjustment</p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipv6AdjustMssClamp}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, ipv6AdjustMssClamp: Boolean(checked), ipv6AdjustMssValue: "" }))
                    }
                    disabled={saving}
                  />
                  Clamp MSS to PMTU
                </label>
                <Input
                  value={form.ipv6AdjustMssValue}
                  onChange={(event) => setForm((prev) => ({ ...prev, ipv6AdjustMssValue: event.target.value }))}
                  placeholder="1360"
                  disabled={saving || form.ipv6AdjustMssClamp}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disable}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, disable: Boolean(checked) }))}
                    disabled={saving}
                  />
                  Disable interface
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disableFlowControl}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, disableFlowControl: Boolean(checked) }))
                    }
                    disabled={saving}
                  />
                  Disable flow control
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disableLinkDetect}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, disableLinkDetect: Boolean(checked) }))
                    }
                    disabled={saving}
                  />
                  Disable link detect
                </label>
              </div>

              <div className="pt-2">
                <Button onClick={saveInterface} disabled={saving}>
                  {saving ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Geneve
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
