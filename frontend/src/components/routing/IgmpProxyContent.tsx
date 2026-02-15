"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
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
import { Textarea } from "@/components/ui/textarea";
import { ethernetService } from "@/lib/api/ethernet";
import { routingProtocolGuides } from "@/lib/help/routingProtocolGuides";
import { igmpProxyService } from "@/lib/api/igmp-proxy";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";

type InterfaceOption = {
  value: string;
  label: string;
};

type IgmpInterfaceEntry = {
  interface: string;
  role: "upstream" | "downstream";
  threshold: string;
  altSubnets: string[];
};

type IgmpState = {
  disabled: boolean;
  disableQuickleave: boolean;
  interfaces: IgmpInterfaceEntry[];
};

const EMPTY_INTERFACE_DRAFT: IgmpInterfaceEntry = {
  interface: "",
  role: "downstream",
  threshold: "",
  altSubnets: [],
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

function parseRole(value: unknown): "upstream" | "downstream" {
  const direct = asString(value).toLowerCase();
  if (direct === "upstream" || direct === "downstream") {
    return direct;
  }
  const root = asObject(value);
  if (Object.prototype.hasOwnProperty.call(root, "upstream")) {
    return "upstream";
  }
  return "downstream";
}

function parseAltSubnets(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    const parsed = value.trim();
    return parsed ? [parsed] : [];
  }

  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => asString(item)).filter(Boolean))];
  }

  const root = asObject(value);
  const keys = Object.keys(root).map((item) => item.trim()).filter(Boolean);
  if (keys.length > 0) {
    return [...new Set(keys)];
  }

  return [];
}

function parseInterfaces(root: Record<string, unknown>): IgmpInterfaceEntry[] {
  const interfaceRoot = asObject(root.interface);
  const rows: IgmpInterfaceEntry[] = [];

  for (const [ifaceName, ifaceConfig] of Object.entries(interfaceRoot)) {
    const ifaceRoot = asObject(ifaceConfig);
    rows.push({
      interface: ifaceName,
      role: parseRole(ifaceRoot.role),
      threshold: asString(ifaceRoot.threshold),
      altSubnets: parseAltSubnets(ifaceRoot["alt-subnet"] ?? ifaceRoot.alt_subnet),
    });
  }

  return rows.sort((left, right) =>
    left.interface.localeCompare(right.interface, undefined, { numeric: true })
  );
}

function normalizeInterface(entry: IgmpInterfaceEntry): IgmpInterfaceEntry {
  return {
    interface: entry.interface.trim(),
    role: entry.role === "upstream" ? "upstream" : "downstream",
    threshold: entry.threshold.trim(),
    altSubnets: [
      ...new Set(entry.altSubnets.map((subnet) => subnet.trim()).filter(Boolean)),
    ].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
  };
}

function interfacesEqual(left: IgmpInterfaceEntry, right: IgmpInterfaceEntry): boolean {
  return (
    left.interface === right.interface &&
    left.role === right.role &&
    left.threshold === right.threshold &&
    left.altSubnets.join("|") === right.altSubnets.join("|")
  );
}

