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
import { sstpcService, type SstpcInterfaceConfig } from "@/lib/api/sstpc";
import { pageGuides } from "@/lib/help/pageGuides";

interface SstpcFormState {
  name: string;
  description: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  server: string;
  username: string;
  password: string;
  noDefaultRoute: boolean;
  defaultRouteDistance: string;
  noPeerDns: boolean;
  ipDisableForwarding: boolean;
  ipSourceValidation: string;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
}

const EMPTY_FORM: SstpcFormState = {
  name: "",
  description: "",
  mtu: "",
  vrf: "",
  disable: false,
  server: "",
  username: "",
  password: "",
  noDefaultRoute: false,
  defaultRouteDistance: "",
  noPeerDns: false,
  ipDisableForwarding: false,
  ipSourceValidation: "",
  ipAdjustMssClamp: false,
  ipAdjustMssValue: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function toFormState(value: SstpcInterfaceConfig): SstpcFormState {
  return {
    name: value.name,
    description: value.description,
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
    server: value.server,
    username: value.username,
    password: value.password,
    noDefaultRoute: value.noDefaultRoute,
    defaultRouteDistance: value.defaultRouteDistance,
    noPeerDns: value.noPeerDns,
    ipDisableForwarding: value.ipDisableForwarding,
    ipSourceValidation: value.ipSourceValidation,
    ipAdjustMssClamp: value.ipAdjustMssClamp,
    ipAdjustMssValue: value.ipAdjustMssValue,
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

function buildSstpcOperations(candidate: SstpcFormState, current: SstpcInterfaceConfig | null): string[] {
  const operations: string[] = [];
  const base = `interfaces sstpc ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      mtu: "",
      vrf: "",
      disable: false,
      server: "",
      username: "",
      password: "",
      noDefaultRoute: false,
      defaultRouteDistance: "",
      noPeerDns: false,
      ipDisableForwarding: false,
      ipSourceValidation: "",
      ipAdjustMssClamp: false,
      ipAdjustMssValue: "",
    } satisfies SstpcInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);
  syncScalar(operations, base, "server", candidate.server.trim(), currentSafe.server);
  syncScalar(operations, base, "username", candidate.username.trim(), currentSafe.username);
  syncScalar(operations, base, "password", candidate.password.trim(), currentSafe.password);
  syncScalar(
    operations,
    base,
    "default-route-distance",
    candidate.defaultRouteDistance.trim(),
    currentSafe.defaultRouteDistance,
  );
  syncScalar(
    operations,
    base,
    "ip source-validation",
    candidate.ipSourceValidation.trim(),
    currentSafe.ipSourceValidation,
  );

  syncFlag(operations, base, "disable", candidate.disable, currentSafe.disable);
  syncFlag(operations, base, "no-default-route", candidate.noDefaultRoute, currentSafe.noDefaultRoute);
  syncFlag(operations, base, "no-peer-dns", candidate.noPeerDns, currentSafe.noPeerDns);
  syncFlag(
    operations,
    base,
    "ip disable-forwarding",
    candidate.ipDisableForwarding,
    currentSafe.ipDisableForwarding,
  );
  syncAdjustMss(
    operations,
    base,
    candidate.ipAdjustMssClamp,
    candidate.ipAdjustMssValue,
    currentSafe.ipAdjustMssClamp,
    currentSafe.ipAdjustMssValue,
  );

  return operations;
}

export default function SstpClientInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<SstpcInterfaceConfig[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<SstpcFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const config = await sstpcService.getConfig(refresh);
      setInterfaces(config.interfaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SSTP client interfaces.");
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

  const editInterface = (value: SstpcInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete SSTP client interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await sstpcService.batchConfigure([
        `delete interfaces sstpc ${quoteCliValue(name)}`,
      ]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected SSTP client deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`SSTP client interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete SSTP client interface.");
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
      setError("Renaming SSTP client interfaces is not supported. Create a new one and delete the old one.");
      return;
    }
    if (!form.server.trim()) {
      setError("SSTP server is required.");
      return;
    }

    const numericFields = [
      { label: "MTU", value: form.mtu },
      { label: "Default Route Distance", value: form.defaultRouteDistance },
      {
        label: "IPv4 Adjust MSS",
        value: form.ipAdjustMssValue,
        allowClamp: form.ipAdjustMssClamp,
      },
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
    const operations = buildSstpcOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await sstpcService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected SSTP client update.");
      }
      await loadData(true);
      setSuccess(current ? `SSTP client '${name}' updated.` : `SSTP client '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save SSTP client interface.");
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
            <h1 className="text-3xl font-bold">SSTP Client Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces sstpc` clients with server, route, and interface controls.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New SSTP Client
            </Button>
            <PageGuideDialog guide={pageGuides.sstpClientInterfaces} />
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
              <p className="text-xs text-muted-foreground">With No Default Route</p>
              <p className="mt-1 text-2xl font-bold">
                {interfaces.filter((entry) => entry.noDefaultRoute).length}
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
              <CardTitle>Configured SSTP Client Interfaces</CardTitle>
              <CardDescription>Select an interface to edit or delete.</CardDescription>
            </CardHeader>
            <CardContent>
              {interfaces.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No SSTP client interfaces configured.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Server</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.map((entry) => (
                      <TableRow key={entry.name}>
                        <TableCell className="font-medium">{entry.name}</TableCell>
                        <TableCell>{entry.server || "-"}</TableCell>
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create SSTP Client Interface"}</CardTitle>
              <CardDescription>Guide-aligned SSTP client interface configuration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sstpc-name">Interface Name</Label>
                  <Input
                    id="sstpc-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="sstpc0"
                    disabled={Boolean(editingName)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sstpc-description">Description</Label>
                  <Input
                    id="sstpc-description"
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Remote access SSTP"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sstpc-server">Server</Label>
                  <Input
                    id="sstpc-server"
                    value={form.server}
                    onChange={(event) => setForm((prev) => ({ ...prev, server: event.target.value }))}
                    placeholder="vpn.example.net"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sstpc-distance">Default Route Distance</Label>
                  <Input
                    id="sstpc-distance"
                    value={form.defaultRouteDistance}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, defaultRouteDistance: event.target.value }))
                    }
                    placeholder="220"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sstpc-username">Username</Label>
                  <Input
                    id="sstpc-username"
                    value={form.username}
                    onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                    placeholder="vpnuser"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sstpc-password">Password</Label>
                  <Input
                    id="sstpc-password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="secret"
                    type="password"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="sstpc-mtu">MTU</Label>
                  <Input
                    id="sstpc-mtu"
                    value={form.mtu}
                    onChange={(event) => setForm((prev) => ({ ...prev, mtu: event.target.value }))}
                    placeholder="1492"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sstpc-vrf">VRF</Label>
                  <Input
                    id="sstpc-vrf"
                    value={form.vrf}
                    onChange={(event) => setForm((prev) => ({ ...prev, vrf: event.target.value }))}
                    placeholder="BLUE"
                  />
                </div>
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
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sstpc-adjust-mss">IPv4 Adjust MSS</Label>
                  <Input
                    id="sstpc-adjust-mss"
                    value={form.ipAdjustMssValue}
                    onChange={(event) => setForm((prev) => ({ ...prev, ipAdjustMssValue: event.target.value }))}
                    placeholder="1452"
                    disabled={form.ipAdjustMssClamp}
                  />
                </div>
                <label className="mt-7 flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipAdjustMssClamp}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, ipAdjustMssClamp: checked === true }))}
                  />
                  Clamp MSS to PMTU
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disable}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, disable: checked === true }))}
                  />
                  Disable Interface
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.noDefaultRoute}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, noDefaultRoute: checked === true }))}
                  />
                  No Default Route
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.noPeerDns}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, noPeerDns: checked === true }))}
                  />
                  No Peer DNS
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
