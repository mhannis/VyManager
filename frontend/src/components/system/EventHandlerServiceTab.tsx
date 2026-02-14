"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BellRing, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, quoteCliValue, toRecord } from "./serviceTabHelpers";

interface EventEnvironmentEntry {
  name: string;
  value: string;
}

interface EventHandlerEntry {
  name: string;
  filterPattern: string;
  syslogIdentifier: string;
  scriptPath: string;
  scriptArguments: string;
  environment: EventEnvironmentEntry[];
}

interface EventHandlerConfigState {
  enabled: boolean;
  events: EventHandlerEntry[];
}

const EMPTY_EVENT_STATE: EventHandlerConfigState = {
  enabled: false,
  events: [],
};

interface EventHandlerServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function parseEventHandlerConfig(serviceNode: Record<string, unknown>): EventHandlerConfigState {
  const eventsNode = toRecord(serviceNode.event);
  const events = Object.keys(eventsNode)
    .sort((left, right) => left.localeCompare(right))
    .map((eventName) => {
      const eventNode = toRecord(eventsNode[eventName]);
      const filterNode = toRecord(eventNode.filter);
      const scriptNode = toRecord(eventNode.script);
      const envNode = toRecord(scriptNode.environment);

      const environment = Object.keys(envNode)
        .sort((left, right) => left.localeCompare(right))
        .map((name) => ({
          name,
          value: asString(toRecord(envNode[name]).value) ?? "",
        }));

      return {
        name: eventName,
        filterPattern: asString(filterNode.pattern) ?? "",
        syslogIdentifier: asString(filterNode["syslog-identifier"]) ?? "",
        scriptPath: asString(scriptNode.path) ?? "",
        scriptArguments: asString(scriptNode.arguments) ?? "",
        environment,
      };
    });

  return {
    enabled: Object.keys(serviceNode).length > 0,
    events,
  };
}

