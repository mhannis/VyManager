"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { quoteCliValue, toRecord, uniqueNonEmpty } from "./serviceTabHelpers";

interface SuricataGroup {
  name: string;
  members: string[];
}

interface SuricataConfigState {
  enabled: boolean;
  interfaces: string[];
  addressGroups: SuricataGroup[];
  portGroups: SuricataGroup[];
}

const EMPTY_SURICATA_STATE: SuricataConfigState = {
  enabled: false,
  interfaces: [],
  addressGroups: [],
  portGroups: [],
};

interface SuricataServiceTabProps {
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

function parseGroupNode(raw: unknown): SuricataGroup[] {
  const root = toRecord(raw);
  return Object.keys(root)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      name,
      members: Object.keys(toRecord(root[name])).sort((left, right) => left.localeCompare(right)),
    }));
}

function parseSuricataConfig(serviceNode: Record<string, unknown>): SuricataConfigState {
  return {
    enabled: Object.keys(serviceNode).length > 0,
    interfaces: Object.keys(toRecord(serviceNode.interface)).sort((left, right) =>
      left.localeCompare(right),
    ),
    addressGroups: parseGroupNode(serviceNode["address-group"]),
    portGroups: parseGroupNode(serviceNode["port-group"]),
  };
}

export function SuricataServiceTab({ canEdit, active, refreshNonce }: SuricataServiceTabProps) {
  const [config, setConfig] = useState<SuricataConfigState>(EMPTY_SURICATA_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getSuricataConfig(refresh);
      setConfig(parseSuricataConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Suricata configuration.");
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

  const updateGroup = (
    key: "addressGroups" | "portGroups",
    index: number,
    update: Partial<SuricataGroup>,
  ) => {
    setConfig((previous) => {
      const next = [...previous[key]];
      next[index] = { ...next[index], ...update };
      return { ...previous, [key]: next };
    });
  };

  const removeGroup = (key: "addressGroups" | "portGroups", index: number) => {
    setConfig((previous) => ({
      ...previous,
      [key]: previous[key].filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const updateInterface = (index: number, value: string) => {
    setConfig((previous) => {
      const next = [...previous.interfaces];
      next[index] = value;
      return { ...previous, interfaces: next };
    });
  };

  const removeInterface = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      interfaces: previous.interfaces.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSave = async () => {
    const interfaces = uniqueNonEmpty(config.interfaces);
    if (config.enabled && interfaces.length === 0) {
      setError("Add at least one interface when Suricata is enabled.");
      setSuccess(null);
      return;
    }

    const operations: string[] = ["delete service suricata"];
    if (config.enabled) {
      operations.push("set service suricata");

      for (const iface of interfaces) {
        operations.push(`set service suricata interface ${quoteCliValue(iface)}`);
      }

      const emitGroups = (groups: SuricataGroup[], commandRoot: "address-group" | "port-group") => {
        for (const group of groups) {
          const name = group.name.trim();
          if (!name) continue;
          for (const member of uniqueNonEmpty(group.members)) {
            operations.push(
              `set service suricata ${commandRoot} ${quoteCliValue(name)} ${quoteCliValue(member)}`,
            );
          }
        }
      };

      emitGroups(config.addressGroups, "address-group");
      emitGroups(config.portGroups, "port-group");
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureSuricata(operations);
      await loadConfig(true);
      setSuccess("Suricata configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update Suricata configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          Suricata
        </CardTitle>
        <CardDescription>
          Configure Suricata interfaces plus address and port groups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading Suricata configuration...</p>
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
              <Label className="text-sm font-medium">Enable Suricata service</Label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Interfaces</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      interfaces: [...previous.interfaces, ""],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Interface
                </Button>
              </div>
              {config.interfaces.length === 0 ? (
                <p className="text-xs text-muted-foreground">No interfaces configured.</p>
              ) : (
                <div className="space-y-2">
                  {config.interfaces.map((iface, index) => (
                    <div key={`suricata-iface-${index}`} className="flex items-center gap-2">
                      <Input
                        value={iface}
                        onChange={(event) => updateInterface(index, event.target.value)}
                        placeholder="eth2"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeInterface(index)}
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Address Groups</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) => ({
                        ...previous,
                        addressGroups: [...previous.addressGroups, { name: "", members: [] }],
                      }))
                    }
                    disabled={!canEdit || saving || !config.enabled}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Group
                  </Button>
                </div>
                {config.addressGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No address groups configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.addressGroups.map((group, index) => (
                      <div key={`suricata-addr-group-${index}`} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={group.name}
                            onChange={(event) =>
                              updateGroup("addressGroups", index, { name: event.target.value })
                            }
                            placeholder="LAN_NET"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeGroup("addressGroups", index)}
                            disabled={!canEdit || saving || !config.enabled}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <Input
                          value={toCsv(group.members)}
                          onChange={(event) =>
                            updateGroup("addressGroups", index, { members: fromCsv(event.target.value) })
                          }
                          placeholder="192.168.10.0/24, GROUP_LAN"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Port Groups</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) => ({
                        ...previous,
                        portGroups: [...previous.portGroups, { name: "", members: [] }],
                      }))
                    }
                    disabled={!canEdit || saving || !config.enabled}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Group
                  </Button>
                </div>
                {config.portGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No port groups configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.portGroups.map((group, index) => (
                      <div key={`suricata-port-group-${index}`} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={group.name}
                            onChange={(event) =>
                              updateGroup("portGroups", index, { name: event.target.value })
                            }
                            placeholder="WEB_PORTS"
                            disabled={!canEdit || saving || !config.enabled}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeGroup("portGroups", index)}
                            disabled={!canEdit || saving || !config.enabled}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <Input
                          value={toCsv(group.members)}
                          onChange={(event) =>
                            updateGroup("portGroups", index, { members: fromCsv(event.target.value) })
                          }
                          placeholder="80, 443"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Suricata EVE logging options are not yet exposed in this tab.
            </p>

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
              {saving ? "Saving..." : "Save Suricata Settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
