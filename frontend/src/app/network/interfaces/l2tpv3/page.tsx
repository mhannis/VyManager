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
import { l2tpv3Service, type L2tpv3InterfaceConfig } from "@/lib/api/l2tpv3";
import { pageGuides } from "@/lib/help/pageGuides";

interface L2tpv3FormState {
  name: string;
  description: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  encapsulation: string;
  sourceAddress: string;
  remote: string;
  sessionId: string;
  peerSessionId: string;
  tunnelId: string;
  peerTunnelId: string;
  sourcePort: string;
  destinationPort: string;
  cookie: string;
  peerCookie: string;
}

const EMPTY_FORM: L2tpv3FormState = {
  name: "",
  description: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  disable: false,
  encapsulation: "",
  sourceAddress: "",
  remote: "",
  sessionId: "",
  peerSessionId: "",
  tunnelId: "",
  peerTunnelId: "",
  sourcePort: "",
  destinationPort: "",
  cookie: "",
  peerCookie: "",
};

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

function toFormState(value: L2tpv3InterfaceConfig): L2tpv3FormState {
  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
    encapsulation: value.encapsulation,
    sourceAddress: value.sourceAddress,
    remote: value.remote,
    sessionId: value.sessionId,
    peerSessionId: value.peerSessionId,
    tunnelId: value.tunnelId,
    peerTunnelId: value.peerTunnelId,
    sourcePort: value.sourcePort,
    destinationPort: value.destinationPort,
    cookie: value.cookie,
    peerCookie: value.peerCookie,
  };
}

function syncScalar(
  operations: string[],
  base: string,
  token: string,
  desired: string,
  current: string,
) {
  if (desired === current) return;
  if (desired) operations.push(`set ${base} ${token} ${quoteCliValue(desired)}`);
  else operations.push(`delete ${base} ${token}`);
}

function buildL2tpv3Operations(candidate: L2tpv3FormState, current: L2tpv3InterfaceConfig | null): string[] {
  const operations: string[] = [];
  const base = `interfaces l2tpv3 ${candidate.name.trim()}`;
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
      sessionId: "",
      peerSessionId: "",
      tunnelId: "",
      peerTunnelId: "",
      sourcePort: "",
      destinationPort: "",
      cookie: "",
      peerCookie: "",
    } satisfies L2tpv3InterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);
  syncScalar(operations, base, "encapsulation", candidate.encapsulation.trim(), currentSafe.encapsulation);
  syncScalar(operations, base, "source-address", candidate.sourceAddress.trim(), currentSafe.sourceAddress);
  syncScalar(operations, base, "remote", candidate.remote.trim(), currentSafe.remote);
  syncScalar(operations, base, "session-id", candidate.sessionId.trim(), currentSafe.sessionId);
  syncScalar(
    operations,
    base,
    "peer-session-id",
    candidate.peerSessionId.trim(),
    currentSafe.peerSessionId,
  );
  syncScalar(operations, base, "tunnel-id", candidate.tunnelId.trim(), currentSafe.tunnelId);
  syncScalar(
    operations,
    base,
    "peer-tunnel-id",
    candidate.peerTunnelId.trim(),
    currentSafe.peerTunnelId,
  );
  syncScalar(operations, base, "source-port", candidate.sourcePort.trim(), currentSafe.sourcePort);
  syncScalar(
    operations,
    base,
    "destination-port",
    candidate.destinationPort.trim(),
    currentSafe.destinationPort,
  );
  syncScalar(operations, base, "cookie", candidate.cookie.trim(), currentSafe.cookie);
  syncScalar(operations, base, "peer-cookie", candidate.peerCookie.trim(), currentSafe.peerCookie);

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

