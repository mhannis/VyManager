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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { ipsecService, type IKEGroup } from "@/lib/api/ipsec";

type DialogMode = "create" | "edit";

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

interface IkeGroupDialogProps {
  open: boolean;
  mode: DialogMode;
  existingNames: string[];
  groupName?: string;
  group?: IKEGroup | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function IkeGroupDialog({
  open,
  mode,
  existingNames,
  groupName,
  group,
  onOpenChange,
  onSuccess,
}: IkeGroupDialogProps) {
  const [name, setName] = useState("");
  const [keyExchange, setKeyExchange] = useState("ikev2");
  const [closeAction, setCloseAction] = useState("");
  const [lifetime, setLifetime] = useState("");
  const [dpdAction, setDpdAction] = useState("");
  const [dpdInterval, setDpdInterval] = useState("");
  const [dpdTimeout, setDpdTimeout] = useState("");
  const [proposals, setProposals] = useState<ProposalFormState[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "create" ? "Create IKE Group" : "Edit IKE Group";
  const description =
    mode === "create"
      ? "Defines Phase 1 (IKE) parameters and cryptographic proposals."
      : "Update IKE parameters and cryptographic proposals.";

  const initialProposalState = useMemo<ProposalFormState[]>(() => {
    const entries = Object.values(group?.proposals || {});
    const mapped = entries.map((proposal) => ({
      proposal_id: proposal.proposal_id || "",
      encryption: proposal.encryption || "",
      hash: proposal.hash || "",
      dh_group: proposal["dh-group"] || "",
      prf: proposal.prf || "",
    }));
    mapped.sort((left, right) => Number(left.proposal_id) - Number(right.proposal_id));
    return mapped;
  }, [group]);

  useEffect(() => {
    if (!open) return;

    setError(null);
    if (mode === "edit") {
      setName(groupName || "");
      setKeyExchange(group?.["key-exchange"] || "ikev2");
      setCloseAction(group?.["close-action"] || "");
      setLifetime(group?.lifetime || "");

      const dpd = group?.["dead-peer-detection"] || null;
      setDpdAction(dpd?.action || "");
      setDpdInterval(dpd?.interval || "");
      setDpdTimeout(dpd?.timeout || "");

      setProposals(initialProposalState);
      return;
    }

    setName("");
    setKeyExchange("ikev2");
    setCloseAction("");
    setLifetime("");
    setDpdAction("restart");
    setDpdInterval("30");
    setDpdTimeout("120");
    setProposals([
      {
        proposal_id: "1",
        encryption: "aes256",
        hash: "sha256",
        dh_group: "14",
        prf: "",
      },
    ]);
  }, [open, mode, groupName, group, initialProposalState]);

  const addProposal = () => {
    setProposals((prev) => [
      ...prev,
      {
        proposal_id: nextNumericId(prev.map((entry) => entry.proposal_id)),
        encryption: "",
        hash: "",
        dh_group: "",
        prf: "",
      },
    ]);
  };

  const updateProposal = (index: number, patch: Partial<ProposalFormState>) => {
    setProposals((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const removeProposal = (index: number) => {
    setProposals((prev) => prev.filter((_, idx) => idx !== index));
  };

  const validateForm = (): string | null => {
    const trimmedName = name.trim();
    if (!trimmedName) return "Group name is required.";

    if (mode === "create" && existingNames.includes(trimmedName)) {
      return `IKE group '${trimmedName}' already exists.`;
    }

    const ids = new Set<string>();
    for (const proposal of proposals) {
      const pid = proposal.proposal_id.trim();
      if (!pid) return "Each proposal must have an ID.";
      if (!/^[1-9][0-9]{0,3}$/.test(pid)) return `Proposal ID '${pid}' must be 1-9999.`;
      if (ids.has(pid)) return `Duplicate proposal ID '${pid}'.`;
      ids.add(pid);

      if (!proposal.encryption.trim() || !proposal.hash.trim()) {
        return `Proposal ${pid} requires encryption and hash.`;
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
      const deadPeerDetection =
        dpdAction.trim() || dpdInterval.trim() || dpdTimeout.trim()
          ? {
              action: dpdAction.trim() || null,
              interval: dpdInterval.trim() || null,
              timeout: dpdTimeout.trim() || null,
            }
          : null;

      const upsert = {
        key_exchange: keyExchange.trim() || null,
        close_action: closeAction.trim() || null,
        lifetime: lifetime.trim() || null,
        dead_peer_detection: deadPeerDetection,
        proposals: proposals.map((proposal) => ({
          proposal_id: proposal.proposal_id.trim(),
          encryption: proposal.encryption.trim() || null,
          hash: proposal.hash.trim() || null,
          dh_group: proposal.dh_group.trim() || null,
          prf: proposal.prf.trim() || null,
        })),
      };

      const targetName = name.trim();
      const result = await ipsecService.upsertIkeGroup(targetName, upsert);
      onOpenChange(false);
      onSuccess(result.message || `IKE group '${targetName}' saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save IKE group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
            <Label>Group Name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="IKE-GROUP-1"
              disabled={mode === "edit"}
            />
          </div>
          <div className="space-y-2">
            <Label>Key Exchange</Label>
            <Select value={keyExchange} onValueChange={setKeyExchange}>
              <SelectTrigger>
                <SelectValue placeholder="Select IKE version" />
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
              value={closeAction}
              onChange={(event) => setCloseAction(event.target.value)}
              placeholder="none"
              list="ike-close-action-options"
            />
            <datalist id="ike-close-action-options">
              <option value="none" />
              <option value="start" />
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>Lifetime (seconds)</Label>
            <Input value={lifetime} onChange={(event) => setLifetime(event.target.value)} placeholder="3600" />
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="font-medium">Dead Peer Detection</div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={dpdAction} onValueChange={setDpdAction}>
                <SelectTrigger>
                  <SelectValue placeholder="restart" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restart">restart</SelectItem>
                  <SelectItem value="clear">clear</SelectItem>
                  <SelectItem value="hold">hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Interval</Label>
              <Input value={dpdInterval} onChange={(event) => setDpdInterval(event.target.value)} placeholder="30" />
            </div>
            <div className="space-y-2">
              <Label>Timeout</Label>
              <Input value={dpdTimeout} onChange={(event) => setDpdTimeout(event.target.value)} placeholder="120" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">Proposals</div>
            <Button type="button" variant="outline" size="sm" onClick={addProposal}>
              <Plus className="mr-2 h-4 w-4" />
              Add Proposal
            </Button>
          </div>

          {proposals.length === 0 ? (
            <div className="text-sm text-muted-foreground">No proposals configured.</div>
          ) : (
            <div className="space-y-3">
              {proposals.map((proposal, index) => (
                <div key={`${proposal.proposal_id}-${index}`} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 flex-1">
                      <div className="space-y-2">
                        <Label>Id</Label>
                        <Input
                          value={proposal.proposal_id}
                          onChange={(event) => updateProposal(index, { proposal_id: event.target.value })}
                          placeholder="1"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Encryption</Label>
                        <Input
                          value={proposal.encryption}
                          onChange={(event) => updateProposal(index, { encryption: event.target.value })}
                          placeholder="aes256"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Hash</Label>
                        <Input
                          value={proposal.hash}
                          onChange={(event) => updateProposal(index, { hash: event.target.value })}
                          placeholder="sha256"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>DH Group</Label>
                        <Input
                          value={proposal.dh_group}
                          onChange={(event) => updateProposal(index, { dh_group: event.target.value })}
                          placeholder="14"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>PRF</Label>
                        <Input
                          value={proposal.prf}
                          onChange={(event) => updateProposal(index, { prf: event.target.value })}
                          placeholder="(optional)"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeProposal(index)}
                      title="Remove proposal"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
