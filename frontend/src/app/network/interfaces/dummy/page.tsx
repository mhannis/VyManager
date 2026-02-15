"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dummyService, type DummyBatchOperation, type DummyInterface } from "@/lib/api/dummy";
import { AlertCircle, Plus, RefreshCw, Save, Server, Trash2 } from "lucide-react";

function parseAddressLines(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function buildDummyOperations(
  candidate: {
    name: string;
    description: string;
    addresses: string[];
    mtu: string;
    vrf: string;
    disabled: boolean;
  },
  current: DummyInterface | null,
): DummyBatchOperation[] {
  const operations: DummyBatchOperation[] = [];

  const description = candidate.description.trim();
  const mtu = candidate.mtu.trim();
  const vrf = candidate.vrf.trim();
  const addresses = candidate.addresses;

  if (!current) {
    if (description) {
      operations.push({ op: "set_description", value: description });
    }
    for (const address of addresses) {
      operations.push({ op: "set_address", value: address });
    }
    if (mtu) {
      operations.push({ op: "set_mtu", value: mtu });
    }
    if (vrf) {
      operations.push({ op: "set_vrf", value: vrf });
    }
    operations.push({ op: candidate.disabled ? "disable" : "enable" });
    return operations;
  }

  const currentDescription = current.description?.trim() || "";
  if (description !== currentDescription) {
    operations.push(
      description ? { op: "set_description", value: description } : { op: "delete_description" },
    );
  }

  const currentAddresses = new Set(current.addresses || []);
  const desiredAddresses = new Set(addresses);
  for (const address of currentAddresses) {
    if (!desiredAddresses.has(address)) {
      operations.push({ op: "delete_address", value: address });
    }
  }
  for (const address of desiredAddresses) {
    if (!currentAddresses.has(address)) {
      operations.push({ op: "set_address", value: address });
    }
  }

  const currentMtu = current.mtu?.trim() || "";
  if (mtu !== currentMtu) {
    operations.push(mtu ? { op: "set_mtu", value: mtu } : { op: "delete_mtu" });
  }

  const currentVrf = current.vrf?.trim() || "";
  if (vrf !== currentVrf) {
    operations.push(vrf ? { op: "set_vrf", value: vrf } : { op: "delete_vrf", value: currentVrf });
  }

  const currentDisabled = Boolean(current.disable);
  if (candidate.disabled !== currentDisabled) {
    operations.push({ op: candidate.disabled ? "disable" : "enable" });
  }

  return operations;
}

export default function DummyInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<DummyInterface[]>([]);

  const [editingName, setEditingName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [addressesText, setAddressesText] = useState("");
  const [mtu, setMtu] = useState("");
  const [vrf, setVrf] = useState("");
  const [disabled, setDisabled] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await dummyService.getConfig();
      setInterfaces(response.interfaces || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dummy interfaces.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setEditingName(null);
    setName("");
    setDescription("");
    setAddressesText("");
    setMtu("");
    setVrf("");
    setDisabled(false);
    setError(null);
    setSuccess(null);
  };

  const editInterface = (iface: DummyInterface) => {
    setEditingName(iface.name);
    setName(iface.name);
    setDescription(iface.description || "");
    setAddressesText((iface.addresses || []).join("\n"));
    setMtu(iface.mtu || "");
    setVrf(iface.vrf || "");
    setDisabled(Boolean(iface.disable));
    setError(null);
    setSuccess(null);
  };

  const saveInterface = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Interface name is required.");
      return;
    }

    const current = interfaces.find((iface) => iface.name === trimmedName) || null;
    if (editingName && current?.name !== editingName) {
      setError("Renaming dummy interfaces is not supported. Create a new one and delete the old interface.");
      return;
    }

    const addresses = parseAddressLines(addressesText);
    const operations = buildDummyOperations(
      {
        name: trimmedName,
        description,
        addresses,
        mtu,
        vrf,
        disabled,
      },
      current,
    );

    if (!current && operations.length === 1 && operations[0].op === "enable") {
      setError("Provide at least one configuration value (address/description/mtu/vrf) for a new interface.");
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
      const response = await dummyService.batchConfigure({
        interface: trimmedName,
        operations,
      });
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected dummy interface update.");
      }
      await loadData();
      setSuccess(
        current
          ? `Dummy interface '${trimmedName}' updated.`
          : `Dummy interface '${trimmedName}' created.`,
      );
      setEditingName(trimmedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dummy interface.");
    } finally {
      setSaving(false);
    }
  };

  const deleteInterface = async (ifaceName: string) => {
    if (!window.confirm(`Delete dummy interface '${ifaceName}'?`)) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await dummyService.batchConfigure({
        interface: ifaceName,
        operations: [{ op: "delete_interface" }],
      });
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected dummy interface delete.");
      }
      await loadData();
      if (editingName === ifaceName) {
        resetForm();
      }
      setSuccess(`Dummy interface '${ifaceName}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete dummy interface.");
    } finally {
      setSaving(false);
    }
  };

  const disabledCount = useMemo(
    () => interfaces.filter((iface) => Boolean(iface.disable)).length,
    [interfaces],
  );
  const withAddressCount = useMemo(
    () => interfaces.filter((iface) => (iface.addresses || []).length > 0).length,
    [interfaces],
  );

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dummy Interfaces</h1>
            <p className="text-muted-foreground mt-1">
              Manage `interfaces dummy` for loopback-style service addresses and testing networks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadData} disabled={refreshing || saving}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="h-4 w-4 mr-2" />
              New
            </Button>
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
              <p className="text-xs text-muted-foreground">With Addresses</p>
              <p className="mt-1 text-2xl font-bold">{withAddressCount}</p>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
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
              <CardTitle className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                Interfaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading dummy interfaces...</div>
              ) : interfaces.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No dummy interfaces configured.</div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Addresses</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {interfaces.map((iface) => (
                        <TableRow key={iface.name}>
                          <TableCell className="font-mono">{iface.name}</TableCell>
                          <TableCell>{iface.description || "-"}</TableCell>
                          <TableCell className="text-xs">
                            {(iface.addresses || []).length > 0 ? (
                              <div className="space-y-1 font-mono">
                                {iface.addresses.map((addr) => (
                                  <div key={`${iface.name}-${addr}`}>{addr}</div>
                                ))}
                              </div>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={iface.disable ? "secondary" : "default"}>
                              {iface.disable ? "Disabled" : "Enabled"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editInterface(iface)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteInterface(iface.name)}
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create Dummy Interface"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="dum0"
                  disabled={saving || Boolean(editingName)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Service loopback interface"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Addresses (one CIDR per line)</Label>
                <Textarea
                  value={addressesText}
                  onChange={(event) => setAddressesText(event.target.value)}
                  placeholder={"10.255.255.1/32\n2001:db8::1/128"}
                  className="min-h-[110px] font-mono text-xs"
                  disabled={saving}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>MTU (optional)</Label>
                  <Input
                    value={mtu}
                    onChange={(event) => setMtu(event.target.value)}
                    placeholder="1500"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>VRF (optional)</Label>
                  <Input
                    value={vrf}
                    onChange={(event) => setVrf(event.target.value)}
                    placeholder="mgmt"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={disabled}
                  onCheckedChange={(checked) => setDisabled(checked === true)}
                  disabled={saving}
                />
                <Label>Administratively disabled</Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveInterface} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {editingName ? "Save Changes" : "Create Interface"}
                </Button>
                {editingName && (
                  <Button variant="outline" onClick={resetForm} disabled={saving}>
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
