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
import { AlertCircle, Loader2, Save, Trash2 } from "lucide-react";
import { ipsecService, type IKEGroup, type SiteToSitePeer } from "@/lib/api/ipsec";
import {
  DH_GROUP_OPTIONS,
  IKE_CLOSE_ACTION_OPTIONS,
  IKE_PRF_OPTIONS,
  IPSEC_ENCRYPTION_OPTIONS,
  IPSEC_HASH_OPTIONS,
} from "@/lib/ipsec/options";

type DialogMode = "create" | "edit";

function valueOrEmpty(value?: string | null): string {
  return value ? value : "";
}

interface ProposalFormState {
  proposal_id: string;
  encryption: string;
  hash: string;
  dh_group: string;
  prf: string;
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

interface Phase1DialogProps {
  open: boolean;
  mode: DialogMode;
  existingPeerIds: string[];
  peerId?: string;
  peer?: SiteToSitePeer | null;
  ikeGroups: Record<string, IKEGroup>;
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
  ikeGroups,
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

  const [updateIkeGroup, setUpdateIkeGroup] = useState(false);
  const [ikeKeyExchange, setIkeKeyExchange] = useState("ikev2");
  const [ikeCloseAction, setIkeCloseAction] = useState("");
  const [ikeLifetime, setIkeLifetime] = useState("");
  const [ikeDpdAction, setIkeDpdAction] = useState("");
  const [ikeDpdInterval, setIkeDpdInterval] = useState("");
  const [ikeDpdTimeout, setIkeDpdTimeout] = useState("");
  const [ikeProposals, setIkeProposals] = useState<ProposalFormState[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "create" ? "Add Phase 1" : "Edit Phase 1";
  const descriptionText =
    mode === "create"
      ? "Create a site-to-site peer (Phase 1) entry, then add one or more Phase 2 tunnels."
      : "Update the Phase 1 peer settings.";

  const defaultIkeGroup = useMemo(() => ikeGroupNames[0] || "", [ikeGroupNames]);
  const defaultEspGroupValue = useMemo(() => espGroupNames[0] || "", [espGroupNames]);

  const loadIkeGroup = (name: string) => {
    const group = ikeGroups?.[name] || null;
    setIkeKeyExchange(group?.["key-exchange"] || "ikev2");
    setIkeCloseAction(group?.["close-action"] || "");
    setIkeLifetime(group?.lifetime || "");

    const dpd = (group as any)?.["dead-peer-detection"] || null;
    setIkeDpdAction(dpd?.action || "");
    setIkeDpdInterval(dpd?.interval || "");
    setIkeDpdTimeout(dpd?.timeout || "");

    const entries = Object.values(group?.proposals || {});
    const mapped = entries.map((proposal) => ({
      proposal_id: proposal.proposal_id || "",
      encryption: proposal.encryption || "",
      hash: proposal.hash || "",
      dh_group: proposal["dh-group"] || "",
      prf: proposal.prf || "",
    }));
    mapped.sort((left, right) => Number(left.proposal_id) - Number(right.proposal_id));
    setIkeProposals(
      mapped.length
        ? mapped
        : [
            {
              proposal_id: "1",
              encryption: "aes256",
              hash: "sha256",
              dh_group: "14",
              prf: "prfsha256",
            },
          ]
    );
  };

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

      // By default, avoid modifying shared IKE groups when editing an existing peer.
      setUpdateIkeGroup(false);
      loadIkeGroup(valueOrEmpty(peer?.["ike-group"]) || defaultIkeGroup);
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

    setUpdateIkeGroup(true);
    loadIkeGroup(defaultIkeGroup);
  }, [open, mode, peerId, peer, defaultIkeGroup, defaultEspGroupValue]);

