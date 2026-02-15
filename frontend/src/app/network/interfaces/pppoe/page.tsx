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
import { ethernetService } from "@/lib/api/ethernet";
import { type PppoeInterfaceConfig, pppoeService } from "@/lib/api/pppoe";
import { showService } from "@/lib/api/show";
import { pageGuides } from "@/lib/help/pageGuides";
import { formatInterfaceDisplayName } from "@/lib/utils";

interface InterfaceChoice {
  value: string;
  label: string;
}

interface PppoeFormState {
  name: string;
  description: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  sourceInterface: string;
  accessConcentrator: string;
  serviceName: string;
  connectOnDemand: boolean;
  noDefaultRoute: boolean;
  defaultRouteDistance: string;
  mru: string;
  idleTimeout: string;
  holdoff: string;
  localAddress: string;
  remoteAddress: string;
  noPeerDns: boolean;
  authenticationUsername: string;
  authenticationPassword: string;
  ipDisableForwarding: boolean;
  ipSourceValidation: string;
  ipAdjustMssClamp: boolean;
  ipAdjustMssValue: string;
  ipv6AddressAutoconf: boolean;
  ipv6DisableForwarding: boolean;
  ipv6AdjustMssClamp: boolean;
  ipv6AdjustMssValue: string;
}

const SOURCE_VALIDATION_OPTIONS = ["strict", "loose", "disable"] as const;

