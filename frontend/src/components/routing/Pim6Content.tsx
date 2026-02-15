"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
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
import { pim6Service } from "@/lib/api/pim6";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";

type InterfaceOption = {
  value: string;
  label: string;
};

type Pim6InterfaceEntry = {
  interface: string;
  mldDisable: boolean;
  mldInterval: string;
  mldLastMemberQueryCount: string;
  mldLastMemberQueryInterval: string;
  mldMaxResponseTime: string;
  mldVersion: string;
};

type Pim6JoinEntry = {
  interface: string;
  group: string;
  source: string;
};

type Pim6State = {
  interfaces: Pim6InterfaceEntry[];
  joins: Pim6JoinEntry[];
};

const EMPTY_INTERFACE: Pim6InterfaceEntry = {
  interface: "",
  mldDisable: false,
  mldInterval: "",
  mldLastMemberQueryCount: "",
  mldLastMemberQueryInterval: "",
  mldMaxResponseTime: "",
  mldVersion: "",
};

const EMPTY_JOIN: Pim6JoinEntry = {
  interface: "",
  group: "",
  source: "",
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseDirectOrKey(value: unknown): string {
  const direct = asString(value);
  if (direct) {
    return direct;
  }
  const root = asObject(value);
  const first = Object.keys(root)[0];
  return first || "";
}

function parseInterfaces(root: Record<string, unknown>): Pim6InterfaceEntry[] {
  const rows: Pim6InterfaceEntry[] = [];
  const interfaceRoot = asObject(root.interface);

  for (const [iface, ifaceConfig] of Object.entries(interfaceRoot)) {
    const mld = asObject(asObject(ifaceConfig).mld);
    rows.push({
      interface: iface,
      mldDisable: Object.prototype.hasOwnProperty.call(mld, "disable"),
      mldInterval: asString(mld.interval),
      mldLastMemberQueryCount: asString(
        mld["last-member-query-count"] ?? mld.last_member_query_count
      ),
      mldLastMemberQueryInterval: asString(
        mld["last-member-query-interval"] ?? mld.last_member_query_interval
      ),
      mldMaxResponseTime: asString(mld["max-response-time"] ?? mld.max_response_time),
      mldVersion: parseDirectOrKey(mld.version),
    });
  }

  return rows.sort((left, right) =>
    left.interface.localeCompare(right.interface, undefined, { numeric: true })
  );
}

function parseJoins(root: Record<string, unknown>): Pim6JoinEntry[] {
  const rows: Pim6JoinEntry[] = [];
  const interfaceRoot = asObject(root.interface);

  for (const [iface, ifaceConfig] of Object.entries(interfaceRoot)) {
    const joinRoot = asObject(asObject(asObject(ifaceConfig).mld).join);
    for (const [group, joinConfig] of Object.entries(joinRoot)) {
      rows.push({
        interface: iface,
        group,
        source: asString(asObject(joinConfig).source),
      });
    }
  }

  return rows.sort((left, right) => {
    const ifaceOrder = left.interface.localeCompare(right.interface, undefined, { numeric: true });
    if (ifaceOrder !== 0) return ifaceOrder;
    return left.group.localeCompare(right.group, undefined, { numeric: true });
  });
}

function normalizeInterface(entry: Pim6InterfaceEntry): Pim6InterfaceEntry {
  return {
    interface: entry.interface.trim(),
    mldDisable: Boolean(entry.mldDisable),
    mldInterval: entry.mldInterval.trim(),
    mldLastMemberQueryCount: entry.mldLastMemberQueryCount.trim(),
    mldLastMemberQueryInterval: entry.mldLastMemberQueryInterval.trim(),
    mldMaxResponseTime: entry.mldMaxResponseTime.trim(),
    mldVersion: entry.mldVersion.trim(),
  };
}

function normalizeJoin(entry: Pim6JoinEntry): Pim6JoinEntry {
  return {
    interface: entry.interface.trim(),
    group: entry.group.trim(),
    source: entry.source.trim(),
  };
}

function interfaceEquals(left: Pim6InterfaceEntry, right: Pim6InterfaceEntry): boolean {
  return (
    left.interface === right.interface &&
    left.mldDisable === right.mldDisable &&
    left.mldInterval === right.mldInterval &&
    left.mldLastMemberQueryCount === right.mldLastMemberQueryCount &&
    left.mldLastMemberQueryInterval === right.mldLastMemberQueryInterval &&
    left.mldMaxResponseTime === right.mldMaxResponseTime &&
    left.mldVersion === right.mldVersion
  );
}

function joinKey(entry: Pim6JoinEntry): string {
  return `${entry.interface}|${entry.group}`;
}

function joinEquals(left: Pim6JoinEntry, right: Pim6JoinEntry): boolean {
  return (
    left.interface === right.interface &&
    left.group === right.group &&
    left.source === right.source
  );
}

function interfaceSetCommands(entry: Pim6InterfaceEntry): string[] {
  const iface = entry.interface;
  const base = `protocols pim6 interface ${iface}`;
  const commands: string[] = [`set ${base}`];

  if (entry.mldDisable) {
    commands.push(`set ${base} mld disable`);
  }
  if (entry.mldInterval) {
    commands.push(`set ${base} mld interval ${entry.mldInterval}`);
  }
  if (entry.mldLastMemberQueryCount) {
    commands.push(`set ${base} mld last-member-query-count ${entry.mldLastMemberQueryCount}`);
  }
  if (entry.mldLastMemberQueryInterval) {
    commands.push(
      `set ${base} mld last-member-query-interval ${entry.mldLastMemberQueryInterval}`
    );
  }
  if (entry.mldMaxResponseTime) {
    commands.push(`set ${base} mld max-response-time ${entry.mldMaxResponseTime}`);
  }
  if (entry.mldVersion) {
    commands.push(`set ${base} mld version ${entry.mldVersion}`);
  }

  return commands;
}

function joinSetCommand(entry: Pim6JoinEntry): string {
  if (entry.source) {
    return `set protocols pim6 interface ${entry.interface} mld join ${entry.group} source ${entry.source}`;
  }
  return `set protocols pim6 interface ${entry.interface} mld join ${entry.group}`;
}

export function Pim6Content() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<Pim6State | null>(null);
  const [interfaces, setInterfaces] = useState<Pim6InterfaceEntry[]>([]);
  const [joins, setJoins] = useState<Pim6JoinEntry[]>([]);

  const [interfaceDraft, setInterfaceDraft] = useState<Pim6InterfaceEntry>(EMPTY_INTERFACE);
  const [joinDraft, setJoinDraft] = useState<Pim6JoinEntry>(EMPTY_JOIN);

  const [interfaceOptions, setInterfaceOptions] = useState<InterfaceOption[]>([]);
  const interfaceLabelByName = useMemo(
    () =>
      interfaceOptions.reduce<Record<string, string>>((acc, option) => {
        acc[option.value] = option.label;
        return acc;
      }, {}),
    [interfaceOptions]
  );

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const [pim6Config, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        pim6Service.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const root = asObject((pim6Config as { pim6?: unknown }).pim6);
      const parsedInterfaces = parseInterfaces(root);
      const parsedJoins = parseJoins(root);
      const parsedState: Pim6State = {
        interfaces: parsedInterfaces,
        joins: parsedJoins,
      };

      setCurrentState(parsedState);
      setInterfaces(parsedInterfaces);
      setJoins(parsedJoins);

      const ethernetInterfaces =
        (ethernetConfig as { interfaces?: Array<{ name: string; description?: string | null }> }).interfaces ?? [];
      const descriptionByName = ethernetInterfaces.reduce<Record<string, string | null>>((acc, iface) => {
        acc[iface.name] = iface.description ?? null;
        return acc;
      }, {});

      const names = new Set<string>();
      ethernetInterfaces.forEach((iface) => names.add(iface.name));
      ((physicalConfig as { interfaces?: Array<{ interface: string }> }).interfaces ?? []).forEach((iface) =>
        names.add(iface.interface)
      );
      ((allInterfacesConfig as { interfaces?: Array<{ name: string }> }).interfaces ?? []).forEach((iface) =>
        names.add(iface.name)
      );
      parsedInterfaces.forEach((entry) => names.add(entry.interface));
      parsedJoins.forEach((entry) => names.add(entry.interface));

      const options = [...names]
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setInterfaceOptions(options);
      setInterfaceDraft((prev) => {
        if (prev.interface) return prev;
        return {
          ...prev,
          interface: options[0]?.value || "",
        };
      });
      setJoinDraft((prev) => {
        if (prev.interface) return prev;
        return {
          ...prev,
          interface: options[0]?.value || "",
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PIM6 configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddOrUpdateInterface = () => {
    const normalized = normalizeInterface(interfaceDraft);
    if (!normalized.interface) {
      setError("Interface is required.");
      return;
    }

    setError(null);
    setInterfaces((prev) => {
      const next = [...prev.filter((entry) => entry.interface !== normalized.interface), normalized];
      return next.sort((left, right) =>
        left.interface.localeCompare(right.interface, undefined, { numeric: true })
      );
    });
  };

  const handleEditInterface = (entry: Pim6InterfaceEntry) => {
    setInterfaceDraft(entry);
  };

  const handleDeleteInterface = (entry: Pim6InterfaceEntry) => {
    setInterfaces((prev) => prev.filter((item) => item.interface !== entry.interface));
    setJoins((prev) => prev.filter((join) => join.interface !== entry.interface));
    if (interfaceDraft.interface === entry.interface) {
      setInterfaceDraft(EMPTY_INTERFACE);
    }
  };

  const handleAddJoin = () => {
    const normalized = normalizeJoin(joinDraft);
    if (!normalized.interface) {
      setError("Join interface is required.");
      return;
    }
    if (!normalized.group) {
      setError("Join multicast group is required.");
      return;
    }

    setError(null);
    setJoins((prev) => {
      const next = [...prev.filter((entry) => joinKey(entry) !== joinKey(normalized)), normalized];
      return next.sort((left, right) => {
        const ifaceOrder = left.interface.localeCompare(right.interface, undefined, { numeric: true });
        if (ifaceOrder !== 0) return ifaceOrder;
        return left.group.localeCompare(right.group, undefined, { numeric: true });
      });
    });
  };

  const handleDeleteJoin = (entry: Pim6JoinEntry) => {
    setJoins((prev) => prev.filter((item) => joinKey(item) !== joinKey(entry)));
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const currentInterfaceMap = new Map(
        currentState.interfaces.map((entry) => [entry.interface, normalizeInterface(entry)])
      );
      const desiredInterfaceMap = new Map(
        interfaces
          .map(normalizeInterface)
          .filter((entry) => entry.interface)
          .map((entry) => [entry.interface, entry])
      );
      const joinResyncInterfaces = new Set<string>();

      for (const [iface] of currentInterfaceMap) {
        if (!desiredInterfaceMap.has(iface)) {
          operations.push(`delete protocols pim6 interface ${iface}`);
        }
      }

      for (const [iface, desiredEntry] of desiredInterfaceMap) {
        const currentEntry = currentInterfaceMap.get(iface);
        if (currentEntry && interfaceEquals(currentEntry, desiredEntry)) {
          continue;
        }

        if (currentEntry) {
          operations.push(`delete protocols pim6 interface ${iface}`);
        }
        operations.push(...interfaceSetCommands(desiredEntry));
        joinResyncInterfaces.add(iface);
      }

      const currentJoinMap = new Map(currentState.joins.map((entry) => [joinKey(entry), normalizeJoin(entry)]));
      const desiredJoinMap = new Map(
        joins
          .map(normalizeJoin)
          .filter((entry) => entry.interface && entry.group)
          .map((entry) => [joinKey(entry), entry])
      );

      for (const [key, currentEntry] of currentJoinMap) {
        if (!desiredJoinMap.has(key)) {
          operations.push(`delete protocols pim6 interface ${currentEntry.interface} mld join ${currentEntry.group}`);
        }
      }

      for (const [key, desiredEntry] of desiredJoinMap) {
        const currentEntry = currentJoinMap.get(key);
        const mustResync = joinResyncInterfaces.has(desiredEntry.interface);
        if (!mustResync && currentEntry && joinEquals(currentEntry, desiredEntry)) {
          continue;
        }

        operations.push(joinSetCommand(desiredEntry));
      }

      const finalOperations = [...new Set(operations.map((item) => item.trim()).filter(Boolean))];
      if (finalOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await pim6Service.batchConfigure({ operations: finalOperations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply PIM6 configuration");
      }

      setMessage(`Applied ${finalOperations.length} PIM6 operation${finalOperations.length === 1 ? "" : "s"}.`);
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save PIM6 configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>PIM6</CardTitle>
          <CardDescription>Loading PIM6 configuration...</CardDescription>
        </CardHeader>
        <CardContent>
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>PIM6 (IPv6 Multicast)</CardTitle>
            <CardDescription>
              Configure PIM6 interfaces, MLD timers, and static MLD joins.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <div className="text-sm text-red-500">{error}</div>}
          {message && <div className="text-sm text-emerald-500">{message}</div>}

          <div className="space-y-3">
            <Label className="text-sm font-medium">Interfaces</Label>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Interface</Label>
                <Select
                  value={interfaceDraft.interface || ""}
                  onValueChange={(value) =>
                    setInterfaceDraft((prev) => ({ ...prev, interface: value }))
                  }
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
                <Label>MLD Interval (seconds)</Label>
                <Input
                  value={interfaceDraft.mldInterval}
                  placeholder="125"
                  onChange={(event) =>
                    setInterfaceDraft((prev) => ({ ...prev, mldInterval: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Last Member Query Count</Label>
                <Input
                  value={interfaceDraft.mldLastMemberQueryCount}
                  placeholder="2"
                  onChange={(event) =>
                    setInterfaceDraft((prev) => ({
                      ...prev,
                      mldLastMemberQueryCount: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Last Member Query Interval (ms)</Label>
                <Input
                  value={interfaceDraft.mldLastMemberQueryInterval}
                  placeholder="1000"
                  onChange={(event) =>
                    setInterfaceDraft((prev) => ({
                      ...prev,
                      mldLastMemberQueryInterval: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>MLD Max Response Time (ms)</Label>
                <Input
                  value={interfaceDraft.mldMaxResponseTime}
                  placeholder="10000"
                  onChange={(event) =>
                    setInterfaceDraft((prev) => ({
                      ...prev,
                      mldMaxResponseTime: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>MLD Version</Label>
                <Select
                  value={interfaceDraft.mldVersion || ""}
                  onValueChange={(value) =>
                    setInterfaceDraft((prev) => ({ ...prev, mldVersion: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">v1</SelectItem>
                    <SelectItem value="2">v2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={interfaceDraft.mldDisable}
                onCheckedChange={(value) =>
                  setInterfaceDraft((prev) => ({ ...prev, mldDisable: Boolean(value) }))
                }
              />
              Disable MLD on interface
            </label>

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={handleAddOrUpdateInterface}>
                <Plus className="mr-2 h-4 w-4" />
                Add / Update Interface
              </Button>
              <Button type="button" variant="ghost" onClick={() => setInterfaceDraft(EMPTY_INTERFACE)}>
                Clear Draft
              </Button>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interface</TableHead>
                    <TableHead>MLD State</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Interval</TableHead>
                    <TableHead className="w-[160px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interfaces.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No PIM6 interfaces configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    interfaces.map((entry) => (
                      <TableRow key={entry.interface}>
                        <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                        <TableCell className="text-xs">
                          {entry.mldDisable ? "Disabled" : "Enabled"}
                        </TableCell>
                        <TableCell className="text-xs">{entry.mldVersion || "-"}</TableCell>
                        <TableCell className="text-xs">{entry.mldInterval || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEditInterface(entry)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteInterface(entry)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Static MLD Joins</Label>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Interface</Label>
                <Select
                  value={joinDraft.interface || ""}
                  onValueChange={(value) => setJoinDraft((prev) => ({ ...prev, interface: value }))}
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
                <Label>Multicast Group</Label>
                <Input
                  value={joinDraft.group}
                  placeholder="ff15::1234"
                  onChange={(event) => setJoinDraft((prev) => ({ ...prev, group: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Source (optional)</Label>
                <Input
                  value={joinDraft.source}
                  placeholder="2001:db8::1"
                  onChange={(event) => setJoinDraft((prev) => ({ ...prev, source: event.target.value }))}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="secondary" onClick={handleAddJoin}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add / Update Join
                </Button>
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interface</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {joins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No static MLD joins configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    joins.map((entry) => (
                      <TableRow key={joinKey(entry)}>
                        <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.group}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.source || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteJoin(entry)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
