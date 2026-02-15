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
import {
  BONDING_MODE_OPTIONS,
  bondingService,
  type BondingInterface,
} from "@/lib/api/bonding";
import { ethernetService } from "@/lib/api/ethernet";
import type { EthernetInterface } from "@/lib/api/types/ethernet";
import { pageGuides } from "@/lib/help/pageGuides";
import { formatInterfaceDisplayName } from "@/lib/utils";

type HashPolicyOption = "layer2" | "layer2+3" | "layer3+4";
type LacpRateOption = "fast" | "slow";

interface InterfaceChoice {
  name: string;
  label: string;
}

interface BondingCandidate {
  name: string;
  description: string;
  addresses: string[];
  mtu: string;
  vrf: string;
  mode: string;
  hashPolicy: string;
  lacpRate: string;
  minLinks: string;
  primary: string;
  allMembersActive: boolean;
  mac: string;
  systemMac: string;
  systemPriority: string;
  disable: boolean;
  members: string[];
}

interface BondingFormState {
  name: string;
  description: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  mode: string;
  hashPolicy: string;
  lacpRate: string;
  minLinks: string;
  primary: string;
  allMembersActive: boolean;
  mac: string;
  systemMac: string;
  systemPriority: string;
  disable: boolean;
  selectedMembers: string[];
  extraMembersText: string;
}

const HASH_POLICY_OPTIONS: HashPolicyOption[] = ["layer2", "layer2+3", "layer3+4"];
const LACP_RATE_OPTIONS: LacpRateOption[] = ["fast", "slow"];

const EMPTY_FORM: BondingFormState = {
  name: "",
  description: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  mode: "802.3ad",
  hashPolicy: "layer2",
  lacpRate: "slow",
  minLinks: "",
  primary: "",
  allMembersActive: false,
  mac: "",
  systemMac: "",
  systemPriority: "",
  disable: false,
  selectedMembers: [],
  extraMembersText: "",
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

function parseMembersText(raw: string): string[] {
  return uniqueNonEmpty(raw.split(/[\n,]/));
}

function listDifference(current: string[], desired: string[]): { toAdd: string[]; toDelete: string[] } {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  const toAdd = desired.filter((item) => !currentSet.has(item));
  const toDelete = current.filter((item) => !desiredSet.has(item));
  return { toAdd, toDelete };
}

function normalizeCandidate(form: BondingFormState): BondingCandidate {
  const addresses = parseAddressLines(form.addressesText);
  const members = uniqueNonEmpty([...form.selectedMembers, ...parseMembersText(form.extraMembersText)]).sort(
    (left, right) => left.localeCompare(right),
  );

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    addresses,
    mtu: form.mtu.trim(),
    vrf: form.vrf.trim(),
    mode: form.mode.trim(),
    hashPolicy: form.hashPolicy.trim(),
    lacpRate: form.lacpRate.trim(),
    minLinks: form.minLinks.trim(),
    primary: form.primary.trim(),
    allMembersActive: form.allMembersActive,
    mac: form.mac.trim(),
    systemMac: form.systemMac.trim(),
    systemPriority: form.systemPriority.trim(),
    disable: form.disable,
    members,
  };
}

