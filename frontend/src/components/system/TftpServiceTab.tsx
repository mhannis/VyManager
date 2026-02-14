"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Folder, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, quoteCliValue, toRecord } from "./serviceTabHelpers";

interface TftpListener {
  address: string;
  vrf: string;
}

interface TftpServiceState {
  enabled: boolean;
  directory: string;
  allowUpload: boolean;
  listeners: TftpListener[];
}

const EMPTY_TFTP_STATE: TftpServiceState = {
  enabled: false,
  directory: "",
  allowUpload: false,
  listeners: [],
};

interface TftpServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function parseTftpState(serviceNode: Record<string, unknown>): TftpServiceState {
  const listenersNode = toRecord(serviceNode["listen-address"]);
  const listeners = Object.keys(listenersNode)
    .sort((left, right) => left.localeCompare(right))
    .map((address) => ({
      address,
      vrf: asString(toRecord(listenersNode[address]).vrf) ?? "",
    }));

  return {
    enabled: Object.keys(serviceNode).length > 0,
    directory: asString(serviceNode.directory) ?? "",
    allowUpload: Object.prototype.hasOwnProperty.call(serviceNode, "allow-upload"),
    listeners,
  };
}

export function TftpServiceTab({ canEdit, active, refreshNonce }: TftpServiceTabProps) {
  const [config, setConfig] = useState<TftpServiceState>(EMPTY_TFTP_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getTftpConfig(refresh);
      setConfig(parseTftpState(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load TFTP server configuration.");
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

  const updateListener = (index: number, update: Partial<TftpListener>) => {
    setConfig((previous) => {
      const next = [...previous.listeners];
      next[index] = { ...next[index], ...update };
      return { ...previous, listeners: next };
    });
  };

  const removeListener = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      listeners: previous.listeners.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSave = async () => {
    if (config.enabled && !config.directory.trim()) {
      setError("TFTP directory is required when the server is enabled.");
      setSuccess(null);
      return;
    }

    for (const listener of config.listeners) {
      if (!listener.address.trim()) {
        setError("Each listener row needs an address.");
        setSuccess(null);
        return;
      }
    }

    const operations: string[] = ["delete service tftp-server"];

    if (config.enabled) {
      operations.push("set service tftp-server");
      operations.push(`set service tftp-server directory ${quoteCliValue(config.directory)}`);

      if (config.allowUpload) {
        operations.push("set service tftp-server allow-upload");
      }

      const seen = new Set<string>();
      for (const listener of config.listeners) {
        const address = listener.address.trim();
        const vrf = listener.vrf.trim();
        const key = `${address}::${vrf}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let command = `set service tftp-server listen-address ${quoteCliValue(address)}`;
        if (vrf) {
          command += ` vrf ${quoteCliValue(vrf)}`;
        }
        operations.push(command);
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureTftp(operations);
      await loadConfig(true);
      setSuccess("TFTP server configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update TFTP server configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Folder className="h-5 w-5 text-primary" />
          TFTP Server
        </CardTitle>
        <CardDescription>
          Configure a simple TFTP service with listener addresses and optional VRF bindings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading TFTP server configuration...</p>
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
              <Label className="text-sm font-medium">Enable TFTP server</Label>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <Label>TFTP Directory</Label>
                <Input
                  value={config.directory}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, directory: event.target.value }))
                  }
                  placeholder="/config/tftpboot"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <label className="flex items-center gap-2 text-sm xl:pt-8">
                <Checkbox
                  checked={config.allowUpload}
                  onCheckedChange={(checked) =>
                    setConfig((previous) => ({ ...previous, allowUpload: checked === true }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                />
                Allow client uploads
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Listen Addresses</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      listeners: [...previous.listeners, { address: "", vrf: "" }],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Listener
                </Button>
              </div>

              {config.listeners.length === 0 ? (
                <p className="text-xs text-muted-foreground">No explicit listeners configured.</p>
              ) : (
                <div className="space-y-2">
                  {config.listeners.map((listener, index) => (
                    <div key={`tftp-listener-${index}`} className="grid gap-2 xl:grid-cols-[2fr_1fr_auto]">
                      <Input
                        value={listener.address}
                        onChange={(event) =>
                          updateListener(index, { address: event.target.value })
                        }
                        placeholder="192.168.10.2"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Input
                        value={listener.vrf}
                        onChange={(event) =>
                          updateListener(index, { vrf: event.target.value })
                        }
                        placeholder="default"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeListener(index)}
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
              {saving ? "Saving..." : "Save TFTP Settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
