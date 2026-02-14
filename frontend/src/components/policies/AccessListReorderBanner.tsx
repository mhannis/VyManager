"use client";

import { PolicyReorderBanner } from "@/components/policies/PolicyReorderBanner";

interface AccessListReorderBannerProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  count: number;
}

export function AccessListReorderBanner({
  onSave,
  onCancel,
  saving,
  count,
}: AccessListReorderBannerProps) {
  return (
    <PolicyReorderBanner
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      title="Reorder in Progress"
      description={`${count} rule${count !== 1 ? "s" : ""} will be renumbered`}
      className="bg-blue-500/10 border-y border-blue-500/20 px-6 py-3"
      iconClassName="h-5 w-5 text-blue-500"
      saveButtonClassName="bg-blue-500 hover:bg-blue-600"
    />
  );
}
