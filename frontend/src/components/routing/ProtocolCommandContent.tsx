"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { RefreshCw, Terminal, ShieldCheck } from "lucide-react";

type ProtocolBatchRequest = {
  operations: string[];
};

type ProtocolService = {
  getConfig: (refresh?: boolean) => Promise<unknown>;
  getCapabilities: () => Promise<unknown>;
  batchConfigure: (request: ProtocolBatchRequest) => Promise<{ success: boolean; error?: string | null } | unknown>;
};

interface ProtocolCommandContentProps {
  title: string;
  description: string;
  service: ProtocolService;
  defaultCommands?: string[];
}

export function ProtocolCommandContent({
  title,
  description,
  service,
  defaultCommands = [],
}: ProtocolCommandContentProps) {
  const [config, setConfig] = useState<unknown>(null);
  const [capabilities, setCapabilities] = useState<unknown>(null);
  const [commandsText, setCommandsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const [configData, capabilityData] = await Promise.all([
        service.getConfig(refresh),
        service.getCapabilities(),
      ]);
      setConfig(configData);
      setCapabilities(capabilityData);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${title} configuration`);
    } finally {
      setLoading(false);
    }
  }, [service, title]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const capabilityFlags = useMemo(() => {
    if (!capabilities || typeof capabilities !== "object") {
      return [] as string[];
    }

    const features = (capabilities as { features?: unknown }).features;
    if (typeof features !== "object" || features === null) {
      return [] as string[];
    }

    return Object.entries(features)
      .filter(([, value]) => {
        if (typeof value === "boolean") {
          return value;
        }
        return typeof value === "object" && value !== null && (value as { supported?: boolean }).supported;
      })
      .map(([key]) => key);
  }, [capabilities]);

  const handleApply = useCallback(async () => {
    const commands = commandsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (commands.length === 0) {
      setError("Add at least one command before applying changes.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      const result = await service.batchConfigure({ operations: commands });
      if (
        result &&
        typeof result === "object" &&
        "success" in result &&
        !(result as { success?: boolean }).success
      ) {
        const message =
          "error" in result && typeof (result as { error?: unknown }).error === "string"
            ? (result as { error: string }).error
            : `Failed to configure ${title}`;
        throw new Error(message);
      }
      setMessage("Configuration applied successfully.");
      setCommandsText("");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to configure ${title}`);
    } finally {
      setSaving(false);
    }
  }, [commandsText, loadData, service, title]);

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
        <Button variant="outline" size="sm" onClick={() => loadData(true)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
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

      <div className="grid flex-1 gap-4 lg:grid-cols-2">
        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              Detected Capabilities
            </CardTitle>
            <CardDescription>Feature flags from this VyOS version</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {capabilityFlags.length === 0 ? (
                <span className="text-xs text-muted-foreground">No capability flags reported.</span>
              ) : (
                capabilityFlags.map((flag) => (
                  <Badge key={flag} variant="secondary" className="font-mono text-[11px]">
                    {flag}
                  </Badge>
                ))
              )}
            </div>

            <ScrollArea className="h-[280px] rounded-md border border-border bg-muted/20 p-3">
              <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {JSON.stringify(config ?? {}, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Terminal className="h-4 w-4" />
              Command Batch
            </CardTitle>
            <CardDescription>
              Enter one VyOS configure command per line (for example: <span className="font-mono">set protocols ...</span>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={commandsText}
              onChange={(event) => setCommandsText(event.target.value)}
              className="min-h-[250px] font-mono text-xs"
              placeholder="set protocols ..."
            />

            {defaultCommands.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {defaultCommands.map((command) => (
                  <Button
                    key={command}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="max-w-full truncate font-mono text-[11px]"
                    title={command}
                    onClick={() => {
                      setCommandsText((prev) => {
                        if (!prev.trim()) {
                          return command;
                        }
                        return `${prev.trim()}\n${command}`;
                      });
                    }}
                  >
                    + {command}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleApply} disabled={saving}>
                {saving ? "Applying..." : "Apply Commands"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
