"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { highAvailabilityApi } from "@/lib/api/high-availability";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";

type VrrpGroup = {
  name: string;
  interface: string;
  vrid: string;
  priority: string;
  advertiseInterval: string;
  preempt: boolean;
  virtualAddresses: string[];
};

type SyncGroup = {
  name: string;
  members: string[];
};

const EMPTY_VRRP_DRAFT: VrrpGroup = {
  name: "",
  interface: "",
  vrid: "",
  priority: "",
  advertiseInterval: "",
  preempt: false,
  virtualAddresses: [],
};

const EMPTY_SYNC_DRAFT: SyncGroup = {
  name: "",
  members: [],
};

function normalizeText(value: string): string {
  return value.trim();
}

function uniqueList(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = normalizeText(value);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function parseCsvList(value: string): string[] {
  return uniqueList(value.split(",").map((item) => item.trim()));
}

function serializeCsvList(values: string[]): string {
  return uniqueList(values).join(", ");
}

function arrayEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function groupEqual(left: VrrpGroup, right: VrrpGroup): boolean {
  return (
    left.name === right.name &&
    left.interface === right.interface &&
    left.vrid === right.vrid &&
    left.priority === right.priority &&
    left.advertiseInterval === right.advertiseInterval &&
    left.preempt === right.preempt &&
    arrayEquals([...left.virtualAddresses].sort(), [...right.virtualAddresses].sort())
  );
}

function syncGroupEqual(left: SyncGroup, right: SyncGroup): boolean {
  return left.name === right.name && arrayEquals([...left.members].sort(), [...right.members].sort());
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export default function HighAvailabilityPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.NETWORK);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [groups, setGroups] = useState<VrrpGroup[]>([]);
  const [syncGroups, setSyncGroups] = useState<SyncGroup[]>([]);

  const [currentGroups, setCurrentGroups] = useState<VrrpGroup[]>([]);
  const [currentSyncGroups, setCurrentSyncGroups] = useState<SyncGroup[]>([]);

  const [groupDraft, setGroupDraft] = useState<VrrpGroup>(EMPTY_VRRP_DRAFT);
  const [groupAddressesInput, setGroupAddressesInput] = useState("");
  const [syncDraft, setSyncDraft] = useState<SyncGroup>(EMPTY_SYNC_DRAFT);
  const [syncMembersInput, setSyncMembersInput] = useState("");

  const [interfaceOptions, setInterfaceOptions] = useState<Array<{ value: string; label: string }>>([]);

  const interfaceLabelByName = useMemo(
    () =>
      interfaceOptions.reduce<Record<string, string>>((acc, item) => {
        acc[item.value] = item.label;
        return acc;
      }, {}),
    [interfaceOptions]
  );

  const groupNames = useMemo(
    () => groups.map((group) => group.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [groups]
  );

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const [config, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        highAvailabilityApi.getConfig<Record<string, unknown>>(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const vrrp = asObject(asObject(config.vrrp));
      const groupRoot = asObject(vrrp.group);
      const syncRoot = asObject(vrrp["sync-group"]);

      const parsedGroups: VrrpGroup[] = Object.entries(groupRoot)
        .map(([name, value]) => {
          const root = asObject(value);
          return {
            name: normalizeText(name),
            interface: normalizeText(String(root.interface ?? "")),
            vrid: normalizeText(String(root.vrid ?? "")),
            priority: normalizeText(String(root.priority ?? "")),
            advertiseInterval: normalizeText(String(root["advertise-interval"] ?? "")),
            preempt: Object.prototype.hasOwnProperty.call(root, "preempt"),
            virtualAddresses: Object.keys(asObject(root["virtual-address"])).map((item) => normalizeText(item)),
          };
        })
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const parsedSyncGroups: SyncGroup[] = Object.entries(syncRoot)
        .map(([name, value]) => {
          const root = asObject(value);
          return {
            name: normalizeText(name),
            members: Object.keys(asObject(root.member)).map((item) => normalizeText(item)),
          };
        })
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const interfaceNames = new Set<string>();
      const descriptionByName = ethernetConfig.interfaces.reduce<Record<string, string | null>>(
        (acc, iface) => {
          acc[iface.name] = iface.description ?? null;
          return acc;
        },
        {}
      );
      ethernetConfig.interfaces.forEach((iface) => interfaceNames.add(iface.name));
      physicalConfig.interfaces.forEach((iface) => interfaceNames.add(iface.interface));
      allInterfacesConfig.interfaces.forEach((iface) => interfaceNames.add(iface.name));
      parsedGroups.forEach((group) => {
        if (group.interface) interfaceNames.add(group.interface);
      });

      const normalizedInterfaces = [...interfaceNames]
        .filter((name) => name !== "lo")
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setInterfaceOptions(normalizedInterfaces);
      setGroups(parsedGroups);
      setSyncGroups(parsedSyncGroups);
      setCurrentGroups(parsedGroups);
      setCurrentSyncGroups(parsedSyncGroups);

      setGroupDraft({ ...EMPTY_VRRP_DRAFT, interface: normalizedInterfaces[0]?.value || "" });
      setGroupAddressesInput("");
      setSyncDraft(EMPTY_SYNC_DRAFT);
      setSyncMembersInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load high-availability configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const addGroup = () => {
    setError(null);

    const entry: VrrpGroup = {
      name: normalizeText(groupDraft.name),
      interface: normalizeText(groupDraft.interface),
      vrid: normalizeText(groupDraft.vrid),
      priority: normalizeText(groupDraft.priority),
      advertiseInterval: normalizeText(groupDraft.advertiseInterval),
      preempt: Boolean(groupDraft.preempt),
      virtualAddresses: parseCsvList(groupAddressesInput),
    };

    if (!entry.name || !entry.interface || !entry.vrid) {
      setError("VRRP group requires name, interface, and VRID.");
      return;
    }

    if (groups.some((item) => item.name === entry.name)) {
      setError("VRRP group name already exists.");
      return;
    }

    setGroups((previous) =>
      [...previous, entry].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    );

    setGroupDraft({ ...EMPTY_VRRP_DRAFT, interface: interfaceOptions[0]?.value || "" });
    setGroupAddressesInput("");
  };

  const removeGroup = (name: string) => {
    setGroups((previous) => previous.filter((group) => group.name !== name));
    setSyncGroups((previous) =>
      previous
        .map((entry) => ({ ...entry, members: entry.members.filter((member) => member !== name) }))
        .filter((entry) => entry.members.length > 0)
    );
  };

  const addSyncGroup = () => {
    setError(null);

    const entry: SyncGroup = {
      name: normalizeText(syncDraft.name),
      members: parseCsvList(syncMembersInput),
    };

    if (!entry.name) {
      setError("Sync-group name is required.");
      return;
    }

    if (entry.members.length === 0) {
      setError("Sync-group requires at least one member VRRP group.");
      return;
    }

    if (syncGroups.some((item) => item.name === entry.name)) {
      setError("Sync-group already exists.");
      return;
    }

    setSyncGroups((previous) =>
      [...previous, entry].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    );

    setSyncDraft(EMPTY_SYNC_DRAFT);
    setSyncMembersInput("");
  };

  const removeSyncGroup = (name: string) => {
    setSyncGroups((previous) => previous.filter((entry) => entry.name !== name));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const currentGroupMap = new Map(currentGroups.map((entry) => [entry.name, entry]));
      const desiredGroupMap = new Map(groups.map((entry) => [entry.name, entry]));

      for (const [name] of currentGroupMap.entries()) {
        if (!desiredGroupMap.has(name)) {
          operations.push(`delete high-availability vrrp group ${name}`);
        }
      }

      for (const [name, desired] of desiredGroupMap.entries()) {
        const current = currentGroupMap.get(name);
        if (current && groupEqual(current, desired)) {
          continue;
        }

        operations.push(`set high-availability vrrp group ${name} interface ${desired.interface}`);
        operations.push(`set high-availability vrrp group ${name} vrid ${desired.vrid}`);

        if (desired.priority) {
          operations.push(`set high-availability vrrp group ${name} priority ${desired.priority}`);
        } else if (current?.priority) {
          operations.push(`delete high-availability vrrp group ${name} priority`);
        }

        if (desired.advertiseInterval) {
          operations.push(
            `set high-availability vrrp group ${name} advertise-interval ${desired.advertiseInterval}`
          );
        } else if (current?.advertiseInterval) {
          operations.push(`delete high-availability vrrp group ${name} advertise-interval`);
        }

        if (desired.preempt) {
          operations.push(`set high-availability vrrp group ${name} preempt`);
        } else if (current?.preempt) {
          operations.push(`delete high-availability vrrp group ${name} preempt`);
        }

        const currentAddresses = uniqueList(current?.virtualAddresses || []);
        const desiredAddresses = uniqueList(desired.virtualAddresses);

        for (const address of currentAddresses) {
          if (!desiredAddresses.includes(address)) {
            operations.push(`delete high-availability vrrp group ${name} virtual-address ${address}`);
          }
        }

        for (const address of desiredAddresses) {
          if (!currentAddresses.includes(address)) {
            operations.push(`set high-availability vrrp group ${name} virtual-address ${address}`);
          }
        }
      }

      const currentSyncMap = new Map(currentSyncGroups.map((entry) => [entry.name, entry]));
      const desiredSyncMap = new Map(syncGroups.map((entry) => [entry.name, entry]));

      for (const [name] of currentSyncMap.entries()) {
        if (!desiredSyncMap.has(name)) {
          operations.push(`delete high-availability vrrp sync-group ${name}`);
        }
      }

      for (const [name, desired] of desiredSyncMap.entries()) {
        const current = currentSyncMap.get(name);
        if (current && syncGroupEqual(current, desired)) {
          continue;
        }

        const currentMembers = uniqueList(current?.members || []);
        const desiredMembers = uniqueList(desired.members);

        for (const member of currentMembers) {
          if (!desiredMembers.includes(member)) {
            operations.push(`delete high-availability vrrp sync-group ${name} member ${member}`);
          }
        }

        for (const member of desiredMembers) {
          if (!currentMembers.includes(member)) {
            operations.push(`set high-availability vrrp sync-group ${name} member ${member}`);
          }
        }
      }

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await highAvailabilityApi.configure(operations);
      if (!result.success) {
        throw new Error(result.error || "Failed to save high-availability configuration");
      }

      setMessage("High-availability configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save high-availability configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">High Availability</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure VRRP groups and sync-groups for active/standby high-availability designs.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {message && (
          <Card className="border-primary/40">
            <CardContent className="pt-6 text-sm text-primary">{message}</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>VRRP Groups</CardTitle>
            <CardDescription>
              Define interface ownership, VRID, priority, and virtual IP addresses for each group.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-6">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={groupDraft.name}
                  onChange={(event) => setGroupDraft((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="WAN"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Interface</Label>
                <Select
                  value={groupDraft.interface || ""}
                  onValueChange={(value) => setGroupDraft((previous) => ({ ...previous, interface: value }))}
                  disabled={!canEdit || interfaceOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select interface" />
                  </SelectTrigger>
                  <SelectContent>
                    {interfaceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>VRID</Label>
                <Input
                  value={groupDraft.vrid}
                  onChange={(event) => setGroupDraft((previous) => ({ ...previous, vrid: event.target.value }))}
                  placeholder="10"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  value={groupDraft.priority}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({ ...previous, priority: event.target.value }))
                  }
                  placeholder="150"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Advertise Interval</Label>
                <Input
                  value={groupDraft.advertiseInterval}
                  onChange={(event) =>
                    setGroupDraft((previous) => ({ ...previous, advertiseInterval: event.target.value }))
                  }
                  placeholder="1"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Virtual Addresses</Label>
                <Input
                  value={groupAddressesInput}
                  onChange={(event) => setGroupAddressesInput(event.target.value)}
                  placeholder="192.0.2.10/24, 192.0.2.11/24"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="vrrp-preempt"
                  checked={groupDraft.preempt}
                  onCheckedChange={(checked) =>
                    setGroupDraft((previous) => ({ ...previous, preempt: Boolean(checked) }))
                  }
                  disabled={!canEdit}
                />
                <Label htmlFor="vrrp-preempt">Preempt</Label>
              </div>

              <Button type="button" variant="outline" onClick={addGroup} disabled={!canEdit}>
                <Plus className="mr-2 h-4 w-4" />
                Add VRRP Group
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>VRID</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Advertise</TableHead>
                  <TableHead>Virtual Addresses</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No VRRP groups configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{entry.name}</Badge>
                          {entry.preempt && <Badge variant="outline">Preempt</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                      <TableCell>{entry.vrid}</TableCell>
                      <TableCell>{entry.priority || "-"}</TableCell>
                      <TableCell>{entry.advertiseInterval || "-"}</TableCell>
                      <TableCell>{serializeCsvList(entry.virtualAddresses) || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeGroup(entry.name)}
                          disabled={!canEdit}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sync Groups</CardTitle>
            <CardDescription>Group multiple VRRP groups for synchronized failover behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={syncDraft.name}
                  onChange={(event) => setSyncDraft((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="WAN-SYNC"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Members</Label>
                <Input
                  value={syncMembersInput}
                  onChange={(event) => setSyncMembersInput(event.target.value)}
                  placeholder="WAN, LAN"
                  disabled={!canEdit}
                />
              </div>
            </div>

            {groupNames.length > 0 && (
              <p className="text-xs text-muted-foreground">Available VRRP groups: {groupNames.join(", ")}</p>
            )}

            <Button type="button" variant="outline" onClick={addSyncGroup} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Add Sync Group
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No sync-groups configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  syncGroups.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell>{serializeCsvList(entry.members)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSyncGroup(entry.name)}
                          disabled={!canEdit}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
