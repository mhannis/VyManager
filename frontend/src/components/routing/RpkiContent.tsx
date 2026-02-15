"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { rpkiService } from "@/lib/api/rpki";
import { routingProtocolGuides } from "@/lib/help/routingProtocolGuides";

type RpkiGlobals = {
  pollingPeriod: string;
  expireInterval: string;
  retryInterval: string;
};

type RpkiCacheEntry = {
  address: string;
  port: string;
  preference: string;
  sshUsername: string;
  sshPrivateKeyFile: string;
  sshPublicKeyFile: string;
};

type RpkiState = {
  globals: RpkiGlobals;
  caches: RpkiCacheEntry[];
};

const EMPTY_GLOBALS: RpkiGlobals = {
  pollingPeriod: "",
  expireInterval: "",
  retryInterval: "",
};

const EMPTY_CACHE: RpkiCacheEntry = {
  address: "",
  port: "",
  preference: "",
  sshUsername: "",
  sshPrivateKeyFile: "",
  sshPublicKeyFile: "",
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseGlobals(root: Record<string, unknown>): RpkiGlobals {
  return {
    pollingPeriod: asString(root["polling-period"] ?? root.polling_period),
    expireInterval: asString(root["expire-interval"] ?? root.expire_interval),
    retryInterval: asString(root["retry-interval"] ?? root.retry_interval),
  };
}

function parseCaches(root: Record<string, unknown>): RpkiCacheEntry[] {
  const rows: RpkiCacheEntry[] = [];
  const cacheRoot = asObject(root.cache);

  for (const [address, cacheConfig] of Object.entries(cacheRoot)) {
    const cfg = asObject(cacheConfig);
    const ssh = asObject(cfg.ssh);

    rows.push({
      address,
      port: asString(cfg.port),
      preference: asString(cfg.preference),
      sshUsername: asString(ssh.username),
      sshPrivateKeyFile: asString(ssh["private-key-file"] ?? ssh.private_key_file),
      sshPublicKeyFile: asString(ssh["public-key-file"] ?? ssh.public_key_file),
    });
  }

  return rows.sort((a, b) => a.address.localeCompare(b.address));
}

function normalizeCache(entry: RpkiCacheEntry): RpkiCacheEntry {
  return {
    address: entry.address.trim(),
    port: entry.port.trim(),
    preference: entry.preference.trim(),
    sshUsername: entry.sshUsername.trim(),
    sshPrivateKeyFile: entry.sshPrivateKeyFile.trim(),
    sshPublicKeyFile: entry.sshPublicKeyFile.trim(),
  };
}

function cachesEqual(a: RpkiCacheEntry, b: RpkiCacheEntry): boolean {
  return (
    a.address === b.address &&
    a.port === b.port &&
    a.preference === b.preference &&
    a.sshUsername === b.sshUsername &&
    a.sshPrivateKeyFile === b.sshPrivateKeyFile &&
    a.sshPublicKeyFile === b.sshPublicKeyFile
  );
}

function cacheSetCommands(entry: RpkiCacheEntry): string[] {
  const address = entry.address;
  const port = entry.port || "3323";
  const commands = [`set protocols rpki cache ${address} port ${port}`];

  if (entry.preference) {
    commands.push(`set protocols rpki cache ${address} preference ${entry.preference}`);
  }
  if (entry.sshUsername) {
    commands.push(`set protocols rpki cache ${address} ssh username ${entry.sshUsername}`);
  }
  if (entry.sshPrivateKeyFile) {
    commands.push(
      `set protocols rpki cache ${address} ssh private-key-file ${entry.sshPrivateKeyFile}`
    );
  }
  if (entry.sshPublicKeyFile) {
    commands.push(
      `set protocols rpki cache ${address} ssh public-key-file ${entry.sshPublicKeyFile}`
    );
  }

  return commands;
}

export function RpkiContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<RpkiState | null>(null);
  const [globals, setGlobals] = useState<RpkiGlobals>(EMPTY_GLOBALS);
  const [caches, setCaches] = useState<RpkiCacheEntry[]>([]);
  const [cacheDraft, setCacheDraft] = useState<RpkiCacheEntry>(EMPTY_CACHE);

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const rpkiConfig = await rpkiService.getConfig(refresh);
      const root = asObject((rpkiConfig as { rpki?: unknown }).rpki);

      const parsedState: RpkiState = {
        globals: parseGlobals(root),
        caches: parseCaches(root),
      };

      setCurrentState(parsedState);
      setGlobals(parsedState.globals);
      setCaches(parsedState.caches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load RPKI configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddOrUpdateCache = () => {
    const normalized = normalizeCache(cacheDraft);
    if (!normalized.address) {
      setError("Cache address is required.");
      return;
    }

    setError(null);
    setCaches((prev) => {
      const without = prev.filter((item) => item.address !== normalized.address);
      return [...without, normalized].sort((a, b) => a.address.localeCompare(b.address));
    });
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const applyScalar = (
        current: string,
        desired: string,
        setCommand: (value: string) => string,
        deleteCommand: string
      ) => {
        if (current === desired) return;
        if (desired) {
          operations.push(setCommand(desired));
        } else {
          operations.push(deleteCommand);
        }
      };

      applyScalar(
        currentState.globals.pollingPeriod,
        globals.pollingPeriod.trim(),
        (value) => `set protocols rpki polling-period ${value}`,
        "delete protocols rpki polling-period"
      );

      applyScalar(
        currentState.globals.expireInterval,
        globals.expireInterval.trim(),
        (value) => `set protocols rpki expire-interval ${value}`,
        "delete protocols rpki expire-interval"
      );

      applyScalar(
        currentState.globals.retryInterval,
        globals.retryInterval.trim(),
        (value) => `set protocols rpki retry-interval ${value}`,
        "delete protocols rpki retry-interval"
      );

      const currentCacheMap = new Map(currentState.caches.map((entry) => [entry.address, entry]));
      const desiredCacheMap = new Map(
        caches
          .map(normalizeCache)
          .filter((entry) => entry.address)
          .map((entry) => [entry.address, entry])
      );

      for (const [address] of currentCacheMap) {
        if (!desiredCacheMap.has(address)) {
          operations.push(`delete protocols rpki cache ${address}`);
        }
      }

      for (const [address, desiredEntry] of desiredCacheMap) {
        const currentEntry = currentCacheMap.get(address);
        if (currentEntry && cachesEqual(currentEntry, desiredEntry)) {
          continue;
        }

        if (currentEntry) {
          operations.push(`delete protocols rpki cache ${address}`);
        }
        operations.push(...cacheSetCommands(desiredEntry));
      }

      const finalOperations = [...new Set(operations.map((item) => item.trim()).filter(Boolean))];
      if (finalOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await rpkiService.batchConfigure({ operations: finalOperations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply RPKI configuration");
      }

      setMessage("RPKI configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save RPKI configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">RPKI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Full-form RPKI validator cache configuration and polling/expiry intervals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PageGuideDialog guide={routingProtocolGuides.rpki} />
          <Button variant="outline" size="sm" onClick={() => loadData(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {message && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="p-3 text-sm text-emerald-400">{message}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global Timers</CardTitle>
          <CardDescription>RPKI cache polling and validation timer controls.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Polling Period (1-86400)</Label>
            <Input
              type="number"
              value={globals.pollingPeriod}
              placeholder="300"
              onChange={(event) =>
                setGlobals((prev) => ({ ...prev, pollingPeriod: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Expire Interval (600-172800)</Label>
            <Input
              type="number"
              value={globals.expireInterval}
              placeholder="7200"
              onChange={(event) =>
                setGlobals((prev) => ({ ...prev, expireInterval: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Retry Interval (1-7200)</Label>
            <Input
              type="number"
              value={globals.retryInterval}
              placeholder="600"
              onChange={(event) =>
                setGlobals((prev) => ({ ...prev, retryInterval: event.target.value }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">RPKI Caches</CardTitle>
          <CardDescription>
            Configure validator cache servers and optional SSH settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {caches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No RPKI cache servers configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Preference</TableHead>
                  <TableHead>SSH Username</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {caches.map((cache) => (
                  <TableRow key={cache.address}>
                    <TableCell className="font-mono text-xs">{cache.address}</TableCell>
                    <TableCell>{cache.port || "3323"}</TableCell>
                    <TableCell>{cache.preference || "-"}</TableCell>
                    <TableCell>{cache.sshUsername || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setCaches((prev) => prev.filter((item) => item.address !== cache.address))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <Input
              value={cacheDraft.address}
              placeholder="192.0.2.1"
              onChange={(event) =>
                setCacheDraft((prev) => ({ ...prev, address: event.target.value }))
              }
            />
            <Input
              type="number"
              value={cacheDraft.port}
              placeholder="3323"
              onChange={(event) => setCacheDraft((prev) => ({ ...prev, port: event.target.value }))}
            />
            <Input
              type="number"
              value={cacheDraft.preference}
              placeholder="1"
              onChange={(event) =>
                setCacheDraft((prev) => ({ ...prev, preference: event.target.value }))
              }
            />
            <Input
              value={cacheDraft.sshUsername}
              placeholder="SSH username (optional)"
              onChange={(event) =>
                setCacheDraft((prev) => ({ ...prev, sshUsername: event.target.value }))
              }
            />
            <Input
              value={cacheDraft.sshPrivateKeyFile}
              placeholder="SSH private-key-file (optional)"
              onChange={(event) =>
                setCacheDraft((prev) => ({ ...prev, sshPrivateKeyFile: event.target.value }))
              }
            />
            <Input
              value={cacheDraft.sshPublicKeyFile}
              placeholder="SSH public-key-file (optional)"
              onChange={(event) =>
                setCacheDraft((prev) => ({ ...prev, sshPublicKeyFile: event.target.value }))
              }
            />
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={handleAddOrUpdateCache}>
              <Plus className="mr-2 h-4 w-4" />
              Add / Update Cache
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
