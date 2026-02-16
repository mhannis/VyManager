"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { segmentRoutingService } from "@/lib/api/segment-routing";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { routingProtocolGuides } from "@/lib/help/routingProtocolGuides";

type SegmentRoutingProtocol = "ospf" | "isis";

type PrefixSidEntry = {
  prefix: string;
  value: string;
  noPhpFlag: boolean;
  explicitNull: boolean;
  nFlagClear: boolean;
};

type ProtocolSettings = {
  globalBlockLow: string;
  globalBlockHigh: string;
  localBlockLow: string;
  localBlockHigh: string;
  maximumLabelDepth: string;
  prefixes: PrefixSidEntry[];
};

type SegmentRoutingState = {
  ospfOpaqueLsa: boolean;
  ospf: ProtocolSettings;
  isis: ProtocolSettings;
};

type PrefixDraftState = Record<SegmentRoutingProtocol, PrefixSidEntry>;

const EMPTY_PROTOCOL_SETTINGS: ProtocolSettings = {
  globalBlockLow: "",
  globalBlockHigh: "",
  localBlockLow: "",
  localBlockHigh: "",
  maximumLabelDepth: "",
  prefixes: [],
};

const EMPTY_PREFIX_DRAFT: PrefixSidEntry = {
  prefix: "",
  value: "",
  noPhpFlag: false,
  explicitNull: false,
  nFlagClear: false,
};

const EMPTY_STATE: SegmentRoutingState = {
  ospfOpaqueLsa: false,
  ospf: EMPTY_PROTOCOL_SETTINGS,
  isis: EMPTY_PROTOCOL_SETTINGS,
};

const FLAG_DEFINITIONS = [
  { key: "noPhpFlag" as const, label: "No PHP", commandToken: "no-php-flag" },
  { key: "explicitNull" as const, label: "Explicit Null", commandToken: "explicit-null" },
  { key: "nFlagClear" as const, label: "N-Flag Clear", commandToken: "n-flag-clear" },
];

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

function hasKey(value: unknown, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(asObject(value), key);
}

function normalizePrefixEntry(value: PrefixSidEntry): PrefixSidEntry {
  return {
    prefix: value.prefix.trim(),
    value: value.value.trim(),
    noPhpFlag: Boolean(value.noPhpFlag),
    explicitNull: Boolean(value.explicitNull),
    nFlagClear: Boolean(value.nFlagClear),
  };
}

function prefixEqual(left: PrefixSidEntry, right: PrefixSidEntry): boolean {
  return (
    left.prefix === right.prefix &&
    left.value === right.value &&
    left.noPhpFlag === right.noPhpFlag &&
    left.explicitNull === right.explicitNull &&
    left.nFlagClear === right.nFlagClear
  );
}

function settingsEqual(left: ProtocolSettings, right: ProtocolSettings): boolean {
  if (
    left.globalBlockLow !== right.globalBlockLow ||
    left.globalBlockHigh !== right.globalBlockHigh ||
    left.localBlockLow !== right.localBlockLow ||
    left.localBlockHigh !== right.localBlockHigh ||
    left.maximumLabelDepth !== right.maximumLabelDepth ||
    left.prefixes.length !== right.prefixes.length
  ) {
    return false;
  }

  for (let index = 0; index < left.prefixes.length; index += 1) {
    if (!prefixEqual(left.prefixes[index], right.prefixes[index])) {
      return false;
    }
  }

  return true;
}

function parsePrefixEntries(root: Record<string, unknown>): PrefixSidEntry[] {
  const prefixRoot = asObject(root.prefix);
  const rows: PrefixSidEntry[] = [];

  for (const [prefix, rawPrefixConfig] of Object.entries(prefixRoot)) {
    const prefixConfig = asObject(rawPrefixConfig);
    const indexRoot = asObject(prefixConfig.index);
    rows.push({
      prefix,
      value: asString(indexRoot.value),
      noPhpFlag: hasKey(indexRoot, "no-php-flag"),
      explicitNull: hasKey(indexRoot, "explicit-null"),
      nFlagClear: hasKey(indexRoot, "n-flag-clear"),
    });
  }

  return rows.sort((left, right) => left.prefix.localeCompare(right.prefix, undefined, { numeric: true }));
}

