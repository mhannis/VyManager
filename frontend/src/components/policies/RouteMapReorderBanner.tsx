"use client";

import { PolicyReorderBanner } from "@/components/policies/PolicyReorderBanner";

interface RouteMapReorderBannerProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  count: number;
}

export function RouteMapReorderBanner({
  onSave,
  onCancel,
  saving,
  count,
}: RouteMapReorderBannerProps) {
  return (
    <PolicyReorderBanner
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      title="Reorder in Progress"
      description={`${count} rule${count !== 1 ? "s" : ""} will be renumbered sequentially`}
    />
  );
}
