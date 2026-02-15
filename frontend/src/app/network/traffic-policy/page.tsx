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
import { qosApi } from "@/lib/api/qos";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";

type TrafficPolicyType = "drop-tail" | "network-emulator" | "random-detect" | "shaper";

type TrafficPolicyEntry = {
  type: TrafficPolicyType;
  name: string;
  bandwidth: string;
  delay: string;
  description: string;
  queueLimit: string;
  reordering: string;
};

type QosPolicyType =
  | "cake"
  | "drop-tail"
  | "fair-queue"
  | "fq-codel"
  | "limiter"
  | "network-emulator"
  | "priority-queue"
  | "random-detect"
  | "rate-control"
  | "round-robin"
  | "shaper";

type QosPolicyEntry = {
  type: QosPolicyType;
  name: string;
  description: string;
  bandwidth: string;
  burst: string;
  delay: string;
  latency: string;
  queueLimit: string;
  hashInterval: string;
  target: string;
  interval: string;
  flows: string;
  codelQuantum: string;
  rtt: string;
};

const TRAFFIC_POLICY_TYPES: TrafficPolicyType[] = [
  "drop-tail",
  "network-emulator",
  "random-detect",
  "shaper",
];

const QOS_POLICY_TYPES: QosPolicyType[] = [
  "cake",
  "drop-tail",
  "fair-queue",
  "fq-codel",
  "limiter",
  "network-emulator",
  "priority-queue",
  "random-detect",
  "rate-control",
  "round-robin",
  "shaper",
];

const EMPTY_TRAFFIC_POLICY_DRAFT: TrafficPolicyEntry = {
  type: "shaper",
  name: "",
  bandwidth: "",
  delay: "",
  description: "",
  queueLimit: "",
  reordering: "",
};

const EMPTY_QOS_POLICY_DRAFT: QosPolicyEntry = {
  type: "shaper",
  name: "",
  description: "",
  bandwidth: "",
  burst: "",
  delay: "",
  latency: "",
  queueLimit: "",
  hashInterval: "",
  target: "",
  interval: "",
  flows: "",
  codelQuantum: "",
  rtt: "",
};

