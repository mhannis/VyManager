"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AlertCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import {
  natCgnatService,
  type CgnatConfig,
  type CgnatExternalPool,
  type CgnatInternalPool,
  type CgnatRule,
} from "@/lib/api/nat-cgnat";

interface ExternalPoolDraft {
  name: string;
  externalPortRanges: string;
  perUserLimitPort: string;
  ranges: string;
}

interface InternalPoolDraft {
  name: string;
  ranges: string;
}

interface RuleDraft {
  ruleId: string;
  sourcePool: string;
  translationPool: string;
}

const EMPTY_CONFIG: CgnatConfig = {
  enabled: false,
  log_allocation: false,
  external_pools: [],
  internal_pools: [],
  rules: [],
};

const EMPTY_EXTERNAL_POOL_DRAFT: ExternalPoolDraft = {
  name: "",
  externalPortRanges: "",
  perUserLimitPort: "",
  ranges: "",
};

const EMPTY_INTERNAL_POOL_DRAFT: InternalPoolDraft = {
  name: "",
  ranges: "",
};

const EMPTY_RULE_DRAFT: RuleDraft = {
  ruleId: "",
  sourcePool: "",
  translationPool: "",
};

function normalize(value: string): string {
  return value.trim();
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => normalize(item))
    .filter(Boolean);
}

function parseExternalRanges(value: string): Array<{ range: string; seq: string | null }> {
  return value
    .split(",")
    .map((item) => normalize(item))
    .filter(Boolean)
    .map((item) => {
      const [range, rawSeq] = item.split("@");
      const seq = normalize(rawSeq || "");
      return {
        range: normalize(range || ""),
        seq: seq || null,
      };
    })
    .filter((entry) => entry.range);
}

function formatExternalRanges(entries: Array<{ range: string; seq: string | null }>): string {
  return entries
    .map((entry) => (entry.seq ? `${entry.range}@${entry.seq}` : entry.range))
    .join(", ");
}

function quoteCliValue(value: string): string {
  const clean = value.trim();
  if (/^[A-Za-z0-9._:/@+-]+$/.test(clean)) return clean;
  return `'${clean.replace(/'/g, "'\\''")}'`;
}

