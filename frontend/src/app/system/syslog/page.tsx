"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import {
  systemSyslogService,
  type SyslogFacilityRule,
  type SyslogFileRule,
  type SyslogRemoteRule,
  type SystemSyslogConfig,
} from "@/lib/api/system-syslog";

interface SyslogFormState {
  markerDisabled: boolean;
  markerInterval: string;
  preserveFqdn: boolean;
  sourceAddress: string;
  consoleRules: SyslogFacilityRule[];
  fileRules: SyslogFileRule[];
  remoteRules: SyslogRemoteRule[];
}

interface RemoteGroup {
  address: string;
  protocol: "udp" | "tcp";
  port: string;
  vrf: string;
  sourceAddress: string;
  includeTimezone: boolean;
  octetCounted: boolean;
  tls: boolean;
  tlsCaCertificate: string;
  tlsCertificate: string;
  tlsAuthMode: string;
  tlsPermittedPeers: string;
  facilities: Record<string, string>;
}

const LOG_LEVELS = [
  "emerg",
  "alert",
  "crit",
  "err",
  "warning",
  "notice",
  "info",
  "debug",
];

const LOG_FACILITIES = [
  "all",
  "kern",
  "user",
  "mail",
  "daemon",
  "auth",
  "syslog",
  "lpr",
  "news",
  "uucp",
  "cron",
  "authpriv",
  "ftp",
  "ntp",
  "security",
  "console",
  "solaris-cron",
  "local0",
  "local1",
  "local2",
  "local3",
  "local4",
  "local5",
  "local6",
  "local7",
];

const TLS_AUTH_MODES = ["anon", "certvalid", "name", "fingerprint"];

const EMPTY_CONSOLE_RULE: SyslogFacilityRule = {
  facility: "all",
  level: "notice",
};

const EMPTY_FILE_RULE: SyslogFileRule = {
  file: "",
  facility: "all",
  level: "notice",
};

