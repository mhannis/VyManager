"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Save, Server } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, quoteCliValue, toRecord } from "./serviceTabHelpers";

interface SaltMinionConfigState {
  enabled: boolean;
  master: string;
  id: string;
  hash: string;
  interval: string;
  masterKey: string;
}

const EMPTY_SALT_STATE: SaltMinionConfigState = {
  enabled: false,
  master: "",
  id: "",
  hash: "",
  interval: "",
  masterKey: "",
};

interface SaltMinionServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function parseSaltMinionConfig(serviceNode: Record<string, unknown>): SaltMinionConfigState {
  return {
    enabled: Object.keys(serviceNode).length > 0,
    master: asString(serviceNode.master) ?? "",
    id: asString(serviceNode.id) ?? "",
    hash: asString(serviceNode.hash) ?? "",
    interval: asString(serviceNode.interval) ?? "",
    masterKey: asString(serviceNode["master-key"]) ?? "",
  };
}

export function SaltMinionServiceTab({ canEdit, active, refreshNonce }: SaltMinionServiceTabProps) {
  const [config, setConfig] = useState<SaltMinionConfigState>(EMPTY_SALT_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getSaltMinionConfig(refresh);
      setConfig(parseSaltMinionConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Salt Minion configuration.");
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

  const handleSave = async () => {
    if (config.interval.trim()) {
      const interval = Number.parseInt(config.interval, 10);
      if (!Number.isFinite(interval) || interval < 1 || interval > 1440) {
        setError("Salt minion interval must be between 1 and 1440 minutes.");
        setSuccess(null);
        return;
      }
    }

    const operations: string[] = ["delete service salt-minion"];
    if (config.enabled) {
      operations.push("set service salt-minion");

      if (config.master.trim()) {
        operations.push(`set service salt-minion master ${quoteCliValue(config.master)}`);
      }
      if (config.id.trim()) {
        operations.push(`set service salt-minion id ${quoteCliValue(config.id)}`);
      }
      if (config.hash.trim()) {
        operations.push(`set service salt-minion hash ${quoteCliValue(config.hash)}`);
      }
      if (config.interval.trim()) {
        operations.push(`set service salt-minion interval ${config.interval.trim()}`);
      }
      if (config.masterKey.trim()) {
        operations.push(`set service salt-minion master-key ${quoteCliValue(config.masterKey)}`);
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureSaltMinion(operations);
      await loadConfig(true);
      setSuccess("Salt Minion configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update Salt Minion configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          Salt Minion
        </CardTitle>
        <CardDescription>
          Configure the Salt minion agent used for centralized orchestration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading Salt Minion configuration...</p>
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
              <Label className="text-sm font-medium">Enable Salt Minion</Label>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <Label>Master</Label>
                <Input
                  value={config.master}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, master: event.target.value }))
                  }
                  placeholder="192.168.10.10"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Minion ID</Label>
                <Input
                  value={config.id}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, id: event.target.value }))
                  }
                  placeholder="vyos-edge-01"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="space-y-2">
                <Label>Hash</Label>
                <Input
                  value={config.hash}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, hash: event.target.value }))
                  }
                  placeholder="sha256"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Interval (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={config.interval}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, interval: event.target.value }))
                  }
                  placeholder="30"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Master Key</Label>
                <Input
                  value={config.masterKey}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, masterKey: event.target.value }))
                  }
                  placeholder="optional-shared-key"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
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
              {saving ? "Saving..." : "Save Salt Minion Settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
