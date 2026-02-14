"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Plus, RefreshCw, Save, Shield, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { ethernetService } from "@/lib/api/ethernet";
import { formatInterfaceDisplayName } from "@/lib/utils";
import { vpnDmvpnApi } from "@/lib/api/vpn-dmvpn";
import { asString, quoteCliValue, toRecord } from "@/components/system/serviceTabHelpers";

interface InterfaceOption {
  value: string;
  label: string;
}

interface NhrpMapEntry {
  tunnelIp: string;
  nbmaIp: string;
}

interface NhrpNhsEntry {
  tunnelIp: string;
  nbmaIp: string;
}

interface DmvpnState {
  enabled: boolean;
  tunnelName: string;
  tunnelAddress: string;
  sourceInterface: string;
  mtu: string;
  adjustMss: string;
  greKey: string;
  enableMulticast: boolean;
  nhrpAuthentication: string;
  nhrpHoldtime: string;
  nhrpNetworkId: string;
  nhrpMulticast: string;
  nhrpRedirect: boolean;
  nhrpShortcut: boolean;
  nhrpRegistrationNoUnique: boolean;
  nhrpMaps: NhrpMapEntry[];
  nhrpNhs: NhrpNhsEntry[];
  ipsecProfileName: string;
  ipsecPresharedSecret: string;
  ipsecIkeGroup: string;
  ipsecEspGroup: string;
  ipsecInterface: string;
}

const EMPTY_STATE: DmvpnState = {
  enabled: false,
  tunnelName: "tun100",
  tunnelAddress: "",
  sourceInterface: "",
  mtu: "",
  adjustMss: "",
  greKey: "",
  enableMulticast: true,
  nhrpAuthentication: "",
  nhrpHoldtime: "",
  nhrpNetworkId: "",
  nhrpMulticast: "dynamic",
  nhrpRedirect: false,
  nhrpShortcut: false,
  nhrpRegistrationNoUnique: false,
  nhrpMaps: [],
  nhrpNhs: [],
  ipsecProfileName: "",
  ipsecPresharedSecret: "",
  ipsecIkeGroup: "",
  ipsecEspGroup: "",
  ipsecInterface: "",
};

function parseLeaf(value: unknown): string {
  const direct = asString(value);
  if (direct) return direct;
  const root = toRecord(value);
  const first = Object.keys(root)[0];
  return first || "";
}

function parseNhrpMaps(root: Record<string, unknown>): NhrpMapEntry[] {
  const mapRoot = toRecord(toRecord(root.map)["tunnel-ip"]);
  return Object.keys(mapRoot)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((tunnelIp) => {
      const mapEntry = toRecord(mapRoot[tunnelIp]);
      return {
        tunnelIp,
        nbmaIp: parseLeaf(mapEntry.nbma),
      };
    })
    .filter((entry) => entry.tunnelIp.length > 0);
}

function parseNhrpNhs(root: Record<string, unknown>): NhrpNhsEntry[] {
  const nhsRoot = toRecord(toRecord(root.nhs)["tunnel-ip"]);
  return Object.keys(nhsRoot)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((tunnelIp) => {
      const entry = toRecord(nhsRoot[tunnelIp]);
      return {
        tunnelIp,
        nbmaIp: parseLeaf(entry.nbma),
      };
    })
    .filter((entry) => entry.tunnelIp.length > 0);
}

