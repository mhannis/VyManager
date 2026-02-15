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
import { showService } from "@/lib/api/show";
import {
  type WirelessInterfaceConfig,
  type WirelessRadiusServer,
  wirelessService,
} from "@/lib/api/wireless";
import { pageGuides } from "@/lib/help/pageGuides";

interface WirelessFormState {
  name: string;
  description: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  channel: string;
  ssid: string;
  type: string;
  mode: string;
  physicalDevice: string;
  maxStations: string;
  reduceTransmitPower: string;
  mgmtFrameProtection: string;
  disableBroadcastSsid: boolean;
  expungeFailingStations: boolean;
  isolateStations: boolean;
  enableBfProtection: boolean;
  perClientThread: boolean;
  wpaMode: string;
  wpaPassphrase: string;
  wpaCiphers: string[];
  wpaRadiusServers: WirelessRadiusServer[];
  capRequireHt: boolean;
  capRequireVht: boolean;
  capRequireHe: boolean;
  capHt40MhzIncapable: boolean;
  capHtAutoPowersave: boolean;
  capHtDsssCck40: boolean;
  capHtGreenfield: boolean;
  capHtLdpc: boolean;
  capHtLsigProtection: boolean;
  capHtStbcTx: boolean;
  capHtChannelSetWidth: string[];
  capHtShortGi: string[];
  capHtSmps: string;
  capHtStbcRx: string;
}

const TYPE_OPTIONS = ["access-point", "station", "monitor"] as const;
const MODE_OPTIONS = ["a", "b", "g", "n", "ac", "ax"] as const;
const WPA_MODE_OPTIONS = ["wpa2", "wpa3", "wpa2-wpa3"] as const;
const WPA_CIPHER_OPTIONS = ["CCMP", "CCMP-256", "GCMP", "GCMP-256", "TKIP"] as const;
const MGMT_FRAME_PROTECTION_OPTIONS = ["optional", "required"] as const;
const HT_CHANNEL_WIDTH_OPTIONS = ["ht20", "ht40-", "ht40+"] as const;
const HT_SHORT_GI_OPTIONS = ["20", "40"] as const;
const HT_SMPS_OPTIONS = ["off", "static", "dynamic"] as const;

const EMPTY_FORM: WirelessFormState = {
  name: "",
  description: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  disable: false,
  channel: "",
  ssid: "",
  type: "station",
  mode: "g",
  physicalDevice: "",
  maxStations: "",
  reduceTransmitPower: "",
  mgmtFrameProtection: "",
  disableBroadcastSsid: false,
  expungeFailingStations: false,
  isolateStations: false,
  enableBfProtection: false,
  perClientThread: false,
  wpaMode: "",
  wpaPassphrase: "",
  wpaCiphers: [],
  wpaRadiusServers: [],
  capRequireHt: false,
  capRequireVht: false,
  capRequireHe: false,
  capHt40MhzIncapable: false,
  capHtAutoPowersave: false,
  capHtDsssCck40: false,
  capHtGreenfield: false,
  capHtLdpc: false,
  capHtLsigProtection: false,
  capHtStbcTx: false,
  capHtChannelSetWidth: [],
  capHtShortGi: [],
  capHtSmps: "",
  capHtStbcRx: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+-]+$/.test(trimmed)) return trimmed;
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

function parseLines(raw: string): string[] {
  return uniqueNonEmpty(raw.split("\n"));
}

function normalizeRadiusServers(entries: WirelessRadiusServer[]): WirelessRadiusServer[] {
  const seen = new Set<string>();
  const out: WirelessRadiusServer[] = [];
  for (const entry of entries) {
    const host = entry.host.trim();
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push({
      host,
      key: entry.key.trim(),
      port: entry.port.trim(),
    });
  }
  return out.sort((left, right) => left.host.localeCompare(right.host));
}