export default function CgnatPage() {
  const { canRead, canWrite, isLoading: permissionsLoading } = usePermissions();
  const canEdit = canWrite(FeatureGroup.NAT);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [config, setConfig] = useState<CgnatConfig>(EMPTY_CONFIG);
  const [currentConfig, setCurrentConfig] = useState<CgnatConfig>(EMPTY_CONFIG);

  const [externalPoolDraft, setExternalPoolDraft] = useState<ExternalPoolDraft>(EMPTY_EXTERNAL_POOL_DRAFT);
  const [internalPoolDraft, setInternalPoolDraft] = useState<InternalPoolDraft>(EMPTY_INTERNAL_POOL_DRAFT);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(EMPTY_RULE_DRAFT);

  const externalPoolNames = useMemo(
    () => config.external_pools.map((pool) => pool.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [config.external_pools]
  );
  const internalPoolNames = useMemo(
    () => config.internal_pools.map((pool) => pool.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [config.internal_pools]
  );

  const load = async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const data = await natCgnatService.getConfig(refresh);
      setConfig(data);
      setCurrentConfig(data);
      setRuleDraft((previous) => ({
        ...previous,
        sourcePool: previous.sourcePool || data.internal_pools[0]?.name || "",
        translationPool: previous.translationPool || data.external_pools[0]?.name || "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CGNAT configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  const addExternalPool = () => {
    setError(null);

    const name = normalize(externalPoolDraft.name);
    if (!name) {
      setError("External pool name is required.");
      return;
    }

    if (config.external_pools.some((entry) => entry.name === name)) {
      setError("External pool name already exists.");
      return;
    }

    const pool: CgnatExternalPool = {
      name,
      external_port_ranges: parseCsv(externalPoolDraft.externalPortRanges),
      per_user_limit_port: normalize(externalPoolDraft.perUserLimitPort) || null,
      ranges: parseExternalRanges(externalPoolDraft.ranges),
    };

    if (pool.ranges.length === 0) {
      setError("External pool requires at least one range.");
      return;
    }

    setConfig((previous) => ({
      ...previous,
      enabled: true,
      external_pools: [...previous.external_pools, pool].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true })
      ),
    }));

    setExternalPoolDraft(EMPTY_EXTERNAL_POOL_DRAFT);
  };

  const addInternalPool = () => {
    setError(null);

    const name = normalize(internalPoolDraft.name);
    if (!name) {
      setError("Internal pool name is required.");
      return;
    }

    if (config.internal_pools.some((entry) => entry.name === name)) {
      setError("Internal pool name already exists.");
      return;
    }

    const pool: CgnatInternalPool = {
      name,
      ranges: parseCsv(internalPoolDraft.ranges),
    };

    if (pool.ranges.length === 0) {
      setError("Internal pool requires at least one range.");
      return;
    }

    setConfig((previous) => ({
      ...previous,
      enabled: true,
      internal_pools: [...previous.internal_pools, pool].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true })
      ),
    }));

    setInternalPoolDraft(EMPTY_INTERNAL_POOL_DRAFT);
  };

  const addRule = () => {
    setError(null);

    const ruleId = normalize(ruleDraft.ruleId);
    const sourcePool = normalize(ruleDraft.sourcePool);
    const translationPool = normalize(ruleDraft.translationPool);

    if (!ruleId || !/^\d+$/.test(ruleId)) {
      setError("Rule ID must be a positive integer.");
      return;
    }

    if (!sourcePool || !translationPool) {
      setError("Rule requires source and translation pools.");
      return;
    }

    if (!config.internal_pools.some((entry) => entry.name === sourcePool)) {
      setError(`Source pool '${sourcePool}' does not exist.`);
      return;
    }

    if (!config.external_pools.some((entry) => entry.name === translationPool)) {
      setError(`Translation pool '${translationPool}' does not exist.`);
      return;
    }

    if (config.rules.some((entry) => entry.rule_id === ruleId)) {
      setError("Rule ID already exists.");
      return;
    }

    const rule: CgnatRule = {
      rule_id: ruleId,
      source_pool: sourcePool,
      translation_pool: translationPool,
    };

    setConfig((previous) => ({
      ...previous,
      enabled: true,
      rules: [...previous.rules, rule].sort((left, right) =>
        left.rule_id.localeCompare(right.rule_id, undefined, { numeric: true })
      ),
    }));

    setRuleDraft({
      ...EMPTY_RULE_DRAFT,
      sourcePool,
      translationPool,
    });
  };

  const removeExternalPool = (name: string) => {
    setConfig((previous) => ({
      ...previous,
      external_pools: previous.external_pools.filter((entry) => entry.name !== name),
      rules: previous.rules.filter((entry) => entry.translation_pool !== name),
    }));
  };

  const removeInternalPool = (name: string) => {
    setConfig((previous) => ({
      ...previous,
      internal_pools: previous.internal_pools.filter((entry) => entry.name !== name),
      rules: previous.rules.filter((entry) => entry.source_pool !== name),
    }));
  };

  const removeRule = (ruleId: string) => {
    setConfig((previous) => ({
      ...previous,
      rules: previous.rules.filter((entry) => entry.rule_id !== ruleId),
    }));
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      if (currentConfig.enabled) {
        operations.push("delete nat cgnat");
      }

      const shouldConfigure =
        config.enabled &&
        (config.log_allocation || config.external_pools.length > 0 || config.internal_pools.length > 0 || config.rules.length > 0);

      if (shouldConfigure) {
        if (config.log_allocation) {
          operations.push("set nat cgnat log-allocation");
        }

        for (const pool of config.external_pools) {
          const poolBase = `set nat cgnat pool external ${quoteCliValue(pool.name)}`;
          operations.push(poolBase);
          for (const portRange of pool.external_port_ranges) {
            operations.push(`${poolBase} external-port-range ${quoteCliValue(portRange)}`);
          }
          if (normalize(pool.per_user_limit_port || "")) {
            operations.push(`${poolBase} per-user-limit port ${quoteCliValue(pool.per_user_limit_port || "")}`);
          }
          for (const rangeEntry of pool.ranges) {
            const rangeBase = `${poolBase} range ${quoteCliValue(rangeEntry.range)}`;
            operations.push(rangeBase);
            if (normalize(rangeEntry.seq || "")) {
              operations.push(`${rangeBase} seq ${quoteCliValue(rangeEntry.seq || "")}`);
            }
          }
        }

        for (const pool of config.internal_pools) {
          const poolBase = `set nat cgnat pool internal ${quoteCliValue(pool.name)}`;
          operations.push(poolBase);
          for (const range of pool.ranges) {
            operations.push(`${poolBase} range ${quoteCliValue(range)}`);
          }
        }

        for (const rule of config.rules) {
          const ruleBase = `set nat cgnat rule ${quoteCliValue(rule.rule_id)}`;
          operations.push(`${ruleBase} source pool ${quoteCliValue(rule.source_pool)}`);
          operations.push(`${ruleBase} translation pool ${quoteCliValue(rule.translation_pool)}`);
        }
      }

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const response = await natCgnatService.configure(operations);
      if (!response.success) {
        throw new Error(response.error || "Failed to update CGNAT configuration");
      }

      setMessage("CGNAT configuration saved successfully.");
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save CGNAT configuration");
    } finally {
      setSaving(false);
    }
  };

  if (permissionsLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
      </AppLayout>
    );
  }

  if (!canRead(FeatureGroup.NAT)) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              You do not have permission to view CGNAT settings.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">CGNAT</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure carrier-grade NAT pools, allocation logging, and source-to-translation pool rules.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/network/nat">Open NAT44</Link>
            </Button>
            <Button variant="outline" onClick={() => load(true)} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={save} disabled={!canEdit || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save CGNAT"}
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {message && (
          <Card className="border-primary/40">
            <CardContent className="pt-6 text-sm text-primary">{message}</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Global</CardTitle>
            <CardDescription>Enable CGNAT and optional allocation logging.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
              <Checkbox
                checked={config.enabled}
                disabled={!canEdit || saving}
                onCheckedChange={(checked) =>
                  setConfig((previous) => ({ ...previous, enabled: checked === true }))
                }
              />
              <span>Enable CGNAT configuration</span>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
              <Checkbox
                checked={config.log_allocation}
                disabled={!canEdit || saving || !config.enabled}
                onCheckedChange={(checked) =>
                  setConfig((previous) => ({ ...previous, log_allocation: checked === true }))
                }
              />
              <span>Enable allocation logging (`set nat cgnat log-allocation`)</span>
            </label>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>External Pools</CardTitle>
              <CardDescription>
                Define external address pools, port ranges, per-user limits, and optional range sequence priorities.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Pool Name</Label>
                  <Input
                    value={externalPoolDraft.name}
                    onChange={(event) =>
                      setExternalPoolDraft((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="ext1"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Per-User Port Limit (optional)</Label>
                  <Input
                    value={externalPoolDraft.perUserLimitPort}
                    onChange={(event) =>
                      setExternalPoolDraft((previous) => ({ ...previous, perUserLimitPort: event.target.value }))
                    }
                    placeholder="2000"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>External Port Ranges (comma-separated)</Label>
                  <Input
                    value={externalPoolDraft.externalPortRanges}
                    onChange={(event) =>
                      setExternalPoolDraft((previous) => ({ ...previous, externalPortRanges: event.target.value }))
                    }
                    placeholder="1024-65535"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Address Ranges (comma-separated, use @seq optional)</Label>
                  <Input
                    value={externalPoolDraft.ranges}
                    onChange={(event) =>
                      setExternalPoolDraft((previous) => ({ ...previous, ranges: event.target.value }))
                    }
                    placeholder="203.0.113.1/32@10, 192.0.2.1/32@20"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
              </div>
              <Button variant="outline" onClick={addExternalPool} disabled={!canEdit || saving || !config.enabled}>
                <Plus className="mr-2 h-4 w-4" />
                Add External Pool
              </Button>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Port Ranges</TableHead>
                    <TableHead>Per-User</TableHead>
                    <TableHead>Ranges</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.external_pools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No external pools configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    config.external_pools.map((pool) => (
                      <TableRow key={pool.name}>
                        <TableCell>{pool.name}</TableCell>
                        <TableCell>{pool.external_port_ranges.join(", ") || "-"}</TableCell>
                        <TableCell>{pool.per_user_limit_port || "-"}</TableCell>
                        <TableCell>{formatExternalRanges(pool.ranges) || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeExternalPool(pool.name)}
                            disabled={!canEdit || saving || !config.enabled}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Internal Pools</CardTitle>
              <CardDescription>Define internal subscriber pools used as source pool references.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Pool Name</Label>
                  <Input
                    value={internalPoolDraft.name}
                    onChange={(event) =>
                      setInternalPoolDraft((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="int1"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ranges (comma-separated)</Label>
                  <Input
                    value={internalPoolDraft.ranges}
                    onChange={(event) =>
                      setInternalPoolDraft((previous) => ({ ...previous, ranges: event.target.value }))
                    }
                    placeholder="100.64.0.0/28"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
              </div>
              <Button variant="outline" onClick={addInternalPool} disabled={!canEdit || saving || !config.enabled}>
                <Plus className="mr-2 h-4 w-4" />
                Add Internal Pool
              </Button>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Ranges</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.internal_pools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        No internal pools configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    config.internal_pools.map((pool) => (
                      <TableRow key={pool.name}>
                        <TableCell>{pool.name}</TableCell>
                        <TableCell>{pool.ranges.join(", ") || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeInternalPool(pool.name)}
                            disabled={!canEdit || saving || !config.enabled}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>CGNAT Rules</CardTitle>
            <CardDescription>Map internal source pools to external translation pools.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Rule ID</Label>
                <Input
                  value={ruleDraft.ruleId}
                  onChange={(event) => setRuleDraft((previous) => ({ ...previous, ruleId: event.target.value }))}
                  placeholder="10"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Source Pool (internal)</Label>
                <Input
                  value={ruleDraft.sourcePool}
                  onChange={(event) => setRuleDraft((previous) => ({ ...previous, sourcePool: event.target.value }))}
                  placeholder={internalPoolNames[0] || "int1"}
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Translation Pool (external)</Label>
                <Input
                  value={ruleDraft.translationPool}
                  onChange={(event) =>
                    setRuleDraft((previous) => ({ ...previous, translationPool: event.target.value }))
                  }
                  placeholder={externalPoolNames[0] || "ext1"}
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
            </div>
            <Button variant="outline" onClick={addRule} disabled={!canEdit || saving || !config.enabled}>
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Source Pool</TableHead>
                  <TableHead>Translation Pool</TableHead>
                  <TableHead className="w-[80px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.rules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No CGNAT rules configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  config.rules.map((rule) => (
                    <TableRow key={rule.rule_id}>
                      <TableCell>{rule.rule_id}</TableCell>
                      <TableCell>{rule.source_pool}</TableCell>
                      <TableCell>{rule.translation_pool}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRule(rule.rule_id)}
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
