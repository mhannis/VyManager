"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PeerDialog } from "@/components/vpn/ipsec/PeerDialog";
import { PskDialog } from "@/components/vpn/ipsec/PskDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { ipsecService, type IPsecConfig, type IPsecStatus } from "@/lib/api/ipsec";
import {
  AlertCircle,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
  Trash2,
} from "lucide-react";

function valueOrDash(value?: string | null): string {
  if (!value) return "-";
  const trimmed = value.trim();
  return trimmed || "-";
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

  const [config, setConfig] = useState<IPsecConfig | null>(null);
  const [status, setStatus] = useState<IPsecStatus | null>(null);

  const [ikeDialogOpen, setIkeDialogOpen] = useState(false);
  const [ikeDialogMode, setIkeDialogMode] = useState<"create" | "edit">("create");
  const [ikeDialogName, setIkeDialogName] = useState("");

  const [espDialogOpen, setEspDialogOpen] = useState(false);
  const [espDialogMode, setEspDialogMode] = useState<"create" | "edit">("create");
  const [espDialogName, setEspDialogName] = useState("");

  const [peerDialogOpen, setPeerDialogOpen] = useState(false);
  const [peerDialogMode, setPeerDialogMode] = useState<"create" | "edit">("create");
  const [peerDialogPeerId, setPeerDialogPeerId] = useState("");

  const [pskDialogOpen, setPskDialogOpen] = useState(false);
  const [pskDialogMode, setPskDialogMode] = useState<"create" | "edit">("create");
  const [pskDialogName, setPskDialogName] = useState("");

  const loadData = async () => {
    try {
      setError(null);
      setSuccess(null);
      setRefreshing(true);
      const [configData, statusData] = await Promise.all([
        ipsecService.getConfig(),
        ipsecService.getStatus().catch(() => null),
      ]);
      setConfig(configData);
      setStatus(statusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load IPsec data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const peerEntries = useMemo(() => Object.entries(config?.["site-to-site"] || {}), [config]);
  const filteredPeers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return peerEntries;
    return peerEntries.filter(([peerId, peer]) => {
      const values = [
        peerId,
        peer.description,
        peer["local-address"],
        peer["remote-address"],
        peer["ike-group"],
        peer["connection-type"],
        peer.vti?.bind,
        peer.vti?.["esp-group"],
      ];
      return values.some((value) => value?.toLowerCase().includes(needle));
    });
  }, [peerEntries, search]);

  const ikeGroupCount = Object.keys(config?.["ike-group"] || {}).length;
  const espGroupCount = Object.keys(config?.["esp-group"] || {}).length;
  const pskCount = Object.keys(config?.psk_secrets || {}).length;
  const peerCount = peerEntries.length;

  const ikeGroupNames = useMemo(() => Object.keys(config?.["ike-group"] || {}).sort(), [config]);
  const espGroupNames = useMemo(() => Object.keys(config?.["esp-group"] || {}).sort(), [config]);
  const existingPeerIds = useMemo(() => Object.keys(config?.["site-to-site"] || {}).sort(), [config]);
  const existingPskIds = useMemo(() => Object.keys(config?.psk_secrets || {}).sort(), [config]);

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
    if (!window.confirm(`Delete peer '${peerId}'?`)) return;
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

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">IPsec VPN</h1>
            <p className="text-muted-foreground mt-1">
              Manage IPsec groups, peers, PSKs, and runtime tunnel status.
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Peers</p>
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

        <Tabs defaultValue="peers" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="peers">Peers</TabsTrigger>
            <TabsTrigger value="ike">IKE Groups</TabsTrigger>
            <TabsTrigger value="esp">ESP Groups</TabsTrigger>
            <TabsTrigger value="psk">PSK</TabsTrigger>
          </TabsList>

          <TabsContent value="peers" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">Site-to-Site Peers</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      Phase 1 peer entries and Phase 2 tunnels or VTI bindings.
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      onClick={() => {
                        setPeerDialogMode("create");
                        setPeerDialogPeerId("");
                        setPeerDialogOpen(true);
                      }}
                      disabled={mutating}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Peer
                    </Button>
                  )}
                </div>
                <div className="relative max-w-md mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Filter by peer, endpoints, group, or VTI..."
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Loading IPsec peers...</div>
                ) : filteredPeers.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No peers found.</div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Peer</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Local Address</TableHead>
                          <TableHead>Remote Address</TableHead>
                          <TableHead>IKE Group</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>VTI</TableHead>
                          <TableHead>Tunnels</TableHead>
                          {canEdit && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPeers.map(([peerId, peer]) => (
                          <TableRow key={peerId}>
                            <TableCell className="font-mono font-medium">{peerId}</TableCell>
                            <TableCell>{valueOrDash(peer.description)}</TableCell>
                            <TableCell className="font-mono">{valueOrDash(peer["local-address"])}</TableCell>
                            <TableCell className="font-mono">{valueOrDash(peer["remote-address"])}</TableCell>
                            <TableCell>{valueOrDash(peer["ike-group"])}</TableCell>
                            <TableCell>{valueOrDash(peer["connection-type"])}</TableCell>
                            <TableCell className="font-mono">{valueOrDash(peer.vti?.bind)}</TableCell>
                            <TableCell>{Object.keys(peer.tunnels || {}).length || "-"}</TableCell>
                            {canEdit && (
                              <TableCell className="text-right">
                                <div className="inline-flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setPeerDialogMode("edit");
                                      setPeerDialogPeerId(peerId);
                                      setPeerDialogOpen(true);
                                    }}
                                    disabled={mutating}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
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
                        ))}
                      </TableBody>
                    </Table>
                  </div>
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
                          const dpdSummary = dpd?.action ? `${dpd.action} ${valueOrDash(dpd.interval)}/${valueOrDash(dpd.timeout)}` : "-";
                          return (
                            <TableRow key={name}>
                              <TableCell className="font-mono font-medium">{name}</TableCell>
                              <TableCell>{valueOrDash(group["key-exchange"])}</TableCell>
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
        </Tabs>

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

        <PeerDialog
          open={peerDialogOpen}
          mode={peerDialogMode}
          existingPeerIds={existingPeerIds}
          peerId={peerDialogMode === "edit" ? peerDialogPeerId : undefined}
          peer={peerDialogMode === "edit" ? (config?.["site-to-site"]?.[peerDialogPeerId] ?? null) : null}
          ikeGroupNames={ikeGroupNames}
          espGroupNames={espGroupNames}
          onOpenChange={(open) => {
            setPeerDialogOpen(open);
            if (!open) {
              setPeerDialogMode("create");
              setPeerDialogPeerId("");
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
