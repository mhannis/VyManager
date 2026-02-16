"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import { systemConsoleService, type SerialConsoleDevice } from "@/lib/api/system-console";

interface ConsoleFormState {
  name: string;
  speed: string;
}

const SPEED_OPTIONS = ["1200", "2400", "4800", "9600", "19200", "38400", "57600", "115200"] as const;

const EMPTY_FORM: ConsoleFormState = {
  name: "",
  speed: "115200",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

export default function SystemSerialConsolePage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [devices, setDevices] = useState<SerialConsoleDevice[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<ConsoleFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemConsoleService.getConfig(refresh);
      setDevices(response.devices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load serial console settings.");
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

  const editDevice = (device: SerialConsoleDevice) => {
    setEditingName(device.name);
    setForm({
      name: device.name,
      speed: device.speed || "115200",
    });
    setError(null);
    setSuccess(null);
  };

  const saveDevice = async () => {
    const name = form.name.trim();
    const speed = form.speed.trim();
    if (!name) {
      setError("Device name is required.");
      return;
    }
    if (!/^tty[A-Za-z0-9._-]+$/.test(name)) {
      setError("Device name should look like ttyS0, ttyUSB0, or ttyAMA0.");
      return;
    }
    if (!speed) {
      setError("Speed is required.");
      return;
    }

    if (editingName && editingName !== name) {
      setError("Renaming devices is not supported. Create a new entry and delete the old one.");
      return;
    }

    const current = devices.find((entry) => entry.name === name);
    if (current && (current.speed || "") === speed) {
      setSuccess("No changes to apply.");
      return;
    }

    const operations: string[] = [
      `set system console device ${quoteCliValue(name)}`,
      `set system console device ${quoteCliValue(name)} speed ${quoteCliValue(speed)}`,
    ];

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemConsoleService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected serial console changes.");
      }
      await loadData(true);
      setSuccess(current ? `Updated ${name}.` : `Added ${name}.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save serial console settings.");
    } finally {
      setSaving(false);
    }
  };

  const deleteDevice = async (name: string) => {
    if (!window.confirm(`Delete console device '${name}'?`)) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemConsoleService.batchConfigure([
        `delete system console device ${quoteCliValue(name)}`,
      ]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected serial console delete.");
      }
      await loadData(true);
      if (editingName === name) resetForm();
      setSuccess(`Deleted ${name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete serial console device.");
    } finally {
      setSaving(false);
    }
  };

  const deviceCount = useMemo(() => devices.length, [devices]);

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
            <h1 className="text-3xl font-bold">Serial Console</h1>
            <p className="mt-1 text-muted-foreground">
              Configure serial console devices under `system console`.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.systemSerialConsole} />
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

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Configured Devices</CardTitle>
              <CardDescription>Serial devices currently configured for console access.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">Devices: {deviceCount}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadData(true)}
                  disabled={refreshing || saving}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Speed</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                          No serial console devices configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      devices.map((device) => (
                        <TableRow key={device.name}>
                          <TableCell className="font-mono text-xs">{device.name}</TableCell>
                          <TableCell>{device.speed || "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editDevice(device)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void deleteDevice(device.name)}
                                disabled={!canEdit || saving}
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
              <CardTitle>{editingName ? `Edit ${editingName}` : "Add Console Device"}</CardTitle>
              <CardDescription>Set device name and line speed for serial console access.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="serial-device-name">Device Name</Label>
                <Input
                  id="serial-device-name"
                  value={form.name}
                  onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="ttyS0"
                  className="font-mono"
                  disabled={!canEdit || saving || Boolean(editingName)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serial-device-speed">Speed</Label>
                <Select
                  value={form.speed || "115200"}
                  onValueChange={(value) => setForm((previous) => ({ ...previous, speed: value }))}
                >
                  <SelectTrigger id="serial-device-speed" disabled={!canEdit || saving}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPEED_OPTIONS.map((speed) => (
                      <SelectItem key={speed} value={speed}>
                        {speed}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!canEdit && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  You have read-only permissions for System settings.
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" onClick={saveDevice} disabled={!canEdit || saving} className="flex-1">
                  {editingName ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingName ? "Update Device" : "Add Device"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