function parseState(
  tunnelRoot: Record<string, unknown>,
  nhrpRoot: Record<string, unknown>,
  ipsecRoot: Record<string, unknown>,
): DmvpnState {
  const tunnelCandidates = Array.from(
    new Set([...Object.keys(tunnelRoot), ...Object.keys(nhrpRoot)]),
  ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const tunnelName = tunnelCandidates[0] ?? "tun100";

  const tunnelConfig = toRecord(tunnelRoot[tunnelName]);
  const nhrpConfig = toRecord(nhrpRoot[tunnelName]);
  const tunnelIpConfig = toRecord(tunnelConfig.ip);
  const tunnelParametersIp = toRecord(toRecord(tunnelConfig.parameters).ip);

  const profileRoot = toRecord(ipsecRoot.profile);
  let profileName = "";
  let profileConfig: Record<string, unknown> = {};
  for (const [name, cfg] of Object.entries(profileRoot)) {
    const bindTunnel = parseLeaf(toRecord(toRecord(cfg).bind).tunnel);
    if (bindTunnel === tunnelName) {
      profileName = name;
      profileConfig = toRecord(cfg);
      break;
    }
  }

  const profileAuth = toRecord(profileConfig.authentication);
  const ipsecInterface = parseLeaf(ipsecRoot.interface);

  const tunnelAddress = parseLeaf(tunnelConfig.address);
  const sourceInterface = parseLeaf(tunnelConfig["source-interface"]);
  const mtu = parseLeaf(tunnelConfig.mtu);
  const adjustMss = parseLeaf(tunnelIpConfig["adjust-mss"]);
  const greKey = parseLeaf(tunnelParametersIp.key);

  return {
    enabled: Boolean(
      Object.keys(tunnelConfig).length ||
        Object.keys(nhrpConfig).length ||
        profileName ||
        tunnelAddress ||
        sourceInterface,
    ),
    tunnelName,
    tunnelAddress,
    sourceInterface,
    mtu,
    adjustMss,
    greKey,
    enableMulticast: Object.prototype.hasOwnProperty.call(tunnelConfig, "enable-multicast"),
    nhrpAuthentication: parseLeaf(nhrpConfig.authentication),
    nhrpHoldtime: parseLeaf(nhrpConfig.holdtime),
    nhrpNetworkId: parseLeaf(nhrpConfig["network-id"]),
    nhrpMulticast: parseLeaf(nhrpConfig.multicast),
    nhrpRedirect: Object.prototype.hasOwnProperty.call(nhrpConfig, "redirect"),
    nhrpShortcut: Object.prototype.hasOwnProperty.call(nhrpConfig, "shortcut"),
    nhrpRegistrationNoUnique: Object.prototype.hasOwnProperty.call(nhrpConfig, "registration-no-unique"),
    nhrpMaps: parseNhrpMaps(nhrpConfig),
    nhrpNhs: parseNhrpNhs(nhrpConfig),
    ipsecProfileName: profileName,
    ipsecPresharedSecret: parseLeaf(profileAuth["pre-shared-secret"]),
    ipsecIkeGroup: parseLeaf(profileConfig["ike-group"]),
    ipsecEspGroup: parseLeaf(profileConfig["esp-group"]),
    ipsecInterface,
  };
}

function updateRow<T extends object, K extends keyof T>(
  rows: T[],
  rowIndex: number,
  key: K,
  value: T[K],
): T[] {
  const next = [...rows];
  next[rowIndex] = { ...next[rowIndex], [key]: value };
  return next;
}

export default function VpnDmvpnPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.VPN) || canWrite(FeatureGroup.IPSEC);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<DmvpnState>(EMPTY_STATE);
  const [interfaceOptions, setInterfaceOptions] = useState<InterfaceOption[]>([]);

  const selectedSourceInterfaceLabel = useMemo(
    () => interfaceOptions.find((option) => option.value === config.sourceInterface)?.label ?? "",
    [config.sourceInterface, interfaceOptions],
  );

  const loadInterfaces = async () => {
    const response = await ethernetService.getConfig();
    const options = response.interfaces
      .map((iface) => ({
        value: iface.name,
        label: formatInterfaceDisplayName(iface.name, iface.description ?? null),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
    setInterfaceOptions(options);
  };

  const loadConfig = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const [payload] = await Promise.all([vpnDmvpnApi.getConfig(refresh), loadInterfaces()]);
      setConfig(parseState(toRecord(payload.interfaces_tunnel), toRecord(payload.nhrp_tunnel), toRecord(payload.ipsec)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DMVPN configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig(false);
  }, []);

  const handleSave = async () => {
    const tunnel = config.tunnelName.trim() || "tun100";
    const operations: string[] = [
      `delete protocols nhrp tunnel ${quoteCliValue(tunnel)}`,
      `delete interfaces tunnel ${quoteCliValue(tunnel)}`,
    ];

    if (config.ipsecProfileName.trim()) {
      operations.push(`delete vpn ipsec profile ${quoteCliValue(config.ipsecProfileName)}`);
    }

    if (config.enabled) {
      const tunnelBase = `set interfaces tunnel ${quoteCliValue(tunnel)}`;
      const nhrpBase = `set protocols nhrp tunnel ${quoteCliValue(tunnel)}`;

      operations.push(tunnelBase);
      operations.push(`${tunnelBase} encapsulation gre`);
      if (config.tunnelAddress.trim()) operations.push(`${tunnelBase} address ${quoteCliValue(config.tunnelAddress)}`);
      if (config.sourceInterface.trim()) operations.push(`${tunnelBase} source-interface ${quoteCliValue(config.sourceInterface)}`);
      if (config.mtu.trim()) operations.push(`${tunnelBase} mtu ${quoteCliValue(config.mtu)}`);
      if (config.adjustMss.trim()) operations.push(`${tunnelBase} ip adjust-mss ${quoteCliValue(config.adjustMss)}`);
      if (config.greKey.trim()) operations.push(`${tunnelBase} parameters ip key ${quoteCliValue(config.greKey)}`);
      if (config.enableMulticast) operations.push(`${tunnelBase} enable-multicast`);

      operations.push(nhrpBase);
      if (config.nhrpAuthentication.trim()) operations.push(`${nhrpBase} authentication ${quoteCliValue(config.nhrpAuthentication)}`);
      if (config.nhrpHoldtime.trim()) operations.push(`${nhrpBase} holdtime ${quoteCliValue(config.nhrpHoldtime)}`);
      if (config.nhrpNetworkId.trim()) operations.push(`${nhrpBase} network-id ${quoteCliValue(config.nhrpNetworkId)}`);
      if (config.nhrpMulticast.trim()) operations.push(`${nhrpBase} multicast ${quoteCliValue(config.nhrpMulticast)}`);
      if (config.nhrpRedirect) operations.push(`${nhrpBase} redirect`);
      if (config.nhrpShortcut) operations.push(`${nhrpBase} shortcut`);
      if (config.nhrpRegistrationNoUnique) operations.push(`${nhrpBase} registration-no-unique`);

      for (const mapEntry of config.nhrpMaps) {
        const tunnelIp = mapEntry.tunnelIp.trim();
        const nbmaIp = mapEntry.nbmaIp.trim();
        if (!tunnelIp || !nbmaIp) continue;
        operations.push(
          `${nhrpBase} map tunnel-ip ${quoteCliValue(tunnelIp)} nbma ${quoteCliValue(nbmaIp)}`,
        );
      }
      for (const nhsEntry of config.nhrpNhs) {
        const tunnelIp = nhsEntry.tunnelIp.trim();
        const nbmaIp = nhsEntry.nbmaIp.trim();
        if (!tunnelIp || !nbmaIp) continue;
        operations.push(
          `${nhrpBase} nhs tunnel-ip ${quoteCliValue(tunnelIp)} nbma ${quoteCliValue(nbmaIp)}`,
        );
      }

      if (config.ipsecProfileName.trim()) {
        const profileBase = `set vpn ipsec profile ${quoteCliValue(config.ipsecProfileName)}`;
        operations.push(profileBase);
        operations.push(`${profileBase} bind tunnel ${quoteCliValue(tunnel)}`);
        if (config.ipsecPresharedSecret.trim()) {
          operations.push(`${profileBase} authentication mode pre-shared-secret`);
          operations.push(`${profileBase} authentication pre-shared-secret ${quoteCliValue(config.ipsecPresharedSecret)}`);
        }
        if (config.ipsecIkeGroup.trim()) operations.push(`${profileBase} ike-group ${quoteCliValue(config.ipsecIkeGroup)}`);
        if (config.ipsecEspGroup.trim()) operations.push(`${profileBase} esp-group ${quoteCliValue(config.ipsecEspGroup)}`);
      }

      if (config.ipsecInterface.trim()) {
        operations.push(`set vpn ipsec interface ${quoteCliValue(config.ipsecInterface)}`);
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await vpnDmvpnApi.configure(operations);
      await loadConfig(true);
      setSuccess("DMVPN configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update DMVPN configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DMVPN</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure DMVPN using tunnel interface settings, NHRP mappings, and optional IPsec profile binding.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              DMVPN Core
            </CardTitle>
            <CardDescription>
              Applies commands under <code>interfaces tunnel</code>, <code>protocols nhrp</code>, and
              <code> vpn ipsec profile</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading DMVPN configuration...</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={config.enabled}
                    onCheckedChange={(checked) =>
                      setConfig((previous) => ({ ...previous, enabled: checked === true }))
                    }
                    disabled={!canEdit || saving}
                  />
                  <Label className="text-sm font-medium">Enable DMVPN configuration</Label>
                </div>

                <div className="grid gap-3 xl:grid-cols-4">
                  <Input
                    value={config.tunnelName}
                    onChange={(event) => setConfig((previous) => ({ ...previous, tunnelName: event.target.value }))}
                    placeholder="Tunnel name (e.g. tun100)"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  <Input
                    value={config.tunnelAddress}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, tunnelAddress: event.target.value }))
                    }
                    placeholder="Tunnel address (e.g. 10.0.0.1/32)"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  <div className="space-y-2">
                    <Select
                      value={config.sourceInterface || "__unset__"}
                      onValueChange={(value) =>
                        setConfig((previous) => ({
                          ...previous,
                          sourceInterface: value === "__unset__" ? "" : value,
                        }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Source interface" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unset__">No source interface</SelectItem>
                        {interfaceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedSourceInterfaceLabel ? (
                      <p className="text-[11px] text-muted-foreground">{selectedSourceInterfaceLabel}</p>
                    ) : null}
                  </div>
                  <Input
                    value={config.ipsecInterface}
                    onChange={(event) =>
                      setConfig((previous) => ({ ...previous, ipsecInterface: event.target.value }))
                    }
                    placeholder="IPsec interface (e.g. eth0)"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  <Input
                    value={config.mtu}
                    onChange={(event) => setConfig((previous) => ({ ...previous, mtu: event.target.value }))}
                    placeholder="Tunnel MTU"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  <Input
                    value={config.adjustMss}
                    onChange={(event) => setConfig((previous) => ({ ...previous, adjustMss: event.target.value }))}
                    placeholder="Adjust MSS"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  <Input
                    value={config.greKey}
                    onChange={(event) => setConfig((previous) => ({ ...previous, greKey: event.target.value }))}
                    placeholder="GRE key"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={config.enableMulticast}
                      onCheckedChange={(checked) =>
                        setConfig((previous) => ({ ...previous, enableMulticast: checked === true }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    />
                    <Label className="text-sm">Enable multicast on tunnel</Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">NHRP Settings</Label>
                  <div className="grid gap-3 xl:grid-cols-4">
                    <Input
                      value={config.nhrpNetworkId}
                      onChange={(event) =>
                        setConfig((previous) => ({ ...previous, nhrpNetworkId: event.target.value }))
                      }
                      placeholder="NHRP network-id"
                      disabled={!canEdit || saving || !config.enabled}
                    />
                    <Input
                      value={config.nhrpAuthentication}
                      onChange={(event) =>
                        setConfig((previous) => ({ ...previous, nhrpAuthentication: event.target.value }))
                      }
                      placeholder="NHRP authentication secret"
                      disabled={!canEdit || saving || !config.enabled}
                    />
                    <Input
                      value={config.nhrpHoldtime}
                      onChange={(event) =>
                        setConfig((previous) => ({ ...previous, nhrpHoldtime: event.target.value }))
                      }
                      placeholder="NHRP holdtime"
                      disabled={!canEdit || saving || !config.enabled}
                    />
                    <Input
                      value={config.nhrpMulticast}
                      onChange={(event) =>
                        setConfig((previous) => ({ ...previous, nhrpMulticast: event.target.value }))
                      }
                      placeholder="NHRP multicast (dynamic/IP)"
                      disabled={!canEdit || saving || !config.enabled}
                    />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={config.nhrpRedirect}
                        onCheckedChange={(checked) =>
                          setConfig((previous) => ({ ...previous, nhrpRedirect: checked === true }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      Redirect
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={config.nhrpShortcut}
                        onCheckedChange={(checked) =>
                          setConfig((previous) => ({ ...previous, nhrpShortcut: checked === true }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      Shortcut
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={config.nhrpRegistrationNoUnique}
                        onCheckedChange={(checked) =>
                          setConfig((previous) => ({ ...previous, nhrpRegistrationNoUnique: checked === true }))
                        }
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      Registration No Unique
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">NHRP Maps (tunnel-ip to NBMA)</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfig((previous) => ({
                          ...previous,
                          nhrpMaps: [...previous.nhrpMaps, { tunnelIp: "", nbmaIp: "" }],
                        }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Map
                    </Button>
                  </div>
                  {config.nhrpMaps.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No static NHRP maps configured.</p>
                  ) : (
                    <div className="space-y-2">
                      {config.nhrpMaps.map((entry, index) => (
                        <div key={`map-${index}`} className="grid gap-2 xl:grid-cols-[1fr_1fr_auto]">
                          <Input
                            value={entry.tunnelIp}
                            onChange={(event) =>
                              setConfig((previous) => ({
                                ...previous,
                                nhrpMaps: updateRow(previous.nhrpMaps, index, "tunnelIp", event.target.value),
                              }))
                            }
                            placeholder="Tunnel IP"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Input
                            value={entry.nbmaIp}
                            onChange={(event) =>
                              setConfig((previous) => ({
                                ...previous,
                                nhrpMaps: updateRow(previous.nhrpMaps, index, "nbmaIp", event.target.value),
                              }))
                            }
                            placeholder="NBMA IP"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setConfig((previous) => ({
                                ...previous,
                                nhrpMaps: previous.nhrpMaps.filter((_, currentIndex) => currentIndex !== index),
                              }))
                            }
                            disabled={!canEdit || saving || !config.enabled}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">NHS Entries (hub lookup)</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfig((previous) => ({
                          ...previous,
                          nhrpNhs: [...previous.nhrpNhs, { tunnelIp: "", nbmaIp: "" }],
                        }))
                      }
                      disabled={!canEdit || saving || !config.enabled}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add NHS
                    </Button>
                  </div>
                  {config.nhrpNhs.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No NHS entries configured.</p>
                  ) : (
                    <div className="space-y-2">
                      {config.nhrpNhs.map((entry, index) => (
                        <div key={`nhs-${index}`} className="grid gap-2 xl:grid-cols-[1fr_1fr_auto]">
                          <Input
                            value={entry.tunnelIp}
                            onChange={(event) =>
                              setConfig((previous) => ({
                                ...previous,
                                nhrpNhs: updateRow(previous.nhrpNhs, index, "tunnelIp", event.target.value),
                              }))
                            }
                            placeholder="NHS tunnel IP"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Input
                            value={entry.nbmaIp}
                            onChange={(event) =>
                              setConfig((previous) => ({
                                ...previous,
                                nhrpNhs: updateRow(previous.nhrpNhs, index, "nbmaIp", event.target.value),
                              }))
                            }
                            placeholder="NHS NBMA IP"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setConfig((previous) => ({
                                ...previous,
                                nhrpNhs: previous.nhrpNhs.filter((_, currentIndex) => currentIndex !== index),
                              }))
                            }
                            disabled={!canEdit || saving || !config.enabled}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Optional IPsec Profile Bind</Label>
                  <div className="grid gap-3 xl:grid-cols-4">
                    <Input
                      value={config.ipsecProfileName}
                      onChange={(event) =>
                        setConfig((previous) => ({ ...previous, ipsecProfileName: event.target.value }))
                      }
                      placeholder="Profile name (e.g. NHRPVPN)"
                      disabled={!canEdit || saving || !config.enabled}
                    />
                    <Input
                      type="password"
                      value={config.ipsecPresharedSecret}
                      onChange={(event) =>
                        setConfig((previous) => ({ ...previous, ipsecPresharedSecret: event.target.value }))
                      }
                      placeholder="Pre-shared secret"
                      disabled={!canEdit || saving || !config.enabled}
                    />
                    <Input
                      value={config.ipsecIkeGroup}
                      onChange={(event) =>
                        setConfig((previous) => ({ ...previous, ipsecIkeGroup: event.target.value }))
                      }
                      placeholder="IKE group"
                      disabled={!canEdit || saving || !config.enabled}
                    />
                    <Input
                      value={config.ipsecEspGroup}
                      onChange={(event) =>
                        setConfig((previous) => ({ ...previous, ipsecEspGroup: event.target.value }))
                      }
                      placeholder="ESP group"
                      disabled={!canEdit || saving || !config.enabled}
                    />
                  </div>
                </div>

                {error ? (
                  <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>{error}</span>
                  </div>
                ) : null}

                {success ? (
                  <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                    {success}
                  </div>
                ) : null}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => loadConfig(true)} disabled={saving}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  <Button onClick={handleSave} disabled={!canEdit || saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save DMVPN"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