function parseProtocolSettings(rawRoot: unknown): ProtocolSettings {
  const root = asObject(rawRoot);
  const globalBlock = asObject(root["global-block"] ?? root.global_block);
  const localBlock = asObject(root["local-block"] ?? root.local_block);

  return {
    globalBlockLow: asString(globalBlock["low-label-value"] ?? globalBlock.low_label_value),
    globalBlockHigh: asString(globalBlock["high-label-value"] ?? globalBlock.high_label_value),
    localBlockLow: asString(localBlock["low-label-value"] ?? localBlock.low_label_value),
    localBlockHigh: asString(localBlock["high-label-value"] ?? localBlock.high_label_value),
    maximumLabelDepth: asString(root["maximum-label-depth"] ?? root.maximum_label_depth),
    prefixes: parsePrefixEntries(root),
  };
}

function parseConfig(rawRoot: unknown): SegmentRoutingState {
  const root = asObject(rawRoot);
  const ospfRoot = asObject(root.ospf);
  const ospfParameters = asObject(ospfRoot.parameters);

  return {
    ospfOpaqueLsa: hasKey(ospfParameters, "opaque-lsa"),
    ospf: parseProtocolSettings(ospfRoot["segment-routing"] ?? ospfRoot.segment_routing),
    isis: parseProtocolSettings(asObject(root.isis)["segment-routing"]),
  };
}

function protocolPrefix(protocol: SegmentRoutingProtocol): string {
  return `protocols ${protocol} segment-routing`;
}

function prefixSetDeleteOperations(
  protocol: SegmentRoutingProtocol,
  currentPrefix: PrefixSidEntry | undefined,
  desiredPrefix: PrefixSidEntry
): string[] {
  const operations: string[] = [];
  const prefixRoot = `${protocolPrefix(protocol)} prefix ${desiredPrefix.prefix} index`;

  if (desiredPrefix.value) {
    if (!currentPrefix || currentPrefix.value !== desiredPrefix.value) {
      operations.push(`set ${prefixRoot} value ${desiredPrefix.value}`);
    }
  } else if (currentPrefix?.value) {
    operations.push(`delete ${prefixRoot} value`);
  }

  for (const flag of FLAG_DEFINITIONS) {
    const currentFlag = currentPrefix ? currentPrefix[flag.key] : false;
    const desiredFlag = desiredPrefix[flag.key];

    if (desiredFlag && !currentFlag) {
      operations.push(`set ${prefixRoot} ${flag.commandToken}`);
    } else if (!desiredFlag && currentFlag) {
      operations.push(`delete ${prefixRoot} ${flag.commandToken}`);
    }
  }

  return operations;
}

function buildProtocolOperations(
  protocol: SegmentRoutingProtocol,
  currentState: ProtocolSettings,
  desiredState: ProtocolSettings
): string[] {
  const operations: string[] = [];
  const root = protocolPrefix(protocol);
  const managedFields: Array<{ key: keyof ProtocolSettings; command: string }> = [
    { key: "globalBlockLow", command: "global-block low-label-value" },
    { key: "globalBlockHigh", command: "global-block high-label-value" },
    { key: "localBlockLow", command: "local-block low-label-value" },
    { key: "localBlockHigh", command: "local-block high-label-value" },
    { key: "maximumLabelDepth", command: "maximum-label-depth" },
  ];

  for (const field of managedFields) {
    const currentValue = currentState[field.key];
    const desiredValue = desiredState[field.key];

    if (currentValue === desiredValue) {
      continue;
    }

    if (desiredValue) {
      operations.push(`set ${root} ${field.command} ${desiredValue}`);
    } else if (currentValue) {
      operations.push(`delete ${root} ${field.command}`);
    }
  }

  const currentPrefixMap = new Map(currentState.prefixes.map((entry) => [entry.prefix, entry]));
  const desiredPrefixMap = new Map(desiredState.prefixes.map((entry) => [entry.prefix, entry]));

  for (const [prefix] of currentPrefixMap.entries()) {
    if (!desiredPrefixMap.has(prefix)) {
      operations.push(`delete ${root} prefix ${prefix}`);
    }
  }

  for (const [prefix, desiredPrefix] of desiredPrefixMap.entries()) {
    const currentPrefix = currentPrefixMap.get(prefix);
    if (currentPrefix && prefixEqual(currentPrefix, desiredPrefix)) {
      continue;
    }
    operations.push(...prefixSetDeleteOperations(protocol, currentPrefix, desiredPrefix));
  }

  return operations;
}

