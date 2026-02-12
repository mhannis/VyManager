"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import {
  containersService,
  type ContainerEnvironmentVar,
  type ContainerPortMapping,
  type ContainerSummary,
  type ContainerUpsertRequest,
  type ContainerVolumeMapping,
  type ContainersOverviewResponse,
} from "@/lib/api/containers";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Square,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ContainerDraft {
  name: string;
  image: string;
  description: string;
  entrypoint: string;
  command: string;
  arguments: string;
  host_name: string;
  restart: "no" | "on-failure" | "always";
  enabled: boolean;
  allow_host_networks: boolean;
  network: string;
  network_address: string;
  environment: ContainerEnvironmentVar[];
  ports: ContainerPortMapping[];
  volumes: ContainerVolumeMapping[];
}

const EMPTY_DRAFT: ContainerDraft = {
  name: "",
  image: "",
  description: "",
  entrypoint: "",
  command: "",
  arguments: "",
  host_name: "",
  restart: "on-failure",
  enabled: true,
  allow_host_networks: true,
  network: "",
  network_address: "",
  environment: [],
  ports: [],
  volumes: [],
};

function normalizeDraftToPayload(draft: ContainerDraft): ContainerUpsertRequest {
  return {
    image: draft.image.trim(),
    description: draft.description.trim() || null,
    entrypoint: draft.entrypoint.trim() || null,
    command: draft.command.trim() || null,
    arguments: draft.arguments.trim() || null,
    host_name: draft.host_name.trim() || null,
    restart: draft.restart,
    enabled: draft.enabled,
    allow_host_networks: draft.allow_host_networks,
    network: draft.network.trim() || null,
    network_address: draft.network_address.trim() || null,
    environment: draft.environment
      .map((env) => ({ key: env.key.trim(), value: env.value }))
      .filter((env) => env.key.length > 0),
    ports: draft.ports.map((port) => ({
      name: port.name.trim(),
      source: Number(port.source),
      destination: Number(port.destination),
      protocol: port.protocol,
    })),
    volumes: draft.volumes
      .map((volume) => ({
        name: volume.name.trim(),
        source: volume.source.trim(),
        destination: volume.destination.trim(),
        mode: volume.mode,
      }))
      .filter((volume) => volume.name.length > 0 || volume.source.length > 0 || volume.destination.length > 0),
  };
}

function toDraft(container: ContainerSummary): ContainerDraft {
  return {
    name: container.name,
    image: container.image ?? "",
    description: container.description ?? "",
    entrypoint: container.entrypoint ?? "",
    command: container.command ?? "",
    arguments: container.arguments ?? "",
    host_name: container.host_name ?? "",
    restart: container.restart ?? "on-failure",
    enabled: container.enabled,
    allow_host_networks: container.allow_host_networks,
    network: container.network ?? "",
    network_address: container.network_address ?? "",
    environment: container.environment.map((item) => ({ ...item })),
    ports: container.ports.map((item) => ({ ...item })),
    volumes: container.volumes.map((item) => ({ ...item })),
  };
}

