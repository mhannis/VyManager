"use client";

import { useEffect, useState } from "react";
import { Activity, AlertCircle, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "./serviceTabHelpers";

interface ExporterConfig {
  enabled: boolean;
  listenAddresses: string[];
  port: string;
  vrf: string;
  collectorTextfile?: boolean;
}

interface MonitoringState {
  enabled: boolean;
  nodeExporter: ExporterConfig;
  frrExporter: ExporterConfig;
  blackboxExporter: ExporterConfig;
  telegrafPromClient: {
    enabled: boolean;
    listenAddresses: string[];
    allowFrom: string[];
    port: string;
    metricVersion: "" | "1" | "2";
    authUsername: string;
    authPassword: string;
  };
}

const EMPTY_EXPORTER: ExporterConfig = {
  enabled: false,
  listenAddresses: [],
  port: "",
  vrf: "",
  collectorTextfile: false,
};

const EMPTY_STATE: MonitoringState = {
  enabled: false,
  nodeExporter: { ...EMPTY_EXPORTER },
  frrExporter: { ...EMPTY_EXPORTER },
  blackboxExporter: { ...EMPTY_EXPORTER },
  telegrafPromClient: {
    enabled: false,
    listenAddresses: [],
    allowFrom: [],
    port: "",
    metricVersion: "",
    authUsername: "",
    authPassword: "",
  },
};

interface MonitoringServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function parseExporter(node: Record<string, unknown>): ExporterConfig {
  const collectors = toRecord(node.collectors);
  return {
    enabled: Object.keys(node).length > 0,
    listenAddresses: objectKeys(node["listen-address"]),
    port: asString(node.port) ?? "",
    vrf: asString(node.vrf) ?? "",
    collectorTextfile: Object.prototype.hasOwnProperty.call(collectors, "textfile"),
  };
}

function parseConfig(serviceNode: Record<string, unknown>): MonitoringState {
  const prometheus = toRecord(serviceNode.prometheus);
  const telegraf = toRecord(serviceNode.telegraf);
  const promClient = toRecord(telegraf["prometheus-client"]);
  const promClientAuth = toRecord(promClient.authentication);

  return {
    enabled: Object.keys(serviceNode).length > 0,
    nodeExporter: parseExporter(toRecord(prometheus["node-exporter"])),
    frrExporter: parseExporter(toRecord(prometheus["frr-exporter"])),
    blackboxExporter: parseExporter(toRecord(prometheus["blackbox-exporter"])),
    telegrafPromClient: {
      enabled: Object.keys(promClient).length > 0,
      listenAddresses: objectKeys(promClient["listen-address"]),
      allowFrom: objectKeys(promClient["allow-from"]),
      port: asString(promClient.port) ?? "",
      metricVersion: (asString(promClient["metric-version"]) as "1" | "2" | null) ?? "",
      authUsername: asString(promClientAuth.username) ?? "",
      authPassword: asString(promClientAuth.password) ?? "",
    },
  };
}

function listEditor(
  label: string,
  values: string[],
  disabled: boolean,
  onChange: (nextValues: string[]) => void,
) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...values, ""])}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>
      {values.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No entries configured.</p>
      ) : (
        <div className="space-y-2">
          {values.map((value, index) => (
            <div key={`${label}-${index}`} className="grid gap-2 xl:grid-cols-[1fr_auto]">
              <Input
                value={value}
                onChange={(event) => {
                  const next = [...values];
                  next[index] = event.target.value;
                  onChange(next);
                }}
                disabled={disabled}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MonitoringServiceTab({ canEdit, active, refreshNonce }: MonitoringServiceTabProps) {
  const [config, setConfig] = useState<MonitoringState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getMonitoringConfig(refresh);
      setConfig(parseConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load monitoring configuration.");
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

  const applyExporterCommands = (ops: string[], key: string, exporter: ExporterConfig) => {
    if (!exporter.enabled) return;
    const base = `set service monitoring prometheus ${key}`;
    ops.push(base);
    for (const address of uniqueNonEmpty(exporter.listenAddresses)) {
      ops.push(`${base} listen-address ${quoteCliValue(address)}`);
    }
    if (exporter.port.trim()) {
      ops.push(`${base} port ${quoteCliValue(exporter.port)}`);
    }
    if (exporter.vrf.trim()) {
      ops.push(`${base} vrf ${quoteCliValue(exporter.vrf)}`);
    }
    if (key === "node-exporter" && exporter.collectorTextfile) {
      ops.push(`${base} collectors textfile`);
    }
  };

  const handleSave = async () => {
    const hasPromAuthUser = config.telegrafPromClient.authUsername.trim().length > 0;
    const hasPromAuthPassword = config.telegrafPromClient.authPassword.trim().length > 0;
    if (hasPromAuthUser !== hasPromAuthPassword) {
      setError("Prometheus client authentication needs both username and password.");
      setSuccess(null);
      return;
    }

    const operations: string[] = ["delete service monitoring"];
    if (config.enabled) {
      operations.push("set service monitoring");
      applyExporterCommands(operations, "node-exporter", config.nodeExporter);
      applyExporterCommands(operations, "frr-exporter", config.frrExporter);
      applyExporterCommands(operations, "blackbox-exporter", config.blackboxExporter);

      if (config.telegrafPromClient.enabled) {
        const base = "set service monitoring telegraf prometheus-client";
        operations.push(base);
        for (const address of uniqueNonEmpty(config.telegrafPromClient.listenAddresses)) {
          operations.push(`${base} listen-address ${quoteCliValue(address)}`);
        }
        for (const prefix of uniqueNonEmpty(config.telegrafPromClient.allowFrom)) {
          operations.push(`${base} allow-from ${quoteCliValue(prefix)}`);
        }
        if (config.telegrafPromClient.port.trim()) {
          operations.push(`${base} port ${quoteCliValue(config.telegrafPromClient.port)}`);
        }
        if (config.telegrafPromClient.metricVersion) {
          operations.push(`${base} metric-version ${config.telegrafPromClient.metricVersion}`);
        }
        if (hasPromAuthUser && hasPromAuthPassword) {
          operations.push(
            `${base} authentication username ${quoteCliValue(config.telegrafPromClient.authUsername)}`,
          );
          operations.push(
            `${base} authentication password ${quoteCliValue(config.telegrafPromClient.authPassword)}`,
          );
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureMonitoring(operations);
      await loadConfig(true);
      setSuccess("Monitoring service configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update monitoring configuration.");
    } finally {
      setSaving(false);
    }
  };

  const disableInputs = !canEdit || saving;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Monitoring
        </CardTitle>
        <CardDescription>
          Configure Prometheus exporters and Telegraf Prometheus client endpoints.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading monitoring configuration...</p>
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
              <Label className="text-sm font-medium">Enable monitoring service</Label>
            </div>

            {["nodeExporter", "frrExporter", "blackboxExporter"].map((key) => {
              const exporterKey = key as "nodeExporter" | "frrExporter" | "blackboxExporter";
              const exporter = config[exporterKey];
              const cliName =
                exporterKey === "nodeExporter"
                  ? "Node Exporter"
                  : exporterKey === "frrExporter"
                    ? "FRR Exporter"
                    : "Blackbox Exporter";
              return (
                <div key={exporterKey} className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={exporter.enabled}
                      onCheckedChange={(checked) =>
                        setConfig((previous) => ({
                          ...previous,
                          [exporterKey]: { ...previous[exporterKey], enabled: checked === true },
                        }))
                      }
                      disabled={disableInputs || !config.enabled}
                    />
                    <Label className="text-sm font-medium">{cliName}</Label>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input
                        value={exporter.port}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            [exporterKey]: { ...previous[exporterKey], port: event.target.value },
                          }))
                        }
                        placeholder="9100"
                        disabled={disableInputs || !config.enabled || !exporter.enabled}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>VRF</Label>
                      <Input
                        value={exporter.vrf}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            [exporterKey]: { ...previous[exporterKey], vrf: event.target.value },
                          }))
                        }
                        placeholder="blue"
                        disabled={disableInputs || !config.enabled || !exporter.enabled}
                      />
                    </div>
                  </div>

                  {exporterKey === "nodeExporter" ? (
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={Boolean(exporter.collectorTextfile)}
                        onCheckedChange={(checked) =>
                          setConfig((previous) => ({
                            ...previous,
                            nodeExporter: {
                              ...previous.nodeExporter,
                              collectorTextfile: checked === true,
                            },
                          }))
                        }
                        disabled={disableInputs || !config.enabled || !exporter.enabled}
                      />
                      <Label className="text-xs font-medium">Enable textfile collector</Label>
                    </div>
                  ) : null}

                  {listEditor(
                    "Listen Addresses",
                    exporter.listenAddresses,
                    disableInputs || !config.enabled || !exporter.enabled,
                    (nextValues) =>
                      setConfig((previous) => ({
                        ...previous,
                        [exporterKey]: { ...previous[exporterKey], listenAddresses: nextValues },
                      })),
                  )}
                </div>
              );
            })}

            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.telegrafPromClient.enabled}
                  onCheckedChange={(checked) =>
                    setConfig((previous) => ({
                      ...previous,
                      telegrafPromClient: {
                        ...previous.telegrafPromClient,
                        enabled: checked === true,
                      },
                    }))
                  }
                  disabled={disableInputs || !config.enabled}
                />
                <Label className="text-sm font-medium">Telegraf Prometheus Client</Label>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    value={config.telegrafPromClient.port}
                    onChange={(event) =>
                      setConfig((previous) => ({
                        ...previous,
                        telegrafPromClient: {
                          ...previous.telegrafPromClient,
                          port: event.target.value,
                        },
                      }))
                    }
                    placeholder="9273"
                    disabled={disableInputs || !config.enabled || !config.telegrafPromClient.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Metric Version</Label>
                  <Input
                    value={config.telegrafPromClient.metricVersion}
                    onChange={(event) =>
                      setConfig((previous) => ({
                        ...previous,
                        telegrafPromClient: {
                          ...previous.telegrafPromClient,
                          metricVersion:
                            event.target.value === "1" || event.target.value === "2"
                              ? event.target.value
                              : "",
                        },
                      }))
                    }
                    placeholder="1 or 2"
                    disabled={disableInputs || !config.enabled || !config.telegrafPromClient.enabled}
                  />
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <div className="space-y-2">
                  <Label>Auth Username</Label>
                  <Input
                    value={config.telegrafPromClient.authUsername}
                    onChange={(event) =>
                      setConfig((previous) => ({
                        ...previous,
                        telegrafPromClient: {
                          ...previous.telegrafPromClient,
                          authUsername: event.target.value,
                        },
                      }))
                    }
                    disabled={disableInputs || !config.enabled || !config.telegrafPromClient.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Auth Password</Label>
                  <Input
                    type="password"
                    value={config.telegrafPromClient.authPassword}
                    onChange={(event) =>
                      setConfig((previous) => ({
                        ...previous,
                        telegrafPromClient: {
                          ...previous.telegrafPromClient,
                          authPassword: event.target.value,
                        },
                      }))
                    }
                    disabled={disableInputs || !config.enabled || !config.telegrafPromClient.enabled}
                  />
                </div>
              </div>

              {listEditor(
                "Listen Addresses",
                config.telegrafPromClient.listenAddresses,
                disableInputs || !config.enabled || !config.telegrafPromClient.enabled,
                (nextValues) =>
                  setConfig((previous) => ({
                    ...previous,
                    telegrafPromClient: {
                      ...previous.telegrafPromClient,
                      listenAddresses: nextValues,
                    },
                  })),
              )}

              {listEditor(
                "Allow-From Prefixes",
                config.telegrafPromClient.allowFrom,
                disableInputs || !config.enabled || !config.telegrafPromClient.enabled,
                (nextValues) =>
                  setConfig((previous) => ({
                    ...previous,
                    telegrafPromClient: {
                      ...previous.telegrafPromClient,
                      allowFrom: nextValues,
                    },
                  })),
              )}
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

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={disableInputs}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Monitoring"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
