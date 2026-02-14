"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Cable, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, quoteCliValue, toRecord } from "./serviceTabHelpers";

interface ConsoleDeviceConfig {
  device: string;
  alias: string;
  description: string;
  speed: string;
  dataBits: string;
  parity: string;
  stopBits: string;
  sshPort: string;
}

interface ConsoleServerConfigState {
  enabled: boolean;
  devices: ConsoleDeviceConfig[];
}

const EMPTY_CONSOLE_STATE: ConsoleServerConfigState = {
  enabled: false,
  devices: [],
};

interface ConsoleServerServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

const SPEED_OPTIONS = ["300", "1200", "2400", "4800", "9600", "19200", "38400", "57600", "115200"];

function parseConsoleConfig(serviceNode: Record<string, unknown>): ConsoleServerConfigState {
  const devicesNode = toRecord(serviceNode.device);
  const devices = Object.keys(devicesNode)
    .sort((left, right) => left.localeCompare(right))
    .map((device) => {
      const node = toRecord(devicesNode[device]);
      return {
        device,
        alias: asString(node.alias) ?? "",
        description: asString(node.description) ?? "",
        speed: asString(node.speed) ?? "",
        dataBits: asString(node["data-bits"]) ?? "",
        parity: asString(node.parity) ?? "",
        stopBits: asString(node["stop-bits"]) ?? "",
        sshPort: asString(toRecord(node.ssh).port) ?? "",
      };
    });

  return {
    enabled: Object.keys(serviceNode).length > 0,
    devices,
  };
}

export function ConsoleServerServiceTab({
  canEdit,
  active,
  refreshNonce,
}: ConsoleServerServiceTabProps) {
  const [config, setConfig] = useState<ConsoleServerConfigState>(EMPTY_CONSOLE_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getConsoleServerConfig(refresh);
      setConfig(parseConsoleConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load console server configuration.");
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

  const updateDevice = (index: number, update: Partial<ConsoleDeviceConfig>) => {
    setConfig((previous) => {
      const next = [...previous.devices];
      next[index] = { ...next[index], ...update };
      return { ...previous, devices: next };
    });
  };

  const removeDevice = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      devices: previous.devices.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSave = async () => {
    if (config.enabled && config.devices.length === 0) {
      setError("Add at least one console device when the service is enabled.");
      setSuccess(null);
      return;
    }

    for (const device of config.devices) {
      if (!device.device.trim()) {
        setError("Each console device row requires a device name.");
        setSuccess(null);
        return;
      }
      if (device.sshPort.trim()) {
        const parsed = Number.parseInt(device.sshPort, 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
          setError("Console SSH port must be between 1 and 65535.");
          setSuccess(null);
          return;
        }
      }
    }

    const operations: string[] = ["delete service console-server"];
    if (config.enabled) {
      const seen = new Set<string>();
      for (const entry of config.devices) {
        const device = entry.device.trim();
        if (!device || seen.has(device)) continue;
        seen.add(device);

        const deviceKey = quoteCliValue(device);
        if (entry.alias.trim()) {
          operations.push(
            `set service console-server device ${deviceKey} alias ${quoteCliValue(entry.alias)}`,
          );
        }
        if (entry.description.trim()) {
          operations.push(
            `set service console-server device ${deviceKey} description ${quoteCliValue(entry.description)}`,
          );
        }
        if (entry.speed.trim()) {
          operations.push(`set service console-server device ${deviceKey} speed ${entry.speed.trim()}`);
        }
        if (entry.dataBits.trim()) {
          operations.push(
            `set service console-server device ${deviceKey} data-bits ${entry.dataBits.trim()}`,
          );
        }
        if (entry.parity.trim()) {
          operations.push(`set service console-server device ${deviceKey} parity ${entry.parity.trim()}`);
        }
        if (entry.stopBits.trim()) {
          operations.push(
            `set service console-server device ${deviceKey} stop-bits ${entry.stopBits.trim()}`,
          );
        }
        if (entry.sshPort.trim()) {
          operations.push(
            `set service console-server device ${deviceKey} ssh port ${entry.sshPort.trim()}`,
          );
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureConsoleServer(operations);
      await loadConfig(true);
      setSuccess("Console server configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update console server configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cable className="h-5 w-5 text-primary" />
          Console Server
        </CardTitle>
        <CardDescription>
          Configure serial console devices and optional SSH port forwarding for out-of-band access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading console server configuration...</p>
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
              <Label className="text-sm font-medium">Enable console server</Label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Console Devices</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      devices: [
                        ...previous.devices,
                        {
                          device: "",
                          alias: "",
                          description: "",
                          speed: "",
                          dataBits: "",
                          parity: "",
                          stopBits: "",
                          sshPort: "",
                        },
                      ],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Device
                </Button>
              </div>

              {config.devices.length === 0 ? (
                <p className="text-xs text-muted-foreground">No console devices configured.</p>
              ) : (
                <div className="space-y-3">
                  {config.devices.map((device, index) => (
                    <div key={`console-device-${index}`} className="rounded-md border p-3 space-y-3">
                      <div className="grid gap-3 xl:grid-cols-[2fr_2fr_auto]">
                        <Input
                          value={device.device}
                          onChange={(event) => updateDevice(index, { device: event.target.value })}
                          placeholder="ttyUSB0"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Input
                          value={device.alias}
                          onChange={(event) => updateDevice(index, { alias: event.target.value })}
                          placeholder="core-switch"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDevice(index)}
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-3 xl:grid-cols-2">
                        <Input
                          value={device.description}
                          onChange={(event) =>
                            updateDevice(index, { description: event.target.value })
                          }
                          placeholder="Description"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Input
                          type="number"
                          min={1}
                          max={65535}
                          value={device.sshPort}
                          onChange={(event) => updateDevice(index, { sshPort: event.target.value })}
                          placeholder="SSH Port (optional)"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                      </div>

                      <div className="grid gap-3 xl:grid-cols-4">
                        <Select
                          value={device.speed || "__empty__"}
                          onValueChange={(value) =>
                            updateDevice(index, { speed: value === "__empty__" ? "" : value })
                          }
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Speed" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty__">Speed</SelectItem>
                            {SPEED_OPTIONS.map((speed) => (
                              <SelectItem key={speed} value={speed}>
                                {speed}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={device.dataBits || "__empty__"}
                          onValueChange={(value) =>
                            updateDevice(index, { dataBits: value === "__empty__" ? "" : value })
                          }
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Data bits" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty__">Data bits</SelectItem>
                            <SelectItem value="7">7</SelectItem>
                            <SelectItem value="8">8</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={device.parity || "__empty__"}
                          onValueChange={(value) =>
                            updateDevice(index, { parity: value === "__empty__" ? "" : value })
                          }
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Parity" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty__">Parity</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="even">Even</SelectItem>
                            <SelectItem value="odd">Odd</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={device.stopBits || "__empty__"}
                          onValueChange={(value) =>
                            updateDevice(index, { stopBits: value === "__empty__" ? "" : value })
                          }
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Stop bits" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty__">Stop bits</SelectItem>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700">
                {success}
              </div>
            )}

            <Button onClick={handleSave} disabled={!canEdit || saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Console Server Settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
