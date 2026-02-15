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
import { macsecService, type MacsecInterfaceConfig, type MacsecStaticPeer } from "@/lib/api/macsec";
import type { EthernetInterface } from "@/lib/api/types/ethernet";
import { pageGuides } from "@/lib/help/pageGuides";
import { formatInterfaceDisplayName } from "@/lib/utils";

interface InterfaceChoice {
  name: string;
  label: string;
}

interface MacsecFormState {
  name: string;
  description: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  sourceInterface: string;
  mac: string;
  disableFlowControl: boolean;
  disableLinkDetect: boolean;
  securityCipher: string;
  securityEncrypt: boolean;
  securityReplayWindow: string;
  securityStaticKey: string;
  securityMkaCak: string;
  securityMkaCkn: string;
  securityMkaPriority: string;
  staticPeers: MacsecStaticPeer[];
}

const EMPTY_FORM: MacsecFormState = {
  name: "",
  description: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  disable: false,
  sourceInterface: "",
  mac: "",
  disableFlowControl: false,
  disableLinkDetect: false,
  securityCipher: "",
  securityEncrypt: false,
  securityReplayWindow: "",
  securityStaticKey: "",
  securityMkaCak: "",
  securityMkaCkn: "",
  securityMkaPriority: "",
  staticPeers: [],
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

function getInterfaceChoices(interfaces: EthernetInterface[]): InterfaceChoice[] {
  return interfaces
    .map((iface) => ({
      name: iface.name,
      label: formatInterfaceDisplayName(iface.name, iface.description ?? null),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function toFormState(value: MacsecInterfaceConfig): MacsecFormState {
  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
    sourceInterface: value.sourceInterface,
    mac: value.mac,
    disableFlowControl: value.disableFlowControl,
    disableLinkDetect: value.disableLinkDetect,
    securityCipher: value.securityCipher,
    securityEncrypt: value.securityEncrypt,
    securityReplayWindow: value.securityReplayWindow,
    securityStaticKey: value.securityStaticKey,
    securityMkaCak: value.securityMkaCak,
    securityMkaCkn: value.securityMkaCkn,
    securityMkaPriority: value.securityMkaPriority,
    staticPeers: value.staticPeers,
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

function buildMacsecOperations(candidate: MacsecFormState, current: MacsecInterfaceConfig | null): string[] {
  const operations: string[] = [];
  const base = `interfaces macsec ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      addresses: [],
      mtu: "",
      vrf: "",
      disable: false,
      sourceInterface: "",
      mac: "",
      disableFlowControl: false,
      disableLinkDetect: false,
      securityCipher: "",
      securityEncrypt: false,
      securityReplayWindow: "",
      securityStaticKey: "",
      securityMkaCak: "",
      securityMkaCkn: "",
      securityMkaPriority: "",
      staticPeers: [],
    } satisfies MacsecInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);
  syncScalar(
    operations,
    base,
    "source-interface",
    candidate.sourceInterface.trim(),
    currentSafe.sourceInterface,
  );
  syncScalar(operations, base, "mac", candidate.mac.trim(), currentSafe.mac);
  syncScalar(
    operations,
    base,
    "security cipher",
    candidate.securityCipher.trim(),
    currentSafe.securityCipher,
  );
  syncScalar(
    operations,
    base,
    "security replay-window",
    candidate.securityReplayWindow.trim(),
    currentSafe.securityReplayWindow,
  );
  syncScalar(
    operations,
    base,
    "security static key",
    candidate.securityStaticKey.trim(),
    currentSafe.securityStaticKey,
  );
  syncScalar(
    operations,
    base,
    "security mka cak",
    candidate.securityMkaCak.trim(),
    currentSafe.securityMkaCak,
  );
  syncScalar(
    operations,
    base,
    "security mka ckn",
    candidate.securityMkaCkn.trim(),
    currentSafe.securityMkaCkn,
  );
  syncScalar(
    operations,
    base,
    "security mka priority",
    candidate.securityMkaPriority.trim(),
    currentSafe.securityMkaPriority,
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
  if (candidate.securityEncrypt !== currentSafe.securityEncrypt) {
    operations.push(
      candidate.securityEncrypt ? `set ${base} security encrypt` : `delete ${base} security encrypt`,
    );
  }

  const desiredPeers = candidate.staticPeers
    .map((peer) => ({
      name: peer.name.trim(),
      mac: peer.mac.trim(),
      key: peer.key.trim(),
      disable: peer.disable,
    }))
    .filter((peer) => peer.name.length > 0);
  const currentPeerMap = new Map(currentSafe.staticPeers.map((peer) => [peer.name, peer]));
  const desiredPeerMap = new Map(desiredPeers.map((peer) => [peer.name, peer]));

  for (const currentPeerName of currentPeerMap.keys()) {
    if (!desiredPeerMap.has(currentPeerName)) {
      operations.push(`delete ${base} security static peer ${quoteCliValue(currentPeerName)}`);
    }
  }
  for (const peer of desiredPeers) {
    const existing = currentPeerMap.get(peer.name);
    syncScalar(
      operations,
      base,
      `security static peer ${quoteCliValue(peer.name)} mac`,
      peer.mac,
      existing?.mac || "",
    );
    syncScalar(
      operations,
      base,
      `security static peer ${quoteCliValue(peer.name)} key`,
      peer.key,
      existing?.key || "",
    );
    const currentDisabled = Boolean(existing?.disable);
    if (peer.disable !== currentDisabled) {
      operations.push(
        peer.disable
          ? `set ${base} security static peer ${quoteCliValue(peer.name)} disable`
          : `delete ${base} security static peer ${quoteCliValue(peer.name)} disable`,
      );
    }
  }

  return operations;
}

export default function MacsecInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<MacsecInterfaceConfig[]>([]);
  const [sourceChoices, setSourceChoices] = useState<InterfaceChoice[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<MacsecFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const [macsecConfig, ethernetConfig] = await Promise.all([
        macsecService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] as EthernetInterface[] })),
      ]);
      setInterfaces(macsecConfig.interfaces);
      setSourceChoices(getInterfaceChoices(ethernetConfig.interfaces || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MACsec interfaces.");
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

  const editInterface = (value: MacsecInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete MACsec interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await macsecService.batchConfigure([`delete interfaces macsec ${quoteCliValue(name)}`]);
      if (!response.success) throw new Error(response.error || "VyOS rejected interface deletion.");
      await loadData(true);
      if (editingName === name) resetForm();
      setSuccess(`MACsec interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete MACsec interface.");
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
      setError("Renaming MACsec interfaces is not supported. Create a new interface and delete the old one.");
      return;
    }
    if (!form.sourceInterface.trim()) {
      setError("Source interface is required.");
      return;
    }
    if (!form.securityCipher.trim()) {
      setError("Security cipher is required.");
      return;
    }

    const numericFields = [
      { label: "MTU", value: form.mtu },
      { label: "Replay Window", value: form.securityReplayWindow },
      { label: "MKA Priority", value: form.securityMkaPriority },
    ];
    for (const field of numericFields) {
      const trimmed = field.value.trim();
      if (!trimmed) continue;
      if (!/^\d+$/.test(trimmed)) {
        setError(`${field.label} must be a whole number.`);
        return;
      }
    }

    const peerNames = new Set<string>();
    for (const peer of form.staticPeers) {
      const nameTrimmed = peer.name.trim();
      if (!nameTrimmed) continue;
      if (peerNames.has(nameTrimmed)) {
        setError(`Duplicate static peer name '${nameTrimmed}'.`);
        return;
      }
      peerNames.add(nameTrimmed);
    }

    const current = interfaces.find((entry) => entry.name === name) || null;
    const operations = buildMacsecOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await macsecService.batchConfigure(operations);
      if (!response.success) throw new Error(response.error || "VyOS rejected interface update.");
      await loadData(true);
      setSuccess(current ? `MACsec '${name}' updated.` : `MACsec '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save MACsec interface.");
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
            <h1 className="text-3xl font-bold">MACsec Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces macsec` with source-interface binding and security (MKA or static peers).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New MACsec
            </Button>
            <PageGuideDialog guide={pageGuides.macsecInterfaces} />
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
              <p className="text-xs text-muted-foreground">With Static Peers</p>
              <p className="mt-1 text-2xl font-bold">
                {interfaces.filter((entry) => entry.staticPeers.length > 0).length}
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
              <CardTitle>Configured MACsec Interfaces</CardTitle>
              <CardDescription>Choose an interface to edit security and peer parameters.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading interfaces...</div>
              ) : interfaces.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No MACsec interfaces configured.</div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Cipher</TableHead>
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
                          <TableCell className="font-mono text-xs">{entry.sourceInterface || "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{entry.securityCipher || "-"}</TableCell>
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create MACsec Interface"}</CardTitle>
              <CardDescription>
                Configure base interface settings plus MKA/static MACsec security parameters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="macsec0"
                  disabled={saving || Boolean(editingName)}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Encrypted uplink"
                  disabled={saving}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
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
                <div className="space-y-2">
                  <Label>Cipher</Label>
                  <Select
                    value={form.securityCipher || "none"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, securityCipher: value === "none" ? "" : value }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select cipher" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="gcm-aes-128">gcm-aes-128</SelectItem>
                      <SelectItem value="gcm-aes-256">gcm-aes-256</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>MTU</Label>
                  <Input
                    value={form.mtu}
                    onChange={(event) => setForm((prev) => ({ ...prev, mtu: event.target.value }))}
                    placeholder="1500"
                    disabled={saving}
                  />
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
              </div>

              <div className="space-y-2">
                <Label>Interface MAC</Label>
                <Input
                  value={form.mac}
                  onChange={(event) => setForm((prev) => ({ ...prev, mac: event.target.value }))}
                  placeholder="00:53:01:02:03:04"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>Addresses (one CIDR per line)</Label>
                <Textarea
                  value={form.addressesText}
                  onChange={(event) => setForm((prev) => ({ ...prev, addressesText: event.target.value }))}
                  placeholder={"192.0.2.1/24\n2001:db8::1/64"}
                  className="min-h-[90px] font-mono text-xs"
                  disabled={saving}
                />
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">Security</p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.securityEncrypt}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, securityEncrypt: Boolean(checked) }))}
                    disabled={saving}
                  />
                  Enable encryption
                </label>
                <Input
                  value={form.securityReplayWindow}
                  onChange={(event) => setForm((prev) => ({ ...prev, securityReplayWindow: event.target.value }))}
                  placeholder="Replay window"
                  disabled={saving}
                />
                <Input
                  value={form.securityStaticKey}
                  onChange={(event) => setForm((prev) => ({ ...prev, securityStaticKey: event.target.value }))}
                  placeholder="Static key (hex)"
                  disabled={saving}
                />
                <Input
                  value={form.securityMkaCak}
                  onChange={(event) => setForm((prev) => ({ ...prev, securityMkaCak: event.target.value }))}
                  placeholder="MKA CAK"
                  disabled={saving}
                />
                <Input
                  value={form.securityMkaCkn}
                  onChange={(event) => setForm((prev) => ({ ...prev, securityMkaCkn: event.target.value }))}
                  placeholder="MKA CKN"
                  disabled={saving}
                />
                <Input
                  value={form.securityMkaPriority}
                  onChange={(event) => setForm((prev) => ({ ...prev, securityMkaPriority: event.target.value }))}
                  placeholder="MKA priority"
                  disabled={saving}
                />
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Static Peers</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        staticPeers: [
                          ...prev.staticPeers,
                          { name: "", mac: "", key: "", disable: false },
                        ],
                      }))
                    }
                    disabled={saving}
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add Peer
                  </Button>
                </div>
                {form.staticPeers.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No static peers configured.</div>
                ) : (
                  <div className="space-y-3">
                    {form.staticPeers.map((peer, index) => (
                      <div key={`peer-${index}`} className="rounded-md border p-3 space-y-2">
                        <div className="grid gap-2 md:grid-cols-3">
                          <Input
                            value={peer.name}
                            onChange={(event) =>
                              setForm((prev) => {
                                const next = [...prev.staticPeers];
                                next[index] = { ...next[index], name: event.target.value };
                                return { ...prev, staticPeers: next };
                              })
                            }
                            placeholder="Peer name"
                            disabled={saving}
                          />
                          <Input
                            value={peer.mac}
                            onChange={(event) =>
                              setForm((prev) => {
                                const next = [...prev.staticPeers];
                                next[index] = { ...next[index], mac: event.target.value };
                                return { ...prev, staticPeers: next };
                              })
                            }
                            placeholder="Peer MAC"
                            disabled={saving}
                          />
                          <Input
                            value={peer.key}
                            onChange={(event) =>
                              setForm((prev) => {
                                const next = [...prev.staticPeers];
                                next[index] = { ...next[index], key: event.target.value };
                                return { ...prev, staticPeers: next };
                              })
                            }
                            placeholder="Peer key"
                            disabled={saving}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={peer.disable}
                              onCheckedChange={(checked) =>
                                setForm((prev) => {
                                  const next = [...prev.staticPeers];
                                  next[index] = { ...next[index], disable: Boolean(checked) };
                                  return { ...prev, staticPeers: next };
                                })
                              }
                              disabled={saving}
                            />
                            Disable peer
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                staticPeers: prev.staticPeers.filter((_, i) => i !== index),
                              }))
                            }
                            disabled={saving}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disableFlowControl}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, disableFlowControl: Boolean(checked) }))}
                    disabled={saving}
                  />
                  Disable flow control
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disableLinkDetect}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, disableLinkDetect: Boolean(checked) }))}
                    disabled={saving}
                  />
                  Disable link detect
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disable}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, disable: Boolean(checked) }))}
                    disabled={saving}
                  />
                  Disable interface
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
                      Save MACsec
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

