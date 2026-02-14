"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { RefreshCw, Plus, Trash2 } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

type ProtocolBatchRequest = { operations: string[] };
type BatchResponse = { success?: boolean; error?: string | null };

export type ProtocolEditorService = {
  getConfig: (refresh?: boolean) => Promise<unknown>;
  batchConfigure: (request: ProtocolBatchRequest) => Promise<BatchResponse | unknown>;
};

type RowItem = Record<string, string>;

type FieldDefinition = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "number" | "select";
  options?: Array<{ value: string; label: string }>;
};

type ExtraFieldDefinition = {
  key: string;
  label: string;
  placeholder?: string;
  parse: (root: Record<string, unknown>) => string;
  setCommand: (value: string) => string;
  deleteCommand?: string;
};

type AdvancedFieldType = "boolean" | "text" | "number";

type AdvancedFieldDefinition = {
  key: string;
  label: string;
  type: AdvancedFieldType;
  placeholder?: string;
  description?: string;
  parse: (root: Record<string, unknown>) => string | boolean;
  setCommand: (value: string | boolean) => string;
  deleteCommand?: string;
};

interface ProtocolSimpleListEditorProps {
  title: string;
  description: string;
  service: ProtocolEditorService;
  rootKey: string;
  fields: FieldDefinition[];
  parseItems: (root: Record<string, unknown>) => RowItem[];
  setCommand: (item: RowItem) => string;
  deleteCommand: (item: RowItem) => string;
  emptyStateMessage?: string;
  extraField?: ExtraFieldDefinition;
  supportedSettings?: string[];
  coverageNote?: string;
  interfaceFieldKeys?: string[];
  advancedFields?: AdvancedFieldDefinition[];
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeItem(item: RowItem, fields: FieldDefinition[]): RowItem {
  const normalized: RowItem = {};
  for (const field of fields) {
    normalized[field.key] = normalizeValue(item[field.key]);
  }
  return normalized;
}

function encodeItem(item: RowItem, fields: FieldDefinition[]): string {
  return fields.map((field) => normalizeValue(item[field.key])).join("\u001f");
}

export function ProtocolSimpleListEditor({
  title,
  description,
  service,
  rootKey,
  fields,
  parseItems,
  setCommand,
  deleteCommand,
  emptyStateMessage = "No entries configured.",
  extraField,
  supportedSettings = [],
  coverageNote = "This page currently configures a focused subset of protocol settings.",
  interfaceFieldKeys = ["interface"],
  advancedFields = [],
}: ProtocolSimpleListEditorProps) {
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentItems, setCurrentItems] = useState<RowItem[]>([]);
  const [items, setItems] = useState<RowItem[]>([]);
  const [draftItem, setDraftItem] = useState<RowItem>({});
  const [interfaceOptionsByField, setInterfaceOptionsByField] = useState<
    Record<string, Array<{ value: string; label: string }>>
  >({});

  const [currentExtra, setCurrentExtra] = useState("");
  const [extraValue, setExtraValue] = useState("");
  const initialLoadKeyRef = useRef<string | null>(null);
  const [currentAdvancedValues, setCurrentAdvancedValues] = useState<Record<string, string | boolean>>({});
  const [advancedValues, setAdvancedValues] = useState<Record<string, string | boolean>>({});

  const createBlankDraft = useCallback((defaults?: RowItem): RowItem => {
    const blank: RowItem = {};
    for (const field of fields) {
      if (defaults && field.key in defaults) {
        blank[field.key] = defaults[field.key];
        continue;
      }
      if (field.type === "select" && field.options && field.options.length > 0) {
        blank[field.key] = field.options[0].value;
      } else {
        blank[field.key] = "";
      }
    }
    return blank;
  }, [fields]);