function parseAltSubnetText(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function interfaceSetCommands(entry: IgmpInterfaceEntry): string[] {
  const iface = entry.interface;
  const commands = [`set protocols igmp-proxy interface ${iface} role ${entry.role}`];

  if (entry.threshold) {
    commands.push(`set protocols igmp-proxy interface ${iface} threshold ${entry.threshold}`);
  }

  entry.altSubnets.forEach((subnet) =>
    commands.push(`set protocols igmp-proxy interface ${iface} alt-subnet ${subnet}`)
  );

  return commands;
}

export function IgmpProxyContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<IgmpState | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [disableQuickleave, setDisableQuickleave] = useState(false);
  const [interfaces, setInterfaces] = useState<IgmpInterfaceEntry[]>([]);

  const [interfaceDraft, setInterfaceDraft] = useState<IgmpInterfaceEntry>(EMPTY_INTERFACE_DRAFT);
  const [altSubnetText, setAltSubnetText] = useState("");

  const [interfaceOptions, setInterfaceOptions] = useState<InterfaceOption[]>([]);

  const interfaceLabelByName = useMemo(
    () =>
      interfaceOptions.reduce<Record<string, string>>((acc, item) => {
        acc[item.value] = item.label;
        return acc;
      }, {}),
    [interfaceOptions]
  );

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const [igmpConfig, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        igmpProxyService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const root = asObject((igmpConfig as { igmp_proxy?: unknown }).igmp_proxy);
      const parsedInterfaces = parseInterfaces(root);
      const parsedState: IgmpState = {
        disabled: Object.prototype.hasOwnProperty.call(root, "disable"),
        disableQuickleave: Object.prototype.hasOwnProperty.call(root, "disable-quickleave"),
        interfaces: parsedInterfaces,
      };

      setCurrentState(parsedState);
      setDisabled(parsedState.disabled);
      setDisableQuickleave(parsedState.disableQuickleave);
      setInterfaces(parsedState.interfaces);

      const ethernetInterfaces =
        (ethernetConfig as { interfaces?: Array<{ name: string; description?: string | null }> })
          .interfaces ?? [];
      const descriptionByName = ethernetInterfaces.reduce<Record<string, string | null>>(
        (acc, iface) => {
          acc[iface.name] = iface.description ?? null;
          return acc;
        },
        {}
      );

      const names = new Set<string>();
      ethernetInterfaces.forEach((iface) => names.add(iface.name));
      ((physicalConfig as { interfaces?: Array<{ interface: string }> }).interfaces ?? []).forEach(
        (iface) => names.add(iface.interface)
      );
      ((allInterfacesConfig as { interfaces?: Array<{ name: string }> }).interfaces ?? []).forEach(
        (iface) => names.add(iface.name)
      );
      parsedInterfaces.forEach((iface) => names.add(iface.interface));

      const options = [...names]
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) =>
          left.label.localeCompare(right.label, undefined, { numeric: true })
        );

      setInterfaceOptions(options);
      setInterfaceDraft((prev) => {
        if (prev.interface) return prev;
        return {
          ...prev,
          interface: options[0]?.value || "",
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load IGMP Proxy configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddOrUpdateInterface = () => {
    const normalized = normalizeInterface({
      ...interfaceDraft,
      altSubnets: parseAltSubnetText(altSubnetText),
    });
    if (!normalized.interface) {
      setError("Interface is required.");
      return;
    }

    setError(null);
    setInterfaces((prev) => {
      const withoutCurrent = prev.filter((entry) => entry.interface !== normalized.interface);
      return [...withoutCurrent, normalized].sort((left, right) =>
        left.interface.localeCompare(right.interface, undefined, { numeric: true })
      );
    });
    setAltSubnetText("");
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      if (currentState.disabled !== disabled) {
        operations.push(disabled ? "set protocols igmp-proxy disable" : "delete protocols igmp-proxy disable");
      }

      if (currentState.disableQuickleave !== disableQuickleave) {
        operations.push(
          disableQuickleave
            ? "set protocols igmp-proxy disable-quickleave"
            : "delete protocols igmp-proxy disable-quickleave"
        );
      }

      const currentInterfaceMap = new Map(
        currentState.interfaces.map((entry) => [entry.interface, normalizeInterface(entry)])
      );
      const desiredInterfaceMap = new Map(
        interfaces
          .map(normalizeInterface)
          .filter((entry) => entry.interface)
          .map((entry) => [entry.interface, entry])
      );

      for (const [iface] of currentInterfaceMap) {
        if (!desiredInterfaceMap.has(iface)) {
          operations.push(`delete protocols igmp-proxy interface ${iface}`);
        }
      }

      for (const [iface, desiredEntry] of desiredInterfaceMap) {
        const currentEntry = currentInterfaceMap.get(iface);
        if (currentEntry && interfacesEqual(currentEntry, desiredEntry)) {
          continue;
        }
        if (currentEntry) {
          operations.push(`delete protocols igmp-proxy interface ${iface}`);
        }
        operations.push(...interfaceSetCommands(desiredEntry));
      }

      const finalOperations = [...new Set(operations.map((item) => item.trim()).filter(Boolean))];
      if (finalOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await igmpProxyService.batchConfigure({ operations: finalOperations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply IGMP Proxy configuration");
      }

      setMessage("IGMP Proxy configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save IGMP Proxy configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">IGMP Proxy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure upstream/downstream interfaces, alternative subnets, and global IGMP proxy behavior.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PageGuideDialog guide={routingProtocolGuides.igmpProxy} />
          <Button variant="outline" size="sm" onClick={() => loadData(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {message && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="p-3 text-sm text-emerald-400">{message}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global Options</CardTitle>
          <CardDescription>Protocol-level controls for IGMP proxy forwarding behavior.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
            <Checkbox id="igmp-disabled" checked={disabled} onCheckedChange={(checked) => setDisabled(Boolean(checked))} />
            <Label htmlFor="igmp-disabled">Disable IGMP proxy service</Label>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
            <Checkbox
              id="igmp-disable-quickleave"
              checked={disableQuickleave}
              onCheckedChange={(checked) => setDisableQuickleave(Boolean(checked))}
            />
            <Label htmlFor="igmp-disable-quickleave">Disable quickleave</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interfaces</CardTitle>
          <CardDescription>
            Assign each interface as upstream or downstream and define optional alternative multicast source subnets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {interfaceOptions.length === 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
              No interfaces were discovered. Configure interfaces first.
            </div>
          )}

          {interfaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No IGMP proxy interfaces configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interface</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Alt Subnets</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interfaces.map((entry) => (
                  <TableRow key={entry.interface}>
                    <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                    <TableCell className="capitalize">{entry.role}</TableCell>
                    <TableCell>{entry.threshold || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.altSubnets.length > 0 ? entry.altSubnets.join(", ") : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setInterfaces((prev) => prev.filter((item) => item.interface !== entry.interface))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <Select
              value={interfaceDraft.interface || "__none__"}
              onValueChange={(value) =>
                setInterfaceDraft((prev) => ({ ...prev, interface: value === "__none__" ? "" : value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select interface" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select interface</SelectItem>
                {interfaceOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={interfaceDraft.role}
              onValueChange={(value: "upstream" | "downstream") =>
                setInterfaceDraft((prev) => ({ ...prev, role: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upstream">Upstream</SelectItem>
                <SelectItem value="downstream">Downstream</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="number"
              value={interfaceDraft.threshold}
              placeholder="Threshold (optional)"
              onChange={(event) =>
                setInterfaceDraft((prev) => ({ ...prev, threshold: event.target.value }))
              }
            />
          </div>

          <div className="space-y-1">
            <Label>Alternative Subnets (one CIDR per line)</Label>
            <Textarea
              value={altSubnetText}
              placeholder={"192.0.2.0/24\n198.51.100.0/24"}
              onChange={(event) => setAltSubnetText(event.target.value)}
              rows={4}
            />
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={handleAddOrUpdateInterface}>
              <Plus className="mr-2 h-4 w-4" />
              Add / Update Interface
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
