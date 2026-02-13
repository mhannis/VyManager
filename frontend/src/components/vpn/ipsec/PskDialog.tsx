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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { ipsecService, type PSKAuthentication } from "@/lib/api/ipsec";

type DialogMode = "create" | "edit";

const SELECT_UNSET_VALUE = "__unset__";

function parseIds(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw.split(/[\n,]+/)) {
    const item = entry.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

interface PskDialogProps {
  open: boolean;
  mode: DialogMode;
  existingNames: string[];
  pskId?: string;
  entry?: PSKAuthentication | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function PskDialog({
  open,
  mode,
  existingNames,
  pskId,
  entry,
  onOpenChange,
  onSuccess,
}: PskDialogProps) {
  const [name, setName] = useState("");
  const [idsText, setIdsText] = useState("");
  const [secret, setSecret] = useState("");
  const [secretType, setSecretType] = useState("text");
  const [showSecret, setShowSecret] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "create" ? "Create PSK Entry" : "Edit PSK Entry";
  const description =
    mode === "create"
      ? "Creates a pre-shared-key secret and the ID selectors it matches."
      : "Update ID selectors and optionally rotate the secret.";

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowSecret(false);

    if (mode === "edit") {
      setName(pskId || entry?.psk_id || "");
      setIdsText((entry?.ids || []).join("\n"));
      setSecret("");
      setSecretType(entry?.secret_type || "");
      return;
    }

    setName("");
    setIdsText("");
    setSecret("");
    setSecretType("text");
  }, [open, mode, pskId, entry]);

  const validateForm = (): string | null => {
    const trimmedName = name.trim();
    if (!trimmedName) return "PSK ID is required.";
    if (mode === "create" && existingNames.includes(trimmedName)) return `PSK '${trimmedName}' already exists.`;

    const ids = parseIds(idsText);
    if (ids.length === 0) return "At least one ID selector is required.";

    if (mode === "create" && !secret.trim()) return "Secret is required for new PSK entries.";
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
      const targetName = name.trim();
      const ids = parseIds(idsText);
      const request: any = { ids, secret_type: secretType.trim() || null };
      if (secret.trim()) {
        request.secret = secret;
      }

      const result = await ipsecService.upsertPsk(targetName, request);
      onOpenChange(false);
      onSuccess(result.message || `PSK '${targetName}' saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save PSK entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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

        <div className="space-y-2">
          <Label>PSK ID</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="PSK-1" disabled={mode === "edit"} />
        </div>

        <div className="space-y-2">
          <Label>ID Selectors</Label>
          <Textarea
            value={idsText}
            onChange={(event) => setIdsText(event.target.value)}
            placeholder={"@local-id\n@remote-id"}
            rows={5}
          />
          <div className="text-xs text-muted-foreground">
            One per line. These should match the local-id/remote-id used by your peers.
          </div>
        </div>

        <div className="space-y-2">
          <Label>Secret {mode === "edit" ? "(leave blank to keep unchanged)" : ""}</Label>
          <div className="flex gap-2">
            <Input
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              type={showSecret ? "text" : "password"}
              placeholder={mode === "edit" ? "••••••••" : "Your PSK secret"}
            />
            <Button type="button" variant="outline" onClick={() => setShowSecret((prev) => !prev)}>
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Secret Type (optional)</Label>
          <Select
            value={secretType || SELECT_UNSET_VALUE}
            onValueChange={(value) => setSecretType(value === SELECT_UNSET_VALUE ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="text" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_UNSET_VALUE}>(unset)</SelectItem>
              <SelectItem value="text">text</SelectItem>
              <SelectItem value="base64">base64</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">
            Controls how VyOS interprets the PSK secret. Leave unset unless you specifically need base64.
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