export default function L2tpv3InterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<L2tpv3InterfaceConfig[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<L2tpv3FormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const config = await l2tpv3Service.getConfig(refresh);
      setInterfaces(config.interfaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load L2TPv3 interfaces.");
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

  const editInterface = (value: L2tpv3InterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete L2TPv3 interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await l2tpv3Service.batchConfigure([`delete interfaces l2tpv3 ${quoteCliValue(name)}`]);
      if (!response.success) throw new Error(response.error || "VyOS rejected interface deletion.");
      await loadData(true);
      if (editingName === name) resetForm();
      setSuccess(`L2TPv3 interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete L2TPv3 interface.");
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
      setError("Renaming L2TPv3 interfaces is not supported. Create a new interface and delete the old one.");
      return;
    }
    if (!form.remote.trim()) {
      setError("Remote endpoint is required.");
      return;
    }
    if (!form.sessionId.trim()) {
      setError("Session ID is required.");
      return;
    }

    const numericFields = [
      { label: "MTU", value: form.mtu },
      { label: "Session ID", value: form.sessionId },
      { label: "Peer Session ID", value: form.peerSessionId },
      { label: "Tunnel ID", value: form.tunnelId },
      { label: "Peer Tunnel ID", value: form.peerTunnelId },
      { label: "Source Port", value: form.sourcePort },
      { label: "Destination Port", value: form.destinationPort },
    ];
    for (const field of numericFields) {
      const trimmed = field.value.trim();
      if (!trimmed) continue;
      if (!/^\d+$/.test(trimmed)) {
        setError(`${field.label} must be a whole number.`);
        return;
      }
    }

    const current = interfaces.find((entry) => entry.name === name) || null;
    const operations = buildL2tpv3Operations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await l2tpv3Service.batchConfigure(operations);
      if (!response.success) throw new Error(response.error || "VyOS rejected interface update.");
      await loadData(true);
      setSuccess(current ? `L2TPv3 '${name}' updated.` : `L2TPv3 '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save L2TPv3 interface.");
    } finally {
      setSaving(false);
    }
  };

  const disabledCount = useMemo(() => interfaces.filter((entry) => entry.disable).length, [interfaces]);

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">L2TPv3 Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces l2tpv3` pseudowires with session, tunnel, and transport parameters.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New L2TPv3
            </Button>
            <PageGuideDialog guide={pageGuides.l2tpv3Interfaces} />
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
                {interfaces.filter((entry) => entry.addresses.length > 0).length}
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
              <CardTitle>Configured L2TPv3 Interfaces</CardTitle>
              <CardDescription>Choose an interface to edit transport and session parameters.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading interfaces...</div>
              ) : interfaces.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No L2TPv3 interfaces configured.</div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Remote</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {interfaces.map((entry) => (
                        <TableRow key={entry.name}>
                          <TableCell>
                            <div className="font-mono text-xs">{entry.name}</div>
                            {entry.description && (
                              <div className="mt-1 text-xs text-muted-foreground">{entry.description}</div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{entry.remote || "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{entry.sessionId || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={entry.disable ? "secondary" : "default"}>
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create L2TPv3 Interface"}</CardTitle>
              <CardDescription>
                Configure remote/source addressing, session/tunnel IDs, and optional ports/cookies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="l2tpeth0"
                  disabled={saving || Boolean(editingName)}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Datacenter pseudowire"
                  disabled={saving}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Remote Endpoint</Label>
                  <Input
                    value={form.remote}
                    onChange={(event) => setForm((prev) => ({ ...prev, remote: event.target.value }))}
                    placeholder="203.0.113.60"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source Address</Label>
                  <Input
                    value={form.sourceAddress}
                    onChange={(event) => setForm((prev) => ({ ...prev, sourceAddress: event.target.value }))}
                    placeholder="192.0.2.10"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Session ID</Label>
                  <Input
                    value={form.sessionId}
                    onChange={(event) => setForm((prev) => ({ ...prev, sessionId: event.target.value }))}
                    placeholder="200"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Peer Session ID</Label>
                  <Input
                    value={form.peerSessionId}
                    onChange={(event) => setForm((prev) => ({ ...prev, peerSessionId: event.target.value }))}
                    placeholder="201"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tunnel ID</Label>
                  <Input
                    value={form.tunnelId}
                    onChange={(event) => setForm((prev) => ({ ...prev, tunnelId: event.target.value }))}
                    placeholder="1000"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Peer Tunnel ID</Label>
                  <Input
                    value={form.peerTunnelId}
                    onChange={(event) => setForm((prev) => ({ ...prev, peerTunnelId: event.target.value }))}
                    placeholder="1001"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Source Port</Label>
                  <Input
                    value={form.sourcePort}
                    onChange={(event) => setForm((prev) => ({ ...prev, sourcePort: event.target.value }))}
                    placeholder="1701"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Destination Port</Label>
                  <Input
                    value={form.destinationPort}
                    onChange={(event) => setForm((prev) => ({ ...prev, destinationPort: event.target.value }))}
                    placeholder="1701"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Cookie</Label>
                  <Input
                    value={form.cookie}
                    onChange={(event) => setForm((prev) => ({ ...prev, cookie: event.target.value }))}
                    placeholder="0x1234abcd"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Peer Cookie</Label>
                  <Input
                    value={form.peerCookie}
                    onChange={(event) => setForm((prev) => ({ ...prev, peerCookie: event.target.value }))}
                    placeholder="0x5678ef01"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Encapsulation</Label>
                  <Select
                    value={form.encapsulation || "none"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, encapsulation: value === "none" ? "" : value }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      <SelectItem value="udp">udp</SelectItem>
                      <SelectItem value="ip">ip</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>MTU</Label>
                  <Input
                    value={form.mtu}
                    onChange={(event) => setForm((prev) => ({ ...prev, mtu: event.target.value }))}
                    placeholder="1500"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>VRF</Label>
                <Input
                  value={form.vrf}
                  onChange={(event) => setForm((prev) => ({ ...prev, vrf: event.target.value }))}
                  placeholder="BLUE"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>Addresses (one CIDR per line)</Label>
                <Textarea
                  value={form.addressesText}
                  onChange={(event) => setForm((prev) => ({ ...prev, addressesText: event.target.value }))}
                  placeholder={"10.20.30.1/30\n2001:db8:20:30::1/64"}
                  className="min-h-[90px] font-mono text-xs"
                  disabled={saving}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.disable}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, disable: Boolean(checked) }))}
                  disabled={saving}
                />
                Disable interface
              </label>

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
                      Save L2TPv3
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

