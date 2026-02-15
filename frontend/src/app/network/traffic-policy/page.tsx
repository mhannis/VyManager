"use client";

import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { trafficPolicyApi } from "@/lib/api/traffic-policy";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";

type PolicyType = "drop-tail" | "network-emulator" | "random-detect" | "shaper";

type PolicyEntry = {
  type: PolicyType;
  name: string;
  bandwidth: string;
  delay: string;
  description: string;
};

const POLICY_TYPES: PolicyType[] = ["drop-tail", "network-emulator", "random-detect", "shaper"];

const EMPTY_POLICY_DRAFT: PolicyEntry = {
  type: "shaper",
  name: "",
  bandwidth: "",
  delay: "",
  description: "",
};

function normalizeText(value: string): string {
  return value.trim();
}

function policyKey(entry: PolicyEntry): string {
  return `${entry.type}\u001f${entry.name}`;
}

function policyEqual(left: PolicyEntry, right: PolicyEntry): boolean {
  return (
    left.type === right.type &&
    left.name === right.name &&
    left.bandwidth === right.bandwidth &&
    left.delay === right.delay &&
    left.description === right.description
  );
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export default function TrafficPolicyPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.NETWORK);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [currentPolicies, setCurrentPolicies] = useState<PolicyEntry[]>([]);
  const [policyDraft, setPolicyDraft] = useState<PolicyEntry>(EMPTY_POLICY_DRAFT);

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const config = await trafficPolicyApi.getConfig<Record<string, unknown>>(refresh);
      const parsed: PolicyEntry[] = [];

      for (const policyType of POLICY_TYPES) {
        const typeRoot = asObject(config[policyType]);
        for (const [name, value] of Object.entries(typeRoot)) {
          const root = asObject(value);
          parsed.push({
            type: policyType,
            name: normalizeText(name),
            bandwidth: normalizeText(String(root.bandwidth ?? "")),
            delay: normalizeText(String(root.delay ?? "")),
            description: normalizeText(String(root.description ?? "")),
          });
        }
      }

      parsed.sort((left, right) => {
        const typeCompare = left.type.localeCompare(right.type);
        if (typeCompare !== 0) return typeCompare;
        return left.name.localeCompare(right.name, undefined, { numeric: true });
      });

      setPolicies(parsed);
      setCurrentPolicies(parsed);
      setPolicyDraft(EMPTY_POLICY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load traffic-policy configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const addPolicy = () => {
    setError(null);

    const entry: PolicyEntry = {
      type: policyDraft.type,
      name: normalizeText(policyDraft.name),
      bandwidth: normalizeText(policyDraft.bandwidth),
      delay: normalizeText(policyDraft.delay),
      description: normalizeText(policyDraft.description),
    };

    if (!entry.name) {
      setError("Policy name is required.");
      return;
    }

    if (policies.some((item) => item.type === entry.type && item.name === entry.name)) {
      setError("Policy type/name combination already exists.");
      return;
    }

    setPolicies((previous) =>
      [...previous, entry].sort((left, right) => {
        const typeCompare = left.type.localeCompare(right.type);
        if (typeCompare !== 0) return typeCompare;
        return left.name.localeCompare(right.name, undefined, { numeric: true });
      })
    );

    setPolicyDraft({ ...EMPTY_POLICY_DRAFT, type: entry.type });
  };

  const removePolicy = (entry: PolicyEntry) => {
    const key = policyKey(entry);
    setPolicies((previous) => previous.filter((item) => policyKey(item) !== key));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const currentMap = new Map(currentPolicies.map((entry) => [policyKey(entry), entry]));
      const desiredMap = new Map(policies.map((entry) => [policyKey(entry), entry]));

      for (const [key, current] of currentMap.entries()) {
        if (!desiredMap.has(key)) {
          operations.push(`delete traffic-policy ${current.type} ${current.name}`);
        }
      }

      for (const [key, desired] of desiredMap.entries()) {
        const current = currentMap.get(key);
        if (current && policyEqual(current, desired)) {
          continue;
        }

        const basePath = `traffic-policy ${desired.type} ${desired.name}`;
        operations.push(`set ${basePath}`);

        if (desired.bandwidth) {
          operations.push(`set ${basePath} bandwidth ${desired.bandwidth}`);
        } else if (current?.bandwidth) {
          operations.push(`delete ${basePath} bandwidth`);
        }

        if (desired.delay) {
          operations.push(`set ${basePath} delay ${desired.delay}`);
        } else if (current?.delay) {
          operations.push(`delete ${basePath} delay`);
        }

        if (desired.description) {
          operations.push(`set ${basePath} description ${JSON.stringify(desired.description)}`);
        } else if (current?.description) {
          operations.push(`delete ${basePath} description`);
        }
      }

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await trafficPolicyApi.configure(operations);
      if (!result.success) {
        throw new Error(result.error || "Failed to save traffic-policy configuration");
      }

      setMessage("Traffic-policy configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save traffic-policy configuration");
    } finally {
      setSaving(false);
    }
  };

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
            <h1 className="text-2xl font-bold text-foreground">Traffic Policy</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure queueing and shaping policies with structured editors for core policy types.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Configuration"}
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
            <CardTitle>Policies</CardTitle>
            <CardDescription>
              Supported policy types: shaper, drop-tail, random-detect, and network-emulator.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={policyDraft.type}
                  onValueChange={(value) =>
                    setPolicyDraft((previous) => ({ ...previous, type: value as PolicyType }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={policyDraft.name}
                  onChange={(event) => setPolicyDraft((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="WAN-SHAPER"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Bandwidth</Label>
                <Input
                  value={policyDraft.bandwidth}
                  onChange={(event) =>
                    setPolicyDraft((previous) => ({ ...previous, bandwidth: event.target.value }))
                  }
                  placeholder="100mbit"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Delay</Label>
                <Input
                  value={policyDraft.delay}
                  onChange={(event) => setPolicyDraft((previous) => ({ ...previous, delay: event.target.value }))}
                  placeholder="40ms"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={policyDraft.description}
                  onChange={(event) =>
                    setPolicyDraft((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="WAN egress policy"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <Button type="button" variant="outline" onClick={addPolicy} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Add Policy
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Bandwidth</TableHead>
                  <TableHead>Delay</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No traffic policies configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  policies.map((entry) => (
                    <TableRow key={policyKey(entry)}>
                      <TableCell>
                        <Badge variant="secondary">{entry.type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell>{entry.bandwidth || "-"}</TableCell>
                      <TableCell>{entry.delay || "-"}</TableCell>
                      <TableCell>{entry.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removePolicy(entry)}
                          disabled={!canEdit}
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