  const loadData = useCallback(
    async (refresh = false) => {
      try {
        if (!initialLoadComplete) {
          setLoading(true);
        }
        setError(null);
        const [configPayload, ethernetPayload, physicalPayload, allInterfacesPayload] = await Promise.all([
          service.getConfig(refresh),
          ethernetService.getConfig().catch(() => ({ interfaces: [] })),
          showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
          showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
        ]);

        const root = asObject(asObject(configPayload)[rootKey]);

        const parsedItems = parseItems(root).map((item) => normalizeItem(item, fields));
        setCurrentItems(parsedItems);
        setItems(parsedItems);

        const descriptionByName = ethernetPayload.interfaces.reduce<Record<string, string | null>>(
          (acc, iface) => {
            acc[iface.name] = iface.description ?? null;
            return acc;
          },
          {}
        );

        const interfaceNames = new Set<string>();
        ethernetPayload.interfaces.forEach((iface) => interfaceNames.add(iface.name));
        physicalPayload.interfaces.forEach((iface) => interfaceNames.add(iface.interface));
        allInterfacesPayload.interfaces.forEach((iface) => interfaceNames.add(iface.name));
        parsedItems.forEach((item) => {
          interfaceFieldKeys.forEach((fieldKey) => {
            const value = normalizeValue(item[fieldKey]);
            if (value) {
              interfaceNames.add(value);
            }
          });
        });

        const interfaceOptions = [...interfaceNames]
          .map((name) => ({
            value: name,
            label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
          }))
          .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

        const interfaceDefaults: RowItem = {};
        const optionsByField: Record<string, Array<{ value: string; label: string }>> = {};
        for (const field of fields) {
          if (!interfaceFieldKeys.includes(field.key)) {
            continue;
          }
          optionsByField[field.key] = interfaceOptions;
          if (interfaceOptions.length > 0) {
            interfaceDefaults[field.key] = interfaceOptions[0].value;
          }
        }
        setInterfaceOptionsByField(optionsByField);
        setDraftItem(createBlankDraft(interfaceDefaults));

        if (extraField) {
          const parsedExtra = normalizeValue(extraField.parse(root));
          setCurrentExtra(parsedExtra);
          setExtraValue(parsedExtra);
        }

        if (advancedFields.length > 0) {
          const parsedAdvanced: Record<string, string | boolean> = {};
          for (const field of advancedFields) {
            const parsed = field.parse(root);
            if (field.type === "boolean") {
              parsedAdvanced[field.key] = Boolean(parsed);
            } else {
              parsedAdvanced[field.key] = normalizeValue(parsed);
            }
          }
          setCurrentAdvancedValues(parsedAdvanced);
          setAdvancedValues(parsedAdvanced);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to load ${title} configuration`);
      } finally {
        setLoading(false);
        setInitialLoadComplete(true);
      }
    },
    [
      advancedFields,
      createBlankDraft,
      extraField,
      fields,
      initialLoadComplete,
      interfaceFieldKeys,
      parseItems,
      rootKey,
      service,
      title,
    ]
  );

  useEffect(() => {
    const loadKey = `${rootKey}:${title}`;
    if (initialLoadKeyRef.current === loadKey) {
      return;
    }
    initialLoadKeyRef.current = loadKey;
    loadData();
  }, [loadData, rootKey, title]);

  const normalizedDraft = useMemo(() => normalizeItem(draftItem, fields), [draftItem, fields]);

  const handleDraftChange = (key: string, value: string) => {
    setDraftItem((prev) => ({ ...prev, [key]: value }));
  };

  const handleAdvancedChange = (key: string, value: string | boolean) => {
    setAdvancedValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleAdd = () => {
    setError(null);
    const normalized = normalizeItem(normalizedDraft, fields);

    for (const field of fields) {
      const required = field.required !== false;
      if (required && !normalized[field.key]) {
        setError(`${field.label} is required.`);
        return;
      }
    }

    const encoded = encodeItem(normalized, fields);
    const exists = items.some((item) => encodeItem(item, fields) === encoded);
    if (exists) {
      setError("Entry already exists.");
      return;
    }

    setItems((prev) => [...prev, normalized]);
    setDraftItem(createBlankDraft());
  };

  const handleRemove = (index: number) => {
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const currentMap = new Map(currentItems.map((item) => [encodeItem(item, fields), item]));
      const desiredMap = new Map(items.map((item) => [encodeItem(item, fields), item]));

      const operations: string[] = [];

      for (const [key, item] of currentMap.entries()) {
        if (!desiredMap.has(key)) {
          operations.push(deleteCommand(item));
        }
      }

      for (const [key, item] of desiredMap.entries()) {
        if (!currentMap.has(key)) {
          operations.push(setCommand(item));
        }
      }

      if (extraField) {
        const current = normalizeValue(currentExtra);
        const desired = normalizeValue(extraValue);

        if (current !== desired) {
          if (!desired && extraField.deleteCommand) {
            operations.push(extraField.deleteCommand);
          } else if (desired) {
            operations.push(extraField.setCommand(desired));
          }
        }
      }

      for (const field of advancedFields) {
        const currentValue = currentAdvancedValues[field.key];
        const desiredValue = advancedValues[field.key];

        if (field.type === "boolean") {
          const currentBool = Boolean(currentValue);
          const desiredBool = Boolean(desiredValue);
          if (currentBool !== desiredBool) {
            if (desiredBool) {
              operations.push(field.setCommand(true));
            } else if (field.deleteCommand) {
              operations.push(field.deleteCommand);
            }
          }
          continue;
        }

        const currentText = normalizeValue(currentValue);
        const desiredText = normalizeValue(desiredValue);
        if (currentText === desiredText) {
          continue;
        }

        if (!desiredText) {
          if (field.deleteCommand) {
            operations.push(field.deleteCommand);
          }
          continue;
        }

        operations.push(field.setCommand(desiredText));
      }

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await service.batchConfigure({ operations });
      if (
        result &&
        typeof result === "object" &&
        "success" in result &&
        !(result as BatchResponse).success
      ) {
        throw new Error(
          (result as BatchResponse).error || `Failed to configure ${title}`
        );
      }

      setMessage("Configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to configure ${title}`);
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadData(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
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
          <CardTitle className="text-base">Current Coverage</CardTitle>
          <CardDescription>{coverageNote}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {supportedSettings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Supported Settings
              </p>
              <div className="flex flex-wrap gap-2">
                {supportedSettings.map((setting) => (
                  <Badge key={setting} variant="secondary">
                    {setting}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {extraField && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Global Setting</CardTitle>
            <CardDescription>Applies to the protocol instance.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            <label className="text-sm font-medium text-muted-foreground">{extraField.label}</label>
            <Input
              value={extraValue}
              placeholder={extraField.placeholder}
              onChange={(event) => setExtraValue(event.target.value)}
            />
          </CardContent>
        </Card>
      )}

      {advancedFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Advanced Settings</CardTitle>
            <CardDescription>Optional protocol-level controls beyond basic entry management.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {advancedFields.map((field) => {
              const value = advancedValues[field.key];
              return (
                <div key={field.key} className="space-y-2">
                  {field.type === "boolean" ? (
                    <div className="flex items-start gap-2 rounded-md border border-border/50 p-3">
                      <Checkbox
                        id={`${title}-${field.key}`}
                        checked={Boolean(value)}
                        onCheckedChange={(checked) => handleAdvancedChange(field.key, Boolean(checked))}
                      />
                      <div className="space-y-1">
                        <label htmlFor={`${title}-${field.key}`} className="text-sm font-medium leading-none">
                          {field.label}
                        </label>
                        {field.description && (
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">{field.label}</label>
                      <Input
                        type={field.type === "number" ? "number" : "text"}
                        value={normalizeValue(value)}
                        placeholder={field.placeholder}
                        onChange={(event) => handleAdvancedChange(field.key, event.target.value)}
                      />
                      {field.description && (
                        <p className="text-xs text-muted-foreground">{field.description}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configured Entries</CardTitle>
          <CardDescription>
            <Badge variant="secondary">{items.length} entries</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {fields.map((field) => (
                    <TableHead key={field.key}>{field.label}</TableHead>
                  ))}
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={`${encodeItem(item, fields)}-${index}`}>
                    {fields.map((field) => (
                      <TableCell key={field.key} className="font-mono text-xs">
                        {item[field.key] || "-"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(index)}
                        title="Remove entry"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Entry</CardTitle>
          <CardDescription>Create a new protocol entry with explicit fields.</CardDescription>
        </CardHeader>
        <CardContent>
          {fields.some((field) => interfaceFieldKeys.includes(field.key)) &&
            fields
              .filter((field) => interfaceFieldKeys.includes(field.key))
              .some((field) => (interfaceOptionsByField[field.key] || []).length === 0) && (
              <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
                No interfaces were discovered for selector fields. Ensure the instance has readable interface data.
              </div>
            )}
          <div className="grid gap-3 md:grid-cols-4">
            {fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="text-xs text-muted-foreground">{field.label}</label>
                {field.type === "select" && field.options ? (
                  <Select
                    value={normalizedDraft[field.key] || ""}
                    onValueChange={(value) => handleDraftChange(field.key, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : interfaceFieldKeys.includes(field.key) && (interfaceOptionsByField[field.key] || []).length > 0 ? (
                  <Select
                    value={normalizedDraft[field.key] || ""}
                    onValueChange={(value) => handleDraftChange(field.key, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {(interfaceOptionsByField[field.key] || []).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    value={normalizedDraft[field.key] || ""}
                    placeholder={field.placeholder}
                    onChange={(event) => handleDraftChange(field.key, event.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Entry
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function parseObjectKeys(value: unknown): string[] {
  const root = asObject(value);
  return Object.keys(root).sort((left, right) => left.localeCompare(right));
}

export function asRecord(value: unknown): Record<string, unknown> {
  return asObject(value);
}

export function asString(value: unknown): string {
  return normalizeValue(value);
}
