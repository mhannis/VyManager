"use client";

import { useEffect, useState } from "react";
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
import { AlertCircle, Loader2, Save } from "lucide-react";
import { ipsecService, type VTIBinding } from "@/lib/api/ipsec";

function valueOrEmpty(value?: string | null): string {
  return value ? value : "";
}

function extractTrafficSelectorPrefix(vti: VTIBinding | null | undefined, side: "local" | "remote"): string {
  const root: any = vti?.["traffic-selector"] || null;
  const node = root && typeof root === "object" ? root[side] : null;
  if (node && typeof node === "object" && typeof node.prefix === "string") {
    return node.prefix;
  }
  return "";
}

interface VtiDialogProps {
  open: boolean;
  peerId: string;
  vti?: VTIBinding | null;
  espGroupNames: string[];
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function VtiDialog({ open, peerId, vti, espGroupNames, onOpenChange, onSuccess }: VtiDialogProps) {
  const [bind, setBind] = useState("");
  const [espGroup, setEspGroup] = useState("");
  const [localPrefix, setLocalPrefix] = useState("");
  const [remotePrefix, setRemotePrefix] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBind(valueOrEmpty(vti?.bind));
    setEspGroup(valueOrEmpty(vti?.["esp-group"]));
    setLocalPrefix(extractTrafficSelectorPrefix(vti, "local"));
    setRemotePrefix(extractTrafficSelectorPrefix(vti, "remote"));
  }, [open, vti]);

  const validateForm = (): string | null => {
    if (!bind.trim()) return "Bind interface is required.";
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
      const request: any = {
        bind: bind.trim() || null,
        esp_group: espGroup.trim() || null,
        local_prefix: localPrefix.trim() || null,
        remote_prefix: remotePrefix.trim() || null,
      };

      const result = await ipsecService.upsertVti(peerId, request);
      onOpenChange(false);
      onSuccess(result.message || "VTI updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update VTI");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" />
            VTI (Route-Based) Configuration
          </DialogTitle>
          <DialogDescription>
            Bind a VTI interface to this peer for route-based VPNs (optional traffic selectors).
          </DialogDescription>
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
            <Label>Bind Interface</Label>
            <Input value={bind} onChange={(event) => setBind(event.target.value)} placeholder="vti1" />
          </div>
          <div className="space-y-2">
            <Label>ESP Group (optional)</Label>
            <Input
              value={espGroup}
              onChange={(event) => setEspGroup(event.target.value)}
              placeholder="ESP"
              list="vti-esp-groups"
            />
            <datalist id="vti-esp-groups">
              {espGroupNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>Traffic Selector Local Prefix (optional)</Label>
            <Input
              value={localPrefix}
              onChange={(event) => setLocalPrefix(event.target.value)}
              placeholder="10.0.0.0/24"
            />
          </div>
          <div className="space-y-2">
            <Label>Traffic Selector Remote Prefix (optional)</Label>
            <Input
              value={remotePrefix}
              onChange={(event) => setRemotePrefix(event.target.value)}
              placeholder="10.1.0.0/24"
            />
          </div>
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

