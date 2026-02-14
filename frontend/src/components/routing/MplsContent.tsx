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
import { Textarea } from "@/components/ui/textarea";
import { ethernetService } from "@/lib/api/ethernet";
import { mplsService } from "@/lib/api/mpls";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";

type InterfaceOption = {
  value: string;
  label: string;
};

type NeighborEntry = {
  address: string;
  password: string;
  sessionHoldtime: string;
  ttlSecurity: string;
};

type MplsState = {
  mplsInterfaces: string[];
  ldpInterfaces: string[];
  routerId: string;
  discoveryTransportIpv4: string;
  discoveryTransportIpv6: string;
  helloIntervalIpv4: string;
  helloHoldtimeIpv4: string;
  helloIntervalIpv6: string;
  helloHoldtimeIpv6: string;
  sessionHoldtimeIpv4: string;
  sessionHoldtimeIpv6: string;
  targetedHelloIntervalIpv4: string;
  targetedHelloHoldtimeIpv4: string;
  targetedHelloIntervalIpv6: string;
  targetedHelloHoldtimeIpv6: string;
  targetedAcceptIpv4: boolean;
  targetedAcceptIpv6: boolean;
  targetedNeighborsIpv4: string[];
  targetedNeighborsIpv6: string[];
  ciscoInteropTlv: boolean;
  orderedControl: boolean;
  transportPreferIpv4: boolean;
  explicitNullIpv4: boolean;
  explicitNullIpv6: boolean;
  neighbors: NeighborEntry[];
};

const EMPTY_STATE: MplsState = {
  mplsInterfaces: [],
  ldpInterfaces: [],
  routerId: "",
  discoveryTransportIpv4: "",
  discoveryTransportIpv6: "",
  helloIntervalIpv4: "",
  helloHoldtimeIpv4: "",
  helloIntervalIpv6: "",
  helloHoldtimeIpv6: "",
  sessionHoldtimeIpv4: "",
  sessionHoldtimeIpv6: "",
  targetedHelloIntervalIpv4: "",
  targetedHelloHoldtimeIpv4: "",
  targetedHelloIntervalIpv6: "",
  targetedHelloHoldtimeIpv6: "",
  targetedAcceptIpv4: false,
  targetedAcceptIpv6: false,
  targetedNeighborsIpv4: [],
  targetedNeighborsIpv6: [],
  ciscoInteropTlv: false,
  orderedControl: false,
  transportPreferIpv4: false,
  explicitNullIpv4: false,
  explicitNullIpv6: false,
  neighbors: [],
};

const EMPTY_NEIGHBOR: NeighborEntry = {
  address: "",
  password: "",
  sessionHoldtime: "",
  ttlSecurity: "",
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

function parseObjectKeys(value: unknown): string[] {
  return Object.keys(asObject(value)).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true })
  );
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

function parseAddressList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => asString(item)).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return parseObjectKeys(value);
}

function parseNeighbors(root: Record<string, unknown>): NeighborEntry[] {
  const neighborRoot = asObject(root.neighbor);
  const rows: NeighborEntry[] = [];

  for (const [address, rawNeighbor] of Object.entries(neighborRoot)) {
    const neighbor = asObject(rawNeighbor);
    rows.push({
      address,
      password: asString(neighbor.password),
      sessionHoldtime: asString(neighbor["session-holdtime"] ?? neighbor.session_holdtime),
      ttlSecurity: asString(neighbor["ttl-security"] ?? neighbor.ttl_security),
    });
  }

  return rows.sort((left, right) =>
    left.address.localeCompare(right.address, undefined, { numeric: true })
  );
}