  const validateForm = (): string | null => {
    const key = peerKey.trim();
    if (!key) return "Peer ID / Remote gateway is required.";
    if (mode === "create" && existingPeerIds.includes(key)) return `Peer '${key}' already exists.`;

    if (!ikeGroup.trim()) return "IKE group is required.";
    if (!updateIkeGroup && !ikeGroups?.[ikeGroup.trim()]) {
      return `IKE group '${ikeGroup.trim()}' does not exist. Select an existing group, or enable 'Update IKE Group' to create it.`;
    }

    if (dhcpInterface.trim() && localAddress.trim()) {
      return "DHCP interface and Local address cannot both be set.";
    }

    if (authMode === "pre-shared-secret") {
      // Not strictly required by VyOS, but recommended since PSK selection uses IDs.
      if (!localId.trim() || !remoteId.trim()) {
        return "Local ID and Remote ID are required for pre-shared-secret auth.";
      }
    }

    if (updateIkeGroup) {
      if (!ikeProposals.length) return "At least one Phase 1 proposal is required.";
      const ids = new Set<string>();
      for (const proposal of ikeProposals) {
        const pid = proposal.proposal_id.trim();
        if (!pid) return "Each Phase 1 proposal must have an ID.";
        if (!/^[1-9][0-9]{0,3}$/.test(pid)) return `Proposal ID '${pid}' must be 1-9999.`;
        if (ids.has(pid)) return `Duplicate proposal ID '${pid}'.`;
        ids.add(pid);
        if (!proposal.encryption.trim() || !proposal.hash.trim()) {
          return `Proposal ${pid} requires encryption and hash.`;
        }
      }
    }

    return null;
  };

  const addIkeProposal = () => {
    setIkeProposals((prev) => [
      ...prev,
      {
        proposal_id: nextNumericId(prev.map((entry) => entry.proposal_id)),
        encryption: "aes256",
        hash: "sha256",
        dh_group: "14",
        prf: "prfsha256",
      },
    ]);
  };

