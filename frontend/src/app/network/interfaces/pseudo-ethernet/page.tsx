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
import {
  pseudoEthernetService,
  type PseudoEthernetInterfaceConfig,
} from "@/lib/api/pseudo-ethernet";
import type { EthernetInterface } from "@/lib/api/types/ethernet";
import { pageGuides } from "@/lib/help/pageGuides";
import { formatInterfaceDisplayName } from "@/lib/utils";

interface InterfaceChoice {
  name: string;
  label: string;
}

interface PseudoEthernetFormState {
  name: string;
  description: string;
  sourceInterface: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  disable: boolean;
}

const EMPTY_FORM: PseudoEthernetFormState = {
  name: "",
  description: "",
  sourceInterface: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  disable: false,
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

function getInterfaceChoices(interfaces: EthernetInterface[]): InterfaceChoice[] {
  return interfaces
    .map((iface) => ({
      name: iface.name,
      label: formatInterfaceDisplayName(iface.name, iface.description ?? null),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function toFormState(value: PseudoEthernetInterfaceConfig): PseudoEthernetFormState {
  return {
    name: value.name,
    description: value.description,
    sourceInterface: value.sourceInterface,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
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

function buildPseudoEthernetOperations(
  candidate: PseudoEthernetFormState,
  current: PseudoEthernetInterfaceConfig | null,
): string[] {
  const operations: string[] = [];
  const base = `interfaces pseudo-ethernet ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      sourceInterface: "",
      addresses: [],
      mtu: "",
      vrf: "",
      disable: false,
    } satisfies PseudoEthernetInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(
    operations,
    base,
    "source-interface",
    candidate.sourceInterface.trim(),
    currentSafe.sourceInterface,
  );
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

  return operations;
}

export default function PseudoEthernetInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<PseudoEthernetInterfaceConfig[]>([]);
  const [sourceChoices, setSourceChoices] = useState<InterfaceChoice[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<PseudoEthernetFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const [config, ethernetConfig] = await Promise.all([
        pseudoEthernetService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] as EthernetInterface[] })),
      ]);
      setInterfaces(config.interfaces);
      setSourceChoices(getInterfaceChoices(ethernetConfig.interfaces || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pseudo-ethernet interfaces.");
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

  const editInterface = (value: PseudoEthernetInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete pseudo-ethernet interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await pseudoEthernetService.batchConfigure([
        `delete interfaces pseudo-ethernet ${quoteCliValue(name)}`,
      ]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected pseudo-ethernet deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`Pseudo-ethernet interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete pseudo-ethernet interface.");
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
      setError("Renaming pseudo-ethernet interfaces is not supported. Create a new one and delete the old one.");
      return;
    }
    if (!form.sourceInterface.trim()) {
      setError("Source interface is required.");
      return;
    }
    if (form.mtu.trim() && !/^\d+$/.test(form.mtu.trim())) {
      setError("MTU must be a whole number.");
      return;
    }

    const current = interfaces.find((entry) => entry.name === name) || null;
    const operations = buildPseudoEthernetOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await pseudoEthernetService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected pseudo-ethernet update.");
      }
      await loadData(true);
      setSuccess(current ? `Pseudo-ethernet '${name}' updated.` : `Pseudo-ethernet '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pseudo-ethernet interface.");
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
            <h1 className="text-3xl font-bold">Pseudo-Ethernet Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces pseudo-ethernet` (MACVLAN) interfaces with source links and IP settings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New Pseudo-Ethernet
            </Button>
            <PageGuideDialog guide={pageGuides.pseudoEthernetInterfaces} />
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
              <p className="text-xs text-muted-foreground">Source Links</p>
              <p className="mt-1 text-2xl font-bold">{new Set(interfaces.map((entry) => entry.sourceInterface)).size}</p>
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
              <CardTitle>Configured Pseudo-Ethernet Interfaces</CardTitle>
              <CardDescription>Select an interface to edit or delete.</CardDescription>
            </CardHeader>
            <CardContent>
              {interfaces.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No pseudo-ethernet interfaces configured.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Source Interface</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.map((entry) => (
                      <TableRow key={entry.name}>
                        <TableCell className="font-medium">{entry.name}</TableCell>
                        <TableCell>{entry.sourceInterface || "-"}</TableCell>
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create Pseudo-Ethernet Interface"}</CardTitle>
              <CardDescription>Choose a source Ethernet interface and apply addressing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pseudo-name">Interface Name</Label>
                  <Input
                    id="pseudo-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="peth0"
                    disabled={Boolean(editingName)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pseudo-description">Description</Label>
                  <Input
                    id="pseudo-description"
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="LAB-MACVLAN"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Source Interface</Label>
                <Select
                  value={form.sourceInterface || "__empty__"}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, sourceInterface: value === "__empty__" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source interface" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">Select source interface</SelectItem>
                    {sourceChoices.map((choice) => (
                      <SelectItem key={choice.name} value={choice.name}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="pseudo-mtu">MTU</Label>
                  <Input
                    id="pseudo-mtu"
                    value={form.mtu}
                    onChange={(event) => setForm((prev) => ({ ...prev, mtu: event.target.value }))}
                    placeholder="1500"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="pseudo-vrf">VRF</Label>
                  <Input
                    id="pseudo-vrf"
                    value={form.vrf}
                    onChange={(event) => setForm((prev) => ({ ...prev, vrf: event.target.value }))}
                    placeholder="BLUE"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pseudo-addresses">IPv4/IPv6 Addresses</Label>
                <Textarea
                  id="pseudo-addresses"
                  value={form.addressesText}
                  onChange={(event) => setForm((prev) => ({ ...prev, addressesText: event.target.value }))}
                  placeholder={"10.60.0.1/24\n2001:db8:60::1/64"}
                  rows={4}
                />
              </div>

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
