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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { ipsecService, type SiteToSitePeer } from "@/lib/api/ipsec";

type DialogMode = "create" | "edit";

function valueOrEmpty(value?: string | null): string {
  return value ? value : "";
}

interface Phase1DialogProps {
  open: boolean;
  mode: DialogMode;
  existingPeerIds: string[];
  peerId?: string;
  peer?: SiteToSitePeer | null;
  ikeGroupNames: string[];
  espGroupNames: string[];
  interfaceNames: string[];
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function Phase1Dialog({
  open,
  mode,
  existingPeerIds,
  peerId,
  peer,
  ikeGroupNames,
  espGroupNames,
  interfaceNames,
  onOpenChange,
  onSuccess,
}: Phase1DialogProps) {
  const [peerKey, setPeerKey] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [connectionType, setConnectionType] = useState("initiate");
  const [ikeGroup, setIkeGroup] = useState("");
  const [defaultEspGroup, setDefaultEspGroup] = useState("");
  const [localAddress, setLocalAddress] = useState("");
  const [dhcpInterface, setDhcpInterface] = useState("");
  const [remoteAddress, setRemoteAddress] = useState("");

  const [authMode, setAuthMode] = useState("pre-shared-secret");
  const [localId, setLocalId] = useState("");
  const [remoteId, setRemoteId] = useState("");

  const [forceUdpEncapsulation, setForceUdpEncapsulation] = useState(false);
  const [replayWindow, setReplayWindow] = useState("");
  const [virtualAddress, setVirtualAddress] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "create" ? "Add Phase 1" : "Edit Phase 1";
  const descriptionText =
    mode === "create"
      ? "Create a site-to-site peer (Phase 1) entry, then add one or more Phase 2 tunnels."
      : "Update the Phase 1 peer settings.";

  const defaultIkeGroup = useMemo(() => ikeGroupNames[0] || "", [ikeGroupNames]);
  const defaultEspGroupValue = useMemo(() => espGroupNames[0] || "", [espGroupNames]);

  useEffect(() => {
    if (!open) return;

    setError(null);
    if (mode === "edit") {
      const key = peerId || peer?.peer_id || "";
      setPeerKey(key);
      setDescription(valueOrEmpty(peer?.description));
      setEnabled(!peer?.disable);
      setConnectionType(valueOrEmpty(peer?.["connection-type"]) || "initiate");
      setIkeGroup(valueOrEmpty(peer?.["ike-group"]) || defaultIkeGroup);
      setDefaultEspGroup(valueOrEmpty(peer?.["default-esp-group"]) || defaultEspGroupValue);
      setLocalAddress(valueOrEmpty(peer?.["local-address"]));
      setDhcpInterface(valueOrEmpty(peer?.["dhcp-interface"]));
      setRemoteAddress(valueOrEmpty(peer?.["remote-address"]));

      const auth = peer?.authentication || null;
      setAuthMode(valueOrEmpty(auth?.mode) || "pre-shared-secret");
      setLocalId(valueOrEmpty(auth?.["local-id"]));
      setRemoteId(valueOrEmpty(auth?.["remote-id"]));

      setForceUdpEncapsulation(Boolean(peer?.["force-udp-encapsulation"]));
      setReplayWindow(valueOrEmpty(peer?.["replay-window"]));
      setVirtualAddress(valueOrEmpty(peer?.["virtual-address"]));
      return;
    }

    setPeerKey("");
    setDescription("");
    setEnabled(true);
    setConnectionType("initiate");
    setIkeGroup(defaultIkeGroup);
    setDefaultEspGroup(defaultEspGroupValue);
    setLocalAddress("");
    setDhcpInterface("");
    setRemoteAddress("");

    setAuthMode("pre-shared-secret");
    setLocalId("");
    setRemoteId("");

    setForceUdpEncapsulation(false);
    setReplayWindow("");
    setVirtualAddress("");
  }, [open, mode, peerId, peer, defaultIkeGroup, defaultEspGroupValue]);

  const validateForm = (): string | null => {
    const key = peerKey.trim();
    if (!key) return "Peer ID / Remote gateway is required.";
    if (mode === "create" && existingPeerIds.includes(key)) return `Peer '${key}' already exists.`;

    if (!ikeGroup.trim()) return "IKE group is required.";

    if (dhcpInterface.trim() && localAddress.trim()) {
      return "DHCP interface and Local address cannot both be set.";
    }

    if (authMode === "pre-shared-secret") {
      // Not strictly required by VyOS, but recommended since PSK selection uses IDs.
      if (!localId.trim() || !remoteId.trim()) {
        return "Local ID and Remote ID are required for pre-shared-secret auth.";
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
      const request: any = {
        enabled,
        description: description.trim() || null,
        connection_type: connectionType.trim() || null,
        ike_group: ikeGroup.trim() || null,
        default_esp_group: defaultEspGroup.trim() || null,
        local_address: localAddress.trim() || null,
        dhcp_interface: dhcpInterface.trim() || null,
        remote_address: (remoteAddress.trim() || key) || null,
        force_udp_encapsulation: forceUdpEncapsulation,
        replay_window: replayWindow.trim() || null,
        virtual_address: virtualAddress.trim() || null,
        authentication: {
          mode: authMode.trim() || null,
          local_id: localId.trim() || null,
          remote_id: remoteId.trim() || null,
        },
      };

      const result = await ipsecService.upsertPeer(key, request);
      onOpenChange(false);
      onSuccess(result.message || `Peer '${key}' saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Phase 1");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="auth">Authentication</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Peer ID / Remote Gateway</Label>
                <Input
                  value={peerKey}
                  onChange={(event) => setPeerKey(event.target.value)}
                  placeholder="203.0.113.10 or peer.example.com or @RIGHT"
                  disabled={mode === "edit"}
                />
              </div>

              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Branch office"
                />
              </div>

              <div className="space-y-2">
                <Label>Enable</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(Boolean(value))} />
                  <span className="text-sm text-muted-foreground">Enabled</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Connection Type</Label>
                <Select value={connectionType} onValueChange={setConnectionType}>
                  <SelectTrigger>
                    <SelectValue placeholder="initiate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="initiate">initiate</SelectItem>
                    <SelectItem value="trap">trap</SelectItem>
                    <SelectItem value="respond">respond</SelectItem>
                    <SelectItem value="none">none</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>IKE Group</Label>
                <Input
                  value={ikeGroup}
                  onChange={(event) => setIkeGroup(event.target.value)}
                  placeholder="IKE"
                  list="ike-group-options"
                />
                <datalist id="ike-group-options">
                  {ikeGroupNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label>Default ESP Group (optional)</Label>
                <Input
                  value={defaultEspGroup}
                  onChange={(event) => setDefaultEspGroup(event.target.value)}
                  placeholder="ESP"
                  list="esp-group-options"
                />
                <datalist id="esp-group-options">
                  {espGroupNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label>Local Address (optional)</Label>
                <Input
                  value={localAddress}
                  onChange={(event) => setLocalAddress(event.target.value)}
                  placeholder="any or 198.51.100.2"
                />
              </div>

              <div className="space-y-2">
                <Label>DHCP Interface (optional)</Label>
                <Input
                  value={dhcpInterface}
                  onChange={(event) => setDhcpInterface(event.target.value)}
                  placeholder="eth0"
                  list="iface-options"
                />
                <datalist id="iface-options">
                  {interfaceNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Remote Address (optional)</Label>
                <Input
                  value={remoteAddress}
                  onChange={(event) => setRemoteAddress(event.target.value)}
                  placeholder="(defaults to Peer ID)"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="auth" className="mt-4 space-y-4">
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
                <Label>Local ID</Label>
                <Input value={localId} onChange={(event) => setLocalId(event.target.value)} placeholder="@LEFT" />
              </div>
              <div className="space-y-2">
                <Label>Remote ID</Label>
                <Input value={remoteId} onChange={(event) => setRemoteId(event.target.value)} placeholder="@RIGHT" />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              PSK selection is based on the Local ID/Remote ID pair, so keep these consistent with your PSK entries.
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Force UDP Encapsulation</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    checked={forceUdpEncapsulation}
                    onCheckedChange={(value) => setForceUdpEncapsulation(Boolean(value))}
                  />
                  <span className="text-sm text-muted-foreground">Enable</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Replay Window (optional)</Label>
                <Input
                  value={replayWindow}
                  onChange={(event) => setReplayWindow(event.target.value)}
                  placeholder="1024"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Virtual Address (optional)</Label>
                <Input
                  value={virtualAddress}
                  onChange={(event) => setVirtualAddress(event.target.value)}
                  placeholder="(optional)"
                />
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