function parseConfig(root: Record<string, unknown>): MplsState {
  const ldp = asObject(root.ldp);
  const discovery = asObject(ldp.discovery);
  const transportAddress = asObject(discovery["transport-address"] ?? discovery.transport_address);
  const discoveryHello = asObject(discovery.hello);
  const helloInterval = asObject(discoveryHello.interval);
  const helloHoldtime = asObject(discoveryHello.holdtime);
  const sessionHoldtime = asObject(ldp["session-holdtime"] ?? ldp.session_holdtime);
  const targetedHello = asObject(ldp["targeted-hello"] ?? ldp.targeted_hello);
  const targetedAccept = asObject(targetedHello.accept);
  const targetedNeighbor = asObject(targetedHello.neighbor);
  const targetedHelloTimers = asObject(targetedHello.hello);
  const targetedHelloInterval = asObject(targetedHelloTimers.interval);
  const targetedHelloHoldtime = asObject(targetedHelloTimers.holdtime);
  const parameter = asObject(ldp.parameter);
  const explicitNull = asObject(ldp["explicit-null"] ?? ldp.explicit_null);

  return {
    mplsInterfaces: parseObjectKeys(root.interface),
    ldpInterfaces: parseObjectKeys(ldp.interface),
    routerId: parseDirectOrKey(ldp["router-id"] ?? ldp.router_id),
    discoveryTransportIpv4: parseDirectOrKey(transportAddress.ipv4),
    discoveryTransportIpv6: parseDirectOrKey(transportAddress.ipv6),
    helloIntervalIpv4: asString(helloInterval.ipv4),
    helloHoldtimeIpv4: asString(helloHoldtime.ipv4),
    helloIntervalIpv6: asString(helloInterval.ipv6),
    helloHoldtimeIpv6: asString(helloHoldtime.ipv6),
    sessionHoldtimeIpv4: asString(sessionHoldtime.ipv4),
    sessionHoldtimeIpv6: asString(sessionHoldtime.ipv6),
    targetedHelloIntervalIpv4: asString(targetedHelloInterval.ipv4),
    targetedHelloHoldtimeIpv4: asString(targetedHelloHoldtime.ipv4),
    targetedHelloIntervalIpv6: asString(targetedHelloInterval.ipv6),
    targetedHelloHoldtimeIpv6: asString(targetedHelloHoldtime.ipv6),
    targetedAcceptIpv4: Object.prototype.hasOwnProperty.call(targetedAccept, "ipv4"),
    targetedAcceptIpv6: Object.prototype.hasOwnProperty.call(targetedAccept, "ipv6"),
    targetedNeighborsIpv4: parseAddressList(targetedNeighbor.ipv4),
    targetedNeighborsIpv6: parseAddressList(targetedNeighbor.ipv6),
    ciscoInteropTlv: Object.prototype.hasOwnProperty.call(parameter, "cisco-interop-tlv"),
    orderedControl: Object.prototype.hasOwnProperty.call(parameter, "ordered-control"),
    transportPreferIpv4: Object.prototype.hasOwnProperty.call(parameter, "transport-prefer-ipv4"),
    explicitNullIpv4: Object.prototype.hasOwnProperty.call(explicitNull, "ipv4"),
    explicitNullIpv6: Object.prototype.hasOwnProperty.call(explicitNull, "ipv6"),
    neighbors: parseNeighbors(ldp),
  };
}