function toFormState(value: WirelessInterfaceConfig): WirelessFormState {
  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
    channel: value.channel,
    ssid: value.ssid,
    type: value.type || "station",
    mode: value.mode || "g",
    physicalDevice: value.physicalDevice,
    maxStations: value.maxStations,
    reduceTransmitPower: value.reduceTransmitPower,
    mgmtFrameProtection: value.mgmtFrameProtection,
    disableBroadcastSsid: value.disableBroadcastSsid,
    expungeFailingStations: value.expungeFailingStations,
    isolateStations: value.isolateStations,
    enableBfProtection: value.enableBfProtection,
    perClientThread: value.perClientThread,
    wpaMode: value.wpaMode,
    wpaPassphrase: value.wpaPassphrase,
    wpaCiphers: value.wpaCiphers,
    wpaRadiusServers: value.wpaRadiusServers,
    capRequireHt: value.capRequireHt,
    capRequireVht: value.capRequireVht,
    capRequireHe: value.capRequireHe,
    capHt40MhzIncapable: value.capHt40MhzIncapable,
    capHtAutoPowersave: value.capHtAutoPowersave,
    capHtDsssCck40: value.capHtDsssCck40,
    capHtGreenfield: value.capHtGreenfield,
    capHtLdpc: value.capHtLdpc,
    capHtLsigProtection: value.capHtLsigProtection,
    capHtStbcTx: value.capHtStbcTx,
    capHtChannelSetWidth: value.capHtChannelSetWidth,
    capHtShortGi: value.capHtShortGi,
    capHtSmps: value.capHtSmps,
    capHtStbcRx: value.capHtStbcRx,
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

function syncTagList(
  operations: string[],
  base: string,
  token: string,
  desired: string[],
  current: string[],
): void {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);

  for (const entry of current) {
    if (!desiredSet.has(entry)) {
      operations.push(`delete ${base} ${token} ${quoteCliValue(entry)}`);
    }
  }
  for (const entry of desired) {
    if (!currentSet.has(entry)) {
      operations.push(`set ${base} ${token} ${quoteCliValue(entry)}`);
    }
  }
}

