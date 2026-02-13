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
import { ipsecService, type ESPGroup } from "@/lib/api/ipsec";
import {
  ESP_PFS_OPTIONS,
  IPSEC_ENCRYPTION_OPTIONS,
  IPSEC_HASH_OPTIONS,
} from "@/lib/ipsec/options";

type DialogMode = "create" | "edit";

interface EspProposalFormState {
  proposal_id: string;
  encryption: string;
  hash: string;
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

function valueOrEmpty(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

interface Phase2DialogProps {
  open: boolean;
  mode: DialogMode;
  peerId: string;
  existingTunnelIds: string[];
  espGroupNames: string[];
  espGroups: Record<string, ESPGroup>;
  tunnelId?: string;
  tunnel?: Record<string, any> | null;
  defaultEspGroup?: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function Phase2Dialog({
  open,
  mode,
  peerId,
  existingTunnelIds,
  espGroupNames,
  espGroups,
  tunnelId,
  tunnel,
  defaultEspGroup,
  onOpenChange,
  onSuccess,
}: Phase2DialogProps) {
  const [tunnelKey, setTunnelKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [localPrefix, setLocalPrefix] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [remotePrefix, setRemotePrefix] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [protocol, setProtocol] = useState("");
  const [priority, setPriority] = useState("");
  const [espGroup, setEspGroup] = useState("");

  const [updateEspGroup, setUpdateEspGroup] = useState(false);
  const [espLifetime, setEspLifetime] = useState("");
  const [espMode, setEspMode] = useState("tunnel");
  const [espPfs, setEspPfs] = useState("");
  const [espProposals, setEspProposals] = useState<EspProposalFormState[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "create" ? "Add Phase 2" : "Edit Phase 2";
  const descriptionText =
    mode === "create"
      ? "Create a policy-based tunnel (Phase 2 / CHILD SA) under this peer."
      : "Update the Phase 2 tunnel.";

  const defaultTunnelId = useMemo(() => nextNumericId(existingTunnelIds), [existingTunnelIds]);

  const loadEspGroup = (name: string) => {
    const group = espGroups?.[name] || null;
    setEspLifetime(group?.lifetime || "");
    setEspMode(group?.mode || "tunnel");
    setEspPfs(group?.pfs || "");

    const entries = Object.values(group?.proposals || {});
    const mapped = entries.map((proposal: any) => ({
      proposal_id: proposal.proposal_id || "",
      encryption: proposal.encryption || "",
      hash: proposal.hash || "",
    }));
    mapped.sort((left, right) => Number(left.proposal_id) - Number(right.proposal_id));
    setEspProposals(
      mapped.length
        ? mapped
        : [
            {
              proposal_id: "1",
              encryption: "aes256",
              hash: "sha256",
            },
          ]
    );
  };

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (mode === "edit") {
      const key = tunnelId || "";
      setTunnelKey(key);
      const raw = tunnel || {};
      setEnabled(!Object.prototype.hasOwnProperty.call(raw, "disable"));
      setLocalPrefix(valueOrEmpty(raw?.local?.prefix));
      setLocalPort(valueOrEmpty(raw?.local?.port));
      setRemotePrefix(valueOrEmpty(raw?.remote?.prefix));
      setRemotePort(valueOrEmpty(raw?.remote?.port));
      setProtocol(valueOrEmpty(raw?.protocol));
      setPriority(valueOrEmpty(raw?.priority));
      setEspGroup(valueOrEmpty(raw?.["esp-group"] || ""));

      // Avoid accidental edits to shared ESP groups when modifying a tunnel.
      setUpdateEspGroup(false);
      loadEspGroup(valueOrEmpty(raw?.["esp-group"] || "") || (defaultEspGroup ? String(defaultEspGroup) : ""));
      return;
    }

    setTunnelKey(defaultTunnelId);
    setEnabled(true);
    setLocalPrefix("");
    setLocalPort("");
    setRemotePrefix("");
    setRemotePort("");
    setProtocol("");
    setPriority("");
    setEspGroup(defaultEspGroup ? String(defaultEspGroup) : "");

    setUpdateEspGroup(true);
    loadEspGroup(defaultEspGroup ? String(defaultEspGroup) : "");
  }, [open, mode, tunnelId, tunnel, defaultTunnelId, defaultEspGroup]);

  const validateForm = (): string | null => {
    const tid = tunnelKey.trim();
    if (!tid) return "Tunnel ID is required.";
    if (!/^[1-9][0-9]{0,3}$/.test(tid)) return "Tunnel ID must be 1-9999.";
    if (mode === "create" && existingTunnelIds.includes(tid)) return `Tunnel '${tid}' already exists.`;

    if (!localPrefix.trim()) return "Local prefix is required.";
    if (!remotePrefix.trim()) return "Remote prefix is required.";

    if (localPort.trim() && !/^[0-9]{1,5}$/.test(localPort.trim())) return "Local port must be numeric.";
    if (remotePort.trim() && !/^[0-9]{1,5}$/.test(remotePort.trim())) return "Remote port must be numeric.";
    if (priority.trim() && !/^[0-9]+$/.test(priority.trim())) return "Priority must be numeric.";

    const effectiveEspGroup = (espGroup.trim() || (defaultEspGroup ? String(defaultEspGroup).trim() : "")) || "";
    if (updateEspGroup) {
      if (!effectiveEspGroup) return "ESP group name is required to edit Phase 2 crypto.";
      if (!espProposals.length) return "At least one Phase 2 proposal is required.";
      const ids = new Set<string>();
      for (const proposal of espProposals) {
        const pid = proposal.proposal_id.trim();
        if (!pid) return "Each Phase 2 proposal must have an ID.";
        if (!/^[1-9][0-9]{0,3}$/.test(pid)) return `Proposal ID '${pid}' must be 1-9999.`;
        if (ids.has(pid)) return `Duplicate proposal ID '${pid}'.`;
        ids.add(pid);
        if (!proposal.encryption.trim() || !proposal.hash.trim()) {
          return `Proposal ${pid} requires encryption and hash.`;
        }
      }
    } else if (effectiveEspGroup && !espGroups?.[effectiveEspGroup]) {
      return `ESP group '${effectiveEspGroup}' does not exist. Select an existing group, or enable 'Update ESP Group' to create it.`;
    }

    return null;
  };

  const addEspProposal = () => {
    setEspProposals((prev) => [
      ...prev,
      {
        proposal_id: nextNumericId(prev.map((entry) => entry.proposal_id)),
        encryption: "aes256",
        hash: "sha256",
      },
    ]);
  };

  const updateEspProposal = (index: number, patch: Partial<EspProposalFormState>) => {
    setEspProposals((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const removeEspProposal = (index: number) => {
    setEspProposals((prev) => prev.filter((_, idx) => idx !== index));
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
      const tid = tunnelKey.trim();
      const effectiveEspGroup = (espGroup.trim() || (defaultEspGroup ? String(defaultEspGroup).trim() : "")) || "";

      if (updateEspGroup) {
        await ipsecService.upsertEspGroup(effectiveEspGroup, {
          lifetime: espLifetime.trim() || null,
          mode: espMode.trim() || null,
          pfs: espPfs.trim() || null,
          proposals: espProposals.map((proposal) => ({
            proposal_id: proposal.proposal_id.trim(),
            encryption: proposal.encryption.trim() || null,
            hash: proposal.hash.trim() || null,
          })),
        });
      }

      const request: any = {
        enabled,
        esp_group: espGroup.trim() || null,
        priority: priority.trim() || null,
        protocol: protocol.trim() || null,
        local_prefix: localPrefix.trim(),
        local_port: localPort.trim() || null,
        remote_prefix: remotePrefix.trim(),
        remote_port: remotePort.trim() || null,
      };

      const result = await ipsecService.upsertTunnel(peerId, tid, request);
      onOpenChange(false);
      onSuccess(result.message || `Tunnel ${tid} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Phase 2");
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

        <Tabs defaultValue="net" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="net">Networks</TabsTrigger>
            <TabsTrigger value="crypto">Phase 2 Crypto</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="net" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tunnel ID</Label>
                <Input
                  value={tunnelKey}
                  onChange={(event) => setTunnelKey(event.target.value)}
                  placeholder="1"
                  disabled={mode === "edit"}
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
                <Label>Local Prefix</Label>
                <Input
                  value={localPrefix}
                  onChange={(event) => setLocalPrefix(event.target.value)}
                  placeholder="10.0.0.0/24"
                />
              </div>
              <div className="space-y-2">
                <Label>Remote Prefix</Label>
                <Input
                  value={remotePrefix}
                  onChange={(event) => setRemotePrefix(event.target.value)}
                  placeholder="10.1.0.0/24"
                />
              </div>

              <div className="space-y-2">
                <Label>ESP Group (optional)</Label>
                <Input
                  value={espGroup}
                  onChange={(event) => setEspGroup(event.target.value)}
                  placeholder="(uses peer default-esp-group if empty)"
                  list="phase2-esp-group-options"
                />
                <datalist id="phase2-esp-group-options">
                  {espGroupNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Protocol (optional)</Label>
                <Input
                  value={protocol}
                  onChange={(event) => setProtocol(event.target.value)}
                  placeholder="(optional)"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="crypto" className="mt-4 space-y-4">
            {(() => {
              const effectiveEspGroup = (espGroup.trim() || (defaultEspGroup ? String(defaultEspGroup).trim() : "")) || "";
              return (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">Phase 2 Proposals (ESP Group)</div>
                      <div className="text-sm text-muted-foreground">
                        Effective ESP group:{" "}
                        <span className="font-mono">{effectiveEspGroup || "(none)"}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        VyOS stores Phase 2 algorithms under <span className="font-mono">ESP Groups</span>. Enable editing
                        to update the effective group when you save this Phase 2 tunnel.
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox checked={updateEspGroup} onCheckedChange={(value) => setUpdateEspGroup(Boolean(value))} />
                      <span className="text-sm text-muted-foreground">Update ESP Group</span>
                    </div>
                  </div>

                  {!effectiveEspGroup ? (
                    <div className="text-sm text-muted-foreground">
                      Set an ESP group name (or configure a default ESP group in Phase 1) to edit Phase 2 crypto.
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Mode</Label>
                          <Select value={espMode} onValueChange={setEspMode} disabled={!updateEspGroup}>
                            <SelectTrigger>
                              <SelectValue placeholder="tunnel" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tunnel">tunnel</SelectItem>
                              <SelectItem value="transport">transport</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Lifetime (seconds, optional)</Label>
                          <Input
                            value={espLifetime}
                            onChange={(event) => setEspLifetime(event.target.value)}
                            placeholder="3600"
                            disabled={!updateEspGroup}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>PFS (optional)</Label>
                          <Input
                            value={espPfs}
                            onChange={(event) => setEspPfs(event.target.value)}
                            placeholder="enable"
                            list="phase2-esp-pfs-options"
                            disabled={!updateEspGroup}
                          />
                          <datalist id="phase2-esp-pfs-options">
                            {ESP_PFS_OPTIONS.map((value) => (
                              <option key={value} value={value} />
                            ))}
                          </datalist>
                        </div>
                      </div>

                      <div className="rounded-md border p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm">Proposals</div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addEspProposal}
                            disabled={!updateEspGroup}
                          >
                            Add Algorithm
                          </Button>
                        </div>

                        {espProposals.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No proposals configured.</div>
                        ) : (
                          <div className="space-y-3">
                            {espProposals.map((proposal, index) => (
                              <div key={`${proposal.proposal_id}-${index}`} className="rounded-md border p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 flex-1">
                                    <div className="space-y-2">
                                      <Label>Id</Label>
                                      <Input
                                        value={proposal.proposal_id}
                                        onChange={(event) => updateEspProposal(index, { proposal_id: event.target.value })}
                                        placeholder="1"
                                        disabled={!updateEspGroup}
                                      />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                      <Label>Encryption</Label>
                                      <Input
                                        value={proposal.encryption}
                                        onChange={(event) => updateEspProposal(index, { encryption: event.target.value })}
                                        placeholder="aes256"
                                        list="phase2-proposal-encryption-options"
                                        disabled={!updateEspGroup}
                                      />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                      <Label>Hash</Label>
                                      <Input
                                        value={proposal.hash}
                                        onChange={(event) => updateEspProposal(index, { hash: event.target.value })}
                                        placeholder="sha256"
                                        list="phase2-proposal-hash-options"
                                        disabled={!updateEspGroup}
                                      />
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeEspProposal(index)}
                                    title="Remove proposal"
                                    disabled={!updateEspGroup}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <datalist id="phase2-proposal-encryption-options">
                        {IPSEC_ENCRYPTION_OPTIONS.map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                      <datalist id="phase2-proposal-hash-options">
                        {IPSEC_HASH_OPTIONS.map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                    </>
                  )}
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="advanced" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Local Port (optional)</Label>
                <Input value={localPort} onChange={(event) => setLocalPort(event.target.value)} placeholder="(optional)" />
              </div>
              <div className="space-y-2">
                <Label>Remote Port (optional)</Label>
                <Input
                  value={remotePort}
                  onChange={(event) => setRemotePort(event.target.value)}
                  placeholder="(optional)"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Priority (optional)</Label>
                <Input
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
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
