"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Plus, Save, Shield, Trash2 } from "lucide-react";
import { systemService, type SshConfig } from "@/lib/api/system";

interface SshServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

export function SshServiceTab({ canEdit, active, refreshNonce }: SshServiceTabProps) {
  const [config, setConfig] = useState<SshConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await systemService.getSshConfig(refresh);
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SSH configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active || config) return;
    loadConfig(false);
  }, [active, config]);

  useEffect(() => {
    if (!active) return;
    loadConfig(true);
  }, [active, refreshNonce]);

  const addListenAddress = () => {
    setConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, listen_addresses: [...previous.listen_addresses, ""] };
    });
  };

  const updateListenAddress = (index: number, value: string) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.listen_addresses];
      next[index] = value;
      return { ...previous, listen_addresses: next };
    });
  };

  const removeListenAddress = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        listen_addresses: previous.listen_addresses.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const handleSave = async () => {
    if (!config) return;
    const port = config.port ?? 22;
    if (port < 1 || port > 65535) {
      setError("SSH port must be between 1 and 65535.");
      setSuccess(null);
      return;
    }

    const payload: SshConfig = {
      enabled: config.enabled,
      port,
      listen_addresses: Array.from(
        new Set(config.listen_addresses.map((entry) => entry.trim()).filter((entry) => entry.length > 0))
      ),
      disable_password_authentication: config.disable_password_authentication,
    };

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await systemService.updateSshConfig(payload);
      setConfig(updated);
      setSuccess("SSH configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update SSH configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            SSH Service
          </CardTitle>
          <CardDescription>
            Enable SSH access and manage bind addresses and authentication posture.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !config ? (
            <p className="text-sm text-muted-foreground">Loading SSH configuration...</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.enabled}
                  onCheckedChange={(checked) =>
                    setConfig((previous) =>
                      previous ? { ...previous, enabled: checked === true } : previous
                    )
                  }
                  disabled={!canEdit || saving}
                />
                <Label className="text-sm font-medium">Enable SSH service</Label>
              </div>

              <div className="grid gap-2 md:max-w-sm">
                <Label>Port</Label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={config.port ?? 22}
                  onChange={(event) =>
                    setConfig((previous) => {
                      if (!previous) return previous;
                      const parsed = Number.parseInt(event.target.value, 10);
                      return {
                        ...previous,
                        port: Number.isNaN(parsed) ? null : parsed,
                      };
                    })
                  }
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.disable_password_authentication}
                  onCheckedChange={(checked) =>
                    setConfig((previous) =>
                      previous
                        ? { ...previous, disable_password_authentication: checked === true }
                        : previous
                    )
                  }
                  disabled={!canEdit || saving || !config.enabled}
                />
                <Label className="text-sm font-medium">Disable password authentication (key-only SSH)</Label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Listen Addresses</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addListenAddress}
                    disabled={!canEdit || saving || !config.enabled}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Address
                  </Button>
                </div>
                {config.listen_addresses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Empty means SSH listens on all available addresses.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {config.listen_addresses.map((entry, index) => (
                      <div key={`ssh-listen-${index}`} className="flex items-center gap-2">
                        <Input
                          value={entry}
                          onChange={(event) => updateListenAddress(index, event.target.value)}
                          placeholder="192.168.1.1"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeListenAddress(index)}
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

              <Button onClick={handleSave} disabled={!canEdit || saving || loading}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save SSH Settings"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
