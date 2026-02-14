"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { IkeGroupDialog } from "@/components/vpn/ipsec/IkeGroupDialog";
import { EspGroupDialog } from "@/components/vpn/ipsec/EspGroupDialog";
import { Phase1Dialog } from "@/components/vpn/ipsec/Phase1Dialog";
import { Phase2Dialog } from "@/components/vpn/ipsec/Phase2Dialog";
import { VtiDialog } from "@/components/vpn/ipsec/VtiDialog";
import { PskDialog } from "@/components/vpn/ipsec/PskDialog";
import {
  SiteToSiteWizard,
  type SiteToSiteWizardInterfaceOption,
} from "@/components/vpn/ipsec/SiteToSiteWizard";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { ethernetService } from "@/lib/api/ethernet";
import {
  ipsecService,
  type IPsecConfig,
  type IPsecSettings,
  type IPsecStatus,
} from "@/lib/api/ipsec";
import { systemService, type SystemLogsResponse, type SystemLogSource } from "@/lib/api/system";
import {
  AlertCircle,
  Download,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
  Trash2,
  Wand2,
} from "lucide-react";

function valueOrDash(value?: string | null): string {
  if (!value) return "-";
  const trimmed = value.trim();
  return trimmed || "-";
}

function severityColor(severity?: string | null): string {
  const normalized = (severity || "").toLowerCase();
  if (["emerg", "alert", "crit", "err"].includes(normalized)) {
    return "bg-red-500/10 text-red-600 border-red-500/20";
  }
  if (normalized === "warning") {
    return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  }
  if (normalized === "notice" || normalized === "info") {
    return "bg-blue-500/10 text-blue-600 border-blue-500/20";
  }
  if (normalized === "debug") {
    return "bg-muted text-muted-foreground border-border";
  }
  return "bg-muted text-muted-foreground border-border";
}

