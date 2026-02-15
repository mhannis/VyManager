"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { arpService } from "@/lib/api/arp";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";

type InterfaceOption = {
  value: string;
  label: string;
};

type ArpEntry = {
  interface: string;
  ip: string;
  mac: string;
};

type ArpState = {
  entries: ArpEntry[];
};

const EMPTY_ENTRY: ArpEntry = {
  interface: "",
  ip: "",
  mac: "",
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

function parseEntries(root: Record<string, unknown>): ArpEntry[] {
  const rows: ArpEntry[] = [];
  const interfaceRoot = asObject(root.interface);

  for (const [iface, ifaceConfig] of Object.entries(interfaceRoot)) {
    const addressRoot = asObject(asObject(ifaceConfig).address);
    for (const [ip, ipCfg] of Object.entries(addressRoot)) {
      rows.push({
        interface: iface,
        ip,
        mac: asString(asObject(ipCfg).mac),
      });
    }
  }

  return rows.sort((left, right) => {
    const ifaceOrder = left.interface.localeCompare(right.interface, undefined, { numeric: true });
    if (ifaceOrder !== 0) return ifaceOrder;
    return left.ip.localeCompare(right.ip, undefined, { numeric: true });
  });
}

function normalizeEntry(entry: ArpEntry): ArpEntry {
  return {
    interface: entry.interface.trim(),
    ip: entry.ip.trim(),
    mac: entry.mac.trim().toLowerCase(),
  };
}

function entryKey(entry: ArpEntry): string {
  return `${entry.interface}|${entry.ip}`;
}

function entryEquals(left: ArpEntry, right: ArpEntry): boolean {
  return left.interface === right.interface && left.ip === right.ip && left.mac === right.mac;
}

const MAC_REGEX = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

export function ArpProtocolContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<ArpState | null>(null);
  const [entries, setEntries] = useState<ArpEntry[]>([]);
  const [entryDraft, setEntryDraft] = useState<ArpEntry>(EMPTY_ENTRY);

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

      const [arpConfig, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        arpService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const root = asObject((arpConfig as { arp?: unknown }).arp);
      const parsedEntries = parseEntries(root);
      const parsedState: ArpState = {
        entries: parsedEntries,
      };

      setCurrentState(parsedState);
      setEntries(parsedEntries);

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
      parsedEntries.forEach((entry) => names.add(entry.interface));

      const options = [...names]
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setInterfaceOptions(options);
      setEntryDraft((prev) => {
        if (prev.interface) return prev;
        return {
          ...prev,
          interface: options[0]?.value || "",
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load static ARP configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddOrUpdateEntry = () => {
    const normalized = normalizeEntry(entryDraft);
    if (!normalized.interface) {
      setError("Interface is required.");
      return;
    }
    if (!normalized.ip) {
      setError("IP address is required.");
      return;
    }
    if (!normalized.mac) {
      setError("MAC address is required.");
      return;
    }
    if (!MAC_REGEX.test(normalized.mac)) {
      setError("MAC address must use xx:xx:xx:xx:xx:xx format.");
      return;
    }

    setError(null);
    setEntries((prev) => {
      const next = [...prev.filter((item) => entryKey(item) !== entryKey(normalized)), normalized];
      return next.sort((left, right) => {
        const ifaceOrder = left.interface.localeCompare(right.interface, undefined, { numeric: true });
        if (ifaceOrder !== 0) return ifaceOrder;
        return left.ip.localeCompare(right.ip, undefined, { numeric: true });
      });
    });
  };

  const handleEditEntry = (entry: ArpEntry) => {
    setEntryDraft(entry);
  };

  const handleDeleteEntry = (entry: ArpEntry) => {
    setEntries((prev) => prev.filter((item) => entryKey(item) !== entryKey(entry)));
    if (entryKey(entryDraft) === entryKey(entry)) {
      setEntryDraft(EMPTY_ENTRY);
    }
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const currentMap = new Map(currentState.entries.map((entry) => [entryKey(entry), normalizeEntry(entry)]));
      const desiredMap = new Map(
        entries
          .map(normalizeEntry)
          .filter((entry) => entry.interface && entry.ip)
          .map((entry) => [entryKey(entry), entry])
      );

      for (const [key, currentEntry] of currentMap) {
        if (!desiredMap.has(key)) {
          operations.push(
            `delete protocols static arp interface ${currentEntry.interface} address ${currentEntry.ip}`
          );
        }
      }

      for (const [key, desiredEntry] of desiredMap) {
        const currentEntry = currentMap.get(key);
        if (currentEntry && entryEquals(currentEntry, desiredEntry)) {
          continue;
        }

        if (currentEntry) {
          operations.push(
            `delete protocols static arp interface ${currentEntry.interface} address ${currentEntry.ip}`
          );
        }

        operations.push(
          `set protocols static arp interface ${desiredEntry.interface} address ${desiredEntry.ip} mac ${desiredEntry.mac}`
        );
      }

      const finalOperations = [...new Set(operations.map((operation) => operation.trim()).filter(Boolean))];
      if (finalOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await arpService.batchConfigure({ operations: finalOperations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply static ARP configuration");
      }

      setMessage(`Applied ${finalOperations.length} static ARP operation${finalOperations.length === 1 ? "" : "s"}.`);
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save static ARP configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Static ARP</CardTitle>
          <CardDescription>Loading protocol static ARP entries...</CardDescription>
        </CardHeader>
        <CardContent>
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Static ARP (Protocols)</CardTitle>
          <CardDescription>
            Manage protocol static ARP bindings (`protocols static arp`) with interface-aware labels.
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
      <CardContent className="space-y-4">
        {error && <div className="text-sm text-red-500">{error}</div>}
        {message && <div className="text-sm text-emerald-500">{message}</div>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>Interface</Label>
            <Select
              value={entryDraft.interface || ""}
              onValueChange={(value) => setEntryDraft((prev) => ({ ...prev, interface: value }))}
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
            <Label>IPv4 Address</Label>
            <Input
              value={entryDraft.ip}
              placeholder="192.0.2.10"
              onChange={(event) => setEntryDraft((prev) => ({ ...prev, ip: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>MAC Address</Label>
            <Input
              value={entryDraft.mac}
              placeholder="aa:bb:cc:dd:ee:ff"
              onChange={(event) => setEntryDraft((prev) => ({ ...prev, mac: event.target.value }))}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={handleAddOrUpdateEntry}>
              <Plus className="mr-2 h-4 w-4" />
              Add / Update Entry
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Interface</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>MAC</TableHead>
                <TableHead className="w-[160px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No static ARP entries configured.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entryKey(entry)}>
                    <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.ip}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.mac}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEditEntry(entry)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteEntry(entry)}>
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
      </CardContent>
    </Card>
  );
}