export function SegmentRoutingContent() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SEGMENT_ROUTING);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState<SegmentRoutingState>(EMPTY_STATE);
  const [state, setState] = useState<SegmentRoutingState>(EMPTY_STATE);
  const [prefixDrafts, setPrefixDrafts] = useState<PrefixDraftState>({
    ospf: EMPTY_PREFIX_DRAFT,
    isis: EMPTY_PREFIX_DRAFT,
  });

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const response = await segmentRoutingService.getConfig(refresh);
      const parsed = parseConfig(response.segment_routing);
      setCurrentState(parsed);
      setState(parsed);
      setPrefixDrafts({
        ospf: EMPTY_PREFIX_DRAFT,
        isis: EMPTY_PREFIX_DRAFT,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Segment Routing configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const updateProtocolState = (
    protocol: SegmentRoutingProtocol,
    updater: (current: ProtocolSettings) => ProtocolSettings
  ) => {
    setState((previous) => ({
      ...previous,
      [protocol]: updater(previous[protocol]),
    }));
  };

  const setProtocolField = (
    protocol: SegmentRoutingProtocol,
    field: keyof Omit<ProtocolSettings, "prefixes">,
    value: string
  ) => {
    updateProtocolState(protocol, (current) => ({
      ...current,
      [field]: value.trim(),
    }));
  };

  const addPrefix = (protocol: SegmentRoutingProtocol) => {
    setError(null);
    const normalized = normalizePrefixEntry(prefixDrafts[protocol]);

    if (!normalized.prefix) {
      setError(`${protocol.toUpperCase()} Prefix SID requires a prefix value.`);
      return;
    }

    if (!normalized.value && !normalized.noPhpFlag && !normalized.explicitNull && !normalized.nFlagClear) {
      setError("Set an index value or at least one prefix flag.");
      return;
    }

    const exists = state[protocol].prefixes.some((entry) => entry.prefix === normalized.prefix);
    if (exists) {
      setError(`${protocol.toUpperCase()} Prefix SID for ${normalized.prefix} already exists.`);
      return;
    }

    updateProtocolState(protocol, (current) => ({
      ...current,
      prefixes: [...current.prefixes, normalized].sort((left, right) =>
        left.prefix.localeCompare(right.prefix, undefined, { numeric: true })
      ),
    }));

    setPrefixDrafts((previous) => ({
      ...previous,
      [protocol]: EMPTY_PREFIX_DRAFT,
    }));
  };

  const removePrefix = (protocol: SegmentRoutingProtocol, prefix: string) => {
    updateProtocolState(protocol, (current) => ({
      ...current,
      prefixes: current.prefixes.filter((entry) => entry.prefix !== prefix),
    }));
  };

  const hasChanges = useMemo(() => {
    return (
      state.ospfOpaqueLsa !== currentState.ospfOpaqueLsa ||
      !settingsEqual(state.ospf, currentState.ospf) ||
      !settingsEqual(state.isis, currentState.isis)
    );
  }, [currentState, state]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];
      if (state.ospfOpaqueLsa !== currentState.ospfOpaqueLsa) {
        if (state.ospfOpaqueLsa) {
          operations.push("set protocols ospf parameters opaque-lsa");
        } else {
          operations.push("delete protocols ospf parameters opaque-lsa");
        }
      }

      operations.push(...buildProtocolOperations("ospf", currentState.ospf, state.ospf));
      operations.push(...buildProtocolOperations("isis", currentState.isis, state.isis));

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await segmentRoutingService.batchConfigure({ operations });
      if (!result.success) {
        throw new Error(result.error || "Failed to save Segment Routing configuration");
      }

      setMessage("Segment Routing configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Segment Routing configuration");
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

  const renderProtocolCard = (
    protocol: SegmentRoutingProtocol,
    title: string,
    description: string
  ) => {
    const protocolState = state[protocol];
    const draft = prefixDrafts[protocol];

    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label>Global Block Low</Label>
              <Input
                value={protocolState.globalBlockLow}
                onChange={(event) => setProtocolField(protocol, "globalBlockLow", event.target.value)}
                placeholder="1000"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Global Block High</Label>
              <Input
                value={protocolState.globalBlockHigh}
                onChange={(event) => setProtocolField(protocol, "globalBlockHigh", event.target.value)}
                placeholder="1100"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Local Block Low</Label>
              <Input
                value={protocolState.localBlockLow}
                onChange={(event) => setProtocolField(protocol, "localBlockLow", event.target.value)}
                placeholder="5000"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Local Block High</Label>
              <Input
                value={protocolState.localBlockHigh}
                onChange={(event) => setProtocolField(protocol, "localBlockHigh", event.target.value)}
                placeholder="5999"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Maximum Label Depth</Label>
              <Input
                value={protocolState.maximumLabelDepth}
                onChange={(event) => setProtocolField(protocol, "maximumLabelDepth", event.target.value)}
                placeholder="8"
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-md border border-border p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Prefix SID Entries</h3>
              <p className="text-xs text-muted-foreground">
                Add per-prefix Segment IDs and optional forwarding flags.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-5 xl:grid-cols-8">
              <div className="space-y-2 md:col-span-2 xl:col-span-3">
                <Label>Prefix</Label>
                <Input
                  value={draft.prefix}
                  onChange={(event) =>
                    setPrefixDrafts((previous) => ({
                      ...previous,
                      [protocol]: { ...previous[protocol], prefix: event.target.value },
                    }))
                  }
                  placeholder="10.1.1.1/32"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2 xl:col-span-1">
                <Label>Index Value</Label>
                <Input
                  value={draft.value}
                  onChange={(event) =>
                    setPrefixDrafts((previous) => ({
                      ...previous,
                      [protocol]: { ...previous[protocol], value: event.target.value },
                    }))
                  }
                  placeholder="100"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2 xl:col-span-3">
                <Label>Flags</Label>
                <div className="flex flex-wrap gap-4 rounded-md border border-border px-3 py-2">
                  {FLAG_DEFINITIONS.map((flag) => (
                    <label key={flag.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={draft[flag.key]}
                        onCheckedChange={(checked) =>
                          setPrefixDrafts((previous) => ({
                            ...previous,
                            [protocol]: { ...previous[protocol], [flag.key]: Boolean(checked) },
                          }))
                        }
                        disabled={!canEdit}
                      />
                      {flag.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-end xl:col-span-1">
                <Button type="button" variant="outline" onClick={() => addPrefix(protocol)} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Index</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {protocolState.prefixes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No Prefix SID entries configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  protocolState.prefixes.map((entry) => {
                    const flagLabels = FLAG_DEFINITIONS.filter((flag) => entry[flag.key]).map(
                      (flag) => flag.label
                    );
                    return (
                      <TableRow key={entry.prefix}>
                        <TableCell className="font-mono text-xs">{entry.prefix}</TableCell>
                        <TableCell>{entry.value || "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {flagLabels.length === 0 ? (
                              <span className="text-xs text-muted-foreground">None</span>
                            ) : (
                              flagLabels.map((label) => (
                                <Badge key={label} variant="secondary">
                                  {label}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removePrefix(protocol, entry.prefix)}
                            disabled={!canEdit}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Segment Routing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure OSPF and IS-IS Segment Routing label blocks and Prefix SID mappings.
          </p>
        </div>
        <div className="flex gap-2">
          <PageGuideDialog guide={routingProtocolGuides.segmentRouting} />
          <Button variant="outline" onClick={() => loadData(true)} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={handleSave} disabled={!canEdit || saving || !hasChanges}>
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
          <CardTitle>OSPF Segment Routing Prerequisite</CardTitle>
          <CardDescription>
            OSPF Segment Routing requires opaque LSA support under OSPF parameters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={state.ospfOpaqueLsa}
              onCheckedChange={(checked) => setState((previous) => ({ ...previous, ospfOpaqueLsa: Boolean(checked) }))}
              disabled={!canEdit}
            />
            Enable OSPF Opaque LSA
          </label>
        </CardContent>
      </Card>

      {renderProtocolCard(
        "ospf",
        "OSPF Segment Routing",
        "Manage OSPF SRGB/SRLB, maximum label depth, and Prefix SID definitions."
      )}

      {renderProtocolCard(
        "isis",
        "IS-IS Segment Routing",
        "Manage IS-IS SRGB/SRLB, maximum label depth, and Prefix SID definitions."
      )}
    </div>
  );
}