function toFormState(value: BondingInterface, choices: InterfaceChoice[]): BondingFormState {
  const knownNames = new Set(choices.map((choice) => choice.name));
  const selectedMembers = value.members.filter((member) => knownNames.has(member));
  const extraMembers = value.members.filter((member) => !knownNames.has(member));

  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    mode: value.mode || "802.3ad",
    hashPolicy: value.hashPolicy || "layer2",
    lacpRate: value.lacpRate || "slow",
    minLinks: value.minLinks,
    primary: value.primary,
    allMembersActive: value.allMembersActive,
    mac: value.mac,
    systemMac: value.systemMac,
    systemPriority: value.systemPriority,
    disable: value.disable,
    selectedMembers,
    extraMembersText: extraMembers.join(", "),
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

function buildBondingOperations(candidate: BondingCandidate, current: BondingInterface | null): string[] {
  const operations: string[] = [];
  const base = `interfaces bonding ${candidate.name}`;
  const currentSafe = current || {
    name: candidate.name,
    description: "",
    addresses: [],
    mtu: "",
    vrf: "",
    mode: "",
    hashPolicy: "",
    lacpRate: "",
    minLinks: "",
    primary: "",
    allMembersActive: false,
    mac: "",
    systemMac: "",
    systemPriority: "",
    disable: false,
    members: [],
  };

  syncScalar(operations, base, "description", candidate.description, currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu, currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf, currentSafe.vrf);
  syncScalar(operations, base, "mode", candidate.mode, currentSafe.mode);
  syncScalar(operations, base, "primary", candidate.primary, currentSafe.primary);
  syncScalar(operations, base, "mac", candidate.mac, currentSafe.mac);
  syncScalar(operations, base, "system-mac", candidate.systemMac, currentSafe.systemMac);
  syncScalar(operations, base, "system-priority", candidate.systemPriority, currentSafe.systemPriority);

  const supportsHashPolicy = candidate.mode === "802.3ad" || candidate.mode === "balance-xor";
  const desiredHash = supportsHashPolicy ? candidate.hashPolicy : "";
  syncScalar(operations, base, "hash-policy", desiredHash, currentSafe.hashPolicy);

  const supportsLacpRate = candidate.mode === "802.3ad";
  const desiredLacpRate = supportsLacpRate ? candidate.lacpRate : "";
  const desiredMinLinks = supportsLacpRate ? candidate.minLinks : "";
  syncScalar(operations, base, "lacp-rate", desiredLacpRate, currentSafe.lacpRate);
  syncScalar(operations, base, "min-links", desiredMinLinks, currentSafe.minLinks);

  if (candidate.allMembersActive !== currentSafe.allMembersActive) {
    operations.push(
      candidate.allMembersActive
        ? `set ${base} all-members-active`
        : `delete ${base} all-members-active`,
    );
  }

  if (candidate.disable !== currentSafe.disable) {
    operations.push(candidate.disable ? `set ${base} disable` : `delete ${base} disable`);
  }

  const addressChanges = listDifference(currentSafe.addresses, candidate.addresses);
  for (const address of addressChanges.toDelete) {
    operations.push(`delete ${base} address ${quoteCliValue(address)}`);
  }
  for (const address of addressChanges.toAdd) {
    operations.push(`set ${base} address ${quoteCliValue(address)}`);
  }

  const memberChanges = listDifference(currentSafe.members, candidate.members);
  for (const member of memberChanges.toDelete) {
    operations.push(`delete ${base} member interface ${quoteCliValue(member)}`);
  }
  for (const member of memberChanges.toAdd) {
    operations.push(`set ${base} member interface ${quoteCliValue(member)}`);
  }

  return operations;
}

function getInterfaceChoices(interfaces: EthernetInterface[]): InterfaceChoice[] {
  return interfaces
    .map((iface) => ({
      name: iface.name,
      label: formatInterfaceDisplayName(iface.name, iface.description ?? null),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export default function BondingInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [bonds, setBonds] = useState<BondingInterface[]>([]);
  const [interfaceChoices, setInterfaceChoices] = useState<InterfaceChoice[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<BondingFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const [bondingConfig, ethernetConfig] = await Promise.all([
        bondingService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] as EthernetInterface[] })),
      ]);
      setBonds(bondingConfig.bonds);
      setInterfaceChoices(getInterfaceChoices(ethernetConfig.interfaces || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bonding interfaces.");
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

  const editBond = (value: BondingInterface) => {
    setEditingName(value.name);
    setForm(toFormState(value, interfaceChoices));
    setError(null);
    setSuccess(null);
  };

  const deleteBond = async (name: string) => {
    if (!window.confirm(`Delete bonding interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await bondingService.batchConfigure([`delete interfaces bonding ${quoteCliValue(name)}`]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected bonding interface deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`Bonding interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete bonding interface.");
    } finally {
      setSaving(false);
    }
  };

  const saveBond = async () => {
    const candidate = normalizeCandidate(form);
    if (!candidate.name) {
      setError("Bonding interface name is required.");
      return;
    }
    if (editingName && editingName !== candidate.name) {
      setError("Renaming bonding interfaces is not supported. Create a new bond and delete the old one.");
      return;
    }
    if (candidate.members.length === 0) {
      setError("Select at least one member interface.");
      return;
    }
    if (candidate.minLinks && !/^\d+$/.test(candidate.minLinks)) {
      setError("Min links must be a whole number.");
      return;
    }
    if (candidate.systemPriority && !/^\d+$/.test(candidate.systemPriority)) {
      setError("System priority must be a whole number.");
      return;
    }

    const current = bonds.find((bond) => bond.name === candidate.name) || null;
    const operations = buildBondingOperations(candidate, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await bondingService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected bonding interface update.");
      }
      await loadData(true);
      setSuccess(current ? `Bond '${candidate.name}' updated.` : `Bond '${candidate.name}' created.`);
      setEditingName(candidate.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bonding interface.");
    } finally {
      setSaving(false);
    }
  };

  const disabledCount = useMemo(
    () => bonds.filter((bond) => bond.disable).length,
    [bonds],
  );
  const lacpCount = useMemo(
    () => bonds.filter((bond) => bond.mode === "802.3ad").length,
    [bonds],
  );
  const hashPolicyDisabled = !(form.mode === "802.3ad" || form.mode === "balance-xor");
  const lacpFieldsDisabled = form.mode !== "802.3ad";
  const primaryOptions = useMemo(
    () => form.selectedMembers.filter(Boolean).sort((left, right) => left.localeCompare(right)),
    [form.selectedMembers],
  );

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Bonding Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces bonding` for link aggregation and active/standby uplinks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New Bond
            </Button>
            <PageGuideDialog guide={pageGuides.bondingInterfaces} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Bonds</p>
              <p className="mt-1 text-2xl font-bold">{bonds.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">802.3ad (LACP)</p>
              <p className="mt-1 text-2xl font-bold">{lacpCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Disabled</p>
              <p className="mt-1 text-2xl font-bold">{disabledCount}</p>
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
              <CardTitle>Configured Bonds</CardTitle>
              <CardDescription>Select a bond to edit member links and LACP behavior.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading bonding interfaces...</div>
              ) : bonds.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No bonding interfaces configured.</div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Members</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bonds.map((bond) => (
                        <TableRow key={bond.name}>
                          <TableCell>
                            <div className="font-mono text-xs">{bond.name}</div>
                            {bond.description && (
                              <div className="mt-1 text-xs text-muted-foreground">{bond.description}</div>
                            )}
                          </TableCell>
                          <TableCell>{bond.mode || "-"}</TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs">
                              {bond.members.length > 0 ? (
                                bond.members.slice(0, 3).map((member) => (
                                  <div key={`${bond.name}-${member}`} className="font-mono">
                                    {member}
                                  </div>
                                ))
                              ) : (
                                <span className="text-muted-foreground">No members</span>
                              )}
                              {bond.members.length > 3 && (
                                <Badge variant="outline">+{bond.members.length - 3} more</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={bond.disable ? "secondary" : "default"}>
                              {bond.disable ? "Disabled" : "Enabled"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editBond(bond)} disabled={saving}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteBond(bond.name)}
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create Bonding Interface"}</CardTitle>
              <CardDescription>
                Choose member links, mode, and LACP/hash behavior. Interface name is immutable after create.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="bond0"
                  disabled={saving || Boolean(editingName)}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Core uplink aggregate"
                  disabled={saving}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select
                    value={form.mode || "802.3ad"}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, mode: value }))}
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BONDING_MODE_OPTIONS.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Hash Policy</Label>
                  <Select
                    value={form.hashPolicy || HASH_POLICY_OPTIONS[0]}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, hashPolicy: value }))}
                    disabled={saving || hashPolicyDisabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HASH_POLICY_OPTIONS.map((policy) => (
                        <SelectItem key={policy} value={policy}>
                          {policy}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>LACP Rate</Label>
                  <Select
                    value={form.lacpRate || LACP_RATE_OPTIONS[1]}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, lacpRate: value }))}
                    disabled={saving || lacpFieldsDisabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LACP_RATE_OPTIONS.map((rate) => (
                        <SelectItem key={rate} value={rate}>
                          {rate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Min Links</Label>
                  <Input
                    value={form.minLinks}
                    onChange={(event) => setForm((prev) => ({ ...prev, minLinks: event.target.value }))}
                    placeholder="1"
                    disabled={saving || lacpFieldsDisabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Primary Member</Label>
                  <Select
                    value={form.primary || "none"}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, primary: value === "none" ? "" : value }))}
                    disabled={saving || primaryOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {primaryOptions.map((member) => (
                        <SelectItem key={member} value={member}>
                          {member}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Member Interfaces</Label>
                {interfaceChoices.length === 0 ? (
                  <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                    No ethernet interfaces discovered yet. Use additional members below.
                  </div>
                ) : (
                  <div className="grid gap-2 rounded-md border p-3 md:grid-cols-2">
                    {interfaceChoices.map((choice) => {
                      const checked = form.selectedMembers.includes(choice.name);
                      return (
                        <label key={choice.name} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                              const value = Boolean(nextChecked);
                              setForm((previous) => {
                                const nextSet = new Set(previous.selectedMembers);
                                if (value) nextSet.add(choice.name);
                                else nextSet.delete(choice.name);
                                return { ...previous, selectedMembers: Array.from(nextSet).sort((a, b) => a.localeCompare(b)) };
                              });
                            }}
                            disabled={saving}
                          />
                          <span>{choice.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Additional Members (comma or newline separated)</Label>
                <Input
                  value={form.extraMembersText}
                  onChange={(event) => setForm((prev) => ({ ...prev, extraMembersText: event.target.value }))}
                  placeholder="eth8, eth9"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>Addresses (one CIDR per line)</Label>
                <Textarea
                  value={form.addressesText}
                  onChange={(event) => setForm((prev) => ({ ...prev, addressesText: event.target.value }))}
                  placeholder={"10.10.0.1/24\n2001:db8:10::1/64"}
                  className="min-h-[96px] font-mono text-xs"
                  disabled={saving}
                />
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

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>MAC</Label>
                  <Input
                    value={form.mac}
                    onChange={(event) => setForm((prev) => ({ ...prev, mac: event.target.value }))}
                    placeholder="02:00:00:00:10:10"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>System MAC</Label>
                  <Input
                    value={form.systemMac}
                    onChange={(event) => setForm((prev) => ({ ...prev, systemMac: event.target.value }))}
                    placeholder="02:00:00:00:20:20"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>System Priority</Label>
                  <Input
                    value={form.systemPriority}
                    onChange={(event) => setForm((prev) => ({ ...prev, systemPriority: event.target.value }))}
                    placeholder="32768"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.allMembersActive}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, allMembersActive: Boolean(checked) }))}
                    disabled={saving}
                  />
                  Receive on all members (`all-members-active`)
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
                <Button onClick={saveBond} disabled={saving}>
                  {saving ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Bond
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

