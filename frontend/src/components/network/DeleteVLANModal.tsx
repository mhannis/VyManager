"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { VLANWithParent } from "@/lib/api/types/ethernet";
import { ethernetService } from "@/lib/api/ethernet";

interface DeleteVLANModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vlan: VLANWithParent | null;
  onSuccess: () => void;
}

export function DeleteVLANModal({ open, onOpenChange, vlan, onSuccess }: DeleteVLANModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!vlan) return;

    setLoading(true);
    setError(null);

    try {
      let op = "delete_vif";
      let value = vlan.vlan_id;

      if (vlan.kind === "vif-s") {
        op = "delete_vif_s";
      } else if (vlan.kind === "vif-c") {
        if (!vlan.service_vlan_id) {
          throw new Error("Missing service VLAN ID for QinQ customer VLAN deletion");
        }
        op = "delete_vif_c";
        value = `${vlan.service_vlan_id},${vlan.vlan_id}`;
      }

      await ethernetService.batchConfigure({
        interface: vlan.parentInterface,
        operations: [{ op, value }],
      });

      await ethernetService.refreshConfig();
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete VLAN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete VLAN</AlertDialogTitle>
          <AlertDialogDescription>
            Delete <code className="font-mono">{vlan?.fullName}</code> and all nested settings under this
            subinterface. This can immediately impact live traffic.
            {error && <span className="mt-2 block text-destructive">{error}</span>}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              handleDelete();
            }}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Deleting..." : "Delete VLAN"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