function buildWirelessOperations(
  candidate: WirelessFormState,
  current: WirelessInterfaceConfig | null,
  desiredCountryCode: string,
  currentCountryCode: string,
): string[] {
  const operations: string[] = [];
  const base = `interfaces wireless ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      addresses: [],
      mtu: "",
      vrf: "",
      disable: false,
      channel: "",
      ssid: "",
      type: "",
      mode: "",
      physicalDevice: "",
      maxStations: "",
      reduceTransmitPower: "",
      mgmtFrameProtection: "",
      disableBroadcastSsid: false,
      expungeFailingStations: false,
      isolateStations: false,
      enableBfProtection: false,
      perClientThread: false,
      wpaMode: "",
      wpaPassphrase: "",
      wpaCiphers: [],
      wpaRadiusServers: [],
      capRequireHt: false,
      capRequireVht: false,
      capRequireHe: false,
      capHt40MhzIncapable: false,
      capHtAutoPowersave: false,
      capHtDsssCck40: false,
      capHtGreenfield: false,
      capHtLdpc: false,
      capHtLsigProtection: false,
      capHtStbcTx: false,
      capHtChannelSetWidth: [],
      capHtShortGi: [],
      capHtSmps: "",
      capHtStbcRx: "",
    } satisfies WirelessInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);
  syncScalar(operations, base, "channel", candidate.channel.trim(), currentSafe.channel);
  syncScalar(operations, base, "ssid", candidate.ssid.trim(), currentSafe.ssid);
  syncScalar(operations, base, "type", candidate.type.trim(), currentSafe.type);
  syncScalar(operations, base, "mode", candidate.mode.trim(), currentSafe.mode);
  syncScalar(
    operations,
    base,
    "physical-device",
    candidate.physicalDevice.trim(),
    currentSafe.physicalDevice,
  );
  syncScalar(
    operations,
    base,
    "max-stations",
    candidate.maxStations.trim(),
    currentSafe.maxStations,
  );
  syncScalar(
    operations,
    base,
    "reduce-transmit-power",
    candidate.reduceTransmitPower.trim(),
    currentSafe.reduceTransmitPower,
  );
  syncScalar(
    operations,
    base,
    "mgmt-frame-protection",
    candidate.mgmtFrameProtection.trim(),
    currentSafe.mgmtFrameProtection,
  );
  syncScalar(operations, base, "security wpa mode", candidate.wpaMode.trim(), currentSafe.wpaMode);
  syncScalar(
    operations,
    base,
    "security wpa passphrase",
    candidate.wpaPassphrase.trim(),
    currentSafe.wpaPassphrase,
  );
  syncScalar(
    operations,
    base,
    "capabilities ht smps",
    candidate.capHtSmps.trim(),
    currentSafe.capHtSmps,
  );
  syncScalar(
    operations,
    base,
    "capabilities ht stbc rx",
    candidate.capHtStbcRx.trim(),
    currentSafe.capHtStbcRx,
  );

  syncTagList(operations, base, "address", parseLines(candidate.addressesText), currentSafe.addresses);
  syncTagList(operations, base, "security wpa cipher", candidate.wpaCiphers, currentSafe.wpaCiphers);
  syncTagList(
    operations,
    base,
    "capabilities ht channel-set-width",
    candidate.capHtChannelSetWidth,
    currentSafe.capHtChannelSetWidth,
  );
  syncTagList(
    operations,
    base,
    "capabilities ht short-gi",
    candidate.capHtShortGi,
    currentSafe.capHtShortGi,
  );

  syncFlag(operations, base, "disable", candidate.disable, currentSafe.disable);
  syncFlag(
    operations,
    base,
    "disable-broadcast-ssid",
    candidate.disableBroadcastSsid,
    currentSafe.disableBroadcastSsid,
  );
  syncFlag(
    operations,
    base,
    "expunge-failing-stations",
    candidate.expungeFailingStations,
    currentSafe.expungeFailingStations,
  );
  syncFlag(
    operations,
    base,
    "isolate-stations",
    candidate.isolateStations,
    currentSafe.isolateStations,
  );
  syncFlag(
    operations,
    base,
    "enable-bf-protection",
    candidate.enableBfProtection,
    currentSafe.enableBfProtection,
  );
  syncFlag(
    operations,
    base,
    "per-client-thread",
    candidate.perClientThread,
    currentSafe.perClientThread,
  );
  syncFlag(operations, base, "capabilities require-ht", candidate.capRequireHt, currentSafe.capRequireHt);
  syncFlag(
    operations,
    base,
    "capabilities require-vht",
    candidate.capRequireVht,
    currentSafe.capRequireVht,
  );
  syncFlag(operations, base, "capabilities require-he", candidate.capRequireHe, currentSafe.capRequireHe);
  syncFlag(
    operations,
    base,
    "capabilities ht 40mhz-incapable",
    candidate.capHt40MhzIncapable,
    currentSafe.capHt40MhzIncapable,
  );
  syncFlag(
    operations,
    base,
    "capabilities ht auto-powersave",
    candidate.capHtAutoPowersave,
    currentSafe.capHtAutoPowersave,
  );
  syncFlag(
    operations,
    base,
    "capabilities ht dsss-cck-40",
    candidate.capHtDsssCck40,
    currentSafe.capHtDsssCck40,
  );
  syncFlag(
    operations,
    base,
    "capabilities ht greenfield",
    candidate.capHtGreenfield,
    currentSafe.capHtGreenfield,
  );
  syncFlag(operations, base, "capabilities ht ldpc", candidate.capHtLdpc, currentSafe.capHtLdpc);
  syncFlag(
    operations,
    base,
    "capabilities ht lsig-protection",
    candidate.capHtLsigProtection,
    currentSafe.capHtLsigProtection,
  );
  syncFlag(
    operations,
    base,
    "capabilities ht stbc tx",
    candidate.capHtStbcTx,
    currentSafe.capHtStbcTx,
  );

  const currentRadius = new Map(currentSafe.wpaRadiusServers.map((entry) => [entry.host, entry]));
  const desiredRadiusEntries = normalizeRadiusServers(candidate.wpaRadiusServers);
  const desiredRadius = new Map(desiredRadiusEntries.map((entry) => [entry.host, entry]));

  for (const host of currentRadius.keys()) {
    if (!desiredRadius.has(host)) {
      operations.push(`delete ${base} security wpa radius server ${quoteCliValue(host)}`);
    }
  }

  for (const desired of desiredRadiusEntries) {
    const existing = currentRadius.get(desired.host);
    if (!existing || existing.port !== desired.port) {
      if (desired.port) {
        operations.push(
          `set ${base} security wpa radius server ${quoteCliValue(desired.host)} port ${quoteCliValue(desired.port)}`,
        );
      } else if (existing?.port) {
        operations.push(`delete ${base} security wpa radius server ${quoteCliValue(desired.host)} port`);
      }
    }

    if (!existing || existing.key !== desired.key) {
      if (desired.key) {
        operations.push(
          `set ${base} security wpa radius server ${quoteCliValue(desired.host)} key ${quoteCliValue(desired.key)}`,
        );
      } else if (existing?.key) {
        operations.push(`delete ${base} security wpa radius server ${quoteCliValue(desired.host)} key`);
      }
    }
  }

  if (desiredCountryCode !== currentCountryCode) {
    if (desiredCountryCode) {
      operations.push(`set system wireless country-code ${quoteCliValue(desiredCountryCode)}`);
    } else {
      operations.push("delete system wireless country-code");
    }
  }

  return operations;
}

export default function WirelessInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<WirelessInterfaceConfig[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<WirelessFormState>(EMPTY_FORM);
  const [detectedInterfaceNames, setDetectedInterfaceNames] = useState<string[]>([]);
  const [countryCode, setCountryCode] = useState("");
  const [initialCountryCode, setInitialCountryCode] = useState("");

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const [config, allInterfaces] = await Promise.all([
        wirelessService.getConfig(refresh),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);
      setInterfaces(config.interfaces);
      const nextCountryCode = config.countryCode || "";
      setCountryCode(nextCountryCode);
      setInitialCountryCode(nextCountryCode);

      const names = allInterfaces.interfaces
        .filter((entry) => entry.type === "wireless" || entry.name.toLowerCase().startsWith("wlan"))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
      setDetectedInterfaceNames(names);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wireless interface data.");
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

  const editInterface = (value: WirelessInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete wireless interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await wirelessService.batchConfigure([
        `delete interfaces wireless ${quoteCliValue(name)}`,
      ]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected wireless deletion.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`Wireless interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete wireless interface.");
    } finally {
      setSaving(false);
    }
  };

  const saveInterface = async () => {
    const name = form.name.trim();
    const normalizedCountryCode = countryCode.trim().toLowerCase();
    if (!name) {
      setError("Interface name is required.");
      return;
    }
    if (editingName && editingName !== name) {
      setError(
        "Renaming wireless interfaces is not supported. Create a new interface and remove the old one.",
      );
      return;
    }
    if (form.type === "access-point" && !normalizedCountryCode) {
      setError("Wireless country code is required when interface type is access-point.");
      return;
    }

    const numericFields = [
      { label: "MTU", value: form.mtu },
      { label: "Channel", value: form.channel },
      { label: "Max stations", value: form.maxStations },
      { label: "Reduce transmit power", value: form.reduceTransmitPower },
      { label: "HT STBC RX", value: form.capHtStbcRx },
    ];
    for (const field of numericFields) {
      const trimmed = field.value.trim();
      if (!trimmed) continue;
      if (!/^\d+$/.test(trimmed)) {
        setError(`${field.label} must be a whole number.`);
        return;
      }
    }

    const radiusServers = normalizeRadiusServers(form.wpaRadiusServers);
    const invalidRadius = radiusServers.find((entry) => !entry.key);
    if (invalidRadius) {
      setError(`RADIUS server '${invalidRadius.host}' requires a shared key.`);
      return;
    }

    const current = interfaces.find((entry) => entry.name === name) || null;
    const operations = buildWirelessOperations(
      { ...form, name, wpaRadiusServers: radiusServers },
      current,
      normalizedCountryCode,
      initialCountryCode,
    );
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await wirelessService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected wireless configuration.");
      }
      await loadData(true);
      setSuccess(current ? `Wireless interface '${name}' updated.` : `Wireless interface '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save wireless interface.");
    } finally {
      setSaving(false);
    }
  };

  const disabledCount = useMemo(() => interfaces.filter((entry) => entry.disable).length, [interfaces]);
  const hasDetectedHardware = detectedInterfaceNames.length > 0 || interfaces.length > 0;

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
            <h1 className="text-3xl font-bold">Wireless Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure WLAN interfaces under `interfaces wireless` with AP/station settings.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.wirelessInterfaces} />
        </div>

        {!hasDetectedHardware && (
          <Card className="border-amber-500/40">
            <CardHeader>
              <CardTitle className="text-base text-amber-300">No Wireless Device Detected</CardTitle>
              <CardDescription>
                No `wlan*` interface is currently visible on this node. You can still pre-stage interface
                configuration for supported hardware.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>System Wireless Country Code</CardTitle>
            <CardDescription>
              Set the regulatory domain (`system wireless country-code`). Required for access-point mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="wireless-country-code">Country Code</Label>
              <Input
                id="wireless-country-code"
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
                placeholder="us"
                maxLength={2}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              This value is applied together with interface changes using Safe Apply. Use ISO 3166-1 alpha-2
              codes such as `us`, `de`, or `fr`.
            </div>
          </CardContent>
        </Card>

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
              <CardTitle>Configured Wireless Interfaces</CardTitle>
              <CardDescription>
                {interfaces.length} interface{interfaces.length === 1 ? "" : "s"} configured
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Disabled: {disabledCount}</Badge>
                  <Badge variant="outline">Detected: {detectedInterfaceNames.length}</Badge>
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
                      <TableHead>SSID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          No wireless interfaces configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      interfaces.map((entry) => (
                        <TableRow key={entry.name}>
                          <TableCell className="font-medium">{entry.name}</TableCell>
                          <TableCell>{entry.ssid || "-"}</TableCell>
                          <TableCell>{entry.type || "-"}</TableCell>
                          <TableCell>{entry.mode || "-"}</TableCell>
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create Wireless Interface"}</CardTitle>
              <CardDescription>Configure basic WLAN, WPA, and HT capability controls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wireless-name">Interface Name</Label>
                  <Input
                    id="wireless-name"
                    value={form.name}
                    onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                    placeholder="wlan0"
                    disabled={Boolean(editingName)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wireless-ssid">SSID</Label>
                  <Input
                    id="wireless-ssid"
                    value={form.ssid}
                    onChange={(event) => setForm((previous) => ({ ...previous, ssid: event.target.value }))}
                    placeholder="VyOS-LAB"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wireless-description">Description</Label>
                <Input
                  id="wireless-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="Office Wi-Fi AP"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="wireless-type">Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(value) => setForm((previous) => ({ ...previous, type: value }))}
                  >
                    <SelectTrigger id="wireless-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wireless-mode">Mode</Label>
                  <Select
                    value={form.mode}
                    onValueChange={(value) => setForm((previous) => ({ ...previous, mode: value }))}
                  >
                    <SelectTrigger id="wireless-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wireless-channel">Channel</Label>
                  <Input
                    id="wireless-channel"
                    value={form.channel}
                    onChange={(event) => setForm((previous) => ({ ...previous, channel: event.target.value }))}
                    placeholder="11"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wireless-physical-device">Physical Device</Label>
                  <Input
                    id="wireless-physical-device"
                    value={form.physicalDevice}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, physicalDevice: event.target.value }))
                    }
                    placeholder="phy0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wireless-mgmt-frame">Management Frame Protection</Label>
                  <Select
                    value={form.mgmtFrameProtection || "none"}
                    onValueChange={(value) =>
                      setForm((previous) => ({
                        ...previous,
                        mgmtFrameProtection: value === "none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger id="wireless-mgmt-frame">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      {MGMT_FRAME_PROTECTION_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wireless-addresses">Addresses / DHCP</Label>
                  <Textarea
                    id="wireless-addresses"
                    value={form.addressesText}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, addressesText: event.target.value }))
                    }
                    placeholder={"dhcp\n192.168.20.1/24"}
                    className="min-h-[90px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wireless-wpa-passphrase">WPA Passphrase</Label>
                  <Input
                    id="wireless-wpa-passphrase"
                    value={form.wpaPassphrase}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, wpaPassphrase: event.target.value }))
                    }
                    placeholder="super-secure-passphrase"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="wireless-wpa-mode">WPA Mode</Label>
                  <Select
                    value={form.wpaMode || "none"}
                    onValueChange={(value) =>
                      setForm((previous) => ({ ...previous, wpaMode: value === "none" ? "" : value }))
                    }
                  >
                    <SelectTrigger id="wireless-wpa-mode">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      {WPA_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wireless-mtu">MTU</Label>
                  <Input
                    id="wireless-mtu"
                    value={form.mtu}
                    onChange={(event) => setForm((previous) => ({ ...previous, mtu: event.target.value }))}
                    placeholder="1500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wireless-vrf">VRF</Label>
                  <Input
                    id="wireless-vrf"
                    value={form.vrf}
                    onChange={(event) => setForm((previous) => ({ ...previous, vrf: event.target.value }))}
                    placeholder="BLUE"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wireless-max-stations">Max Stations</Label>
                  <Input
                    id="wireless-max-stations"
                    value={form.maxStations}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, maxStations: event.target.value }))
                    }
                    placeholder="2007"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wireless-reduce-tx-power">Reduce TX Power</Label>
                  <Input
                    id="wireless-reduce-tx-power"
                    value={form.reduceTransmitPower}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, reduceTransmitPower: event.target.value }))
                    }
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>WPA Ciphers</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {WPA_CIPHER_OPTIONS.map((cipher) => (
                    <label key={cipher} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.wpaCiphers.includes(cipher)}
                        onCheckedChange={(checked) =>
                          setForm((previous) => ({
                            ...previous,
                            wpaCiphers: checked
                              ? uniqueNonEmpty([...previous.wpaCiphers, cipher])
                              : previous.wpaCiphers.filter((entry) => entry !== cipher),
                          }))
                        }
                      />
                      {cipher}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>RADIUS Servers (optional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm((previous) => ({
                        ...previous,
                        wpaRadiusServers: [...previous.wpaRadiusServers, { host: "", key: "", port: "" }],
                      }))
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add RADIUS
                  </Button>
                </div>
                {form.wpaRadiusServers.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No RADIUS servers configured.</div>
                ) : (
                  <div className="space-y-2">
                    {form.wpaRadiusServers.map((server, index) => (
                      <div key={`${server.host}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_120px_1fr_auto]">
                        <Input
                          value={server.host}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              wpaRadiusServers: previous.wpaRadiusServers.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, host: event.target.value } : entry,
                              ),
                            }))
                          }
                          placeholder="192.0.2.10"
                        />
                        <Input
                          value={server.port}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              wpaRadiusServers: previous.wpaRadiusServers.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, port: event.target.value } : entry,
                              ),
                            }))
                          }
                          placeholder="1812"
                        />
                        <Input
                          value={server.key}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              wpaRadiusServers: previous.wpaRadiusServers.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, key: event.target.value } : entry,
                              ),
                            }))
                          }
                          placeholder="shared-secret"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() =>
                            setForm((previous) => ({
                              ...previous,
                              wpaRadiusServers: previous.wpaRadiusServers.filter(
                                (_, entryIndex) => entryIndex !== index,
                              ),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label>HT Capability Sets</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {HT_CHANNEL_WIDTH_OPTIONS.map((value) => (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.capHtChannelSetWidth.includes(value)}
                        onCheckedChange={(checked) =>
                          setForm((previous) => ({
                            ...previous,
                            capHtChannelSetWidth: checked
                              ? uniqueNonEmpty([...previous.capHtChannelSetWidth, value])
                              : previous.capHtChannelSetWidth.filter((entry) => entry !== value),
                          }))
                        }
                      />
                      channel-set-width {value}
                    </label>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {HT_SHORT_GI_OPTIONS.map((value) => (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.capHtShortGi.includes(value)}
                        onCheckedChange={(checked) =>
                          setForm((previous) => ({
                            ...previous,
                            capHtShortGi: checked
                              ? uniqueNonEmpty([...previous.capHtShortGi, value])
                              : previous.capHtShortGi.filter((entry) => entry !== value),
                          }))
                        }
                      />
                      short-gi {value}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wireless-ht-smps">HT SMPS</Label>
                  <Select
                    value={form.capHtSmps || "none"}
                    onValueChange={(value) =>
                      setForm((previous) => ({ ...previous, capHtSmps: value === "none" ? "" : value }))
                    }
                  >
                    <SelectTrigger id="wireless-ht-smps">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      {HT_SMPS_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wireless-ht-stbc-rx">HT STBC RX</Label>
                  <Input
                    id="wireless-ht-stbc-rx"
                    value={form.capHtStbcRx}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, capHtStbcRx: event.target.value }))
                    }
                    placeholder="1"
                  />
                </div>
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
                    checked={form.disableBroadcastSsid}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, disableBroadcastSsid: Boolean(checked) }))
                    }
                  />
                  Disable broadcast SSID
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.expungeFailingStations}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, expungeFailingStations: Boolean(checked) }))
                    }
                  />
                  Expunge failing stations
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.isolateStations}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, isolateStations: Boolean(checked) }))
                    }
                  />
                  Isolate stations
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.enableBfProtection}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, enableBfProtection: Boolean(checked) }))
                    }
                  />
                  Enable beacon-frame protection
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.perClientThread}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, perClientThread: Boolean(checked) }))
                    }
                  />
                  Per-client thread
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.capRequireHt}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, capRequireHt: Boolean(checked) }))
                    }
                  />
                  Require HT
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.capRequireVht}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, capRequireVht: Boolean(checked) }))
                    }
                  />
                  Require VHT
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.capRequireHe}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, capRequireHe: Boolean(checked) }))
                    }
                  />
                  Require HE
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.capHt40MhzIncapable}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, capHt40MhzIncapable: Boolean(checked) }))
                    }
                  />
                  HT 40MHz incapable
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.capHtAutoPowersave}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, capHtAutoPowersave: Boolean(checked) }))
                    }
                  />
                  HT auto powersave
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.capHtDsssCck40}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, capHtDsssCck40: Boolean(checked) }))
                    }
                  />
                  HT DSSS-CCK-40
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.capHtGreenfield}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, capHtGreenfield: Boolean(checked) }))
                    }
                  />
                  HT Greenfield
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.capHtLdpc}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, capHtLdpc: Boolean(checked) }))
                    }
                  />
                  HT LDPC
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.capHtLsigProtection}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, capHtLsigProtection: Boolean(checked) }))
                    }
                  />
                  HT L-SIG protection
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.capHtStbcTx}
                    onCheckedChange={(checked) =>
                      setForm((previous) => ({ ...previous, capHtStbcTx: Boolean(checked) }))
                    }
                  />
                  HT STBC TX
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