function getValidationError(draft: ContainerDraft): string | null {
  const name = draft.name.trim();
  if (!name) return "Container name is required.";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(name)) {
    return "Container name can include letters, numbers, dot, dash, underscore.";
  }
  if (!draft.image.trim()) return "Container image is required.";

  const envKeys = new Set<string>();
  for (const env of draft.environment) {
    const key = env.key.trim();
    if (!key) continue;
    if (envKeys.has(key)) return `Duplicate environment key: ${key}`;
    envKeys.add(key);
  }

  const portNames = new Set<string>();
  for (const port of draft.ports) {
    const nameText = port.name.trim();
    if (!nameText) return "Every port mapping needs a name.";
    if (portNames.has(nameText)) return `Duplicate port mapping name: ${nameText}`;
    portNames.add(nameText);
    if (!Number.isInteger(Number(port.source)) || Number(port.source) < 1 || Number(port.source) > 65535) {
      return `Invalid source port for ${nameText}.`;
    }
    if (
      !Number.isInteger(Number(port.destination)) ||
      Number(port.destination) < 1 ||
      Number(port.destination) > 65535
    ) {
      return `Invalid destination port for ${nameText}.`;
    }
  }

  const volumeNames = new Set<string>();
  for (const volume of draft.volumes) {
    const nameText = volume.name.trim();
    if (!nameText) return "Every volume mapping needs a name.";
    if (volumeNames.has(nameText)) return `Duplicate volume mapping name: ${nameText}`;
    volumeNames.add(nameText);
    if (!volume.source.trim() || !volume.destination.trim()) {
      return `Volume ${nameText} requires source and destination.`;
    }
  }

  if (draft.allow_host_networks && draft.network.trim()) {
    return "Host networking cannot be combined with custom container network.";
  }
  if (draft.network.trim() && draft.ports.length > 0) {
    return "Port publishing cannot be used when a custom container network is configured.";
  }
  if (draft.network_address.trim() && !draft.network.trim()) {
    return "Set a network name before setting a network address.";
  }

  return null;
}

function loadPiHoleTemplate(): ContainerDraft {
  return {
    name: "pihole",
    image: "pihole/pihole:latest",
    description: "Pi-hole DNS and ad-blocking container",
    entrypoint: "",
    command: "",
    arguments: "",
    host_name: "pihole",
    restart: "on-failure",
    enabled: true,
    allow_host_networks: true,
    network: "",
    network_address: "",
    environment: [
      { key: "TZ", value: "UTC" },
      { key: "WEBPASSWORD", value: "changeme" },
      { key: "DNSMASQ_LISTENING", value: "all" },
    ],
    ports: [
      { name: "dns-tcp", source: 53, destination: 53, protocol: "tcp" },
      { name: "dns-udp", source: 53, destination: 53, protocol: "udp" },
      { name: "web", source: 8080, destination: 80, protocol: "tcp" },
    ],
    volumes: [
      { name: "etc-pihole", source: "/config/pihole/etc-pihole", destination: "/etc/pihole", mode: "rw" },
      {
        name: "etc-dnsmasq",
        source: "/config/pihole/etc-dnsmasq.d",
        destination: "/etc/dnsmasq.d",
        mode: "rw",
      },
    ],
  };
}

