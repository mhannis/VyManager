"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, KeyRound, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { vpnRsaKeysApi } from "@/lib/api/vpn-rsa-keys";
import { quoteCliValue, toRecord } from "@/components/system/serviceTabHelpers";

interface RsaKeyEntry {
  name: string;
  key: string;
}

function parseConfig(root: Record<string, unknown>): RsaKeyEntry[] {
  return Object.keys(root)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((name) => {
      const cfg = toRecord(root[name]);
      return {
        name,
        key: typeof cfg.key === "string" ? cfg.key : "",
      };
    });
}

export default function VpnRsaKeysPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.VPN) || canWrite(FeatureGroup.IPSEC);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [entries, setEntries] = useState<RsaKeyEntry[]>([]);

  const loadConfig = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await vpnRsaKeysApi.getConfig(refresh);
      setEntries(parseConfig(toRecord(payload.vpn)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load VPN RSA keys configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig(false);
  }, []);

  const handleSave = async () => {
    const operations: string[] = ["delete vpn rsa-keys"];

    for (const entry of entries) {
      const name = entry.name.trim();
      const key = entry.key.trim();
      if (!name || !key) continue;
      operations.push(`set vpn rsa-keys ${quoteCliValue(name)} key ${quoteCliValue(key)}`);
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await vpnRsaKeysApi.configure(operations);
      await loadConfig(true);
      setSuccess("VPN RSA keys configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update VPN RSA keys configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">RSA Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage reusable VPN RSA public keys for peer authentication profiles.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              VPN RSA Keys
            </CardTitle>
            <CardDescription>
              Add key aliases and public key material under <code>vpn rsa-keys</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading VPN RSA keys...</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Key Entries</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEntries((previous) => [...previous, { name: "", key: "" }])}
                    disabled={!canEdit || saving}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Key
                  </Button>
                </div>

                {entries.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No RSA keys configured.</p>
                ) : (
                  <div className="space-y-2">
                    {entries.map((entry, index) => (
                      <div key={`rsa-key-${index}`} className="rounded border p-3 space-y-2">
                        <div className="grid gap-2 xl:grid-cols-[1fr_auto]">
                          <Input
                            value={entry.name}
                            onChange={(event) =>
                              setEntries((previous) => {
                                const next = [...previous];
                                next[index] = { ...next[index], name: event.target.value };
                                return next;
                              })
                            }
                            placeholder="PEER-A"
                            disabled={!canEdit || saving}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setEntries((previous) => previous.filter((_, currentIndex) => currentIndex !== index))
                            }
                            disabled={!canEdit || saving}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <Input
                          value={entry.key}
                          onChange={(event) =>
                            setEntries((previous) => {
                              const next = [...previous];
                              next[index] = { ...next[index], key: event.target.value };
                              return next;
                            })
                          }
                          placeholder="ssh-rsa AAAAB3..."
                          disabled={!canEdit || saving}
                        />
                      </div>
                    ))}
                  </div>
                )}

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
                    {saving ? "Saving..." : "Save RSA Keys"}
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
