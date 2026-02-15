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
  bridgeInterfaceService,
  type BridgeInterfaceConfig,
  type BridgeMember,
} from "@/lib/api/bridge-interface";
import { ethernetService } from "@/lib/api/ethernet";
import type { EthernetInterface } from "@/lib/api/types/ethernet";
import { pageGuides } from "@/lib/help/pageGuides";
import { formatInterfaceDisplayName } from "@/lib/utils";

interface InterfaceChoice {
  name: string;
  label: string;
}

interface BridgeFormState {
  name: string;
  description: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  aging: string;
  protocol: string;
  disable: boolean;
  enableVlan: boolean;
  igmpSnooping: boolean;
  igmpQuerier: boolean;
  stpEnabled: boolean;
  stpPriority: string;
  stpHelloTime: string;
  stpMaxAge: string;
  stpForwardDelay: string;
  selectedMembers: string[];
  memberOverrides: Record<string, { cost: string; priority: string }>;
  extraMembersText: string;
}

const EMPTY_FORM: BridgeFormState = {
  name: "",
  description: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  aging: "",
  protocol: "",
  disable: false,
  enableVlan: false,
  igmpSnooping: false,
  igmpQuerier: false,
  stpEnabled: false,
  stpPriority: "",
  stpHelloTime: "",
  stpMaxAge: "",
  stpForwardDelay: "",
  selectedMembers: [],
  memberOverrides: {},
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

function getInterfaceChoices(interfaces: EthernetInterface[]): InterfaceChoice[] {
  return interfaces
    .map((iface) => ({
      name: iface.name,
      label: formatInterfaceDisplayName(iface.name, iface.description ?? null),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function toFormState(value: BridgeInterfaceConfig, choices: InterfaceChoice[]): BridgeFormState {
  const known = new Set(choices.map((choice) => choice.name));
  const selectedMembers: string[] = [];
  const extraMembers: string[] = [];
  const memberOverrides: Record<string, { cost: string; priority: string }> = {};

  for (const member of value.members) {
    memberOverrides[member.interfaceName] = {
      cost: member.cost,
      priority: member.priority,
    };
    if (known.has(member.interfaceName)) {
      selectedMembers.push(member.interfaceName);
    } else {
      extraMembers.push(member.interfaceName);
    }
  }

  selectedMembers.sort((left, right) => left.localeCompare(right));
  extraMembers.sort((left, right) => left.localeCompare(right));

  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    aging: value.aging,
    protocol: value.protocol,
    disable: value.disable,
    enableVlan: value.enableVlan,
    igmpSnooping: value.igmpSnooping,
    igmpQuerier: value.igmpQuerier,
    stpEnabled: value.stpEnabled,
    stpPriority: value.stpPriority,
    stpHelloTime: value.stpHelloTime,
    stpMaxAge: value.stpMaxAge,
    stpForwardDelay: value.stpForwardDelay,
    selectedMembers,
    memberOverrides,
    extraMembersText: extraMembers.join(", "),
  };
}

function buildDesiredMembers(form: BridgeFormState): BridgeMember[] {
  const extraMembers = parseMembersText(form.extraMembersText);
  const names = uniqueNonEmpty([...form.selectedMembers, ...extraMembers]).sort((left, right) =>
    left.localeCompare(right),
  );
  return names.map((name) => {
    const override = form.memberOverrides[name] || { cost: "", priority: "" };
    return {
      interfaceName: name,
      cost: override.cost.trim(),
      priority: override.priority.trim(),
    };
  });
}

function buildBridgeOperations(candidate: BridgeFormState, current: BridgeInterfaceConfig | null): string[] {
  const operations: string[] = [];
  const base = `interfaces bridge ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      addresses: [],
      mtu: "",
      vrf: "",
      disable: false,
      aging: "",
      protocol: "",
      enableVlan: false,
      igmpSnooping: false,
      igmpQuerier: false,
      stpEnabled: false,
      stpPriority: "",
      stpHelloTime: "",
      stpMaxAge: "",
      stpForwardDelay: "",
      members: [],
    } satisfies BridgeInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);
  syncScalar(operations, base, "aging", candidate.aging.trim(), currentSafe.aging);
  syncScalar(operations, base, "protocol", candidate.protocol.trim(), currentSafe.protocol);

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
  if (candidate.enableVlan !== currentSafe.enableVlan) {
    operations.push(candidate.enableVlan ? `set ${base} enable-vlan` : `delete ${base} enable-vlan`);
  }
  if (candidate.igmpSnooping !== currentSafe.igmpSnooping) {
    operations.push(candidate.igmpSnooping ? `set ${base} igmp snooping` : `delete ${base} igmp snooping`);
  }
  if (candidate.igmpQuerier !== currentSafe.igmpQuerier) {
    operations.push(candidate.igmpQuerier ? `set ${base} igmp querier` : `delete ${base} igmp querier`);
  }

  if (candidate.stpEnabled !== currentSafe.stpEnabled) {
    operations.push(candidate.stpEnabled ? `set ${base} stp` : `delete ${base} stp`);
  }
  if (candidate.stpEnabled) {
    const currentPriority = currentSafe.stpEnabled ? currentSafe.stpPriority : "";
    const currentHello = currentSafe.stpEnabled ? currentSafe.stpHelloTime : "";
    const currentMaxAge = currentSafe.stpEnabled ? currentSafe.stpMaxAge : "";
    const currentForwardDelay = currentSafe.stpEnabled ? currentSafe.stpForwardDelay : "";
    syncScalar(operations, base, "stp priority", candidate.stpPriority.trim(), currentPriority);
    syncScalar(operations, base, "stp hello-time", candidate.stpHelloTime.trim(), currentHello);
    syncScalar(operations, base, "stp max-age", candidate.stpMaxAge.trim(), currentMaxAge);
    syncScalar(
      operations,
      base,
      "stp forward-delay",
      candidate.stpForwardDelay.trim(),
      currentForwardDelay,
    );
  }

  const desiredMembers = buildDesiredMembers(candidate);
  const currentMemberMap = new Map(currentSafe.members.map((member) => [member.interfaceName, member]));
  const desiredMemberMap = new Map(desiredMembers.map((member) => [member.interfaceName, member]));

  for (const currentName of currentMemberMap.keys()) {
    if (!desiredMemberMap.has(currentName)) {
      operations.push(`delete ${base} member interface ${quoteCliValue(currentName)}`);
    }
  }
  for (const desiredMember of desiredMembers) {
    const existing = currentMemberMap.get(desiredMember.interfaceName);
    if (!existing) {
      operations.push(`set ${base} member interface ${quoteCliValue(desiredMember.interfaceName)}`);
    }

    const currentCost = existing?.cost?.trim() || "";
    const currentPriority = existing?.priority?.trim() || "";
    if (desiredMember.cost !== currentCost) {
      if (desiredMember.cost) {
        operations.push(
          `set ${base} member interface ${quoteCliValue(desiredMember.interfaceName)} cost ${quoteCliValue(desiredMember.cost)}`,
        );
      } else {
        operations.push(
          `delete ${base} member interface ${quoteCliValue(desiredMember.interfaceName)} cost`,
        );
      }
    }
    if (desiredMember.priority !== currentPriority) {
      if (desiredMember.priority) {
        operations.push(
          `set ${base} member interface ${quoteCliValue(desiredMember.interfaceName)} priority ${quoteCliValue(desiredMember.priority)}`,
        );
      } else {
        operations.push(
          `delete ${base} member interface ${quoteCliValue(desiredMember.interfaceName)} priority`,
        );
      }
    }
  }

  return operations;
}

export default function BridgeInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [bridges, setBridges] = useState<BridgeInterfaceConfig[]>([]);
  const [interfaceChoices, setInterfaceChoices] = useState<InterfaceChoice[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<BridgeFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const [bridgeConfig, ethernetConfig] = await Promise.all([
        bridgeInterfaceService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] as EthernetInterface[] })),
      ]);
      setBridges(bridgeConfig.bridges);
      setInterfaceChoices(getInterfaceChoices(ethernetConfig.interfaces || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bridge interfaces.");
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

  const editBridge = (value: BridgeInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value, interfaceChoices));
    setError(null);
    setSuccess(null);
  };

  const deleteBridge = async (name: string) => {
    if (!window.confirm(`Delete bridge interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await bridgeInterfaceService.batchConfigure([`delete interfaces bridge ${quoteCliValue(name)}`]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected bridge interface deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`Bridge '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete bridge interface.");
    } finally {
      setSaving(false);
    }
  };

  const saveBridge = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Bridge interface name is required.");
      return;
    }
    if (editingName && editingName !== name) {
      setError("Renaming bridge interfaces is not supported. Create a new bridge and delete the old one.");
      return;
    }

    const desiredMembers = buildDesiredMembers(form);
    if (desiredMembers.length === 0) {
      setError("Select at least one member interface.");
      return;
    }

    const numericFields = [
      { label: "Aging", value: form.aging },
      { label: "STP Priority", value: form.stpPriority },
      { label: "STP Hello Time", value: form.stpHelloTime },
      { label: "STP Max Age", value: form.stpMaxAge },
      { label: "STP Forward Delay", value: form.stpForwardDelay },
    ];
    for (const field of numericFields) {
      const trimmed = field.value.trim();
      if (!trimmed) continue;
      if (!/^\d+$/.test(trimmed)) {
        setError(`${field.label} must be a whole number.`);
        return;
      }
    }
    for (const member of desiredMembers) {
      if (member.cost && !/^\d+$/.test(member.cost)) {
        setError(`Member cost must be a whole number (${member.interfaceName}).`);
        return;
      }
      if (member.priority && !/^\d+$/.test(member.priority)) {
        setError(`Member priority must be a whole number (${member.interfaceName}).`);
        return;
      }
    }

    const current = bridges.find((bridge) => bridge.name === name) || null;
    const operations = buildBridgeOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await bridgeInterfaceService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected bridge interface update.");
      }
      await loadData(true);
      setSuccess(current ? `Bridge '${name}' updated.` : `Bridge '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bridge interface.");
    } finally {
      setSaving(false);
    }
  };

  const stpCount = useMemo(() => bridges.filter((bridge) => bridge.stpEnabled).length, [bridges]);
  const disabledCount = useMemo(() => bridges.filter((bridge) => bridge.disable).length, [bridges]);
  const selectedMembers = useMemo(
    () => [...form.selectedMembers].sort((left, right) => left.localeCompare(right)),
    [form.selectedMembers],
  );

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Bridge Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces bridge` domains with member ports, STP options, and VLAN behavior.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New Bridge
            </Button>
            <PageGuideDialog guide={pageGuides.bridgeInterfaces} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Bridges</p>
              <p className="mt-1 text-2xl font-bold">{bridges.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">STP Enabled</p>
              <p className="mt-1 text-2xl font-bold">{stpCount}</p>
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
              <CardTitle>Configured Bridges</CardTitle>
              <CardDescription>Select a bridge to edit member ports and STP timers.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading bridge interfaces...</div>
              ) : bridges.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No bridge interfaces configured.</div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Members</TableHead>
                        <TableHead>STP</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bridges.map((bridge) => (
                        <TableRow key={bridge.name}>
                          <TableCell>
                            <div className="font-mono text-xs">{bridge.name}</div>
                            {bridge.description && (
                              <div className="mt-1 text-xs text-muted-foreground">{bridge.description}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{bridge.members.length}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={bridge.stpEnabled ? "default" : "secondary"}>
                              {bridge.stpEnabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={bridge.disable ? "secondary" : "default"}>
                              {bridge.disable ? "Disabled" : "Enabled"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editBridge(bridge)} disabled={saving}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteBridge(bridge.name)}
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create Bridge Interface"}</CardTitle>
              <CardDescription>
                Build bridge domains, assign member ports, and tune spanning-tree behavior.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="br0"
                  disabled={saving || Boolean(editingName)}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="LAN bridge domain"
                  disabled={saving}
                />
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
                              const enabled = Boolean(nextChecked);
                              setForm((previous) => {
                                const nextSet = new Set(previous.selectedMembers);
                                if (enabled) nextSet.add(choice.name);
                                else nextSet.delete(choice.name);
                                return {
                                  ...previous,
                                  selectedMembers: Array.from(nextSet).sort((a, b) => a.localeCompare(b)),
                                };
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

              {selectedMembers.length > 0 && (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm font-medium">Per-Port Options</p>
                  {selectedMembers.map((memberName) => {
                    const override = form.memberOverrides[memberName] || { cost: "", priority: "" };
                    return (
                      <div key={memberName} className="grid gap-3 md:grid-cols-3">
                        <div className="text-sm">
                          <span className="font-mono">{memberName}</span>
                        </div>
                        <Input
                          value={override.cost}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              memberOverrides: {
                                ...previous.memberOverrides,
                                [memberName]: {
                                  cost: event.target.value,
                                  priority: previous.memberOverrides[memberName]?.priority || "",
                                },
                              },
                            }))
                          }
                          placeholder="Cost"
                          disabled={saving}
                        />
                        <Input
                          value={override.priority}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              memberOverrides: {
                                ...previous.memberOverrides,
                                [memberName]: {
                                  cost: previous.memberOverrides[memberName]?.cost || "",
                                  priority: event.target.value,
                                },
                              },
                            }))
                          }
                          placeholder="Priority"
                          disabled={saving}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2">
                <Label>Addresses (one CIDR per line)</Label>
                <Textarea
                  value={form.addressesText}
                  onChange={(event) => setForm((prev) => ({ ...prev, addressesText: event.target.value }))}
                  placeholder={"192.168.50.1/24\n2001:db8:50::1/64"}
                  className="min-h-[90px] font-mono text-xs"
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

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Aging</Label>
                  <Input
                    value={form.aging}
                    onChange={(event) => setForm((prev) => ({ ...prev, aging: event.target.value }))}
                    placeholder="300"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Protocol</Label>
                  <Select
                    value={form.protocol || "none"}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, protocol: value === "none" ? "" : value }))}
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      <SelectItem value="802.1q">802.1q</SelectItem>
                      <SelectItem value="802.1ad">802.1ad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.enableVlan}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enableVlan: Boolean(checked) }))}
                    disabled={saving}
                  />
                  Enable VLAN filtering
                </label>
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
                    checked={form.igmpSnooping}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, igmpSnooping: Boolean(checked) }))}
                    disabled={saving}
                  />
                  IGMP Snooping
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.igmpQuerier}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, igmpQuerier: Boolean(checked) }))}
                    disabled={saving}
                  />
                  IGMP Querier
                </label>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.stpEnabled}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, stpEnabled: Boolean(checked) }))}
                    disabled={saving}
                  />
                  Enable STP
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={form.stpPriority}
                    onChange={(event) => setForm((prev) => ({ ...prev, stpPriority: event.target.value }))}
                    placeholder="STP priority"
                    disabled={saving || !form.stpEnabled}
                  />
                  <Input
                    value={form.stpHelloTime}
                    onChange={(event) => setForm((prev) => ({ ...prev, stpHelloTime: event.target.value }))}
                    placeholder="Hello time"
                    disabled={saving || !form.stpEnabled}
                  />
                  <Input
                    value={form.stpMaxAge}
                    onChange={(event) => setForm((prev) => ({ ...prev, stpMaxAge: event.target.value }))}
                    placeholder="Max age"
                    disabled={saving || !form.stpEnabled}
                  />
                  <Input
                    value={form.stpForwardDelay}
                    onChange={(event) => setForm((prev) => ({ ...prev, stpForwardDelay: event.target.value }))}
                    placeholder="Forward delay"
                    disabled={saving || !form.stpEnabled}
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button onClick={saveBridge} disabled={saving}>
                  {saving ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Bridge
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

