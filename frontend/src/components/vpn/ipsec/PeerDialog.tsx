"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { ipsecService, type SiteToSitePeer } from "@/lib/api/ipsec";

type DialogMode = "create" | "edit";
type PeerMode = "policy" | "vti";

interface TunnelFormState {
  tunnel_id: string;
  local_prefix: string;
  remote_prefix: string;
  esp_group: string;
}

function nextNumericId(existing: string[]): string {
  const taken = new Set<number>();
  for (const raw of existing) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) taken.add(parsed);
  }
  for (let id = 1; id < 10000; id++) {
    if (!taken.has(id)) return String(id);
  }
  return "1";
}

function valueOrEmpty(value?: string | null): string {
  return value ? value : "";
}

interface PeerDialogProps {
  open: boolean;
  mode: DialogMode;
  existingPeerIds: string[];
  peerId?: string;
  peer?: SiteToSitePeer | null;
  ikeGroupNames: string[];
  espGroupNames: string[];
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function PeerDialog({
  open,
  mode,
  existingPeerIds,
  peerId,
  peer,
  ikeGroupNames,
  espGroupNames,
  onOpenChange,
  onSuccess,
}: PeerDialogProps) {
  const [peerKey, setPeerKey] = useState("");
  const [description, setDescription] = useState("");
  const [connectionType, setConnectionType] = useState("initiate");
  const [ikeGroup, setIkeGroup] = useState("");
  const [localAddress, setLocalAddress] = useState("");
  const [remoteAddress, setRemoteAddress] = useState("");

  const [authMode, setAuthMode] = useState("pre-shared-secret");
  const [localId, setLocalId] = useState("");
  const [remoteId, setRemoteId] = useState("");

  const [peerMode, setPeerMode] = useState<PeerMode>("policy");
  const [tunnels, setTunnels] = useState<TunnelFormState[]>([]);
  const [vtiBind, setVtiBind] = useState("");
  const [vtiEspGroup, setVtiEspGroup] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "create" ? "Create Site-to-Site Peer" : "Edit Site-to-Site Peer";
  const dialogDescription =
    mode === "create"
      ? "Defines Phase 1 settings for a remote peer, plus Phase 2 tunnels or VTI binding."
      : "Update the remote peer and its tunnels/VTI binding.";

  const defaultIkeGroup = useMemo(() => ikeGroupNames[0] || "", [ikeGroupNames]);
  const defaultEspGroup = useMemo(() => espGroupNames[0] || "", [espGroupNames]);

  const initialTunnelState = useMemo<TunnelFormState[]>(() => {
    const raw = peer?.tunnels || null;
    if (!raw) return [];

    const mapped: TunnelFormState[] = [];
    for (const [tunnelId, tunnelValue] of Object.entries(raw)) {
      const tunnel: any = tunnelValue || {};
      const localPrefix = typeof tunnel?.local?.prefix === "string" ? tunnel.local.prefix : "";
      const remotePrefix = typeof tunnel?.remote?.prefix === "string" ? tunnel.remote.prefix : "";
      const espGroup = typeof tunnel?.["esp-group"] === "string" ? tunnel["esp-group"] : "";

      mapped.push({
        tunnel_id: String(tunnelId),
        local_prefix: localPrefix,
        remote_prefix: remotePrefix,
        esp_group: espGroup,
      });
    }

    mapped.sort((left, right) => Number(left.tunnel_id) - Number(right.tunnel_id));
    return mapped;
  }, [peer]);

  useEffect(() => {
    if (!open) return;

    setError(null);
    if (mode === "edit") {
      const key = peerId || peer?.peer_id || "";
      setPeerKey(key);
      setDescription(valueOrEmpty(peer?.description));
      setConnectionType(valueOrEmpty(peer?.["connection-type"]) || "initiate");
      setIkeGroup(valueOrEmpty(peer?.["ike-group"]));
      setLocalAddress(valueOrEmpty(peer?.["local-address"]));
      setRemoteAddress(valueOrEmpty(peer?.["remote-address"]));

      const auth = peer?.authentication || null;
      setAuthMode(valueOrEmpty(auth?.mode) || "pre-shared-secret");
      setLocalId(valueOrEmpty(auth?.["local-id"]));
      setRemoteId(valueOrEmpty(auth?.["remote-id"]));

      const vtiBindValue = valueOrEmpty(peer?.vti?.bind);
      const vtiEspValue = valueOrEmpty(peer?.vti?.["esp-group"]);
      if (vtiBindValue) {
        setPeerMode("vti");
        setVtiBind(vtiBindValue);
        setVtiEspGroup(vtiEspValue);
        setTunnels(initialTunnelState);
      } else {
        setPeerMode("policy");
        setTunnels(initialTunnelState.length ? initialTunnelState : [{ tunnel_id: "1", local_prefix: "", remote_prefix: "", esp_group: defaultEspGroup }]);
        setVtiBind("");
        setVtiEspGroup("");
      }

      return;
    }

    setPeerKey("");
    setDescription("");
    setConnectionType("initiate");
    setIkeGroup(defaultIkeGroup);
    setLocalAddress("");
    setRemoteAddress("");

    setAuthMode("pre-shared-secret");
    setLocalId("");
    setRemoteId("");

    setPeerMode("policy");
    setTunnels([{ tunnel_id: "1", local_prefix: "", remote_prefix: "", esp_group: defaultEspGroup }]);
    setVtiBind("");
    setVtiEspGroup(defaultEspGroup);
  }, [open, mode, peerId, peer, initialTunnelState, defaultIkeGroup, defaultEspGroup]);

  const addTunnel = () => {
    setTunnels((prev) => [
      ...prev,
      {
        tunnel_id: nextNumericId(prev.map((entry) => entry.tunnel_id)),
        local_prefix: "",
        remote_prefix: "",
        esp_group: defaultEspGroup,
      },
    ]);
  };

  const updateTunnel = (index: number, patch: Partial<TunnelFormState>) => {
    setTunnels((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const removeTunnel = (index: number) => {
    setTunnels((prev) => prev.filter((_, idx) => idx !== index));
  };

  const validateForm = (): string | null => {
    const key = peerKey.trim();
    if (!key) return "Peer ID is required.";
    if (mode === "create" && existingPeerIds.includes(key)) return `Peer '${key}' already exists.`;

    if (peerMode === "vti") {
      if (!vtiBind.trim()) return "VTI bind interface is required.";
      if (!vtiEspGroup.trim()) return "VTI ESP group is required.";
      return null;
    }

    if (tunnels.length === 0) return null;
    const ids = new Set<string>();
    for (const tunnel of tunnels) {
      const tid = tunnel.tunnel_id.trim();
      if (!tid) return "Each tunnel must have an ID.";
      if (!/^[1-9][0-9]{0,3}$/.test(tid)) return `Tunnel ID '${tid}' must be 1-9999.`;
      if (ids.has(tid)) return `Duplicate tunnel ID '${tid}'.`;
      ids.add(tid);

      if (!tunnel.local_prefix.trim() || !tunnel.remote_prefix.trim() || !tunnel.esp_group.trim()) {
        return `Tunnel ${tid} requires local prefix, remote prefix, and ESP group.`;
      }
    }

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const key = peerKey.trim();
      const request = {
        description: description.trim() || null,
        connection_type: connectionType.trim() || null,
        ike_group: ikeGroup.trim() || null,
        local_address: localAddress.trim() || null,
        remote_address: remoteAddress.trim() || null,
        authentication: {
          mode: authMode.trim() || null,
          local_id: localId.trim() || null,
          remote_id: remoteId.trim() || null,
        },
        vti:
          peerMode === "vti"
            ? {
                bind: vtiBind.trim() || null,
                esp_group: vtiEspGroup.trim() || null,
              }
            : null,
        tunnels:
          peerMode === "policy"
            ? tunnels.map((tunnel) => ({
                tunnel_id: tunnel.tunnel_id.trim(),
                local_prefix: tunnel.local_prefix.trim() || null,
                remote_prefix: tunnel.remote_prefix.trim() || null,
                esp_group: tunnel.esp_group.trim() || null,
              }))
            : [],
      };

      const result = await ipsecService.upsertPeer(key, request);
      onOpenChange(false);
      onSuccess(result.message || `Peer '${key}' saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save peer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Peer ID</Label>
            <Input
              value={peerKey}
              onChange={(event) => setPeerKey(event.target.value)}
              placeholder="203.0.113.10 or peer.example.com"
              disabled={mode === "edit"}
            />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Branch office" />
          </div>
          <div className="space-y-2">
            <Label>Connection Type</Label>
            <Select value={connectionType} onValueChange={setConnectionType}>
              <SelectTrigger>
                <SelectValue placeholder="initiate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="initiate">initiate</SelectItem>
                <SelectItem value="respond">respond</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>IKE Group</Label>
            <Input
              value={ikeGroup}
              onChange={(event) => setIkeGroup(event.target.value)}
              placeholder="IKE-GROUP-1"
              list="ike-group-options"
            />
            <datalist id="ike-group-options">
              {ikeGroupNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>Local Address (optional)</Label>
            <Input value={localAddress} onChange={(event) => setLocalAddress(event.target.value)} placeholder="198.51.100.2" />
          </div>
          <div className="space-y-2">
            <Label>Remote Address (optional)</Label>
            <Input value={remoteAddress} onChange={(event) => setRemoteAddress(event.target.value)} placeholder="203.0.113.10" />
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="font-medium">Authentication</div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={authMode} onValueChange={setAuthMode}>
                <SelectTrigger>
                  <SelectValue placeholder="pre-shared-secret" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre-shared-secret">pre-shared-secret</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Local ID (optional)</Label>
              <Input value={localId} onChange={(event) => setLocalId(event.target.value)} placeholder="@local-id" />
            </div>
            <div className="space-y-2">
              <Label>Remote ID (optional)</Label>
              <Input value={remoteId} onChange={(event) => setRemoteId(event.target.value)} placeholder="@remote-id" />
            </div>
          </div>
        </div>

        <Tabs value={peerMode} onValueChange={(value) => setPeerMode(value as PeerMode)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="policy">Policy Tunnels</TabsTrigger>
            <TabsTrigger value="vti">VTI (Route-Based)</TabsTrigger>
          </TabsList>

          <TabsContent value="policy" className="mt-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">Tunnels (Phase 2)</div>
                <Button type="button" variant="outline" size="sm" onClick={addTunnel}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Tunnel
                </Button>
              </div>

              {tunnels.length === 0 ? (
                <div className="text-sm text-muted-foreground">No tunnels configured.</div>
              ) : (
                <div className="space-y-3">
                  {tunnels.map((tunnel, index) => (
                    <div key={`${tunnel.tunnel_id}-${index}`} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 flex-1">
                          <div className="space-y-2">
                            <Label>Id</Label>
                            <Input
                              value={tunnel.tunnel_id}
                              onChange={(event) => updateTunnel(index, { tunnel_id: event.target.value })}
                              placeholder="1"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Local Prefix</Label>
                            <Input
                              value={tunnel.local_prefix}
                              onChange={(event) => updateTunnel(index, { local_prefix: event.target.value })}
                              placeholder="10.0.0.0/24"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Remote Prefix</Label>
                            <Input
                              value={tunnel.remote_prefix}
                              onChange={(event) => updateTunnel(index, { remote_prefix: event.target.value })}
                              placeholder="10.1.0.0/24"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>ESP Group</Label>
                            <Input
                              value={tunnel.esp_group}
                              onChange={(event) => updateTunnel(index, { esp_group: event.target.value })}
                              placeholder="ESP-GROUP-1"
                              list="esp-group-options"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTunnel(index)}
                          title="Remove tunnel"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <datalist id="esp-group-options">
                {espGroupNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
          </TabsContent>

          <TabsContent value="vti" className="mt-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="font-medium">VTI Binding</div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Bind Interface</Label>
                  <Input
                    value={vtiBind}
                    onChange={(event) => setVtiBind(event.target.value)}
                    placeholder="vti0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>ESP Group</Label>
                  <Input
                    value={vtiEspGroup}
                    onChange={(event) => setVtiEspGroup(event.target.value)}
                    placeholder="ESP-GROUP-1"
                    list="esp-group-options"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

