"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { loopbackService, type LoopbackInterfaceConfig } from "@/lib/api/loopback";
import { pageGuides } from "@/lib/help/pageGuides";

interface LoopbackFormState {
  name: string;
  description: string;
  addressesText: string;
}

const EMPTY_FORM: LoopbackFormState = {
  name: "",
  description: "",
  addressesText: "",
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

function toFormState(value: LoopbackInterfaceConfig): LoopbackFormState {
  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
  };
}

function buildLoopbackOperations(candidate: LoopbackFormState, current: LoopbackInterfaceConfig | null): string[] {
  const operations: string[] = [];
  const base = `interfaces loopback ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      addresses: [],
    } satisfies LoopbackInterfaceConfig);

  const desiredDescription = candidate.description.trim();
  if (desiredDescription !== currentSafe.description) {
    if (desiredDescription) {
      operations.push(`set ${base} description ${quoteCliValue(desiredDescription)}`);
    } else {
      operations.push(`delete ${base} description`);
    }
  }

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

  return operations;
}

export default function LoopbackInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<LoopbackInterfaceConfig[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<LoopbackFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const config = await loopbackService.getConfig(refresh);
      setInterfaces(config.interfaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load loopback interfaces.");
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

  const editInterface = (value: LoopbackInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete loopback interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await loopbackService.batchConfigure([
        `delete interfaces loopback ${quoteCliValue(name)}`,
      ]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected loopback deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`Loopback interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete loopback interface.");
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
      setError("Renaming loopback interfaces is not supported. Create a new one and delete the old one.");
      return;
    }

    const current = interfaces.find((entry) => entry.name === name) || null;
    const operations = buildLoopbackOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await loopbackService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected loopback configuration.");
      }
      await loadData(true);
      setSuccess(current ? `Loopback '${name}' updated.` : `Loopback '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save loopback interface.");
    } finally {
      setSaving(false);
    }
  };

  const interfaceCount = interfaces.length;
  const addressCount = useMemo(
    () => interfaces.reduce((count, entry) => count + entry.addresses.length, 0),
    [interfaces],
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
            <h1 className="text-3xl font-bold">Loopback Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces loopback` for router IDs and service addresses.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.loopbackInterfaces} />
        </div>

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

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Configured Loopbacks</CardTitle>
              <CardDescription>
                {interfaceCount} interface{interfaceCount === 1 ? "" : "s"} / {addressCount} address
                {addressCount === 1 ? "" : "es"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Interfaces: {interfaceCount}</Badge>
                  <Badge variant="outline">Addresses: {addressCount}</Badge>
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
                      <TableHead>Description</TableHead>
                      <TableHead>Addresses</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No loopback interfaces configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      interfaces.map((entry) => (
                        <TableRow key={entry.name}>
                          <TableCell className="font-medium">{entry.name}</TableCell>
                          <TableCell>{entry.description || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {entry.addresses.length > 0 ? entry.addresses.join(", ") : "-"}
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create Loopback Interface"}</CardTitle>
              <CardDescription>Loopback supports address and description settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="loopback-name">Interface Name</Label>
                <Input
                  id="loopback-name"
                  value={form.name}
                  onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="lo"
                  disabled={Boolean(editingName)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loopback-description">Description</Label>
                <Input
                  id="loopback-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="Router ID loopback"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loopback-addresses">IP Addresses</Label>
                <Textarea
                  id="loopback-addresses"
                  value={form.addressesText}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, addressesText: event.target.value }))
                  }
                  placeholder={"10.255.255.1/32\n2001:db8::1/128"}
                  className="min-h-[110px]"
                />
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
