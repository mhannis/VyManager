"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Globe, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "./serviceTabHelpers";

interface HttpsApiKey {
  id: string;
  key: string;
}

interface HttpsServiceState {
  enabled: boolean;
  port: string;
  tlsVersion: "" | "1.2" | "1.3";
  vrf: string;
  requestBodySizeLimit: string;
  enableHttpRedirect: boolean;
  apiRest: boolean;
  apiRestDebug: boolean;
  apiRestStrict: boolean;
  listenAddresses: string[];
  allowClientAddresses: string[];
  apiKeys: HttpsApiKey[];
}

const EMPTY_HTTPS_STATE: HttpsServiceState = {
  enabled: false,
  port: "",
  tlsVersion: "",
  vrf: "",
  requestBodySizeLimit: "",
  enableHttpRedirect: false,
  apiRest: false,
  apiRestDebug: false,
  apiRestStrict: false,
  listenAddresses: [],
  allowClientAddresses: [],
  apiKeys: [],
};

interface HttpsServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function parseHttpsState(serviceNode: Record<string, unknown>): HttpsServiceState {
  const apiNode = toRecord(serviceNode.api);
  const restNode = toRecord(apiNode.rest);
  const apiKeyRoot = toRecord(toRecord(apiNode.keys).id);

  return {
    enabled: Object.keys(serviceNode).length > 0,
    port: asString(serviceNode.port) ?? "",
    tlsVersion: (asString(serviceNode["tls-version"]) as "" | "1.2" | "1.3" | null) ?? "",
    vrf: asString(serviceNode.vrf) ?? "",
    requestBodySizeLimit: asString(serviceNode["request-body-size-limit"]) ?? "",
    enableHttpRedirect: Object.prototype.hasOwnProperty.call(serviceNode, "enable-http-redirect"),
    apiRest: Object.prototype.hasOwnProperty.call(apiNode, "rest"),
    apiRestDebug: Object.prototype.hasOwnProperty.call(restNode, "debug"),
    apiRestStrict: Object.prototype.hasOwnProperty.call(restNode, "strict"),
    listenAddresses: objectKeys(serviceNode["listen-address"]),
    allowClientAddresses: objectKeys(toRecord(toRecord(serviceNode["allow-client"]).address)),
    apiKeys: Object.entries(apiKeyRoot)
      .map(([id, payload]) => ({ id, key: asString(toRecord(payload).key) ?? "" }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function HttpsServiceTab({ canEdit, active, refreshNonce }: HttpsServiceTabProps) {
  const [config, setConfig] = useState<HttpsServiceState>(EMPTY_HTTPS_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getHttpsConfig(refresh);
      setConfig(parseHttpsState(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load HTTPS service configuration.");
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

  const updateListEntry = (
    key: "listenAddresses" | "allowClientAddresses",
    index: number,
    value: string,
  ) => {
    setConfig((previous) => {
      const next = [...previous[key]];
      next[index] = value;
      return { ...previous, [key]: next };
    });
  };

  const removeListEntry = (key: "listenAddresses" | "allowClientAddresses", index: number) => {
    setConfig((previous) => ({
      ...previous,
      [key]: previous[key].filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const updateApiKey = (index: number, update: Partial<HttpsApiKey>) => {
    setConfig((previous) => {
      const next = [...previous.apiKeys];
      next[index] = { ...next[index], ...update };
      return { ...previous, apiKeys: next };
    });
  };

  const removeApiKey = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      apiKeys: previous.apiKeys.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSave = async () => {
    if (config.port) {
      const port = Number.parseInt(config.port, 10);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        setError("HTTPS port must be between 1 and 65535.");
        setSuccess(null);
        return;
      }
    }

    for (const apiKey of config.apiKeys) {
      const hasId = apiKey.id.trim().length > 0;
      const hasKey = apiKey.key.trim().length > 0;
      if (hasId !== hasKey) {
        setError("Each API key row needs both an ID and a key value.");
        setSuccess(null);
        return;
      }
    }

    const operations: string[] = ["delete service https"];

    if (config.enabled) {
      operations.push("set service https");

      if (config.port.trim()) {
        operations.push(`set service https port ${config.port.trim()}`);
      }

      if (config.tlsVersion) {
        operations.push(`set service https tls-version ${config.tlsVersion}`);
      }

      if (config.vrf.trim()) {
        operations.push(`set service https vrf ${quoteCliValue(config.vrf)}`);
      }

      if (config.requestBodySizeLimit.trim()) {
        operations.push(
          `set service https request-body-size-limit ${quoteCliValue(config.requestBodySizeLimit)}`,
        );
      }

      if (config.enableHttpRedirect) {
        operations.push("set service https enable-http-redirect");
      }

      for (const address of uniqueNonEmpty(config.listenAddresses)) {
        operations.push(`set service https listen-address ${quoteCliValue(address)}`);
      }

      for (const address of uniqueNonEmpty(config.allowClientAddresses)) {
        operations.push(`set service https allow-client address ${quoteCliValue(address)}`);
      }

      if (config.apiRest || config.apiRestDebug || config.apiRestStrict) {
        operations.push("set service https api rest");
      }
      if (config.apiRestDebug) {
        operations.push("set service https api rest debug");
      }
      if (config.apiRestStrict) {
        operations.push("set service https api rest strict");
      }

      for (const apiKey of config.apiKeys) {
        const id = apiKey.id.trim();
        const key = apiKey.key.trim();
        if (!id || !key) continue;
        operations.push(
          `set service https api keys id ${quoteCliValue(id)} key ${quoteCliValue(key)}`,
        );
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureHttps(operations);
      await loadConfig(true);
      setSuccess("HTTPS service configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update HTTPS service configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          HTTPS API
        </CardTitle>
        <CardDescription>
          Configure GUI/API listener addresses, REST API mode, and API keys.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading HTTPS configuration...</p>
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
              <Label className="text-sm font-medium">Enable HTTPS service</Label>
            </div>

            <div className="grid gap-4 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={config.port}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, port: event.target.value }))
                  }
                  placeholder="443"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>

              <div className="space-y-2">
                <Label>TLS Version</Label>
                <Select
                  value={config.tlsVersion || "__default__"}
                  onValueChange={(value) =>
                    setConfig((previous) => ({
                      ...previous,
                      tlsVersion: value === "__default__" ? "" : (value as "1.2" | "1.3"),
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">System default</SelectItem>
                    <SelectItem value="1.2">TLS 1.2</SelectItem>
                    <SelectItem value="1.3">TLS 1.3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>VRF</Label>
                <Input
                  value={config.vrf}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, vrf: event.target.value }))
                  }
                  placeholder="blue"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>

              <div className="space-y-2">
                <Label>Request Body Limit</Label>
                <Input
                  value={config.requestBodySizeLimit}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, requestBodySizeLimit: event.target.value }))
                  }
                  placeholder="10MiB"
                  disabled={!canEdit || saving || !config.enabled}
                />
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={config.enableHttpRedirect}
                  onCheckedChange={(checked) =>
                    setConfig((previous) => ({ ...previous, enableHttpRedirect: checked === true }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                />
                Redirect HTTP to HTTPS
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={config.apiRest}
                  onCheckedChange={(checked) =>
                    setConfig((previous) => ({ ...previous, apiRest: checked === true }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                />
                Enable REST API
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={config.apiRestDebug}
                    onCheckedChange={(checked) =>
                      setConfig((previous) => ({ ...previous, apiRestDebug: checked === true }))
                    }
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  REST debug
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={config.apiRestStrict}
                    onCheckedChange={(checked) =>
                      setConfig((previous) => ({ ...previous, apiRestStrict: checked === true }))
                    }
                    disabled={!canEdit || saving || !config.enabled}
                  />
                  REST strict
                </label>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Listen Addresses</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) => ({
                        ...previous,
                        listenAddresses: [...previous.listenAddresses, ""],
                      }))
                    }
                    disabled={!canEdit || saving || !config.enabled}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
                {config.listenAddresses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No explicit listener addresses set.</p>
                ) : (
                  <div className="space-y-2">
                    {config.listenAddresses.map((entry, index) => (
                      <div key={`https-listen-${index}`} className="flex items-center gap-2">
                        <Input
                          value={entry}
                          onChange={(event) =>
                            updateListEntry("listenAddresses", index, event.target.value)
                          }
                          placeholder="192.168.10.242"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeListEntry("listenAddresses", index)}
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Allow-Client Addresses</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) => ({
                        ...previous,
                        allowClientAddresses: [...previous.allowClientAddresses, ""],
                      }))
                    }
                    disabled={!canEdit || saving || !config.enabled}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
                {config.allowClientAddresses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No client restrictions configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.allowClientAddresses.map((entry, index) => (
                      <div key={`https-allow-${index}`} className="flex items-center gap-2">
                        <Input
                          value={entry}
                          onChange={(event) =>
                            updateListEntry("allowClientAddresses", index, event.target.value)
                          }
                          placeholder="192.168.10.0/24"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeListEntry("allowClientAddresses", index)}
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">API Keys</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      apiKeys: [...previous.apiKeys, { id: "", key: "" }],
                    }))
                  }
                  disabled={!canEdit || saving || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Key
                </Button>
              </div>
              {config.apiKeys.length === 0 ? (
                <p className="text-xs text-muted-foreground">No API keys configured.</p>
              ) : (
                <div className="space-y-2">
                  {config.apiKeys.map((entry, index) => (
                    <div key={`https-key-${index}`} className="grid gap-2 xl:grid-cols-[1fr_2fr_auto]">
                      <Input
                        value={entry.id}
                        onChange={(event) => updateApiKey(index, { id: event.target.value })}
                        placeholder="ops-client"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Input
                        value={entry.key}
                        onChange={(event) => updateApiKey(index, { key: event.target.value })}
                        placeholder="paste-api-key"
                        disabled={!canEdit || saving || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeApiKey(index)}
                        disabled={!canEdit || saving || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              GraphQL, CORS, and certificate-specific options are not yet exposed in this tab.
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
              {saving ? "Saving..." : "Save HTTPS Settings"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