function normalizeText(value: string): string {
  return value.trim();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function trafficPolicyKey(entry: TrafficPolicyEntry): string {
  return `${entry.type}\u001f${entry.name}`;
}

function qosPolicyKey(entry: QosPolicyEntry): string {
  return `${entry.type}\u001f${entry.name}`;
}

function trafficPolicyEqual(left: TrafficPolicyEntry, right: TrafficPolicyEntry): boolean {
  return (
    left.type === right.type &&
    left.name === right.name &&
    left.bandwidth === right.bandwidth &&
    left.delay === right.delay &&
    left.description === right.description &&
    left.queueLimit === right.queueLimit &&
    left.reordering === right.reordering
  );
}

function qosPolicyEqual(left: QosPolicyEntry, right: QosPolicyEntry): boolean {
  return (
    left.type === right.type &&
    left.name === right.name &&
    left.description === right.description &&
    left.bandwidth === right.bandwidth &&
    left.burst === right.burst &&
    left.delay === right.delay &&
    left.latency === right.latency &&
    left.queueLimit === right.queueLimit &&
    left.hashInterval === right.hashInterval &&
    left.target === right.target &&
    left.interval === right.interval &&
    left.flows === right.flows &&
    left.codelQuantum === right.codelQuantum &&
    left.rtt === right.rtt
  );
}

function sortByTypeAndName<T extends { type: string; name: string }>(entries: T[]): T[] {
  return [...entries].sort((left, right) => {
    const typeCompare = left.type.localeCompare(right.type);
    if (typeCompare !== 0) return typeCompare;
    return left.name.localeCompare(right.name, undefined, { numeric: true });
  });
}

export default function TrafficPolicyPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.NETWORK);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [trafficPolicies, setTrafficPolicies] = useState<TrafficPolicyEntry[]>([]);
  const [currentTrafficPolicies, setCurrentTrafficPolicies] = useState<TrafficPolicyEntry[]>([]);
  const [trafficPolicyDraft, setTrafficPolicyDraft] =
    useState<TrafficPolicyEntry>(EMPTY_TRAFFIC_POLICY_DRAFT);

  const [qosPolicies, setQosPolicies] = useState<QosPolicyEntry[]>([]);
  const [currentQosPolicies, setCurrentQosPolicies] = useState<QosPolicyEntry[]>([]);
  const [qosPolicyDraft, setQosPolicyDraft] = useState<QosPolicyEntry>(EMPTY_QOS_POLICY_DRAFT);

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const [trafficConfig, qosConfig] = await Promise.all([
        trafficPolicyApi.getConfig<Record<string, unknown>>(refresh),
        qosApi.getConfig<Record<string, unknown>>(refresh).catch(() => ({})),
      ]);

      const parsedTraffic: TrafficPolicyEntry[] = [];
      for (const policyType of TRAFFIC_POLICY_TYPES) {
        const typeRoot = asObject(trafficConfig[policyType]);
        for (const [name, value] of Object.entries(typeRoot)) {
          const root = asObject(value);
          parsedTraffic.push({
            type: policyType,
            name: normalizeText(name),
            bandwidth: normalizeText(asText(root.bandwidth)),
            delay: normalizeText(asText(root.delay)),
            description: normalizeText(asText(root.description)),
            queueLimit: normalizeText(asText(root["queue-limit"])),
            reordering: normalizeText(asText(root.reordering)),
          });
        }
      }

      const policyRoot = asObject(asObject(qosConfig).policy);
      const parsedQos: QosPolicyEntry[] = [];
      for (const policyType of QOS_POLICY_TYPES) {
        const typeRoot = asObject(policyRoot[policyType]);
        for (const [name, value] of Object.entries(typeRoot)) {
          const root = asObject(value);
          parsedQos.push({
            type: policyType,
            name: normalizeText(name),
            description: normalizeText(asText(root.description)),
            bandwidth: normalizeText(asText(root.bandwidth)),
            burst: normalizeText(asText(root.burst)),
            delay: normalizeText(asText(root.delay)),
            latency: normalizeText(asText(root.latency)),
            queueLimit: normalizeText(asText(root["queue-limit"])),
            hashInterval: normalizeText(asText(root["hash-interval"])),
            target: normalizeText(asText(root.target)),
            interval: normalizeText(asText(root.interval)),
            flows: normalizeText(asText(root.flows)),
            codelQuantum: normalizeText(asText(root["codel-quantum"])),
            rtt: normalizeText(asText(root.rtt)),
          });
        }
      }

      const sortedTraffic = sortByTypeAndName(parsedTraffic);
      const sortedQos = sortByTypeAndName(parsedQos);

      setTrafficPolicies(sortedTraffic);
      setCurrentTrafficPolicies(sortedTraffic);
      setTrafficPolicyDraft(EMPTY_TRAFFIC_POLICY_DRAFT);

      setQosPolicies(sortedQos);
      setCurrentQosPolicies(sortedQos);
      setQosPolicyDraft(EMPTY_QOS_POLICY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load traffic-policy configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const addTrafficPolicy = () => {
    setError(null);

    const entry: TrafficPolicyEntry = {
      type: trafficPolicyDraft.type,
      name: normalizeText(trafficPolicyDraft.name),
      bandwidth: normalizeText(trafficPolicyDraft.bandwidth),
      delay: normalizeText(trafficPolicyDraft.delay),
      description: normalizeText(trafficPolicyDraft.description),
      queueLimit: normalizeText(trafficPolicyDraft.queueLimit),
      reordering: normalizeText(trafficPolicyDraft.reordering),
    };

    if (!entry.name) {
      setError("Traffic-policy name is required.");
      return;
    }

    if (trafficPolicies.some((item) => item.type === entry.type && item.name === entry.name)) {
      setError("Traffic-policy type/name combination already exists.");
      return;
    }

    setTrafficPolicies((previous) => sortByTypeAndName([...previous, entry]));
    setTrafficPolicyDraft({ ...EMPTY_TRAFFIC_POLICY_DRAFT, type: entry.type });
  };

  const removeTrafficPolicy = (entry: TrafficPolicyEntry) => {
    const key = trafficPolicyKey(entry);
    setTrafficPolicies((previous) => previous.filter((item) => trafficPolicyKey(item) !== key));
  };

  const addQosPolicy = () => {
    setError(null);

    const entry: QosPolicyEntry = {
      type: qosPolicyDraft.type,
      name: normalizeText(qosPolicyDraft.name),
      description: normalizeText(qosPolicyDraft.description),
      bandwidth: normalizeText(qosPolicyDraft.bandwidth),
      burst: normalizeText(qosPolicyDraft.burst),
      delay: normalizeText(qosPolicyDraft.delay),
      latency: normalizeText(qosPolicyDraft.latency),
      queueLimit: normalizeText(qosPolicyDraft.queueLimit),
      hashInterval: normalizeText(qosPolicyDraft.hashInterval),
      target: normalizeText(qosPolicyDraft.target),
      interval: normalizeText(qosPolicyDraft.interval),
      flows: normalizeText(qosPolicyDraft.flows),
      codelQuantum: normalizeText(qosPolicyDraft.codelQuantum),
      rtt: normalizeText(qosPolicyDraft.rtt),
    };

    if (!entry.name) {
      setError("QoS policy name is required.");
      return;
    }

    if (qosPolicies.some((item) => item.type === entry.type && item.name === entry.name)) {
      setError("QoS policy type/name combination already exists.");
      return;
    }

    setQosPolicies((previous) => sortByTypeAndName([...previous, entry]));
    setQosPolicyDraft({ ...EMPTY_QOS_POLICY_DRAFT, type: entry.type });
  };

  const removeQosPolicy = (entry: QosPolicyEntry) => {
    const key = qosPolicyKey(entry);
    setQosPolicies((previous) => previous.filter((item) => qosPolicyKey(item) !== key));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const trafficOperations: string[] = [];
      const currentTrafficMap = new Map(currentTrafficPolicies.map((entry) => [trafficPolicyKey(entry), entry]));
      const desiredTrafficMap = new Map(trafficPolicies.map((entry) => [trafficPolicyKey(entry), entry]));

      for (const [key, current] of currentTrafficMap.entries()) {
        if (!desiredTrafficMap.has(key)) {
          trafficOperations.push(`delete traffic-policy ${current.type} ${current.name}`);
        }
      }

      const trafficFields: Array<{ key: keyof TrafficPolicyEntry; cliKey: string; quoted?: boolean }> = [
        { key: "bandwidth", cliKey: "bandwidth" },
        { key: "delay", cliKey: "delay" },
        { key: "description", cliKey: "description", quoted: true },
        { key: "queueLimit", cliKey: "queue-limit" },
        { key: "reordering", cliKey: "reordering" },
      ];

      for (const [key, desired] of desiredTrafficMap.entries()) {
        const current = currentTrafficMap.get(key);
        if (current && trafficPolicyEqual(current, desired)) {
          continue;
        }

        const basePath = `traffic-policy ${desired.type} ${desired.name}`;
        trafficOperations.push(`set ${basePath}`);

        for (const field of trafficFields) {
          const desiredValue = normalizeText(String(desired[field.key] ?? ""));
          const currentValue = normalizeText(String(current?.[field.key] ?? ""));

          if (desiredValue) {
            const value = field.quoted ? JSON.stringify(desiredValue) : desiredValue;
            trafficOperations.push(`set ${basePath} ${field.cliKey} ${value}`);
          } else if (currentValue) {
            trafficOperations.push(`delete ${basePath} ${field.cliKey}`);
          }
        }
      }

      const qosOperations: string[] = [];
      const currentQosMap = new Map(currentQosPolicies.map((entry) => [qosPolicyKey(entry), entry]));
      const desiredQosMap = new Map(qosPolicies.map((entry) => [qosPolicyKey(entry), entry]));

      for (const [key, current] of currentQosMap.entries()) {
        if (!desiredQosMap.has(key)) {
          qosOperations.push(`delete qos policy ${current.type} ${current.name}`);
        }
      }

      const qosFields: Array<{ key: keyof QosPolicyEntry; cliKey: string; quoted?: boolean }> = [
        { key: "description", cliKey: "description", quoted: true },
        { key: "bandwidth", cliKey: "bandwidth" },
        { key: "burst", cliKey: "burst" },
        { key: "delay", cliKey: "delay" },
        { key: "latency", cliKey: "latency" },
        { key: "queueLimit", cliKey: "queue-limit" },
        { key: "hashInterval", cliKey: "hash-interval" },
        { key: "target", cliKey: "target" },
        { key: "interval", cliKey: "interval" },
        { key: "flows", cliKey: "flows" },
        { key: "codelQuantum", cliKey: "codel-quantum" },
        { key: "rtt", cliKey: "rtt" },
      ];

      for (const [key, desired] of desiredQosMap.entries()) {
        const current = currentQosMap.get(key);
        if (current && qosPolicyEqual(current, desired)) {
          continue;
        }

        const basePath = `qos policy ${desired.type} ${desired.name}`;
        qosOperations.push(`set ${basePath}`);

        for (const field of qosFields) {
          const desiredValue = normalizeText(String(desired[field.key] ?? ""));
          const currentValue = normalizeText(String(current?.[field.key] ?? ""));

          if (desiredValue) {
            const value = field.quoted ? JSON.stringify(desiredValue) : desiredValue;
            qosOperations.push(`set ${basePath} ${field.cliKey} ${value}`);
          } else if (currentValue) {
            qosOperations.push(`delete ${basePath} ${field.cliKey}`);
          }
        }
      }

      if (trafficOperations.length === 0 && qosOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      if (trafficOperations.length > 0) {
        const trafficResult = await trafficPolicyApi.configure(trafficOperations);
        if (!trafficResult.success) {
          throw new Error(trafficResult.error || "Failed to save traffic-policy configuration");
        }
      }

      if (qosOperations.length > 0) {
        const qosResult = await qosApi.configure(qosOperations);
        if (!qosResult.success) {
          throw new Error(qosResult.error || "Failed to save QoS configuration");
        }
      }

      setMessage("Traffic policy and QoS configuration saved successfully.");
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
              Configure both `traffic-policy` and guide-based `qos policy` trees with structured form editors.
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
            <CardTitle>Traffic-Policy Tree</CardTitle>
            <CardDescription>
              Manage `traffic-policy` objects. Includes queue-limit and reordering options for network-emulator.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-7">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={trafficPolicyDraft.type}
                  onValueChange={(value) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, type: value as TrafficPolicyType }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAFFIC_POLICY_TYPES.map((type) => (
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
                  value={trafficPolicyDraft.name}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, name: event.target.value }))
                  }
                  placeholder="WAN-SHAPER"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Bandwidth</Label>
                <Input
                  value={trafficPolicyDraft.bandwidth}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, bandwidth: event.target.value }))
                  }
                  placeholder="100mbit"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Delay</Label>
                <Input
                  value={trafficPolicyDraft.delay}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, delay: event.target.value }))
                  }
                  placeholder="40ms"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Queue Limit</Label>
                <Input
                  value={trafficPolicyDraft.queueLimit}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, queueLimit: event.target.value }))
                  }
                  placeholder="1000"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Reordering %</Label>
                <Input
                  value={trafficPolicyDraft.reordering}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, reordering: event.target.value }))
                  }
                  placeholder="5"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={trafficPolicyDraft.description}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="WAN policy"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <Button type="button" variant="outline" onClick={addTrafficPolicy} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Add Traffic-Policy Entry
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Bandwidth</TableHead>
                  <TableHead>Delay</TableHead>
                  <TableHead>Queue Limit</TableHead>
                  <TableHead>Reordering</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trafficPolicies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      No traffic-policy entries configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  trafficPolicies.map((entry) => (
                    <TableRow key={trafficPolicyKey(entry)}>
                      <TableCell>
                        <Badge variant="secondary">{entry.type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell>{entry.bandwidth || "-"}</TableCell>
                      <TableCell>{entry.delay || "-"}</TableCell>
                      <TableCell>{entry.queueLimit || "-"}</TableCell>
                      <TableCell>{entry.reordering || "-"}</TableCell>
                      <TableCell>{entry.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTrafficPolicy(entry)}
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

        <Card>
          <CardHeader>
            <CardTitle>QoS Policy Tree</CardTitle>
            <CardDescription>
              Guide-aligned QoS policies (`set qos policy ...`). Interface assignment remains under interface configuration pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={qosPolicyDraft.type}
                  onValueChange={(value) =>
                    setQosPolicyDraft((previous) => ({ ...previous, type: value as QosPolicyType }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QOS_POLICY_TYPES.map((type) => (
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
                  value={qosPolicyDraft.name}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, name: event.target.value }))
                  }
                  placeholder="WAN-QOS"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={qosPolicyDraft.description}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="Primary QoS policy"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Bandwidth</Label>
                <Input
                  value={qosPolicyDraft.bandwidth}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, bandwidth: event.target.value }))
                  }
                  placeholder="1gbit"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Burst</Label>
                <Input
                  value={qosPolicyDraft.burst}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, burst: event.target.value }))
                  }
                  placeholder="15k"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-6">
              <div className="space-y-2">
                <Label>Delay</Label>
                <Input
                  value={qosPolicyDraft.delay}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, delay: event.target.value }))
                  }
                  placeholder="40ms"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Latency</Label>
                <Input
                  value={qosPolicyDraft.latency}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, latency: event.target.value }))
                  }
                  placeholder="50ms"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Queue Limit</Label>
                <Input
                  value={qosPolicyDraft.queueLimit}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, queueLimit: event.target.value }))
                  }
                  placeholder="1000"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Hash Interval</Label>
                <Input
                  value={qosPolicyDraft.hashInterval}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, hashInterval: event.target.value }))
                  }
                  placeholder="10"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Target</Label>
                <Input
                  value={qosPolicyDraft.target}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, target: event.target.value }))
                  }
                  placeholder="5ms"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Interval</Label>
                <Input
                  value={qosPolicyDraft.interval}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, interval: event.target.value }))
                  }
                  placeholder="100ms"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Flows</Label>
                <Input
                  value={qosPolicyDraft.flows}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, flows: event.target.value }))
                  }
                  placeholder="1024"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Codel Quantum</Label>
                <Input
                  value={qosPolicyDraft.codelQuantum}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, codelQuantum: event.target.value }))
                  }
                  placeholder="300"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>RTT</Label>
                <Input
                  value={qosPolicyDraft.rtt}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, rtt: event.target.value }))
                  }
                  placeholder="100ms"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <Button type="button" variant="outline" onClick={addQosPolicy} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Add QoS Policy
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Bandwidth</TableHead>
                  <TableHead>Delay</TableHead>
                  <TableHead>Queue Limit</TableHead>
                  <TableHead>RTT</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qosPolicies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      No QoS policies configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  qosPolicies.map((entry) => (
                    <TableRow key={qosPolicyKey(entry)}>
                      <TableCell>
                        <Badge variant="secondary">{entry.type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell>{entry.bandwidth || "-"}</TableCell>
                      <TableCell>{entry.delay || "-"}</TableCell>
                      <TableCell>{entry.queueLimit || "-"}</TableCell>
                      <TableCell>{entry.rtt || "-"}</TableCell>
                      <TableCell>{entry.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeQosPolicy(entry)}
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