export default function SystemContainersPage() {
  const { canWrite } = usePermissions();
  const canEditSystem = canWrite(FeatureGroup.SYSTEM);

  const [overview, setOverview] = useState<ContainersOverviewResponse | null>(null);
  const [draft, setDraft] = useState<ContainerDraft>({ ...EMPTY_DRAFT });
  const [selectedContainerName, setSelectedContainerName] = useState<string | null>(null);
  const [logsContainerName, setLogsContainerName] = useState<string | null>(null);
  const [logsText, setLogsText] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedContainer = useMemo(() => {
    if (!overview || !selectedContainerName) return null;
    return overview.containers.find((container) => container.name === selectedContainerName) ?? null;
  }, [overview, selectedContainerName]);

  const loadOverview = useCallback(async (refresh: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await containersService.getOverview(refresh);
      setOverview(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load container data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview(true);
  }, [loadOverview]);

  const resetDraft = () => {
    setSelectedContainerName(null);
    setDraft({ ...EMPTY_DRAFT });
    setSuccess(null);
    setError(null);
  };

  const editContainer = (container: ContainerSummary) => {
    setSelectedContainerName(container.name);
    setDraft(toDraft(container));
    setSuccess(null);
    setError(null);
  };

  const saveContainer = async () => {
    const validationError = getValidationError(draft);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const name = draft.name.trim();
      await containersService.upsertContainer(name, normalizeDraftToPayload(draft));
      await loadOverview(true);
      setSelectedContainerName(name);
      setSuccess(`Container ${name} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save container.");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (name: string, action: "start" | "stop" | "restart") => {
    setActionTarget(name);
    setError(null);
    setSuccess(null);
    try {
      const response = await containersService.action(name, action);
      await loadOverview(true);
      setSuccess(response.warning ? `${response.message} (${response.warning})` : response.message ?? "Action completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} container.`);
    } finally {
      setActionTarget(null);
    }
  };

  const removeContainer = async (name: string) => {
    const confirmed = window.confirm(`Delete container ${name}?`);
    if (!confirmed) return;

    setActionTarget(name);
    setError(null);
    setSuccess(null);
    try {
      await containersService.deleteContainer(name);
      if (selectedContainerName === name) {
        resetDraft();
      }
      if (logsContainerName === name) {
        setLogsContainerName(null);
        setLogsText("");
      }
      await loadOverview(true);
      setSuccess(`Container ${name} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete container.");
    } finally {
      setActionTarget(null);
    }
  };

  const loadLogs = async (name: string) => {
    setLoadingLogs(true);
    setError(null);
    try {
      const response = await containersService.getLogs(name, 400);
      setLogsContainerName(name);
      setLogsText(response.logs || "(no logs)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load container logs.");
    } finally {
      setLoadingLogs(false);
    }
  };

  const updateEnv = (index: number, key: keyof ContainerEnvironmentVar, value: string) => {
    setDraft((previous) => {
      const environment = [...previous.environment];
      environment[index] = { ...environment[index], [key]: value };
      return { ...previous, environment };
    });
  };

  const updatePort = (index: number, key: keyof ContainerPortMapping, value: string | number) => {
    setDraft((previous) => {
      const ports = [...previous.ports];
      if (key === "source" || key === "destination") {
        ports[index] = { ...ports[index], [key]: Number(value) };
      } else {
        ports[index] = {
          ...ports[index],
          [key]: value as ContainerPortMapping[typeof key],
        };
      }
      return { ...previous, ports };
    });
  };

  const updateVolume = (index: number, key: keyof ContainerVolumeMapping, value: string) => {
    setDraft((previous) => {
      const volumes = [...previous.volumes];
      volumes[index] = {
        ...volumes[index],
        [key]: value as ContainerVolumeMapping[typeof key],
      };
      return { ...previous, volumes };
    });
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Server className="h-8 w-8" />
              Container Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Configure and control VyOS containers, then launch exposed web UIs directly.
            </p>
            {overview?.connection_host && (
              <p className="text-xs text-muted-foreground mt-1">
                Instance host: <span className="font-mono">{overview.connection_host}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => loadOverview(true)} disabled={loading || saving}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setDraft(loadPiHoleTemplate())} disabled={saving}>
              <WandSparkles className="h-4 w-4 mr-2" />
              Pi-hole Template
            </Button>
            <Button variant="outline" onClick={resetDraft} disabled={saving}>
              <Plus className="h-4 w-4 mr-2" />
              New Container
            </Button>
          </div>
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

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Containers</CardTitle>
              <CardDescription>
                {overview
                  ? `${overview.configured_total} configured, ${overview.active_total ?? 0} active`
                  : "Loading containers..."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading containers...
                </div>
              ) : !overview || overview.containers.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No containers configured yet.
                </div>
              ) : (
                overview.containers.map((container) => {
                  const isSelected = selectedContainerName === container.name;
                  const busy = actionTarget === container.name;
                  return (
                    <div
                      key={container.name}
                      className={cn(
                        "rounded-md border p-4 space-y-3",
                        isSelected && "border-primary bg-primary/5"
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{container.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {container.image ?? "(no image)"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{container.status ?? "unknown"}</Badge>
                          <Badge variant={container.enabled ? "default" : "secondary"}>
                            {container.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                      </div>

                      {container.description && (
                        <p className="text-xs text-muted-foreground">{container.description}</p>
                      )}

                      {container.ports.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {container.ports.map((port) => (
                            <Badge key={port.name} variant="secondary" className="text-xs">
                              {`${port.name}: ${port.source}->${port.destination}/${port.protocol}`}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {container.links.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {container.links.map((link) => (
                            <a
                              key={`${container.name}-${link.label}-${link.url}`}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => editContainer(container)}>
                          Edit
                        </Button>
                        {container.enabled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runAction(container.name, "stop")}
                            disabled={!canEditSystem || busy || saving}
                          >
                            <Square className="h-3.5 w-3.5 mr-1" />
                            Stop
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runAction(container.name, "start")}
                            disabled={!canEditSystem || busy || saving}
                          >
                            <Play className="h-3.5 w-3.5 mr-1" />
                            Start
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runAction(container.name, "restart")}
                          disabled={!canEditSystem || busy || saving}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Restart
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadLogs(container.name)}
                          disabled={loadingLogs}
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          Logs
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeContainer(container.name)}
                          disabled={!canEditSystem || busy || saving}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}

              {logsContainerName && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Logs: {logsContainerName}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLogsContainerName(null);
                        setLogsText("");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea value={logsText} readOnly className="min-h-56 font-mono text-xs" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{selectedContainer ? `Edit: ${selectedContainer.name}` : "Create Container"}</CardTitle>
              <CardDescription>
                Define image, networking, ports, environment, and volumes for this container.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={draft.name}
                    onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
                    placeholder="pihole"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Image</Label>
                  <Input
                    value={draft.image}
                    onChange={(event) => setDraft((previous) => ({ ...previous, image: event.target.value }))}
                    placeholder="pihole/pihole:latest"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Restart Policy</Label>
                  <Select
                    value={draft.restart}
                    onValueChange={(value: "no" | "on-failure" | "always") =>
                      setDraft((previous) => ({ ...previous, restart: value }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">no</SelectItem>
                      <SelectItem value="on-failure">on-failure</SelectItem>
                      <SelectItem value="always">always</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hostname (optional)</Label>
                  <Input
                    value={draft.host_name}
                    onChange={(event) =>
                      setDraft((previous) => ({ ...previous, host_name: event.target.value }))
                    }
                    placeholder="pihole"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  value={draft.description}
                  onChange={(event) => setDraft((previous) => ({ ...previous, description: event.target.value }))}
                  disabled={saving}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Entrypoint (optional)</Label>
                  <Input
                    value={draft.entrypoint}
                    onChange={(event) => setDraft((previous) => ({ ...previous, entrypoint: event.target.value }))}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Command (optional)</Label>
                  <Input
                    value={draft.command}
                    onChange={(event) => setDraft((previous) => ({ ...previous, command: event.target.value }))}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Arguments (optional)</Label>
                  <Input
                    value={draft.arguments}
                    onChange={(event) => setDraft((previous) => ({ ...previous, arguments: event.target.value }))}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Network Name (optional)</Label>
                  <Input
                    value={draft.network}
                    onChange={(event) => setDraft((previous) => ({ ...previous, network: event.target.value }))}
                    placeholder="trusted-net"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Network Address (optional)</Label>
                  <Input
                    value={draft.network_address}
                    onChange={(event) =>
                      setDraft((previous) => ({ ...previous, network_address: event.target.value }))
                    }
                    placeholder="192.168.100.50"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={draft.enabled}
                    onCheckedChange={(checked) =>
                      setDraft((previous) => ({ ...previous, enabled: checked === true }))
                    }
                    disabled={saving}
                  />
                  <Label>Enabled</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={draft.allow_host_networks}
                    onCheckedChange={(checked) =>
                      setDraft((previous) => ({ ...previous, allow_host_networks: checked === true }))
                    }
                    disabled={saving}
                  />
                  <Label>Allow Host Networks</Label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Environment Variables</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        environment: [...previous.environment, { key: "", value: "" }],
                      }))
                    }
                    disabled={saving}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
                {draft.environment.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No environment variables configured.</p>
                ) : (
                  <div className="space-y-2">
                    {draft.environment.map((env, index) => (
                      <div key={`env-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                        <Input
                          placeholder="KEY"
                          value={env.key}
                          onChange={(event) => updateEnv(index, "key", event.target.value)}
                          disabled={saving}
                        />
                        <Input
                          placeholder="value"
                          value={env.value}
                          onChange={(event) => updateEnv(index, "value", event.target.value)}
                          disabled={saving}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDraft((previous) => ({
                              ...previous,
                              environment: previous.environment.filter((_, i) => i !== index),
                            }))
                          }
                          disabled={saving}
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
                  <Label>Port Mappings</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        ports: [
                          ...previous.ports,
                          { name: "", source: 8080, destination: 80, protocol: "tcp" },
                        ],
                      }))
                    }
                    disabled={saving}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
                {draft.ports.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No published ports configured.</p>
                ) : (
                  <div className="space-y-2">
                    {draft.ports.map((port, index) => (
                      <div
                        key={`port-${index}`}
                        className="grid gap-2 md:grid-cols-[1fr_120px_120px_120px_auto]"
                      >
                        <Input
                          placeholder="name"
                          value={port.name}
                          onChange={(event) => updatePort(index, "name", event.target.value)}
                          disabled={saving}
                        />
                        <Input
                          type="number"
                          value={String(port.source)}
                          onChange={(event) => updatePort(index, "source", Number(event.target.value))}
                          disabled={saving}
                        />
                        <Input
                          type="number"
                          value={String(port.destination)}
                          onChange={(event) => updatePort(index, "destination", Number(event.target.value))}
                          disabled={saving}
                        />
                        <Select
                          value={port.protocol}
                          onValueChange={(value: "tcp" | "udp") => updatePort(index, "protocol", value)}
                          disabled={saving}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tcp">tcp</SelectItem>
                            <SelectItem value="udp">udp</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDraft((previous) => ({
                              ...previous,
                              ports: previous.ports.filter((_, i) => i !== index),
                            }))
                          }
                          disabled={saving}
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
                  <Label>Volume Mappings</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        volumes: [
                          ...previous.volumes,
                          { name: "", source: "", destination: "", mode: "rw" },
                        ],
                      }))
                    }
                    disabled={saving}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
                {draft.volumes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No volume mappings configured.</p>
                ) : (
                  <div className="space-y-2">
                    {draft.volumes.map((volume, index) => (
                      <div
                        key={`volume-${index}`}
                        className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_120px_auto]"
                      >
                        <Input
                          placeholder="name"
                          value={volume.name}
                          onChange={(event) => updateVolume(index, "name", event.target.value)}
                          disabled={saving}
                        />
                        <Input
                          placeholder="/config/..."
                          value={volume.source}
                          onChange={(event) => updateVolume(index, "source", event.target.value)}
                          disabled={saving}
                        />
                        <Input
                          placeholder="/container/path"
                          value={volume.destination}
                          onChange={(event) => updateVolume(index, "destination", event.target.value)}
                          disabled={saving}
                        />
                        <Select
                          value={volume.mode}
                          onValueChange={(value: "rw" | "ro") => updateVolume(index, "mode", value)}
                          disabled={saving}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rw">rw</SelectItem>
                            <SelectItem value="ro">ro</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDraft((previous) => ({
                              ...previous,
                              volumes: previous.volumes.filter((_, i) => i !== index),
                            }))
                          }
                          disabled={saving}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!canEditSystem && (
                <p className="text-xs text-muted-foreground">
                  You currently have read-only access for System features.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={saveContainer} disabled={!canEditSystem || saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Saving..." : "Save Container"}
                </Button>
                <Button variant="outline" onClick={resetDraft} disabled={saving}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