  const updateIkeProposal = (index: number, patch: Partial<ProposalFormState>) => {
    setIkeProposals((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const removeIkeProposal = (index: number) => {
    setIkeProposals((prev) => prev.filter((_, idx) => idx !== index));
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

      if (updateIkeGroup) {
        const deadPeerDetection =
          ikeDpdAction.trim() || ikeDpdInterval.trim() || ikeDpdTimeout.trim()
            ? {
                action: ikeDpdAction.trim() || null,
                interval: ikeDpdInterval.trim() || null,
                timeout: ikeDpdTimeout.trim() || null,
              }
            : null;

        await ipsecService.upsertIkeGroup(ikeGroup.trim(), {
          key_exchange: ikeKeyExchange.trim() || null,
          close_action: ikeCloseAction.trim() || null,
          lifetime: ikeLifetime.trim() || null,
          dead_peer_detection: deadPeerDetection,
          proposals: ikeProposals.map((proposal) => ({
            proposal_id: proposal.proposal_id.trim(),
            encryption: proposal.encryption.trim() || null,
            hash: proposal.hash.trim() || null,
            dh_group: proposal.dh_group.trim() || null,
            prf: proposal.prf.trim() || null,
          })),
        });
      }

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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="auth">Authentication</TabsTrigger>
            <TabsTrigger value="crypto">Phase 1 Crypto</TabsTrigger>
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

          <TabsContent value="crypto" className="mt-4 space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">Phase 1 Proposals (IKE Group)</div>
                  <div className="text-sm text-muted-foreground">
                    VyOS stores Phase 1 algorithms under <span className="font-mono">IKE Groups</span>. Enable editing to
                    update the selected IKE group when you save this Phase 1.
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox checked={updateIkeGroup} onCheckedChange={(value) => setUpdateIkeGroup(Boolean(value))} />
                  <span className="text-sm text-muted-foreground">Update IKE Group</span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Key Exchange</Label>
                  <Select value={ikeKeyExchange} onValueChange={setIkeKeyExchange} disabled={!updateIkeGroup}>
                    <SelectTrigger>
                      <SelectValue placeholder="ikev2" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ikev2">ikev2</SelectItem>
                      <SelectItem value="ikev1">ikev1</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Close Action (optional)</Label>
                  <Input
                    value={ikeCloseAction}
                    onChange={(event) => setIkeCloseAction(event.target.value)}
                    placeholder="none"
                    list="phase1-close-action-options"
                    disabled={!updateIkeGroup}
                  />
                  <datalist id="phase1-close-action-options">
                    {IKE_CLOSE_ACTION_OPTIONS.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label>Lifetime (seconds, optional)</Label>
                  <Input
                    value={ikeLifetime}
                    onChange={(event) => setIkeLifetime(event.target.value)}
                    placeholder="3600"
                    disabled={!updateIkeGroup}
                  />
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div className="font-medium text-sm">Dead Peer Detection (optional)</div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Action</Label>
                    <Select value={ikeDpdAction} onValueChange={setIkeDpdAction} disabled={!updateIkeGroup}>
                      <SelectTrigger>
                        <SelectValue placeholder="restart" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">(unset)</SelectItem>
                        <SelectItem value="restart">restart</SelectItem>
                        <SelectItem value="clear">clear</SelectItem>
                        <SelectItem value="hold">hold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Interval</Label>
                    <Input
                      value={ikeDpdInterval}
                      onChange={(event) => setIkeDpdInterval(event.target.value)}
                      placeholder="30"
                      disabled={!updateIkeGroup}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Timeout</Label>
                    <Input
                      value={ikeDpdTimeout}
                      onChange={(event) => setIkeDpdTimeout(event.target.value)}
                      placeholder="120"
                      disabled={!updateIkeGroup}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">Proposals</div>
                  <Button type="button" variant="outline" size="sm" onClick={addIkeProposal} disabled={!updateIkeGroup}>
                    Add Algorithm
                  </Button>
                </div>

                {ikeProposals.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No proposals configured.</div>
                ) : (
                  <div className="space-y-3">
                    {ikeProposals.map((proposal, index) => (
                      <div key={`${proposal.proposal_id}-${index}`} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 flex-1">
                            <div className="space-y-2">
                              <Label>Id</Label>
                              <Input
                                value={proposal.proposal_id}
                                onChange={(event) => updateIkeProposal(index, { proposal_id: event.target.value })}
                                placeholder="1"
                                disabled={!updateIkeGroup}
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label>Encryption</Label>
                              <Input
                                value={proposal.encryption}
                                onChange={(event) => updateIkeProposal(index, { encryption: event.target.value })}
                                placeholder="aes256"
                                list="phase1-proposal-encryption-options"
                                disabled={!updateIkeGroup}
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label>Hash</Label>
                              <Input
                                value={proposal.hash}
                                onChange={(event) => updateIkeProposal(index, { hash: event.target.value })}
                                placeholder="sha256"
                                list="phase1-proposal-hash-options"
                                disabled={!updateIkeGroup}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>DH Group</Label>
                              <Input
                                value={proposal.dh_group}
                                onChange={(event) => updateIkeProposal(index, { dh_group: event.target.value })}
                                placeholder="14"
                                list="phase1-proposal-dh-options"
                                disabled={!updateIkeGroup}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>PRF</Label>
                              <Input
                                value={proposal.prf}
                                onChange={(event) => updateIkeProposal(index, { prf: event.target.value })}
                                placeholder="(optional)"
                                list="phase1-proposal-prf-options"
                                disabled={!updateIkeGroup}
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeIkeProposal(index)}
                            title="Remove proposal"
                            disabled={!updateIkeGroup}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <datalist id="phase1-proposal-encryption-options">
                {IPSEC_ENCRYPTION_OPTIONS.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <datalist id="phase1-proposal-hash-options">
                {IPSEC_HASH_OPTIONS.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <datalist id="phase1-proposal-dh-options">
                {DH_GROUP_OPTIONS.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <datalist id="phase1-proposal-prf-options">
                {IKE_PRF_OPTIONS.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
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
