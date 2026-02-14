"use client";

import { PolicyReorderBanner } from "@/components/policies/PolicyReorderBanner";

interface ExtCommunityListReorderBannerProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  count: number;
}

export function ExtCommunityListReorderBanner({
  onSave,
  onCancel,
  saving,
  count,
}: ExtCommunityListReorderBannerProps) {
  return (
    <PolicyReorderBanner
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      title={`You have reordered ${count} rule${count !== 1 ? "s" : ""}`}
      description='Click "Save Changes" to apply the new order or "Cancel" to discard changes'
      saveLabel="Save Changes"
    />
  );
}
