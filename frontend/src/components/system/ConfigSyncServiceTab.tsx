"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "./serviceTabHelpers";

interface ConfigSyncSectionEntry {
  section: string;
  value: string;
}

interface ConfigSyncState {
  enabled: boolean;
  mode: "" | "load" | "set";
  secondaryAddress: string;
  secondaryKey: string;
  secondaryPort: string;
  secondaryTimeout: string;
  sections: ConfigSyncSectionEntry[];
}

const VALUE_REQUIRED_SECTIONS = new Set(["interfaces", "protocols", "qos", "service", "system"]);
const SECTION_OPTIONS = [
  "firewall",
  "interfaces",
  "nat",
  "nat66",
  "pki",
  "policy",
  "protocols",
  "qos",
  "service",
  "system",
  "vpn",
  "vrf",
];

const SYSTEM_SECTION_SUGGESTIONS = [
  "conntrack",
  "flow-accounting",
  "option",
  "sflow",
  "static-host-mapping",
  "sysctl",
  "time-zone",
];

const EMPTY_CONFIG_SYNC_STATE: ConfigSyncState = {
  enabled: false,
  mode: "",
  secondaryAddress: "",
  secondaryKey: "",
  secondaryPort: "",
  secondaryTimeout: "",
  sections: [],
};

interface ConfigSyncServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function parseConfigSyncConfig(serviceNode: Record<string, unknown>): ConfigSyncState {
  const secondary = toRecord(serviceNode.secondary);
  const mode = asString(serviceNode.mode);
  const sectionsNode = toRecord(serviceNode.section);

  const sections: ConfigSyncSectionEntry[] = [];
  for (const sectionName of Object.keys(sectionsNode).sort((left, right) => left.localeCompare(right))) {
    const nested = toRecord(sectionsNode[sectionName]);
    const values = objectKeys(nested);
    if (values.length === 0) {
      sections.push({ section: sectionName, value: "" });
      continue;
    }
    for (const value of values) {
      sections.push({ section: sectionName, value });
    }
  }

  return {
    enabled: Object.keys(serviceNode).length > 0,
    mode: mode === "load" || mode === "set" ? mode : "",
    secondaryAddress: asString(secondary.address) ?? "",
    secondaryKey: asString(secondary.key) ?? "",
    secondaryPort: asString(secondary.port) ?? "",
    secondaryTimeout: asString(secondary.timeout) ?? "",
    sections,
  };
}