const EMPTY_REMOTE_RULE: SyslogRemoteRule = {
  address: "",
  facility: "all",
  level: "notice",
  protocol: "udp",
  port: "",
  vrf: "",
  sourceAddress: "",
  includeTimezone: false,
  octetCounted: false,
  tls: false,
  tlsCaCertificate: "",
  tlsCertificate: "",
  tlsAuthMode: "certvalid",
  tlsPermittedPeers: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function sanitizeRule(rule: SyslogFacilityRule): SyslogFacilityRule {
  return {
    facility: rule.facility.trim(),
    level: rule.level.trim().toLowerCase(),
  };
}

function sanitizeFileRule(rule: SyslogFileRule): SyslogFileRule {
  return {
    file: rule.file.trim(),
    facility: rule.facility.trim(),
    level: rule.level.trim().toLowerCase(),
  };
}

function sanitizeRemoteRule(rule: SyslogRemoteRule): SyslogRemoteRule {
  return {
    address: rule.address.trim(),
    facility: rule.facility.trim(),
    level: rule.level.trim().toLowerCase(),
    protocol: rule.protocol === "tcp" ? "tcp" : "udp",
    port: rule.port.trim(),
    vrf: rule.vrf.trim(),
    sourceAddress: rule.sourceAddress.trim(),
    includeTimezone: Boolean(rule.includeTimezone),
    octetCounted: Boolean(rule.octetCounted),
    tls: Boolean(rule.tls),
    tlsCaCertificate: rule.tlsCaCertificate.trim(),
    tlsCertificate: rule.tlsCertificate.trim(),
    tlsAuthMode: rule.tlsAuthMode.trim().toLowerCase(),
    tlsPermittedPeers: rule.tlsPermittedPeers
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .join(", "),
  };
}

function sortRules(rules: SyslogFacilityRule[]): SyslogFacilityRule[] {
  return [...rules].sort((left, right) => {
    const facility = left.facility.localeCompare(right.facility);
    if (facility !== 0) return facility;
    return left.level.localeCompare(right.level);
  });
}

function sortFileRules(rules: SyslogFileRule[]): SyslogFileRule[] {
  return [...rules].sort((left, right) => {
    const file = left.file.localeCompare(right.file);
    if (file !== 0) return file;
    const facility = left.facility.localeCompare(right.facility);
    if (facility !== 0) return facility;
    return left.level.localeCompare(right.level);
  });
}

function sortRemoteRules(rules: SyslogRemoteRule[]): SyslogRemoteRule[] {
  return [...rules].sort((left, right) => {
    const address = left.address.localeCompare(right.address);
    if (address !== 0) return address;
    const facility = left.facility.localeCompare(right.facility);
    if (facility !== 0) return facility;
    return left.level.localeCompare(right.level);
  });
}

function normalizeState(state: SyslogFormState): SyslogFormState {
  return {
    markerDisabled: Boolean(state.markerDisabled),
    markerInterval: state.markerInterval.trim(),
    preserveFqdn: Boolean(state.preserveFqdn),
    sourceAddress: state.sourceAddress.trim(),
    consoleRules: sortRules(state.consoleRules.map(sanitizeRule).filter((rule) => rule.facility || rule.level)),
    fileRules: sortFileRules(
      state.fileRules.map(sanitizeFileRule).filter((rule) => rule.file || rule.facility || rule.level),
    ),
    remoteRules: sortRemoteRules(
      state.remoteRules
        .map(sanitizeRemoteRule)
        .filter(
          (rule) =>
            rule.address ||
            rule.facility ||
            rule.level ||
            rule.port ||
            rule.vrf ||
            rule.sourceAddress ||
            rule.tlsCaCertificate ||
            rule.tlsCertificate ||
            rule.tlsPermittedPeers,
        ),
    ),
  };
}

function toFormState(config: SystemSyslogConfig): SyslogFormState {
  return normalizeState({
    markerDisabled: config.markerDisabled,
    markerInterval: config.markerInterval,
    preserveFqdn: config.preserveFqdn,
    sourceAddress: config.sourceAddress,
    consoleRules: config.consoleRules.length > 0 ? config.consoleRules : [{ ...EMPTY_CONSOLE_RULE }],
    fileRules: config.fileRules.length > 0 ? config.fileRules : [{ ...EMPTY_FILE_RULE }],
    remoteRules: config.remoteRules.length > 0 ? config.remoteRules : [{ ...EMPTY_REMOTE_RULE }],
  });
}

function mapRules(rules: SyslogFacilityRule[]): Map<string, string> {
  const mapped = new Map<string, string>();
  for (const rule of rules) {
    mapped.set(rule.facility, rule.level);
  }
  return mapped;
}

function groupFileRules(rules: SyslogFileRule[]): Map<string, Map<string, string>> {
  const grouped = new Map<string, Map<string, string>>();
  for (const rule of rules) {
    if (!grouped.has(rule.file)) {
      grouped.set(rule.file, new Map<string, string>());
    }
    grouped.get(rule.file)!.set(rule.facility, rule.level);
  }
  return grouped;
}

function splitPeers(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function groupRemoteRules(rules: SyslogRemoteRule[]): Map<string, RemoteGroup> {
  const grouped = new Map<string, RemoteGroup>();
  for (const rule of rules) {
    const address = rule.address;
    if (!grouped.has(address)) {
      grouped.set(address, {
        address,
        protocol: rule.protocol,
        port: rule.port,
        vrf: rule.vrf,
        sourceAddress: rule.sourceAddress,
        includeTimezone: rule.includeTimezone,
        octetCounted: rule.octetCounted,
        tls: rule.tls,
        tlsCaCertificate: rule.tlsCaCertificate,
        tlsCertificate: rule.tlsCertificate,
        tlsAuthMode: rule.tlsAuthMode,
        tlsPermittedPeers: rule.tlsPermittedPeers,
        facilities: {},
      });
    }
    grouped.get(address)!.facilities[rule.facility] = rule.level;
  }
  return grouped;
}

function buildOperations(
  current: SystemSyslogConfig | null,
  formState: SyslogFormState,
): { operations: string[]; validationError: string | null } {
  const form = normalizeState(formState);
  const operations: string[] = [];
  const base = "system syslog";
  const currentNormalized = current ? toFormState(current) : null;

  if (form.markerInterval && !/^\d+$/.test(form.markerInterval)) {
    return { operations: [], validationError: "Marker interval must be a whole number of seconds." };
  }

  for (const [index, rule] of form.consoleRules.entries()) {
    if (!rule.facility || !rule.level) {
      return { operations: [], validationError: `Console rule ${index + 1} requires facility and level.` };
    }
  }
  for (const [index, rule] of form.fileRules.entries()) {
    if (!rule.file || !rule.facility || !rule.level) {
      return { operations: [], validationError: `File rule ${index + 1} requires filename, facility, and level.` };
    }
  }
  for (const [index, rule] of form.remoteRules.entries()) {
    if (!rule.address || !rule.facility || !rule.level) {
      return { operations: [], validationError: `Remote rule ${index + 1} requires address, facility, and level.` };
    }
    if (rule.port && !/^\d+$/.test(rule.port)) {
      return { operations: [], validationError: `Remote rule ${index + 1} port must be numeric.` };
    }
    if (rule.tls && rule.protocol !== "tcp") {
      return { operations: [], validationError: `Remote rule ${index + 1} uses TLS, so protocol must be TCP.` };
    }
    if (
      rule.tls &&
      (rule.tlsAuthMode === "name" || rule.tlsAuthMode === "fingerprint") &&
      splitPeers(rule.tlsPermittedPeers).length === 0
    ) {
      return {
        operations: [],
        validationError: `Remote rule ${index + 1} requires permitted peers when TLS auth mode is ${rule.tlsAuthMode}.`,
      };
    }
  }

  const remoteConsistency = new Map<string, string>();
  for (const rule of form.remoteRules) {
    const signature = [
      rule.protocol,
      rule.port,
      rule.vrf,
      rule.sourceAddress,
      String(rule.includeTimezone),
      String(rule.octetCounted),
      String(rule.tls),
      rule.tlsCaCertificate,
      rule.tlsCertificate,
      rule.tlsAuthMode,
      rule.tlsPermittedPeers,
    ].join("|");
    const existing = remoteConsistency.get(rule.address);
    if (existing && existing !== signature) {
      return {
        operations: [],
        validationError:
          `Remote destination ${rule.address} has conflicting transport/TLS settings across facility rows. ` +
          "Use matching transport/TLS values for every row with the same address.",
      };
    }
    remoteConsistency.set(rule.address, signature);
  }

  const currentRules = currentNormalized ?? normalizeState({
    markerDisabled: false,
    markerInterval: "",
    preserveFqdn: false,
    sourceAddress: "",
    consoleRules: [],
    fileRules: [],
    remoteRules: [],
  });

  const syncScalar = (token: string, desired: string, existing: string) => {
    if (desired === existing) return;
    if (desired) {
      operations.push(`set ${base} ${token} ${quoteCliValue(desired)}`);
    } else {
      operations.push(`delete ${base} ${token}`);
    }
  };

  if (form.markerDisabled !== currentRules.markerDisabled) {
    operations.push(
      `${form.markerDisabled ? "set" : "delete"} ${base} marker disable`,
    );
  }
  syncScalar("marker interval", form.markerInterval, currentRules.markerInterval);

  if (form.preserveFqdn !== currentRules.preserveFqdn) {
    operations.push(`${form.preserveFqdn ? "set" : "delete"} ${base} preserve-fqdn`);
  }
  syncScalar("source-address", form.sourceAddress, currentRules.sourceAddress);

  const currentConsole = mapRules(currentRules.consoleRules);
  const desiredConsole = mapRules(form.consoleRules);
  for (const [facility] of currentConsole.entries()) {
    if (!desiredConsole.has(facility)) {
      operations.push(`delete ${base} console facility ${quoteCliValue(facility)}`);
    }
  }
  for (const [facility, level] of desiredConsole.entries()) {
    if (currentConsole.get(facility) !== level) {
      operations.push(
        `set ${base} console facility ${quoteCliValue(facility)} level ${quoteCliValue(level)}`,
      );
    }
  }

  const currentFiles = groupFileRules(currentRules.fileRules);
  const desiredFiles = groupFileRules(form.fileRules);
  for (const [file] of currentFiles.entries()) {
    if (!desiredFiles.has(file)) {
      operations.push(`delete ${base} file ${quoteCliValue(file)}`);
    }
  }
  for (const [file, desiredFacilities] of desiredFiles.entries()) {
    const currentFacilities = currentFiles.get(file) || new Map<string, string>();
    for (const [facility] of currentFacilities.entries()) {
      if (!desiredFacilities.has(facility)) {
        operations.push(
          `delete ${base} file ${quoteCliValue(file)} facility ${quoteCliValue(facility)}`,
        );
      }
    }
    for (const [facility, level] of desiredFacilities.entries()) {
      if (currentFacilities.get(facility) !== level) {
        operations.push(
          `set ${base} file ${quoteCliValue(file)} facility ${quoteCliValue(facility)} level ${quoteCliValue(level)}`,
        );
      }
    }
  }

  const remotePath = current?.remoteNodeType === "host" ? "host" : "remote";
  const currentRemote = groupRemoteRules(currentRules.remoteRules);
  const desiredRemote = groupRemoteRules(form.remoteRules);

  for (const [address] of currentRemote.entries()) {
    if (!desiredRemote.has(address)) {
      operations.push(`delete ${base} ${remotePath} ${quoteCliValue(address)}`);
    }
  }

  const syncRemoteScalar = (
    address: string,
    token: string,
    desired: string,
    existing: string,
  ) => {
    if (desired === existing) return;
    if (desired) {
      operations.push(`set ${base} ${remotePath} ${quoteCliValue(address)} ${token} ${quoteCliValue(desired)}`);
    } else {
      operations.push(`delete ${base} ${remotePath} ${quoteCliValue(address)} ${token}`);
    }
  };

  for (const [address, desired] of desiredRemote.entries()) {
    const existing = currentRemote.get(address);

    syncRemoteScalar(address, "protocol", desired.protocol, existing?.protocol ?? "");
    syncRemoteScalar(address, "port", desired.port, existing?.port ?? "");
    syncRemoteScalar(address, "vrf", desired.vrf, existing?.vrf ?? "");
    syncRemoteScalar(address, "source-address", desired.sourceAddress, existing?.sourceAddress ?? "");

    if (desired.includeTimezone !== Boolean(existing?.includeTimezone)) {
      operations.push(
        `${desired.includeTimezone ? "set" : "delete"} ${base} ${remotePath} ${quoteCliValue(address)} format include-timezone`,
      );
    }
    if (desired.octetCounted !== Boolean(existing?.octetCounted)) {
      operations.push(
        `${desired.octetCounted ? "set" : "delete"} ${base} ${remotePath} ${quoteCliValue(address)} format octet-counted`,
      );
    }

    if (desired.tls !== Boolean(existing?.tls)) {
      operations.push(
        `${desired.tls ? "set" : "delete"} ${base} ${remotePath} ${quoteCliValue(address)} tls`,
      );
    }

    if (desired.tls) {
      syncRemoteScalar(address, "tls ca-certificate", desired.tlsCaCertificate, existing?.tlsCaCertificate ?? "");
      syncRemoteScalar(address, "tls certificate", desired.tlsCertificate, existing?.tlsCertificate ?? "");
      syncRemoteScalar(address, "tls auth-mode", desired.tlsAuthMode, existing?.tlsAuthMode ?? "");

      const desiredPeers = splitPeers(desired.tlsPermittedPeers);
      const currentPeers = splitPeers(existing?.tlsPermittedPeers ?? "");
      const currentPeerSet = new Set(currentPeers);
      const desiredPeerSet = new Set(desiredPeers);

      for (const peer of currentPeers) {
        if (!desiredPeerSet.has(peer)) {
          operations.push(
            `delete ${base} ${remotePath} ${quoteCliValue(address)} tls permitted-peer ${quoteCliValue(peer)}`,
          );
        }
      }
      for (const peer of desiredPeers) {
        if (!currentPeerSet.has(peer)) {
          operations.push(
            `set ${base} ${remotePath} ${quoteCliValue(address)} tls permitted-peer ${quoteCliValue(peer)}`,
          );
        }
      }
    }

    const currentFacilities = existing ? new Map(Object.entries(existing.facilities)) : new Map<string, string>();
    const desiredFacilities = new Map(Object.entries(desired.facilities));
    for (const [facility] of currentFacilities.entries()) {
      if (!desiredFacilities.has(facility)) {
        operations.push(
          `delete ${base} ${remotePath} ${quoteCliValue(address)} facility ${quoteCliValue(facility)}`,
        );
      }
    }
    for (const [facility, level] of desiredFacilities.entries()) {
      if (currentFacilities.get(facility) !== level) {
        operations.push(
          `set ${base} ${remotePath} ${quoteCliValue(address)} facility ${quoteCliValue(facility)} level ${quoteCliValue(level)}`,
        );
      }
    }
  }

  return { operations, validationError: null };
}

export default function SystemSyslogPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemSyslogConfig | null>(null);
  const [form, setForm] = useState<SyslogFormState>({
    markerDisabled: false,
    markerInterval: "",
    preserveFqdn: false,
    sourceAddress: "",
    consoleRules: [{ ...EMPTY_CONSOLE_RULE }],
    fileRules: [{ ...EMPTY_FILE_RULE }],
    remoteRules: [{ ...EMPTY_REMOTE_RULE }],
  });

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemSyslogService.getConfig(refresh);
      setConfig(response);
      setForm(toFormState(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system syslog configuration.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const hasChanges = useMemo(() => {
    if (!config) return false;
    const currentNormalized = normalizeState(toFormState(config));
    const formNormalized = normalizeState(form);
    return JSON.stringify(currentNormalized) !== JSON.stringify(formNormalized);
  }, [config, form]);

  const saveConfig = async () => {
    const { operations, validationError } = buildOperations(config, form);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemSyslogService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected syslog changes.");
      }
      await loadData(true);
      setSuccess("System syslog settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save system syslog settings.");
    } finally {
      setSaving(false);
    }
  };

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
            <h1 className="text-3xl font-bold">System Syslog</h1>
            <p className="mt-1 text-muted-foreground">
              Configure local and remote syslog destinations under `system syslog`.
            </p>
          </div>
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

        <Card>
          <CardHeader>
            <CardTitle>Global Options</CardTitle>
            <CardDescription>Marker behavior, FQDN preservation, and default source address.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="syslog-marker-interval">Marker Interval (seconds)</Label>
                <Input
                  id="syslog-marker-interval"
                  value={form.markerInterval}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, markerInterval: event.target.value }))
                  }
                  placeholder="300"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="syslog-source-address">Source Address</Label>
                <Input
                  id="syslog-source-address"
                  value={form.sourceAddress}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, sourceAddress: event.target.value }))
                  }
                  placeholder="192.0.2.1"
                  disabled={!canEdit || saving}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.markerDisabled}
                  onCheckedChange={(checked) =>
                    setForm((previous) => ({ ...previous, markerDisabled: checked === true }))
                  }
                  disabled={!canEdit || saving}
                />
                Disable periodic marker logs
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.preserveFqdn}
                  onCheckedChange={(checked) =>
                    setForm((previous) => ({ ...previous, preserveFqdn: checked === true }))
                  }
                  disabled={!canEdit || saving}
                />
                Preserve FQDN in syslog hostnames
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Console Rules</CardTitle>
            <CardDescription>Define facility + level filters for console log output.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.consoleRules.map((rule, index) => (
              <div key={`console-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <Select
                  value={rule.facility || "__empty__"}
                  onValueChange={(value) =>
                    setForm((previous) => {
                      const next = [...previous.consoleRules];
                      next[index] = { ...next[index], facility: value === "__empty__" ? "" : value };
                      return { ...previous, consoleRules: next };
                    })
                  }
                  disabled={!canEdit || saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_FACILITIES.map((facility) => (
                      <SelectItem key={facility} value={facility}>
                        {facility}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={rule.level || "__empty__"}
                  onValueChange={(value) =>
                    setForm((previous) => {
                      const next = [...previous.consoleRules];
                      next[index] = { ...next[index], level: value === "__empty__" ? "" : value };
                      return { ...previous, consoleRules: next };
                    })
                  }
                  disabled={!canEdit || saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Level" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      consoleRules:
                        previous.consoleRules.length > 1
                          ? previous.consoleRules.filter((_, ruleIndex) => ruleIndex !== index)
                          : previous.consoleRules,
                    }))
                  }
                  disabled={!canEdit || saving || form.consoleRules.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setForm((previous) => ({
                  ...previous,
                  consoleRules: [...previous.consoleRules, { ...EMPTY_CONSOLE_RULE }],
                }))
              }
              disabled={!canEdit || saving}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Console Rule
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>File Rules</CardTitle>
            <CardDescription>Configure local file targets with facility + level filters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.fileRules.map((rule, index) => (
              <div key={`file-${index}`} className="grid gap-2 md:grid-cols-[1.3fr_1fr_1fr_auto]">
                <Input
                  value={rule.file}
                  onChange={(event) =>
                    setForm((previous) => {
                      const next = [...previous.fileRules];
                      next[index] = { ...next[index], file: event.target.value };
                      return { ...previous, fileRules: next };
                    })
                  }
                  placeholder="messages"
                  disabled={!canEdit || saving}
                />
                <Select
                  value={rule.facility || "__empty__"}
                  onValueChange={(value) =>
                    setForm((previous) => {
                      const next = [...previous.fileRules];
                      next[index] = { ...next[index], facility: value === "__empty__" ? "" : value };
                      return { ...previous, fileRules: next };
                    })
                  }
                  disabled={!canEdit || saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_FACILITIES.map((facility) => (
                      <SelectItem key={facility} value={facility}>
                        {facility}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={rule.level || "__empty__"}
                  onValueChange={(value) =>
                    setForm((previous) => {
                      const next = [...previous.fileRules];
                      next[index] = { ...next[index], level: value === "__empty__" ? "" : value };
                      return { ...previous, fileRules: next };
                    })
                  }
                  disabled={!canEdit || saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Level" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      fileRules:
                        previous.fileRules.length > 1
                          ? previous.fileRules.filter((_, rowIndex) => rowIndex !== index)
                          : previous.fileRules,
                    }))
                  }
                  disabled={!canEdit || saving || form.fileRules.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setForm((previous) => ({
                  ...previous,
                  fileRules: [...previous.fileRules, { ...EMPTY_FILE_RULE }],
                }))
              }
              disabled={!canEdit || saving}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add File Rule
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Remote Destinations</CardTitle>
            <CardDescription>Send syslog to remote collectors with transport and TLS options.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.remoteRules.map((rule, index) => (
              <div key={`remote-${index}`} className="space-y-3 rounded-md border p-3">
                <div className="grid gap-2 md:grid-cols-[1.2fr_0.8fr_0.7fr_1fr_1fr_auto]">
                  <Input
                    value={rule.address}
                    onChange={(event) =>
                      setForm((previous) => {
                        const next = [...previous.remoteRules];
                        next[index] = { ...next[index], address: event.target.value };
                        return { ...previous, remoteRules: next };
                      })
                    }
                    placeholder="192.0.2.20"
                    disabled={!canEdit || saving}
                  />
                  <Select
                    value={rule.protocol}
                    onValueChange={(value) =>
                      setForm((previous) => {
                        const next = [...previous.remoteRules];
                        next[index] = { ...next[index], protocol: value as "udp" | "tcp" };
                        return { ...previous, remoteRules: next };
                      })
                    }
                    disabled={!canEdit || saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="udp">udp</SelectItem>
                      <SelectItem value="tcp">tcp</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={rule.port}
                    onChange={(event) =>
                      setForm((previous) => {
                        const next = [...previous.remoteRules];
                        next[index] = { ...next[index], port: event.target.value };
                        return { ...previous, remoteRules: next };
                      })
                    }
                    placeholder="514"
                    disabled={!canEdit || saving}
                  />
                  <Select
                    value={rule.facility || "__empty__"}
                    onValueChange={(value) =>
                      setForm((previous) => {
                        const next = [...previous.remoteRules];
                        next[index] = { ...next[index], facility: value === "__empty__" ? "" : value };
                        return { ...previous, remoteRules: next };
                      })
                    }
                    disabled={!canEdit || saving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOG_FACILITIES.map((facility) => (
                        <SelectItem key={facility} value={facility}>
                          {facility}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={rule.level || "__empty__"}
                    onValueChange={(value) =>
                      setForm((previous) => {
                        const next = [...previous.remoteRules];
                        next[index] = { ...next[index], level: value === "__empty__" ? "" : value };
                        return { ...previous, remoteRules: next };
                      })
                    }
                    disabled={!canEdit || saving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Level" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOG_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setForm((previous) => ({
                        ...previous,
                        remoteRules:
                          previous.remoteRules.length > 1
                            ? previous.remoteRules.filter((_, rowIndex) => rowIndex !== index)
                            : previous.remoteRules,
                      }))
                    }
                    disabled={!canEdit || saving || form.remoteRules.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    value={rule.vrf}
                    onChange={(event) =>
                      setForm((previous) => {
                        const next = [...previous.remoteRules];
                        next[index] = { ...next[index], vrf: event.target.value };
                        return { ...previous, remoteRules: next };
                      })
                    }
                    placeholder="VRF (optional)"
                    disabled={!canEdit || saving}
                  />
                  <Input
                    value={rule.sourceAddress}
                    onChange={(event) =>
                      setForm((previous) => {
                        const next = [...previous.remoteRules];
                        next[index] = { ...next[index], sourceAddress: event.target.value };
                        return { ...previous, remoteRules: next };
                      })
                    }
                    placeholder="Source address (optional)"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={rule.includeTimezone}
                      onCheckedChange={(checked) =>
                        setForm((previous) => {
                          const next = [...previous.remoteRules];
                          next[index] = { ...next[index], includeTimezone: checked === true };
                          return { ...previous, remoteRules: next };
                        })
                      }
                      disabled={!canEdit || saving}
                    />
                    Include timezone
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={rule.octetCounted}
                      onCheckedChange={(checked) =>
                        setForm((previous) => {
                          const next = [...previous.remoteRules];
                          next[index] = { ...next[index], octetCounted: checked === true };
                          return { ...previous, remoteRules: next };
                        })
                      }
                      disabled={!canEdit || saving}
                    />
                    Octet-counted framing
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={rule.tls}
                      onCheckedChange={(checked) =>
                        setForm((previous) => {
                          const next = [...previous.remoteRules];
                          next[index] = { ...next[index], tls: checked === true };
                          return { ...previous, remoteRules: next };
                        })
                      }
                      disabled={!canEdit || saving}
                    />
                    Enable TLS
                  </label>
                </div>
                {rule.tls && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      value={rule.tlsCaCertificate}
                      onChange={(event) =>
                        setForm((previous) => {
                          const next = [...previous.remoteRules];
                          next[index] = { ...next[index], tlsCaCertificate: event.target.value };
                          return { ...previous, remoteRules: next };
                        })
                      }
                      placeholder="TLS CA certificate name"
                      disabled={!canEdit || saving}
                    />
                    <Input
                      value={rule.tlsCertificate}
                      onChange={(event) =>
                        setForm((previous) => {
                          const next = [...previous.remoteRules];
                          next[index] = { ...next[index], tlsCertificate: event.target.value };
                          return { ...previous, remoteRules: next };
                        })
                      }
                      placeholder="TLS certificate name"
                      disabled={!canEdit || saving}
                    />
                    <Select
                      value={rule.tlsAuthMode || "__empty__"}
                      onValueChange={(value) =>
                        setForm((previous) => {
                          const next = [...previous.remoteRules];
                          next[index] = { ...next[index], tlsAuthMode: value === "__empty__" ? "" : value };
                          return { ...previous, remoteRules: next };
                        })
                      }
                      disabled={!canEdit || saving}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="TLS auth mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {TLS_AUTH_MODES.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {mode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={rule.tlsPermittedPeers}
                      onChange={(event) =>
                        setForm((previous) => {
                          const next = [...previous.remoteRules];
                          next[index] = { ...next[index], tlsPermittedPeers: event.target.value };
                          return { ...previous, remoteRules: next };
                        })
                      }
                      placeholder="Permitted peers (comma-separated)"
                      disabled={!canEdit || saving}
                    />
                  </div>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setForm((previous) => ({
                  ...previous,
                  remoteRules: [...previous.remoteRules, { ...EMPTY_REMOTE_RULE }],
                }))
              }
              disabled={!canEdit || saving}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Remote Rule
            </Button>
          </CardContent>
        </Card>

        {!canEdit && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            You have read-only permissions for System settings.
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Badge variant={hasChanges ? "default" : "secondary"}>
            {hasChanges ? "Unsaved Changes" : "In Sync"}
          </Badge>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadData(true)}
              disabled={refreshing || saving}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" onClick={saveConfig} disabled={!canEdit || saving || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              Save Syslog
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

