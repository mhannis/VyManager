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
import { AlertCircle, Loader2, Save } from "lucide-react";
import { ipsecService } from "@/lib/api/ipsec";

type DialogMode = "create" | "edit";

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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "create" ? "Add Phase 2" : "Edit Phase 2";
  const descriptionText =
    mode === "create"
      ? "Create a policy-based tunnel (Phase 2 / CHILD SA) under this peer."
      : "Update the Phase 2 tunnel.";

  const defaultTunnelId = useMemo(() => nextNumericId(existingTunnelIds), [existingTunnelIds]);

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
      const tid = tunnelKey.trim();
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="net">Networks</TabsTrigger>
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