const EMPTY_FORM: PppoeFormState = {
  name: "",
  description: "",
  mtu: "",
  vrf: "",
  disable: false,
  sourceInterface: "",
  accessConcentrator: "",
  serviceName: "",
  connectOnDemand: false,
  noDefaultRoute: false,
  defaultRouteDistance: "",
  mru: "",
  idleTimeout: "",
  holdoff: "",
  localAddress: "",
  remoteAddress: "",
  noPeerDns: false,
  authenticationUsername: "",
  authenticationPassword: "",
  ipDisableForwarding: false,
  ipSourceValidation: "",
  ipAdjustMssClamp: false,
  ipAdjustMssValue: "",
  ipv6AddressAutoconf: false,
  ipv6DisableForwarding: false,
  ipv6AdjustMssClamp: false,
  ipv6AdjustMssValue: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function toFormState(value: PppoeInterfaceConfig): PppoeFormState {
  return {
    name: value.name,
    description: value.description,
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
    sourceInterface: value.sourceInterface,
    accessConcentrator: value.accessConcentrator,
    serviceName: value.serviceName,
    connectOnDemand: value.connectOnDemand,
    noDefaultRoute: value.noDefaultRoute,
    defaultRouteDistance: value.defaultRouteDistance,
    mru: value.mru,
    idleTimeout: value.idleTimeout,
    holdoff: value.holdoff,
    localAddress: value.localAddress,
    remoteAddress: value.remoteAddress,
    noPeerDns: value.noPeerDns,
    authenticationUsername: value.authenticationUsername,
    authenticationPassword: value.authenticationPassword,
    ipDisableForwarding: value.ipDisableForwarding,
    ipSourceValidation: value.ipSourceValidation,
    ipAdjustMssClamp: value.ipAdjustMssClamp,
    ipAdjustMssValue: value.ipAdjustMssValue,
    ipv6AddressAutoconf: value.ipv6AddressAutoconf,
    ipv6DisableForwarding: value.ipv6DisableForwarding,
    ipv6AdjustMssClamp: value.ipv6AdjustMssClamp,
    ipv6AdjustMssValue: value.ipv6AdjustMssValue,
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
  tokenPrefix: "ip adjust-mss" | "ipv6 adjust-mss",
  desiredClamp: boolean,
  desiredValue: string,
  currentClamp: boolean,
  currentValue: string,
): void {
  const trimmedDesired = desiredValue.trim();
  const trimmedCurrent = currentValue.trim();

  if (desiredClamp) {
    if (currentClamp && !trimmedCurrent) return;
    if (currentClamp || trimmedCurrent) {
      operations.push(`delete ${base} ${tokenPrefix}`);
    }
    operations.push(`set ${base} ${tokenPrefix} clamp-mss-to-pmtu`);
    return;
  }

  if (trimmedDesired) {
    if (currentClamp || trimmedDesired !== trimmedCurrent) {
      if (currentClamp) {
        operations.push(`delete ${base} ${tokenPrefix}`);
      }
      operations.push(`set ${base} ${tokenPrefix} ${quoteCliValue(trimmedDesired)}`);
    }
    return;
  }

  if (currentClamp || trimmedCurrent) {
    operations.push(`delete ${base} ${tokenPrefix}`);
  }
}

function buildPppoeOperations(candidate: PppoeFormState, current: PppoeInterfaceConfig | null): string[] {
  const operations: string[] = [];
  const base = `interfaces pppoe ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      mtu: "",
      vrf: "",
      disable: false,
      sourceInterface: "",
      accessConcentrator: "",
      serviceName: "",
      connectOnDemand: false,
      noDefaultRoute: false,
      defaultRouteDistance: "",
      mru: "",
      idleTimeout: "",
      holdoff: "",
      localAddress: "",
      remoteAddress: "",
      noPeerDns: false,
      authenticationUsername: "",
      authenticationPassword: "",
      ipDisableForwarding: false,
      ipSourceValidation: "",
      ipAdjustMssClamp: false,
      ipAdjustMssValue: "",
      ipv6AddressAutoconf: false,
      ipv6DisableForwarding: false,
      ipv6AdjustMssClamp: false,
      ipv6AdjustMssValue: "",
    } satisfies PppoeInterfaceConfig);

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
  syncScalar(
    operations,
    base,
    "access-concentrator",
    candidate.accessConcentrator.trim(),
    currentSafe.accessConcentrator,
  );
  syncScalar(operations, base, "service-name", candidate.serviceName.trim(), currentSafe.serviceName);
  syncScalar(
    operations,
    base,
    "default-route-distance",
    candidate.defaultRouteDistance.trim(),
    currentSafe.defaultRouteDistance,
  );
  syncScalar(operations, base, "mru", candidate.mru.trim(), currentSafe.mru);
  syncScalar(operations, base, "idle-timeout", candidate.idleTimeout.trim(), currentSafe.idleTimeout);
  syncScalar(operations, base, "holdoff", candidate.holdoff.trim(), currentSafe.holdoff);
  syncScalar(operations, base, "local-address", candidate.localAddress.trim(), currentSafe.localAddress);
  syncScalar(operations, base, "remote-address", candidate.remoteAddress.trim(), currentSafe.remoteAddress);
  syncScalar(
    operations,
    base,
    "authentication username",
    candidate.authenticationUsername.trim(),
    currentSafe.authenticationUsername,
  );
  syncScalar(
    operations,
    base,
    "authentication password",
    candidate.authenticationPassword.trim(),
    currentSafe.authenticationPassword,
  );
  syncScalar(
    operations,
    base,
    "ip source-validation",
    candidate.ipSourceValidation.trim(),
    currentSafe.ipSourceValidation,
  );

  syncFlag(operations, base, "disable", candidate.disable, currentSafe.disable);
  syncFlag(
    operations,
    base,
    "connect-on-demand",
    candidate.connectOnDemand,
    currentSafe.connectOnDemand,
  );
  syncFlag(
    operations,
    base,
    "no-default-route",
    candidate.noDefaultRoute,
    currentSafe.noDefaultRoute,
  );
  syncFlag(operations, base, "no-peer-dns", candidate.noPeerDns, currentSafe.noPeerDns);
  syncFlag(
    operations,
    base,
    "ip disable-forwarding",
    candidate.ipDisableForwarding,
    currentSafe.ipDisableForwarding,
  );
  syncFlag(
    operations,
    base,
    "ipv6 address autoconf",
    candidate.ipv6AddressAutoconf,
    currentSafe.ipv6AddressAutoconf,
  );
  syncFlag(
    operations,
    base,
    "ipv6 disable-forwarding",
    candidate.ipv6DisableForwarding,
    currentSafe.ipv6DisableForwarding,
  );

  syncAdjustMss(
    operations,
    base,
    "ip adjust-mss",
    candidate.ipAdjustMssClamp,
    candidate.ipAdjustMssValue,
    currentSafe.ipAdjustMssClamp,
    currentSafe.ipAdjustMssValue,
  );
  syncAdjustMss(
    operations,
    base,
    "ipv6 adjust-mss",
    candidate.ipv6AdjustMssClamp,
    candidate.ipv6AdjustMssValue,
    currentSafe.ipv6AdjustMssClamp,
    currentSafe.ipv6AdjustMssValue,
  );

  return operations;
}

export default function PppoeInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<PppoeInterfaceConfig[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<PppoeFormState>(EMPTY_FORM);
  const [sourceInterfaces, setSourceInterfaces] = useState<InterfaceChoice[]>([]);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const [config, allInterfacesResponse, ethernetConfig] = await Promise.all([
        pppoeService.getConfig(refresh),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 }),
        ),
        ethernetService.getConfig().catch(() => ({ interfaces: [], total: 0, by_type: {}, by_vrf: {} })),
      ]);
      setInterfaces(config.interfaces);

      const descriptionByName = ethernetConfig.interfaces.reduce<Record<string, string | null>>(
        (acc, iface) => {
          acc[iface.name] = iface.description ?? null;
          return acc;
        },
        {},
      );

      const choices = allInterfacesResponse.interfaces
        .filter((entry) => !["loopback"].includes(entry.type))
        .map((entry) => ({
          value: entry.name,
          label: formatInterfaceDisplayName(entry.name, descriptionByName[entry.name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label));

      setSourceInterfaces(choices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PPPoE interfaces.");
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

  const editInterface = (value: PppoeInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete PPPoE interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await pppoeService.batchConfigure([`delete interfaces pppoe ${quoteCliValue(name)}`]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected PPPoE deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`PPPoE interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete PPPoE interface.");
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
      setError("Renaming PPPoE interfaces is not supported. Create a new one and delete the old one.");
      return;
    }
    if (!form.sourceInterface.trim()) {
      setError("Source interface is required for PPPoE.");
      return;
    }

    const numericFields = [
      { label: "MTU", value: form.mtu },
      { label: "MRU", value: form.mru },
      { label: "Idle timeout", value: form.idleTimeout },
      { label: "Holdoff", value: form.holdoff },
      { label: "Default route distance", value: form.defaultRouteDistance },
      { label: "IPv4 Adjust MSS", value: form.ipAdjustMssValue, allowClamp: form.ipAdjustMssClamp },
      { label: "IPv6 Adjust MSS", value: form.ipv6AdjustMssValue, allowClamp: form.ipv6AdjustMssClamp },
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
    const operations = buildPppoeOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await pppoeService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected PPPoE configuration.");
      }
      await loadData(true);
      setSuccess(current ? `PPPoE '${name}' updated.` : `PPPoE '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save PPPoE interface.");
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
            <h1 className="text-3xl font-bold">PPPoE Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure PPPoE WAN interfaces with authentication, routing, and MSS controls.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.pppoeInterfaces} />
        </div>

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {success && (
          <Card className="border-emerald-500/50">
            <CardContent className="pt-6">
              <p className="text-sm text-emerald-300">{success}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Configured PPPoE Interfaces</CardTitle>
              <CardDescription>
                {interfaces.length} interface{interfaces.length === 1 ? "" : "s"} configured
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Disabled: {disabledCount}</Badge>
                  <Badge variant="outline">Sources: {sourceInterfaces.length}</Badge>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadData(true)}
                  disabled={refreshing}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          No PPPoE interfaces configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      interfaces.map((entry) => (
                        <TableRow key={entry.name}>
                          <TableCell className="font-medium">{entry.name}</TableCell>
                          <TableCell>{entry.sourceInterface || "-"}</TableCell>
                          <TableCell>{entry.authenticationUsername || "-"}</TableCell>
                          <TableCell>
                            {entry.disable ? (
                              <Badge variant="destructive">Disabled</Badge>
                            ) : (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600">Enabled</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editInterface(entry)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void deleteInterface(entry.name)}
                                disabled={saving}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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

          <Card>
            <CardHeader>
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create PPPoE Interface"}</CardTitle>
              <CardDescription>Configure authentication, route behavior, and IP tuning.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pppoe-name">Interface Name</Label>
                  <Input
                    id="pppoe-name"
                    value={form.name}
                    onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                    placeholder="pppoe0"
                    disabled={Boolean(editingName)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pppoe-source-interface">Source Interface</Label>
                  <Select
                    value={form.sourceInterface || "none"}
                    onValueChange={(value) =>
                      setForm((previous) => ({
                        ...previous,
                        sourceInterface: value === "none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger id="pppoe-source-interface">
                      <SelectValue placeholder="Select source interface" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select source interface</SelectItem>
                      {sourceInterfaces.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pppoe-description">Description</Label>
                <Input
                  id="pppoe-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="WAN-PPPoE"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pppoe-auth-user">Authentication Username</Label>
                  <Input
                    id="pppoe-auth-user"
                    value={form.authenticationUsername}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        authenticationUsername: event.target.value,
                      }))
                    }
                    placeholder="isp-user"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pppoe-auth-password">Authentication Password</Label>
                  <Input
                    id="pppoe-auth-password"
                    value={form.authenticationPassword}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        authenticationPassword: event.target.value,
                      }))
                    }
                    placeholder="isp-secret"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pppoe-service-name">Service Name</Label>
                  <Input
                    id="pppoe-service-name"
                    value={form.serviceName}
                    onChange={(event) => setForm((previous) => ({ ...previous, serviceName: event.target.value }))}
                    placeholder="internet"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pppoe-ac-name">Access Concentrator</Label>
                  <Input
                    id="pppoe-ac-name"
                    value={form.accessConcentrator}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, accessConcentrator: event.target.value }))
                    }
                    placeholder="ac-name"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pppoe-mtu">MTU</Label>
                  <Input
                    id="pppoe-mtu"
                    value={form.mtu}
                    onChange={(event) => setForm((previous) => ({ ...previous, mtu: event.target.value }))}
                    placeholder="1492"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pppoe-mru">MRU</Label>
                  <Input
                    id="pppoe-mru"
                    value={form.mru}
                    onChange={(event) => setForm((previous) => ({ ...previous, mru: event.target.value }))}
                    placeholder="1492"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pppoe-idle-timeout">Idle Timeout</Label>
                  <Input
                    id="pppoe-idle-timeout"
                    value={form.idleTimeout}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, idleTimeout: event.target.value }))
                    }
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pppoe-holdoff">Holdoff</Label>
                  <Input
                    id="pppoe-holdoff"
                    value={form.holdoff}
                    onChange={(event) => setForm((previous) => ({ ...previous, holdoff: event.target.value }))}
                    placeholder="30"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pppoe-local-address">Local Address</Label>
                  <Input
                    id="pppoe-local-address"
                    value={form.localAddress}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, localAddress: event.target.value }))
                    }
                    placeholder="192.0.2.2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pppoe-remote-address">Remote Address</Label>
                  <Input
                    id="pppoe-remote-address"
                    value={form.remoteAddress}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, remoteAddress: event.target.value }))
                    }
                    placeholder="192.0.2.1"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pppoe-default-distance">Default Route Distance</Label>
                  <Input
                    id="pppoe-default-distance"
                    value={form.defaultRouteDistance}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        defaultRouteDistance: event.target.value,
                      }))
                    }
                    placeholder="220"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pppoe-vrf">VRF</Label>
                  <Input
                    id="pppoe-vrf"
                    value={form.vrf}
                    onChange={(event) => setForm((previous) => ({ ...previous, vrf: event.target.value }))}
                    placeholder="BLUE"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pppoe-ip-source-validation">IPv4 Source Validation</Label>
                  <Select
                    value={form.ipSourceValidation || "none"}
                    onValueChange={(value) =>
                      setForm((previous) => ({
                        ...previous,
                        ipSourceValidation: value === "none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger id="pppoe-ip-source-validation">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      {SOURCE_VALIDATION_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pppoe-ip-mss">IPv4 Adjust MSS</Label>
                  <Input
                    id="pppoe-ip-mss"
                    value={form.ipAdjustMssValue}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, ipAdjustMssValue: event.target.value }))
                    }
                    placeholder="1452"
                    disabled={form.ipAdjustMssClamp}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pppoe-ipv6-mss">IPv6 Adjust MSS</Label>
                <Input
                  id="pppoe-ipv6-mss"
                  value={form.ipv6AdjustMssValue}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, ipv6AdjustMssValue: event.target.value }))
                  }
                  placeholder="1432"
                  disabled={form.ipv6AdjustMssClamp}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disable}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, disable: Boolean(checked) }))
                    }
                  />
                  Disable interface
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.connectOnDemand}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, connectOnDemand: Boolean(checked) }))
                    }
                  />
                  Connect on demand
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.noDefaultRoute}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, noDefaultRoute: Boolean(checked) }))
                    }
                  />
                  No default route
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.noPeerDns}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, noPeerDns: Boolean(checked) }))
                    }
                  />
                  No peer DNS
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipDisableForwarding}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, ipDisableForwarding: Boolean(checked) }))
                    }
                  />
                  Disable IPv4 forwarding
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipAdjustMssClamp}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, ipAdjustMssClamp: Boolean(checked) }))
                    }
                  />
                  Clamp IPv4 MSS to PMTU
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipv6AddressAutoconf}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, ipv6AddressAutoconf: Boolean(checked) }))
                    }
                  />
                  IPv6 autoconf
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipv6DisableForwarding}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, ipv6DisableForwarding: Boolean(checked) }))
                    }
                  />
                  Disable IPv6 forwarding
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ipv6AdjustMssClamp}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, ipv6AdjustMssClamp: Boolean(checked) }))
                    }
                  />
                  Clamp IPv6 MSS to PMTU
                </label>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" onClick={() => void saveInterface()} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Saving..." : editingName ? "Save Changes" : "Create Interface"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                  <Plus className="mr-2 h-4 w-4" />
                  New
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