export function ConfigSyncServiceTab({ canEdit, active, refreshNonce }: ConfigSyncServiceTabProps) {
  const [config, setConfig] = useState<ConfigSyncState>(EMPTY_CONFIG_SYNC_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const disableInputs = !canEdit || saving;

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getConfigSyncConfig(refresh);
      setConfig(parseConfigSyncConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config sync configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    loadConfig(false);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    loadConfig(true);
  }, [active, refreshNonce]);

  const sectionDisplayRows = useMemo(
    () =>
      config.sections.map((entry, index) => ({
        ...entry,
        index,
        valueRequired: VALUE_REQUIRED_SECTIONS.has(entry.section),
      })),
    [config.sections],
  );

  const addSection = () => {
    setConfig((previous) => ({
      ...previous,
      sections: [...previous.sections, { section: "firewall", value: "" }],
    }));
  };

  const updateSection = (index: number, update: Partial<ConfigSyncSectionEntry>) => {
    setConfig((previous) => {
      const next = [...previous.sections];
      const current = next[index] ?? { section: "firewall", value: "" };
      const merged = { ...current, ...update };
      if (!VALUE_REQUIRED_SECTIONS.has(merged.section)) {
        merged.value = "";
      }
      next[index] = merged;
      return { ...previous, sections: next };
    });
  };

  const removeSection = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      sections: previous.sections.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSave = async () => {
    if (config.enabled) {
      if (!config.secondaryAddress.trim()) {
        setError("Secondary address is required when config sync is enabled.");
        setSuccess(null);
        return;
      }
      if (!config.secondaryKey.trim()) {
        setError("Secondary API key is required when config sync is enabled.");
        setSuccess(null);
        return;
      }

      if (config.secondaryPort.trim()) {
        const port = Number.parseInt(config.secondaryPort, 10);
        if (!Number.isFinite(port) || port < 1 || port > 65535) {
          setError("Secondary port must be between 1 and 65535.");
          setSuccess(null);
          return;
        }
      }
      if (config.secondaryTimeout.trim()) {
        const timeout = Number.parseInt(config.secondaryTimeout, 10);
        if (!Number.isFinite(timeout) || timeout < 1) {
          setError("Secondary timeout must be a positive integer.");
          setSuccess(null);
          return;
        }
      }

      for (const row of config.sections) {
        const section = row.section.trim();
        if (!section) {
          setError("Each section row must include a section.");
          setSuccess(null);
          return;
        }
        if (VALUE_REQUIRED_SECTIONS.has(section) && !row.value.trim()) {
          setError(`Section '${section}' requires a value.`);
          setSuccess(null);
          return;
        }
      }
    }

    const operations: string[] = ["delete service config-sync"];
    if (config.enabled) {
      operations.push("set service config-sync");

      const mode = config.mode || "load";
      operations.push(`set service config-sync mode ${mode}`);
      operations.push(`set service config-sync secondary address ${quoteCliValue(config.secondaryAddress)}`);
      operations.push(`set service config-sync secondary key ${quoteCliValue(config.secondaryKey)}`);

      if (config.secondaryPort.trim()) {
        operations.push(`set service config-sync secondary port ${config.secondaryPort.trim()}`);
      }
      if (config.secondaryTimeout.trim()) {
        operations.push(`set service config-sync secondary timeout ${config.secondaryTimeout.trim()}`);
      }

      const seenSections = new Set<string>();
      for (const row of config.sections) {
        const section = row.section.trim();
        if (!section) continue;
        const value = row.value.trim();
        const key = `${section}|${value}`;
        if (seenSections.has(key)) continue;
        seenSections.add(key);

        if (VALUE_REQUIRED_SECTIONS.has(section)) {
          operations.push(`set service config-sync section ${section} ${quoteCliValue(value)}`);
        } else {
          operations.push(`set service config-sync section ${section}`);
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureConfigSync(uniqueNonEmpty(operations));
      await loadConfig(true);
      setSuccess("Config sync settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update config sync settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" />
          Config Sync
        </CardTitle>
        <CardDescription>
          Synchronize selected configuration sections to a secondary VyOS router over the HTTPS API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading config sync settings...</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={config.enabled}
                onCheckedChange={(checked) =>
                  setConfig((previous) => ({ ...previous, enabled: checked === true }))
                }
                disabled={disableInputs}
              />
              <Label className="text-sm font-medium">Enable config sync</Label>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              <div className="space-y-2">
                <Label>Sync mode</Label>
                <Select
                  value={config.mode || "load"}
                  onValueChange={(value: "load" | "set") =>
                    setConfig((previous) => ({ ...previous, mode: value }))
                  }
                  disabled={disableInputs || !config.enabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="load">load (replace section)</SelectItem>
                    <SelectItem value="set">set (merge section)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Secondary address</Label>
                <Input
                  value={config.secondaryAddress}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, secondaryAddress: event.target.value }))
                  }
                  placeholder="192.0.2.20"
                  disabled={disableInputs || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Secondary API key</Label>
                <Input
                  value={config.secondaryKey}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, secondaryKey: event.target.value }))
                  }
                  placeholder="API key on secondary router"
                  disabled={disableInputs || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Secondary port</Label>
                <Input
                  value={config.secondaryPort}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, secondaryPort: event.target.value }))
                  }
                  placeholder="8443"
                  disabled={disableInputs || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Timeout (seconds)</Label>
                <Input
                  value={config.secondaryTimeout}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, secondaryTimeout: event.target.value }))
                  }
                  placeholder="30"
                  disabled={disableInputs || !config.enabled}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Synchronized Sections</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addSection}
                  disabled={disableInputs || !config.enabled}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Section
                </Button>
              </div>
              {sectionDisplayRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No config sections selected.</p>
              ) : (
                <div className="space-y-3">
                  {sectionDisplayRows.map((row) => (
                    <div key={`config-sync-section-${row.index}`} className="rounded-md border p-3">
                      <div className="grid gap-3 xl:grid-cols-[220px_1fr_auto]">
                        <Select
                          value={row.section}
                          onValueChange={(value) => updateSection(row.index, { section: value })}
                          disabled={disableInputs || !config.enabled}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SECTION_OPTIONS.map((option) => (
                              <SelectItem key={`config-sync-section-option-${option}`} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {row.valueRequired ? (
                          <Input
                            value={row.value}
                            onChange={(event) => updateSection(row.index, { value: event.target.value })}
                            placeholder={
                              row.section === "system"
                                ? "time-zone / conntrack / sysctl ..."
                                : "Section value"
                            }
                            list={row.section === "system" ? "config-sync-system-sections" : undefined}
                            disabled={disableInputs || !config.enabled}
                          />
                        ) : (
                          <div className="flex items-center rounded-md border px-3 text-xs text-muted-foreground">
                            No section value required
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSection(row.index)}
                          disabled={disableInputs || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <datalist id="config-sync-system-sections">
              {SYSTEM_SECTION_SUGGESTIONS.map((item) => (
                <option key={`config-sync-system-${item}`} value={item} />
              ))}
            </datalist>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <span>{error}</span>
                </div>
              </div>
            )}
            {success && (
              <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700">
                {success}
              </div>
            )}

            <Button onClick={handleSave} disabled={disableInputs}>
              <Save className="mr-2 h-4 w-4" />
              Save Config Sync
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