function normalizeAddressList(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

function normalizeNeighbor(value: NeighborEntry): NeighborEntry {
  return {
    address: value.address.trim(),
    password: value.password.trim(),
    sessionHoldtime: value.sessionHoldtime.trim(),
    ttlSecurity: value.ttlSecurity.trim(),
  };
}

function neighborEqual(left: NeighborEntry, right: NeighborEntry): boolean {
  return (
    left.address === right.address &&
    left.password === right.password &&
    left.sessionHoldtime === right.sessionHoldtime &&
    left.ttlSecurity === right.ttlSecurity
  );
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function parseAddressTextarea(value: string): string[] {
  return normalizeAddressList(
    value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function neighborSetCommands(entry: NeighborEntry): string[] {
  const address = entry.address;
  const commands: string[] = [];
  if (entry.password) {
    commands.push(`set protocols mpls ldp neighbor ${address} password ${entry.password}`);
  }
  if (entry.sessionHoldtime) {
    commands.push(
      `set protocols mpls ldp neighbor ${address} session-holdtime ${entry.sessionHoldtime}`
    );
  }
  if (entry.ttlSecurity) {
    commands.push(`set protocols mpls ldp neighbor ${address} ttl-security ${entry.ttlSecurity}`);
  }
  return commands;
}

export function MplsContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<MplsState | null>(null);
  const [state, setState] = useState<MplsState>(EMPTY_STATE);

  const [selectedMplsInterface, setSelectedMplsInterface] = useState("");
  const [selectedLdpInterface, setSelectedLdpInterface] = useState("");
  const [neighborDraft, setNeighborDraft] = useState<NeighborEntry>(EMPTY_NEIGHBOR);
  const [targetedIpv4Text, setTargetedIpv4Text] = useState("");
  const [targetedIpv6Text, setTargetedIpv6Text] = useState("");

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
      const [mplsConfig, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        mplsService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const root = asObject((mplsConfig as { mpls?: unknown }).mpls);
      const parsedState = parseConfig(root);
      setCurrentState(parsedState);
      setState(parsedState);
      setTargetedIpv4Text(parsedState.targetedNeighborsIpv4.join("\n"));
      setTargetedIpv6Text(parsedState.targetedNeighborsIpv6.join("\n"));

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
      parsedState.mplsInterfaces.forEach((iface) => names.add(iface));
      parsedState.ldpInterfaces.forEach((iface) => names.add(iface));

      const options = [...names]
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) =>
          left.label.localeCompare(right.label, undefined, { numeric: true })
        );

      setInterfaceOptions(options);
      setSelectedMplsInterface((current) => current || options[0]?.value || "");
      setSelectedLdpInterface((current) => current || options[0]?.value || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MPLS configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddMplsInterface = () => {
    const iface = selectedMplsInterface.trim();
    if (!iface) return;
    setState((prev) => ({
      ...prev,
      mplsInterfaces: normalizeAddressList([...prev.mplsInterfaces, iface]),
    }));
  };

  const handleAddLdpInterface = () => {
    const iface = selectedLdpInterface.trim();
    if (!iface) return;
    setState((prev) => ({
      ...prev,
      ldpInterfaces: normalizeAddressList([...prev.ldpInterfaces, iface]),
    }));
  };

  const handleAddOrUpdateNeighbor = () => {
    const normalized = normalizeNeighbor(neighborDraft);
    if (!normalized.address) {
      setError("Neighbor address is required.");
      return;
    }
    if (!normalized.password && !normalized.sessionHoldtime && !normalized.ttlSecurity) {
      setError("Set at least one neighbor option (password, session holdtime, or TTL security).");
      return;
    }

    setError(null);
    setState((prev) => {
      const withoutCurrent = prev.neighbors.filter((item) => item.address !== normalized.address);
      return {
        ...prev,
        neighbors: [...withoutCurrent, normalized].sort((left, right) =>
          left.address.localeCompare(right.address, undefined, { numeric: true })
        ),
      };
    });
    setNeighborDraft(EMPTY_NEIGHBOR);
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const currentMplsInterfaces = normalizeAddressList(currentState.mplsInterfaces);
      const desiredMplsInterfaces = normalizeAddressList(state.mplsInterfaces);
      currentMplsInterfaces.forEach((iface) => {
        if (!desiredMplsInterfaces.includes(iface)) {
          operations.push(`delete protocols mpls interface ${iface}`);
        }
      });
      desiredMplsInterfaces.forEach((iface) => {
        if (!currentMplsInterfaces.includes(iface)) {
          operations.push(`set protocols mpls interface ${iface}`);
        }
      });

      const currentLdpInterfaces = normalizeAddressList(currentState.ldpInterfaces);
      const desiredLdpInterfaces = normalizeAddressList(state.ldpInterfaces);
      currentLdpInterfaces.forEach((iface) => {
        if (!desiredLdpInterfaces.includes(iface)) {
          operations.push(`delete protocols mpls ldp interface ${iface}`);
        }
      });
      desiredLdpInterfaces.forEach((iface) => {
        if (!currentLdpInterfaces.includes(iface)) {
          operations.push(`set protocols mpls ldp interface ${iface}`);
        }
      });

      const applyScalar = (
        current: string,
        desired: string,
        setCommand: (value: string) => string,
        deleteCommand: string
      ) => {
        const currentValue = current.trim();
        const desiredValue = desired.trim();
        if (currentValue === desiredValue) return;
        if (desiredValue) {
          operations.push(setCommand(desiredValue));
        } else {
          operations.push(deleteCommand);
        }
      };

      applyScalar(
        currentState.routerId,
        state.routerId,
        (value) => `set protocols mpls ldp router-id ${value}`,
        "delete protocols mpls ldp router-id"
      );
      applyScalar(
        currentState.discoveryTransportIpv4,
        state.discoveryTransportIpv4,
        (value) => `set protocols mpls ldp discovery transport-address ipv4 ${value}`,
        "delete protocols mpls ldp discovery transport-address ipv4"
      );
      applyScalar(
        currentState.discoveryTransportIpv6,
        state.discoveryTransportIpv6,
        (value) => `set protocols mpls ldp discovery transport-address ipv6 ${value}`,
        "delete protocols mpls ldp discovery transport-address ipv6"
      );
      applyScalar(
        currentState.helloIntervalIpv4,
        state.helloIntervalIpv4,
        (value) => `set protocols mpls ldp discovery hello interval ipv4 ${value}`,
        "delete protocols mpls ldp discovery hello interval ipv4"
      );
      applyScalar(
        currentState.helloHoldtimeIpv4,
        state.helloHoldtimeIpv4,
        (value) => `set protocols mpls ldp discovery hello holdtime ipv4 ${value}`,
        "delete protocols mpls ldp discovery hello holdtime ipv4"
      );
      applyScalar(
        currentState.helloIntervalIpv6,
        state.helloIntervalIpv6,
        (value) => `set protocols mpls ldp discovery hello interval ipv6 ${value}`,
        "delete protocols mpls ldp discovery hello interval ipv6"
      );
      applyScalar(
        currentState.helloHoldtimeIpv6,
        state.helloHoldtimeIpv6,
        (value) => `set protocols mpls ldp discovery hello holdtime ipv6 ${value}`,
        "delete protocols mpls ldp discovery hello holdtime ipv6"
      );
      applyScalar(
        currentState.sessionHoldtimeIpv4,
        state.sessionHoldtimeIpv4,
        (value) => `set protocols mpls ldp session-holdtime ipv4 ${value}`,
        "delete protocols mpls ldp session-holdtime ipv4"
      );
      applyScalar(
        currentState.sessionHoldtimeIpv6,
        state.sessionHoldtimeIpv6,
        (value) => `set protocols mpls ldp session-holdtime ipv6 ${value}`,
        "delete protocols mpls ldp session-holdtime ipv6"
      );
      applyScalar(
        currentState.targetedHelloIntervalIpv4,
        state.targetedHelloIntervalIpv4,
        (value) => `set protocols mpls ldp targeted-hello hello interval ipv4 ${value}`,
        "delete protocols mpls ldp targeted-hello hello interval ipv4"
      );
      applyScalar(
        currentState.targetedHelloHoldtimeIpv4,
        state.targetedHelloHoldtimeIpv4,
        (value) => `set protocols mpls ldp targeted-hello hello holdtime ipv4 ${value}`,
        "delete protocols mpls ldp targeted-hello hello holdtime ipv4"
      );
      applyScalar(
        currentState.targetedHelloIntervalIpv6,
        state.targetedHelloIntervalIpv6,
        (value) => `set protocols mpls ldp targeted-hello hello interval ipv6 ${value}`,
        "delete protocols mpls ldp targeted-hello hello interval ipv6"
      );
      applyScalar(
        currentState.targetedHelloHoldtimeIpv6,
        state.targetedHelloHoldtimeIpv6,
        (value) => `set protocols mpls ldp targeted-hello hello holdtime ipv6 ${value}`,
        "delete protocols mpls ldp targeted-hello hello holdtime ipv6"
      );

      const applyBool = (current: boolean, desired: boolean, setCommand: string, deleteCommand: string) => {
        if (current === desired) return;
        operations.push(desired ? setCommand : deleteCommand);
      };

      applyBool(
        currentState.ciscoInteropTlv,
        state.ciscoInteropTlv,
        "set protocols mpls ldp parameter cisco-interop-tlv",
        "delete protocols mpls ldp parameter cisco-interop-tlv"
      );
      applyBool(
        currentState.orderedControl,
        state.orderedControl,
        "set protocols mpls ldp parameter ordered-control",
        "delete protocols mpls ldp parameter ordered-control"
      );
      applyBool(
        currentState.transportPreferIpv4,
        state.transportPreferIpv4,
        "set protocols mpls ldp parameter transport-prefer-ipv4",
        "delete protocols mpls ldp parameter transport-prefer-ipv4"
      );
      applyBool(
        currentState.explicitNullIpv4,
        state.explicitNullIpv4,
        "set protocols mpls ldp explicit-null ipv4",
        "delete protocols mpls ldp explicit-null ipv4"
      );
      applyBool(
        currentState.explicitNullIpv6,
        state.explicitNullIpv6,
        "set protocols mpls ldp explicit-null ipv6",
        "delete protocols mpls ldp explicit-null ipv6"
      );
      applyBool(
        currentState.targetedAcceptIpv4,
        state.targetedAcceptIpv4,
        "set protocols mpls ldp targeted-hello accept ipv4",
        "delete protocols mpls ldp targeted-hello accept ipv4"
      );
      applyBool(
        currentState.targetedAcceptIpv6,
        state.targetedAcceptIpv6,
        "set protocols mpls ldp targeted-hello accept ipv6",
        "delete protocols mpls ldp targeted-hello accept ipv6"
      );

      const currentTargetedIpv4 = normalizeAddressList(currentState.targetedNeighborsIpv4);
      const desiredTargetedIpv4 = normalizeAddressList(parseAddressTextarea(targetedIpv4Text));
      if (!arraysEqual(currentTargetedIpv4, desiredTargetedIpv4)) {
        currentTargetedIpv4.forEach((address) => {
          operations.push(`delete protocols mpls ldp targeted-hello neighbor ipv4 ${address}`);
        });
        desiredTargetedIpv4.forEach((address) => {
          operations.push(`set protocols mpls ldp targeted-hello neighbor ipv4 ${address}`);
        });
      }

      const currentTargetedIpv6 = normalizeAddressList(currentState.targetedNeighborsIpv6);
      const desiredTargetedIpv6 = normalizeAddressList(parseAddressTextarea(targetedIpv6Text));
      if (!arraysEqual(currentTargetedIpv6, desiredTargetedIpv6)) {
        currentTargetedIpv6.forEach((address) => {
          operations.push(`delete protocols mpls ldp targeted-hello neighbor ipv6 ${address}`);
        });
        desiredTargetedIpv6.forEach((address) => {
          operations.push(`set protocols mpls ldp targeted-hello neighbor ipv6 ${address}`);
        });
      }

      const currentNeighborMap = new Map(
        currentState.neighbors.map((entry) => [entry.address, normalizeNeighbor(entry)])
      );
      const desiredNeighborMap = new Map(
        state.neighbors
          .map(normalizeNeighbor)
          .filter((entry) => entry.address)
          .map((entry) => [entry.address, entry])
      );

      for (const [address] of currentNeighborMap) {
        if (!desiredNeighborMap.has(address)) {
          operations.push(`delete protocols mpls ldp neighbor ${address}`);
        }
      }

      for (const [address, desiredNeighbor] of desiredNeighborMap) {
        const currentNeighbor = currentNeighborMap.get(address);
        if (currentNeighbor && neighborEqual(currentNeighbor, desiredNeighbor)) {
          continue;
        }
        if (currentNeighbor) {
          operations.push(`delete protocols mpls ldp neighbor ${address}`);
        }
        operations.push(...neighborSetCommands(desiredNeighbor));
      }

      const finalOperations = [...new Set(operations.map((item) => item.trim()).filter(Boolean))];
      if (finalOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await mplsService.batchConfigure({ operations: finalOperations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply MPLS configuration");
      }

      setMessage("MPLS configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save MPLS configuration");
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
          <h1 className="text-2xl font-bold text-foreground">MPLS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure MPLS and LDP interfaces, core LDP timers, targeted hello, and static LDP neighbors.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <CardTitle className="text-base">Interface Membership</CardTitle>
          <CardDescription>Add interfaces to MPLS and LDP participation lists.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>MPLS Interfaces</Label>
              {state.mplsInterfaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">No MPLS interfaces configured.</p>
              ) : (
                <div className="space-y-2">
                  {state.mplsInterfaces.map((iface) => (
                    <div
                      key={`mpls-${iface}`}
                      className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-sm"
                    >
                      <span>{interfaceLabelByName[iface] || iface}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            mplsInterfaces: prev.mplsInterfaces.filter((item) => item !== iface),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Select
                  value={selectedMplsInterface || "__none__"}
                  onValueChange={(value) => setSelectedMplsInterface(value === "__none__" ? "" : value)}
                >
                  <SelectTrigger className="flex-1">
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
                <Button variant="outline" onClick={handleAddMplsInterface}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>LDP Interfaces</Label>
              {state.ldpInterfaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">No LDP interfaces configured.</p>
              ) : (
                <div className="space-y-2">
                  {state.ldpInterfaces.map((iface) => (
                    <div
                      key={`ldp-${iface}`}
                      className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-sm"
                    >
                      <span>{interfaceLabelByName[iface] || iface}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            ldpInterfaces: prev.ldpInterfaces.filter((item) => item !== iface),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Select
                  value={selectedLdpInterface || "__none__"}
                  onValueChange={(value) => setSelectedLdpInterface(value === "__none__" ? "" : value)}
                >
                  <SelectTrigger className="flex-1">
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
                <Button variant="outline" onClick={handleAddLdpInterface}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LDP Core Parameters</CardTitle>
          <CardDescription>Router ID, transport addresses, discovery/session timers, and LDP behavior flags.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              value={state.routerId}
              placeholder="Router ID"
              onChange={(event) => setState((prev) => ({ ...prev, routerId: event.target.value }))}
            />
            <Input
              value={state.discoveryTransportIpv4}
              placeholder="Discovery transport IPv4"
              onChange={(event) =>
                setState((prev) => ({ ...prev, discoveryTransportIpv4: event.target.value }))
              }
            />
            <Input
              value={state.discoveryTransportIpv6}
              placeholder="Discovery transport IPv6"
              onChange={(event) =>
                setState((prev) => ({ ...prev, discoveryTransportIpv6: event.target.value }))
              }
            />
            <Input
              type="number"
              value={state.helloIntervalIpv4}
              placeholder="Hello interval IPv4"
              onChange={(event) =>
                setState((prev) => ({ ...prev, helloIntervalIpv4: event.target.value }))
              }
            />
            <Input
              type="number"
              value={state.helloHoldtimeIpv4}
              placeholder="Hello holdtime IPv4"
              onChange={(event) =>
                setState((prev) => ({ ...prev, helloHoldtimeIpv4: event.target.value }))
              }
            />
            <Input
              type="number"
              value={state.sessionHoldtimeIpv4}
              placeholder="Session holdtime IPv4"
              onChange={(event) =>
                setState((prev) => ({ ...prev, sessionHoldtimeIpv4: event.target.value }))
              }
            />
            <Input
              type="number"
              value={state.helloIntervalIpv6}
              placeholder="Hello interval IPv6"
              onChange={(event) =>
                setState((prev) => ({ ...prev, helloIntervalIpv6: event.target.value }))
              }
            />
            <Input
              type="number"
              value={state.helloHoldtimeIpv6}
              placeholder="Hello holdtime IPv6"
              onChange={(event) =>
                setState((prev) => ({ ...prev, helloHoldtimeIpv6: event.target.value }))
              }
            />
            <Input
              type="number"
              value={state.sessionHoldtimeIpv6}
              placeholder="Session holdtime IPv6"
              onChange={(event) =>
                setState((prev) => ({ ...prev, sessionHoldtimeIpv6: event.target.value }))
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="mpls-cisco-interop-tlv"
                checked={state.ciscoInteropTlv}
                onCheckedChange={(checked) =>
                  setState((prev) => ({ ...prev, ciscoInteropTlv: Boolean(checked) }))
                }
              />
              <Label htmlFor="mpls-cisco-interop-tlv">Cisco interop TLV</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="mpls-ordered-control"
                checked={state.orderedControl}
                onCheckedChange={(checked) =>
                  setState((prev) => ({ ...prev, orderedControl: Boolean(checked) }))
                }
              />
              <Label htmlFor="mpls-ordered-control">Ordered control</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="mpls-transport-prefer-ipv4"
                checked={state.transportPreferIpv4}
                onCheckedChange={(checked) =>
                  setState((prev) => ({ ...prev, transportPreferIpv4: Boolean(checked) }))
                }
              />
              <Label htmlFor="mpls-transport-prefer-ipv4">Transport prefer IPv4</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="mpls-explicit-null-ipv4"
                checked={state.explicitNullIpv4}
                onCheckedChange={(checked) =>
                  setState((prev) => ({ ...prev, explicitNullIpv4: Boolean(checked) }))
                }
              />
              <Label htmlFor="mpls-explicit-null-ipv4">Explicit-null IPv4</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="mpls-explicit-null-ipv6"
                checked={state.explicitNullIpv6}
                onCheckedChange={(checked) =>
                  setState((prev) => ({ ...prev, explicitNullIpv6: Boolean(checked) }))
                }
              />
              <Label htmlFor="mpls-explicit-null-ipv6">Explicit-null IPv6</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Targeted Hello</CardTitle>
          <CardDescription>Enable targeted hello accept mode and define static targeted neighbors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="mpls-targeted-accept-ipv4"
                checked={state.targetedAcceptIpv4}
                onCheckedChange={(checked) =>
                  setState((prev) => ({ ...prev, targetedAcceptIpv4: Boolean(checked) }))
                }
              />
              <Label htmlFor="mpls-targeted-accept-ipv4">Accept targeted hello IPv4</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="mpls-targeted-accept-ipv6"
                checked={state.targetedAcceptIpv6}
                onCheckedChange={(checked) =>
                  setState((prev) => ({ ...prev, targetedAcceptIpv6: Boolean(checked) }))
                }
              />
              <Label htmlFor="mpls-targeted-accept-ipv6">Accept targeted hello IPv6</Label>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              type="number"
              value={state.targetedHelloIntervalIpv4}
              placeholder="Targeted interval IPv4"
              onChange={(event) =>
                setState((prev) => ({ ...prev, targetedHelloIntervalIpv4: event.target.value }))
              }
            />
            <Input
              type="number"
              value={state.targetedHelloHoldtimeIpv4}
              placeholder="Targeted holdtime IPv4"
              onChange={(event) =>
                setState((prev) => ({ ...prev, targetedHelloHoldtimeIpv4: event.target.value }))
              }
            />
            <Input
              type="number"
              value={state.targetedHelloIntervalIpv6}
              placeholder="Targeted interval IPv6"
              onChange={(event) =>
                setState((prev) => ({ ...prev, targetedHelloIntervalIpv6: event.target.value }))
              }
            />
            <Input
              type="number"
              value={state.targetedHelloHoldtimeIpv6}
              placeholder="Targeted holdtime IPv6"
              onChange={(event) =>
                setState((prev) => ({ ...prev, targetedHelloHoldtimeIpv6: event.target.value }))
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Targeted Neighbors IPv4 (one per line)</Label>
              <Textarea
                value={targetedIpv4Text}
                rows={4}
                placeholder={"192.0.2.10\n192.0.2.11"}
                onChange={(event) => setTargetedIpv4Text(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Targeted Neighbors IPv6 (one per line)</Label>
              <Textarea
                value={targetedIpv6Text}
                rows={4}
                placeholder={"2001:db8::10\n2001:db8::11"}
                onChange={(event) => setTargetedIpv6Text(event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LDP Neighbors</CardTitle>
          <CardDescription>Configure static LDP neighbors with optional password and timers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.neighbors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No LDP neighbors configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Session Holdtime</TableHead>
                  <TableHead>TTL Security</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.neighbors.map((entry) => (
                  <TableRow key={entry.address}>
                    <TableCell className="font-mono text-xs">{entry.address}</TableCell>
                    <TableCell>{entry.password ? "Configured" : "-"}</TableCell>
                    <TableCell>{entry.sessionHoldtime || "-"}</TableCell>
                    <TableCell>{entry.ttlSecurity || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            neighbors: prev.neighbors.filter((item) => item.address !== entry.address),
                          }))
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

          <div className="grid gap-3 md:grid-cols-4">
            <Input
              value={neighborDraft.address}
              placeholder="Neighbor address"
              onChange={(event) =>
                setNeighborDraft((prev) => ({ ...prev, address: event.target.value }))
              }
            />
            <Input
              value={neighborDraft.password}
              placeholder="Password (optional)"
              onChange={(event) =>
                setNeighborDraft((prev) => ({ ...prev, password: event.target.value }))
              }
            />
            <Input
              type="number"
              value={neighborDraft.sessionHoldtime}
              placeholder="Session holdtime"
              onChange={(event) =>
                setNeighborDraft((prev) => ({ ...prev, sessionHoldtime: event.target.value }))
              }
            />
            <Input
              type="number"
              value={neighborDraft.ttlSecurity}
              placeholder="TTL security hops"
              onChange={(event) =>
                setNeighborDraft((prev) => ({ ...prev, ttlSecurity: event.target.value }))
              }
            />
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleAddOrUpdateNeighbor}>
              <Plus className="mr-2 h-4 w-4" />
              Add / Update Neighbor
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