export function EventHandlerServiceTab({
  canEdit,
  active,
  refreshNonce,
}: EventHandlerServiceTabProps) {
  const [config, setConfig] = useState<EventHandlerConfigState>(EMPTY_EVENT_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getEventHandlerConfig(refresh);
      setConfig(parseEventHandlerConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event handler configuration.");
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

  const updateEvent = (index: number, update: Partial<EventHandlerEntry>) => {
    setConfig((previous) => {
      const next = [...previous.events];
      next[index] = { ...next[index], ...update };
      return { ...previous, events: next };
    });
  };

  const removeEvent = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      events: previous.events.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const updateEnvironment = (
    eventIndex: number,
    envIndex: number,
    update: Partial<EventEnvironmentEntry>,
  ) => {
    setConfig((previous) => {
      const nextEvents = [...previous.events];
      const event = nextEvents[eventIndex];
      const nextEnv = [...event.environment];
      nextEnv[envIndex] = { ...nextEnv[envIndex], ...update };
      nextEvents[eventIndex] = { ...event, environment: nextEnv };
      return { ...previous, events: nextEvents };
    });
  };

  const removeEnvironment = (eventIndex: number, envIndex: number) => {
    setConfig((previous) => {
      const nextEvents = [...previous.events];
      const event = nextEvents[eventIndex];
      nextEvents[eventIndex] = {
        ...event,
        environment: event.environment.filter((_, currentIndex) => currentIndex !== envIndex),
      };
      return { ...previous, events: nextEvents };
    });
  };

  const handleSave = async () => {
    if (config.enabled && config.events.length === 0) {
      setError("Add at least one event when event handler is enabled.");
      setSuccess(null);
      return;
    }

    const operations: string[] = ["delete service event-handler"];
    if (config.enabled) {
      for (const event of config.events) {
        const name = event.name.trim();
        if (!name) continue;
        const base = `set service event-handler event ${quoteCliValue(name)}`;

        if (event.filterPattern.trim()) {
          operations.push(`${base} filter pattern ${quoteCliValue(event.filterPattern)}`);
        }
        if (event.syslogIdentifier.trim()) {
          operations.push(
            `${base} filter syslog-identifier ${quoteCliValue(event.syslogIdentifier)}`,
          );
        }
        if (event.scriptPath.trim()) {
          operations.push(`${base} script path ${quoteCliValue(event.scriptPath)}`);
        }
        if (event.scriptArguments.trim()) {
          operations.push(`${base} script arguments ${quoteCliValue(event.scriptArguments)}`);
        }
        for (const env of event.environment) {
          const envName = env.name.trim();
          const envValue = env.value.trim();
          if (!envName || !envValue) continue;
          operations.push(
            `${base} script environment ${quoteCliValue(envName)} value ${quoteCliValue(envValue)}`,
          );
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureEventHandler(operations);
      await loadConfig(true);
      setSuccess("Event handler configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update event handler configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" />
          Event Handler
        </CardTitle>
        <CardDescription>
          Trigger scripts in response to system events and matching filters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading event handler configuration...</p>
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
              <Label className="text-sm font-medium">Enable event handler service</Label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Events</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      events: [
                        ...previous.events,
                        {
                          name: "",
                          filterPattern: "",
                          syslogIdentifier: "",
                          scriptPath: "",
                          scriptArguments: "",
                          environment: [],
                        },
                      ],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Event
                </Button>
              </div>

              {config.events.length === 0 ? (
                <p className="text-xs text-muted-foreground">No event handlers configured.</p>
              ) : (
                <div className="space-y-3">
                  {config.events.map((event, eventIndex) => (
                    <div key={`event-handler-${eventIndex}`} className="rounded-md border p-3 space-y-3">
                      <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
                        <Input
                          value={event.name}
                          onChange={(changeEvent) =>
                            updateEvent(eventIndex, { name: changeEvent.target.value })
                          }
                          placeholder="INTERFACE_DOWN"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeEvent(eventIndex)}
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-3 xl:grid-cols-2">
                        <Input
                          value={event.filterPattern}
                          onChange={(changeEvent) =>
                            updateEvent(eventIndex, { filterPattern: changeEvent.target.value })
                          }
                          placeholder="Filter pattern (regex)"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Input
                          value={event.syslogIdentifier}
                          onChange={(changeEvent) =>
                            updateEvent(eventIndex, { syslogIdentifier: changeEvent.target.value })
                          }
                          placeholder="Syslog identifier"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                      </div>

                      <div className="grid gap-3 xl:grid-cols-2">
                        <Input
                          value={event.scriptPath}
                          onChange={(changeEvent) =>
                            updateEvent(eventIndex, { scriptPath: changeEvent.target.value })
                          }
                          placeholder="/config/scripts/eventhandler.py"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Input
                          value={event.scriptArguments}
                          onChange={(changeEvent) =>
                            updateEvent(eventIndex, { scriptArguments: changeEvent.target.value })
                          }
                          placeholder="Script arguments"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium">Environment Variables</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updateEvent(eventIndex, {
                                environment: [...event.environment, { name: "", value: "" }],
                              })
                            }
                            disabled={!canEdit || saving || !config.enabled}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Env
                          </Button>
                        </div>
                        {event.environment.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No environment entries.</p>
                        ) : (
                          <div className="space-y-2">
                            {event.environment.map((env, envIndex) => (
                              <div
                                key={`event-env-${eventIndex}-${envIndex}`}
                                className="grid gap-2 xl:grid-cols-[1fr_1fr_auto]"
                              >
                                <Input
                                  value={env.name}
                                  onChange={(changeEvent) =>
                                    updateEnvironment(eventIndex, envIndex, {
                                      name: changeEvent.target.value,
                                    })
                                  }
                                  placeholder="ENV_NAME"
                                  disabled={!canEdit || saving || !config.enabled}
                                />
                                <Input
                                  value={env.value}
                                  onChange={(changeEvent) =>
                                    updateEnvironment(eventIndex, envIndex, {
                                      value: changeEvent.target.value,
                                    })
                                  }
                                  placeholder="value"
                                  disabled={!canEdit || saving || !config.enabled}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeEnvironment(eventIndex, envIndex)}
                                  disabled={!canEdit || saving || !config.enabled}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
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
              {saving ? "Saving..." : "Save Event Handler Settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