function parseCsvList(value: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value.split(",")) {
    const item = entry.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function sortedNumericKeys(map: Record<string, any> | null | undefined): string[] {
  const keys = Object.keys(map || {});
  keys.sort((left, right) => Number(left) - Number(right));
  return keys;
}

export default function IPsecPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.IPSEC) || canWrite(FeatureGroup.VPN);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("tunnels");

  const [config, setConfig] = useState<IPsecConfig | null>(null);
  const [status, setStatus] = useState<IPsecStatus | null>(null);
  const [interfaceNames, setInterfaceNames] = useState<string[]>([]);
  const [interfaceOptions, setInterfaceOptions] = useState<SiteToSiteWizardInterfaceOption[]>([]);

  const [settings, setSettings] = useState<IPsecSettings | null>(null);
  const [settingsInterfaces, setSettingsInterfaces] = useState("");
  const [disableRouteAutoinstall, setDisableRouteAutoinstall] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [logs, setLogs] = useState<SystemLogsResponse | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsRefreshing, setLogsRefreshing] = useState(false);
  const [logsDownloading, setLogsDownloading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsAutoRefresh, setLogsAutoRefresh] = useState(true);
  const [logsLineCount, setLogsLineCount] = useState("200");
  const [logsSource, setLogsSource] = useState<SystemLogSource>("auto");
  const [logsSearchInput, setLogsSearchInput] = useState("charon");
  const [logsSearchFilter, setLogsSearchFilter] = useState("charon");

  const [selectedPeerId, setSelectedPeerId] = useState<string>("");

  const [ikeDialogOpen, setIkeDialogOpen] = useState(false);
  const [ikeDialogMode, setIkeDialogMode] = useState<"create" | "edit">("create");
  const [ikeDialogName, setIkeDialogName] = useState("");

  const [espDialogOpen, setEspDialogOpen] = useState(false);
  const [espDialogMode, setEspDialogMode] = useState<"create" | "edit">("create");
  const [espDialogName, setEspDialogName] = useState("");

  const [phase1DialogOpen, setPhase1DialogOpen] = useState(false);
  const [phase1DialogMode, setPhase1DialogMode] = useState<"create" | "edit">("create");
  const [phase1DialogPeerId, setPhase1DialogPeerId] = useState("");

  const [phase2DialogOpen, setPhase2DialogOpen] = useState(false);
  const [phase2DialogMode, setPhase2DialogMode] = useState<"create" | "edit">("create");
  const [phase2DialogPeerId, setPhase2DialogPeerId] = useState("");
  const [phase2DialogTunnelId, setPhase2DialogTunnelId] = useState("");

  const [vtiDialogOpen, setVtiDialogOpen] = useState(false);
  const [vtiDialogPeerId, setVtiDialogPeerId] = useState("");

  const [pskDialogOpen, setPskDialogOpen] = useState(false);
  const [pskDialogMode, setPskDialogMode] = useState<"create" | "edit">("create");
  const [pskDialogName, setPskDialogName] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadData = async () => {
    setError(null);
    setSuccess(null);
    setRefreshing(true);
    try {
      const [configResult, statusResult, ethResult, settingsResult] = await Promise.allSettled([
        ipsecService.getConfig(),
        ipsecService.getStatus().catch(() => null),
        ethernetService.getConfig().catch(() => null),
        ipsecService.getSettings().catch(() => null),
      ]);

      if (configResult.status !== "fulfilled") {
        throw configResult.reason;
      }

      setConfig(configResult.value);
      setStatus(statusResult.status === "fulfilled" ? (statusResult.value as any) : null);

      const ethConfig = ethResult.status === "fulfilled" ? (ethResult.value as any) : null;
      if (ethConfig?.interfaces) {
        const options = ethConfig.interfaces
          .filter((iface: { name?: string }) => Boolean(iface?.name))
          .map((iface: { name: string; description?: string | null }) => ({
            name: iface.name,
            description: iface.description ?? null,
          }))
          .sort((left: SiteToSiteWizardInterfaceOption, right: SiteToSiteWizardInterfaceOption) =>
            left.name.localeCompare(right.name)
          );
        setInterfaceOptions(options);
        setInterfaceNames(options.map((iface: SiteToSiteWizardInterfaceOption) => iface.name));
      } else {
        setInterfaceOptions([]);
        setInterfaceNames([]);
      }

      const settingsValue = settingsResult.status === "fulfilled" ? (settingsResult.value as any) : null;
      if (settingsValue) {
        setSettings(settingsValue);
        setSettingsInterfaces((settingsValue.interfaces || []).join(", "));
        setDisableRouteAutoinstall(Boolean(settingsValue.disable_route_autoinstall));
      } else {
        setSettings(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load IPsec data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadLogs = async () => {
    if (activeTab !== "logs") return;
    setLogsError(null);
    if (!logs) setLogsLoading(true);
    setLogsRefreshing(true);
    try {
      const parsedLineCount = Number.parseInt(logsLineCount, 10);
      const effectiveLineCount = Number.isNaN(parsedLineCount) ? 200 : parsedLineCount;
      const response = await systemService.getLogs(
        effectiveLineCount,
        logsSearchFilter || undefined,
        logsSource,
      );
      setLogs(response);
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "Failed to load IPsec logs");
    } finally {
      setLogsLoading(false);
      setLogsRefreshing(false);
    }
  };

  const handleLogsDownload = async () => {
    try {
      setLogsError(null);
      setLogsDownloading(true);

      const parsedLineCount = Number.parseInt(logsLineCount, 10);
      const effectiveLineCount = Number.isNaN(parsedLineCount) ? 200 : parsedLineCount;

      const params = new URLSearchParams({
        lines: String(effectiveLineCount),
        source: logsSource,
      });
      if (logsSearchFilter && logsSearchFilter.trim()) {
        params.set("contains", logsSearchFilter.trim());
      }

      const response = await fetch(`/api/vyos/system/logs/download?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        let message = `Failed to download logs (${response.status})`;
        if (contentType.includes("application/json")) {
          const payload = await response.json();
          const detail = payload?.detail || payload?.error || payload?.message;
          if (typeof detail === "string" && detail.trim()) {
            message = detail.trim();
          }
        } else {
          const raw = await response.text();
          const trimmed = raw.trim();
          if (trimmed) message = trimmed.slice(0, 300);
        }
        throw new Error(message);
      }

      const disposition = response.headers.get("content-disposition") || "";
      const filenameMatch = /filename=\"?([^\";]+)\"?/i.exec(disposition);
      const filename = filenameMatch?.[1] || "vyos-ipsec-logs.log";

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "Failed to download logs");
    } finally {
      setLogsDownloading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab !== "logs") return;
    loadLogs();
  }, [activeTab, logsLineCount, logsSearchFilter, logsSource]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== "logs" || !logsAutoRefresh) return;
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, [activeTab, logsAutoRefresh, logsLineCount, logsSearchFilter, logsSource]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const peerIds = Object.keys(config?.["site-to-site"] || {}).sort();
    if (peerIds.length === 0) {
      setSelectedPeerId("");
      return;
    }
    if (!selectedPeerId || !peerIds.includes(selectedPeerId)) {
      setSelectedPeerId(peerIds[0]);
    }
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  const peerEntries = useMemo(() => {
    const entries = Object.entries(config?.["site-to-site"] || {});
    entries.sort((left, right) => left[0].localeCompare(right[0]));
    return entries;
  }, [config]);

  const filteredPeers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return peerEntries;
    return peerEntries.filter(([peerId, peer]) => {
      const auth: any = peer?.authentication || {};
      const values = [
        peerId,
        peer.description,
        peer["local-address"],
        peer["remote-address"],
        peer["ike-group"],
        peer["default-esp-group"],
        peer["connection-type"],
        peer["dhcp-interface"],
        auth?.["local-id"],
        auth?.["remote-id"],
        peer.vti?.bind,
      ];
      return values.some((value) => value?.toLowerCase?.().includes(needle));
    });
  }, [peerEntries, search]);

  const selectedPeer = selectedPeerId ? (config?.["site-to-site"]?.[selectedPeerId] ?? null) : null;
  const selectedPeerTunnelIds = useMemo(() => sortedNumericKeys(selectedPeer?.tunnels || {}), [selectedPeer]);

  const ikeGroupNames = useMemo(() => Object.keys(config?.["ike-group"] || {}).sort(), [config]);
  const espGroupNames = useMemo(() => Object.keys(config?.["esp-group"] || {}).sort(), [config]);
  const existingPeerIds = useMemo(() => Object.keys(config?.["site-to-site"] || {}).sort(), [config]);
  const existingPskIds = useMemo(() => Object.keys(config?.psk_secrets || {}).sort(), [config]);
  const logEntries = useMemo(() => logs?.entries || [], [logs]);

  const ikeGroupCount = ikeGroupNames.length;
  const espGroupCount = espGroupNames.length;
  const pskCount = existingPskIds.length;
  const peerCount = peerEntries.length;

  const handleSuccess = async (message: string) => {
    setSuccess(message);
    await loadData();
  };

  const deleteIkeGroup = async (name: string) => {
    if (!canEdit) return;
    if (!window.confirm(`Delete IKE group '${name}'?`)) return;
    setMutating(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await ipsecService.deleteIkeGroup(name);
      setSuccess(result.message || `IKE group '${name}' deleted.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete IKE group");
    } finally {
      setMutating(false);
    }
  };

  const deleteEspGroup = async (name: string) => {
    if (!canEdit) return;
    if (!window.confirm(`Delete ESP group '${name}'?`)) return;
    setMutating(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await ipsecService.deleteEspGroup(name);
      setSuccess(result.message || `ESP group '${name}' deleted.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete ESP group");
    } finally {
      setMutating(false);
    }
  };

  const deletePeer = async (peerId: string) => {
    if (!canEdit) return;
    if (!window.confirm(`Delete Phase 1 peer '${peerId}'? (All Phase 2 tunnels under it will be deleted)`)) return;
    setMutating(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await ipsecService.deletePeer(peerId);
      setSuccess(result.message || `Peer '${peerId}' deleted.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete peer");
    } finally {
      setMutating(false);
    }
  };

  const deleteTunnel = async (peerId: string, tunnelId: string) => {
    if (!canEdit) return;
    if (!window.confirm(`Delete Phase 2 tunnel '${tunnelId}' under peer '${peerId}'?`)) return;
    setMutating(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await ipsecService.deleteTunnel(peerId, tunnelId);
      setSuccess(result.message || `Tunnel '${tunnelId}' deleted.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tunnel");
    } finally {
      setMutating(false);
    }
  };

  const deleteVti = async (peerId: string) => {
    if (!canEdit) return;
    if (!window.confirm(`Remove VTI configuration for peer '${peerId}'?`)) return;
    setMutating(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await ipsecService.deleteVti(peerId);
      setSuccess(result.message || "VTI deleted.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete VTI");
    } finally {
      setMutating(false);
    }
  };

  const deletePsk = async (pskId: string) => {
    if (!canEdit) return;
    if (!window.confirm(`Delete PSK '${pskId}'?`)) return;
    setMutating(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await ipsecService.deletePsk(pskId);
      setSuccess(result.message || `PSK '${pskId}' deleted.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete PSK");
    } finally {
      setMutating(false);
    }
  };

  const saveSettings = async () => {
    if (!canEdit) return;
    setSettingsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await ipsecService.updateSettings({
        interfaces: parseCsvList(settingsInterfaces),
        disable_route_autoinstall: disableRouteAutoinstall,
      });
      setSuccess(result.message || "IPsec settings updated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save IPsec settings");
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">IPsec VPN</h1>
            <p className="text-muted-foreground mt-1">
              pfSense-like tunnel workflow: create Phase 1, then add Phase 2 tunnels.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setWizardOpen(true)} disabled={!canEdit || refreshing}>
              <Wand2 className="mr-2 h-4 w-4" />
              Site-to-Site Wizard
            </Button>
            <Button variant="outline" onClick={loadData} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Phase 1</p>
              <p className="mt-1 text-2xl font-bold">{peerCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">IKE Groups</p>
              <p className="mt-1 text-2xl font-bold">{ikeGroupCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">ESP Groups</p>
              <p className="mt-1 text-2xl font-bold">{espGroupCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">PSK Entries</p>
              <p className="mt-1 text-2xl font-bold">{pskCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Runtime</p>
              <div className="mt-1 flex items-center gap-2">
                {!status?.available ? (
                  <Badge variant="outline">
                    <ShieldQuestion className="mr-1 h-3 w-3" />
                    Unavailable
                  </Badge>
                ) : status.established_count > 0 ? (
                  <Badge className="bg-green-600 hover:bg-green-600">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Established
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <ShieldOff className="mr-1 h-3 w-3" />
                    Idle
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {success && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {success}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="tunnels">Tunnels</TabsTrigger>
            <TabsTrigger value="ike">IKE Groups</TabsTrigger>
            <TabsTrigger value="esp">ESP Groups</TabsTrigger>
            <TabsTrigger value="psk">PSK</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="tunnels" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">Phase 1 (Peers)</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      Create a Phase 1 entry, then add one or more Phase 2 tunnels.
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      onClick={() => {
                        setPhase1DialogMode("create");
                        setPhase1DialogPeerId("");
                        setPhase1DialogOpen(true);
                      }}
                      disabled={mutating}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Phase 1
                    </Button>
                  )}
                </div>
                <div className="relative max-w-md mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Filter peers..."
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Loading Phase 1 peers...</div>
                ) : filteredPeers.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No Phase 1 peers found.</div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Peer</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Enabled</TableHead>
                          <TableHead>Local</TableHead>
                          <TableHead>Remote</TableHead>
                          <TableHead>IKE</TableHead>
                          <TableHead>Default ESP</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Phase 2</TableHead>
                          <TableHead>VTI</TableHead>
                          {canEdit && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPeers.map(([peerId, peer]) => {
                          const isSelected = peerId === selectedPeerId;
                          const tunnelCount = Object.keys(peer.tunnels || {}).length;
                          const enabled = !peer.disable;
                          return (
                            <TableRow
                              key={peerId}
                              className={isSelected ? "bg-muted/40" : undefined}
                              onClick={() => setSelectedPeerId(peerId)}
                            >
                              <TableCell className="font-mono font-medium">{peerId}</TableCell>
                              <TableCell>{valueOrDash(peer.description)}</TableCell>
                              <TableCell>{enabled ? "Yes" : "No"}</TableCell>
                              <TableCell className="font-mono">
                                {peer["dhcp-interface"] ? `dhcp:${peer["dhcp-interface"]}` : valueOrDash(peer["local-address"])}
                              </TableCell>
                              <TableCell className="font-mono">{valueOrDash(peer["remote-address"])}</TableCell>
                              <TableCell>{valueOrDash(peer["ike-group"])}</TableCell>
                              <TableCell>{valueOrDash(peer["default-esp-group"])}</TableCell>
                              <TableCell>{valueOrDash(peer["connection-type"])}</TableCell>
                              <TableCell>{tunnelCount}</TableCell>
                              <TableCell className="font-mono">{valueOrDash(peer.vti?.bind)}</TableCell>
                              {canEdit && (
                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="inline-flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setPhase1DialogMode("edit");
                                        setPhase1DialogPeerId(peerId);
                                        setPhase1DialogOpen(true);
                                      }}
                                      disabled={mutating}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedPeerId(peerId);
                                        setPhase2DialogMode("create");
                                        setPhase2DialogPeerId(peerId);
                                        setPhase2DialogTunnelId("");
                                        setPhase2DialogOpen(true);
                                      }}
                                      disabled={mutating}
                                    >
                                      <Plus className="mr-2 h-4 w-4" />
                                      Phase 2
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => deletePeer(peerId)}
                                      disabled={mutating}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">Phase 2 (Tunnels)</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      {selectedPeerId ? (
                        <span>
                          Showing Phase 2 tunnels for <span className="font-mono">{selectedPeerId}</span>
                        </span>
                      ) : (
                        "Select a Phase 1 peer above to manage Phase 2 tunnels."
                      )}
                    </div>
                  </div>
                  {canEdit && selectedPeerId && (
                    <Button
                      onClick={() => {
                        setPhase2DialogMode("create");
                        setPhase2DialogPeerId(selectedPeerId);
                        setPhase2DialogTunnelId("");
                        setPhase2DialogOpen(true);
                      }}
                      disabled={mutating}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Phase 2
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedPeerId || !selectedPeer ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Select a Phase 1 peer to view tunnels.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-3 text-sm">
                      <div className="rounded-md border p-3">
                        <div className="text-xs text-muted-foreground">IKE Group</div>
                        <div className="mt-1">{valueOrDash(selectedPeer["ike-group"])}</div>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="text-xs text-muted-foreground">Default ESP Group</div>
                        <div className="mt-1">{valueOrDash(selectedPeer["default-esp-group"])}</div>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="text-xs text-muted-foreground">Force UDP Encapsulation</div>
                        <div className="mt-1">{selectedPeer["force-udp-encapsulation"] ? "Yes" : "No"}</div>
                      </div>
                    </div>

                    {selectedPeerTunnelIds.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        No Phase 2 tunnels configured for this peer.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>ID</TableHead>
                              <TableHead>Enabled</TableHead>
                              <TableHead>Local</TableHead>
                              <TableHead>L.Port</TableHead>
                              <TableHead>Remote</TableHead>
                              <TableHead>R.Port</TableHead>
                              <TableHead>ESP</TableHead>
                              <TableHead>Protocol</TableHead>
                              <TableHead>Priority</TableHead>
                              {canEdit && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedPeerTunnelIds.map((tunnelId) => {
                              const tunnel: any = (selectedPeer.tunnels || {})[tunnelId] || {};
                              const enabled = !Object.prototype.hasOwnProperty.call(tunnel, "disable");
                              const espValue = tunnel["esp-group"] || selectedPeer["default-esp-group"] || "";
                              return (
                                <TableRow key={tunnelId}>
                                  <TableCell className="font-mono font-medium">{tunnelId}</TableCell>
                                  <TableCell>{enabled ? "Yes" : "No"}</TableCell>
                                  <TableCell className="font-mono">{valueOrDash(tunnel?.local?.prefix)}</TableCell>
                                  <TableCell className="font-mono">{valueOrDash(tunnel?.local?.port)}</TableCell>
                                  <TableCell className="font-mono">{valueOrDash(tunnel?.remote?.prefix)}</TableCell>
                                  <TableCell className="font-mono">{valueOrDash(tunnel?.remote?.port)}</TableCell>
                                  <TableCell>{valueOrDash(espValue)}</TableCell>
                                  <TableCell>{valueOrDash(tunnel?.protocol)}</TableCell>
                                  <TableCell>{valueOrDash(tunnel?.priority)}</TableCell>
                                  {canEdit && (
                                    <TableCell className="text-right">
                                      <div className="inline-flex gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setPhase2DialogMode("edit");
                                            setPhase2DialogPeerId(selectedPeerId);
                                            setPhase2DialogTunnelId(tunnelId);
                                            setPhase2DialogOpen(true);
                                          }}
                                          disabled={mutating}
                                        >
                                          <Pencil className="mr-2 h-4 w-4" />
                                          Edit
                                        </Button>
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => deleteTunnel(selectedPeerId, tunnelId)}
                                          disabled={mutating}
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          Delete
                                        </Button>
                                      </div>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    <div className="rounded-lg border p-4 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium">VTI (Route-Based)</div>
                          <div className="text-sm text-muted-foreground">
                            Optional route-based config. Not required for policy-based Phase 2 tunnels.
                          </div>
                        </div>
                        {canEdit && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setVtiDialogPeerId(selectedPeerId);
                                setVtiDialogOpen(true);
                              }}
                              disabled={mutating}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Configure
                            </Button>
                            {selectedPeer.vti?.bind && (
                              <Button
                                variant="destructive"
                                onClick={() => deleteVti(selectedPeerId)}
                                disabled={mutating}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid gap-3 md:grid-cols-3 text-sm mt-3">
                        <div>
                          <div className="text-xs text-muted-foreground">Bind</div>
                          <div className="mt-1 font-mono">{valueOrDash(selectedPeer.vti?.bind)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">ESP Group</div>
                          <div className="mt-1">{valueOrDash(selectedPeer.vti?.["esp-group"])}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Traffic Selector</div>
                          <div className="mt-1 font-mono text-xs">
                            {(() => {
                              const ts: any = selectedPeer.vti?.["traffic-selector"] || null;
                              const local = ts?.local?.prefix ? `L:${ts.local.prefix}` : "";
                              const remote = ts?.remote?.prefix ? `R:${ts.remote.prefix}` : "";
                              const combined = [local, remote].filter(Boolean).join(" ");
                              return combined || "-";
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ike" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">IKE Groups</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      Phase 1 cryptographic settings and proposals.
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      onClick={() => {
                        setIkeDialogMode("create");
                        setIkeDialogName("");
                        setIkeDialogOpen(true);
                      }}
                      disabled={mutating}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add IKE Group
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {ikeGroupNames.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No IKE groups configured.</div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Key Exchange</TableHead>
                          <TableHead>Close Action</TableHead>
                          <TableHead>Lifetime</TableHead>
                          <TableHead>DPD</TableHead>
                          <TableHead>Proposals</TableHead>
                          {canEdit && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ikeGroupNames.map((name) => {
                          const group = config?.["ike-group"]?.[name];
                          if (!group) return null;
                          const dpd = group["dead-peer-detection"] || null;
                          const dpdSummary = dpd?.action
                            ? `${dpd.action} ${valueOrDash(dpd.interval)}/${valueOrDash(dpd.timeout)}`
                            : "-";
                          return (
                            <TableRow key={name}>
                              <TableCell className="font-mono font-medium">{name}</TableCell>
                              <TableCell>{valueOrDash(group["key-exchange"])}</TableCell>
                              <TableCell>{valueOrDash(group["close-action"] || null)}</TableCell>
                              <TableCell>{valueOrDash(group.lifetime)}</TableCell>
                              <TableCell>{dpdSummary}</TableCell>
                              <TableCell>{Object.keys(group.proposals || {}).length}</TableCell>
                              {canEdit && (
                                <TableCell className="text-right">
                                  <div className="inline-flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setIkeDialogMode("edit");
                                        setIkeDialogName(name);
                                        setIkeDialogOpen(true);
                                      }}
                                      disabled={mutating}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => deleteIkeGroup(name)}
                                      disabled={mutating}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="esp" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">ESP Groups</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      Phase 2 cryptographic settings and proposals.
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      onClick={() => {
                        setEspDialogMode("create");
                        setEspDialogName("");
                        setEspDialogOpen(true);
                      }}
                      disabled={mutating}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add ESP Group
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {espGroupNames.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No ESP groups configured.</div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Mode</TableHead>
                          <TableHead>Lifetime</TableHead>
                          <TableHead>PFS</TableHead>
                          <TableHead>Proposals</TableHead>
                          {canEdit && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {espGroupNames.map((name) => {
                          const group = config?.["esp-group"]?.[name];
                          if (!group) return null;
                          return (
                            <TableRow key={name}>
                              <TableCell className="font-mono font-medium">{name}</TableCell>
                              <TableCell>{valueOrDash(group.mode)}</TableCell>
                              <TableCell>{valueOrDash(group.lifetime)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  <KeyRound className="mr-1 h-3 w-3" />
                                  {valueOrDash(group.pfs)}
                                </Badge>
                              </TableCell>
                              <TableCell>{Object.keys(group.proposals || {}).length}</TableCell>
                              {canEdit && (
                                <TableCell className="text-right">
                                  <div className="inline-flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setEspDialogMode("edit");
                                        setEspDialogName(name);
                                        setEspDialogOpen(true);
                                      }}
                                      disabled={mutating}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => deleteEspGroup(name)}
                                      disabled={mutating}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="psk" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">Pre-Shared Keys</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      ID selectors and shared secrets used by peers configured for PSK.
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      onClick={() => {
                        setPskDialogMode("create");
                        setPskDialogName("");
                        setPskDialogOpen(true);
                      }}
                      disabled={mutating}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add PSK
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {existingPskIds.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No PSK entries configured.</div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>PSK</TableHead>
                          <TableHead>IDs</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Secret</TableHead>
                          {canEdit && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {existingPskIds.map((pskId) => {
                          const entry = config?.psk_secrets?.[pskId];
                          if (!entry) return null;
                          return (
                            <TableRow key={pskId}>
                              <TableCell className="font-mono font-medium">{pskId}</TableCell>
                              <TableCell className="font-mono text-xs">{(entry.ids || []).join(", ") || "-"}</TableCell>
                              <TableCell>{valueOrDash(entry.secret_type || null)}</TableCell>
                              <TableCell>{entry.secret ? "Set" : "-"}</TableCell>
                              {canEdit && (
                                <TableCell className="text-right">
                                  <div className="inline-flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setPskDialogMode("edit");
                                        setPskDialogName(pskId);
                                        setPskDialogOpen(true);
                                      }}
                                      disabled={mutating}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => deletePsk(pskId)}
                                      disabled={mutating}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Global Settings</CardTitle>
                <div className="text-sm text-muted-foreground mt-1">
                  Configure global IPsec interfaces and options (VyOS-specific).
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!settings && (
                  <div className="text-sm text-muted-foreground">
                    Settings are unavailable (no active instance, or the device does not support the endpoint).
                  </div>
                )}

                <div className="space-y-2">
                  <Label>IPsec Interfaces</Label>
                  <Input
                    value={settingsInterfaces}
                    onChange={(event) => setSettingsInterfaces(event.target.value)}
                    placeholder="eth0, eth1"
                    disabled={!canEdit || settingsSaving}
                    list="ipsec-interface-options"
                  />
                  <datalist id="ipsec-interface-options">
                    {interfaceNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <div className="text-xs text-muted-foreground">
                    Comma-separated. These are the interfaces VyOS uses for IPsec (similar to pfSense Phase 1 interface selection).
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Disable Route Auto-Install</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={disableRouteAutoinstall}
                      onCheckedChange={(value) => setDisableRouteAutoinstall(Boolean(value))}
                      disabled={!canEdit || settingsSaving}
                    />
                    <span className="text-sm text-muted-foreground">Enable</span>
                  </div>
                </div>

                {canEdit && (
                  <div className="flex justify-end">
                    <Button onClick={saveSettings} disabled={settingsSaving}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${settingsSaving ? "animate-spin" : ""}`} />
                      Save Settings
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="mt-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">IPsec Logs</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Helpful for troubleshooting IKE/ESP negotiation (search for <span className="font-mono">charon</span>,{" "}
                  <span className="font-mono">ipsec</span>, <span className="font-mono">ike</span>,{" "}
                  <span className="font-mono">esp</span>).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleLogsDownload} disabled={logsDownloading}>
                  <Download className="mr-2 h-4 w-4" />
                  {logsDownloading ? "Downloading..." : "Download"}
                </Button>
                <Button
                  variant={logsAutoRefresh ? "default" : "outline"}
                  onClick={() => setLogsAutoRefresh((previous) => !previous)}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${logsAutoRefresh ? "animate-spin" : ""}`} />
                  Auto-refresh
                </Button>
                <Button variant="outline" onClick={loadLogs} disabled={logsRefreshing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${logsRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="mt-1 text-sm font-medium">{logs?.source_command || "-"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Returned</p>
                  <p className="mt-1 text-2xl font-bold">{logs?.returned_lines || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total in Output</p>
                  <p className="mt-1 text-2xl font-bold">{logs?.total_lines || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="mt-1">
                    <Badge variant={logs?.available ? "default" : "secondary"}>
                      {logs?.available ? "Available" : "Unavailable"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {logsError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <span>{logsError}</span>
                </div>
              </div>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Line Count</p>
                  <Select value={logsLineCount} onValueChange={setLogsLineCount}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                      <SelectItem value="1000">1000</SelectItem>
                      <SelectItem value="2000">2000</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Log Source</p>
                  <Select value={logsSource} onValueChange={(value) => setLogsSource(value as SystemLogSource)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="syslog">Syslog (show log)</SelectItem>
                      <SelectItem value="tail">Tail (show log tail)</SelectItem>
                      <SelectItem value="system">System (show system logs)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs text-muted-foreground">Search</p>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={logsSearchInput}
                        onChange={(event) => setLogsSearchInput(event.target.value)}
                        placeholder="Match in raw log lines..."
                        className="pl-9"
                      />
                    </div>
                    <Button onClick={() => setLogsSearchFilter(logsSearchInput.trim())}>Apply</Button>
                    {logsSearchFilter && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setLogsSearchInput("");
                          setLogsSearchFilter("");
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Log Entries</CardTitle>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Loading logs...</div>
                ) : logEntries.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No log entries found.</div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">Timestamp</TableHead>
                          <TableHead className="w-[180px]">Process</TableHead>
                          <TableHead className="w-[110px]">Severity</TableHead>
                          <TableHead>Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logEntries.map((entry, index) => (
                          <TableRow key={`${entry.timestamp || "ts"}-${entry.process || "proc"}-${index}`}>
                            <TableCell className="font-mono text-xs">{entry.timestamp || "-"}</TableCell>
                            <TableCell className="font-mono text-xs">{entry.process || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={severityColor(entry.severity)}>
                                {(entry.severity || "unknown").toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{entry.message || entry.raw}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <SiteToSiteWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          interfaceOptions={interfaceOptions}
          existingPeerIds={existingPeerIds}
          existingIkeGroups={ikeGroupNames}
          existingEspGroups={espGroupNames}
          existingPskIds={existingPskIds}
          onSuccess={async (message) => {
            setSuccess(message);
            await loadData();
          }}
        />

        <IkeGroupDialog
          open={ikeDialogOpen}
          mode={ikeDialogMode}
          existingNames={ikeGroupNames}
          groupName={ikeDialogMode === "edit" ? ikeDialogName : undefined}
          group={ikeDialogMode === "edit" ? (config?.["ike-group"]?.[ikeDialogName] ?? null) : null}
          onOpenChange={(open) => {
            setIkeDialogOpen(open);
            if (!open) {
              setIkeDialogMode("create");
              setIkeDialogName("");
            }
          }}
          onSuccess={handleSuccess}
        />

        <EspGroupDialog
          open={espDialogOpen}
          mode={espDialogMode}
          existingNames={espGroupNames}
          groupName={espDialogMode === "edit" ? espDialogName : undefined}
          group={espDialogMode === "edit" ? (config?.["esp-group"]?.[espDialogName] ?? null) : null}
          onOpenChange={(open) => {
            setEspDialogOpen(open);
            if (!open) {
              setEspDialogMode("create");
              setEspDialogName("");
            }
          }}
          onSuccess={handleSuccess}
        />

        <Phase1Dialog
          open={phase1DialogOpen}
          mode={phase1DialogMode}
          existingPeerIds={existingPeerIds}
          peerId={phase1DialogMode === "edit" ? phase1DialogPeerId : undefined}
          peer={phase1DialogMode === "edit" ? (config?.["site-to-site"]?.[phase1DialogPeerId] ?? null) : null}
          ikeGroups={config?.["ike-group"] || {}}
          ikeGroupNames={ikeGroupNames}
          espGroupNames={espGroupNames}
          interfaceNames={interfaceNames}
          onOpenChange={(open) => {
            setPhase1DialogOpen(open);
            if (!open) {
              setPhase1DialogMode("create");
              setPhase1DialogPeerId("");
            }
          }}
          onSuccess={(message) => {
            handleSuccess(message);
            if (phase1DialogMode === "create" && phase1DialogPeerId) {
              setSelectedPeerId(phase1DialogPeerId);
            }
          }}
        />

        <Phase2Dialog
          open={phase2DialogOpen}
          mode={phase2DialogMode}
          peerId={phase2DialogPeerId}
          existingTunnelIds={phase2DialogPeerId ? sortedNumericKeys(config?.["site-to-site"]?.[phase2DialogPeerId]?.tunnels || {}) : []}
          espGroupNames={espGroupNames}
          espGroups={config?.["esp-group"] || {}}
          tunnelId={phase2DialogMode === "edit" ? phase2DialogTunnelId : undefined}
          tunnel={
            phase2DialogMode === "edit"
              ? (config?.["site-to-site"]?.[phase2DialogPeerId]?.tunnels || {})[phase2DialogTunnelId] || null
              : null
          }
          defaultEspGroup={phase2DialogPeerId ? (config?.["site-to-site"]?.[phase2DialogPeerId]?.["default-esp-group"] ?? null) : null}
          onOpenChange={(open) => {
            setPhase2DialogOpen(open);
            if (!open) {
              setPhase2DialogMode("create");
              setPhase2DialogPeerId("");
              setPhase2DialogTunnelId("");
            }
          }}
          onSuccess={handleSuccess}
        />

        <VtiDialog
          open={vtiDialogOpen}
          peerId={vtiDialogPeerId}
          vti={vtiDialogPeerId ? (config?.["site-to-site"]?.[vtiDialogPeerId]?.vti ?? null) : null}
          espGroupNames={espGroupNames}
          onOpenChange={(open) => {
            setVtiDialogOpen(open);
            if (!open) {
              setVtiDialogPeerId("");
            }
          }}
          onSuccess={handleSuccess}
        />

        <PskDialog
          open={pskDialogOpen}
          mode={pskDialogMode}
          existingNames={existingPskIds}
          pskId={pskDialogMode === "edit" ? pskDialogName : undefined}
          entry={pskDialogMode === "edit" ? (config?.psk_secrets?.[pskDialogName] ?? null) : null}
          onOpenChange={(open) => {
            setPskDialogOpen(open);
            if (!open) {
              setPskDialogMode("create");
              setPskDialogName("");
            }
          }}
          onSuccess={handleSuccess}
        />
      </div>
    </AppLayout>
  );
}
