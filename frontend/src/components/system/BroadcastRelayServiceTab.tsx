"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Plus, RadioTower, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "./serviceTabHelpers";

interface BroadcastRelayRule {
  id: string;
  description: string;
  disabled: boolean;
  addresses: string[];
  ports: string[];
  interfaces: string[];
}

interface BroadcastRelayConfigState {
  enabled: boolean;
  globalDisable: boolean;
  rules: BroadcastRelayRule[];
}

const EMPTY_BROADCAST_RELAY_STATE: BroadcastRelayConfigState = {
  enabled: false,
  globalDisable: false,
  rules: [],
};

interface BroadcastRelayServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function toCsv(values: string[]): string {
  return values.join(", ");
}

function fromCsv(value: string): string[] {
  return uniqueNonEmpty(value.split(",").map((entry) => entry.trim()).filter(Boolean));
}

function parseBroadcastRelayConfig(serviceNode: Record<string, unknown>): BroadcastRelayConfigState {
  const rulesNode = toRecord(serviceNode.id);
  const rules = Object.keys(rulesNode)
    .sort((left, right) => Number(left) - Number(right))
    .map((ruleId) => {
      const ruleNode = toRecord(rulesNode[ruleId]);
      return {
        id: ruleId,
        description: asString(ruleNode.description) ?? "",
        disabled: Object.prototype.hasOwnProperty.call(ruleNode, "disable"),
        addresses: objectKeys(ruleNode.address),
        ports: objectKeys(ruleNode.port),
        interfaces: objectKeys(ruleNode.interface),
      };
    });

  return {
    enabled: Object.keys(serviceNode).length > 0,
    globalDisable: Object.prototype.hasOwnProperty.call(serviceNode, "disable"),
    rules,
  };
}

export function BroadcastRelayServiceTab({
  canEdit,
  active,
  refreshNonce,
}: BroadcastRelayServiceTabProps) {
  const [config, setConfig] = useState<BroadcastRelayConfigState>(EMPTY_BROADCAST_RELAY_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getBroadcastRelayConfig(refresh);
      setConfig(parseBroadcastRelayConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load broadcast relay configuration.");
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

  const updateRule = (index: number, update: Partial<BroadcastRelayRule>) => {
    setConfig((previous) => {
      const next = [...previous.rules];
      next[index] = { ...next[index], ...update };
      return { ...previous, rules: next };
    });
  };

  const removeRule = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      rules: previous.rules.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSave = async () => {
    for (const rule of config.rules) {
      const id = Number.parseInt(rule.id, 10);
      if (!Number.isFinite(id) || id < 1) {
        setError(`Broadcast relay rule ID '${rule.id}' is invalid. Use positive integers.`);
        setSuccess(null);
        return;
      }
    }

    const operations: string[] = ["delete service broadcast-relay"];
    if (config.enabled) {
      operations.push("set service broadcast-relay");
      if (config.globalDisable) {
        operations.push("set service broadcast-relay disable");
      }

      for (const rule of config.rules) {
        const id = Number.parseInt(rule.id, 10);
        if (!Number.isFinite(id) || id < 1) continue;
        const idCommand = `set service broadcast-relay id ${id}`;

        if (rule.description.trim()) {
          operations.push(`${idCommand} description ${quoteCliValue(rule.description)}`);
        }
        if (rule.disabled) {
          operations.push(`${idCommand} disable`);
        }
        for (const address of uniqueNonEmpty(rule.addresses)) {
          operations.push(`${idCommand} address ${quoteCliValue(address)}`);
        }
        for (const port of uniqueNonEmpty(rule.ports)) {
          operations.push(`${idCommand} port ${quoteCliValue(port)}`);
        }
        for (const iface of uniqueNonEmpty(rule.interfaces)) {
          operations.push(`${idCommand} interface ${quoteCliValue(iface)}`);
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureBroadcastRelay(operations);
      await loadConfig(true);
      setSuccess("Broadcast relay configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update broadcast relay configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RadioTower className="h-5 w-5 text-primary" />
          UDP Broadcast Relay
        </CardTitle>
        <CardDescription>
          Relay selected UDP broadcast traffic between interfaces using rule IDs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading broadcast relay configuration...</p>
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
              <Label className="text-sm font-medium">Enable broadcast relay service</Label>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                checked={config.globalDisable}
                onCheckedChange={(checked) =>
                  setConfig((previous) => ({ ...previous, globalDisable: checked === true }))
                }
                disabled={!canEdit || saving || !config.enabled}
              />
              <Label className="text-sm font-medium">Disable relay globally</Label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Relay Rules</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      rules: [
                        ...previous.rules,
                        {
                          id: "",
                          description: "",
                          disabled: false,
                          addresses: [],
                          ports: [],
                          interfaces: [],
                        },
                      ],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Rule
                </Button>
              </div>

              {config.rules.length === 0 ? (
                <p className="text-xs text-muted-foreground">No relay rules configured.</p>
              ) : (
                <div className="space-y-3">
                  {config.rules.map((rule, index) => (
                    <div key={`broadcast-rule-${index}`} className="rounded-md border p-3 space-y-3">
                      <div className="grid gap-3 xl:grid-cols-[1fr_2fr_auto]">
                        <Input
                          type="number"
                          min={1}
                          value={rule.id}
                          onChange={(event) => updateRule(index, { id: event.target.value })}
                          placeholder="Rule ID"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Input
                          value={rule.description}
                          onChange={(event) =>
                            updateRule(index, { description: event.target.value })
                          }
                          placeholder="Description"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRule(index)}
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={rule.disabled}
                          onCheckedChange={(checked) =>
                            updateRule(index, { disabled: checked === true })
                          }
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        Disable this rule
                      </label>

                      <div className="grid gap-3 xl:grid-cols-3">
                        <Input
                          value={toCsv(rule.addresses)}
                          onChange={(event) =>
                            updateRule(index, { addresses: fromCsv(event.target.value) })
                          }
                          placeholder="Target addresses: 192.0.2.10"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Input
                          value={toCsv(rule.ports)}
                          onChange={(event) =>
                            updateRule(index, { ports: fromCsv(event.target.value) })
                          }
                          placeholder="UDP ports: 1900, 5353"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Input
                          value={toCsv(rule.interfaces)}
                          onChange={(event) =>
                            updateRule(index, { interfaces: fromCsv(event.target.value) })
                          }
                          placeholder="Interfaces: eth2, eth3"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                      </div>
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
              {saving ? "Saving..." : "Save Broadcast Relay Settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
