"use client";

import { PolicyReorderBanner } from "@/components/policies/PolicyReorderBanner";

interface LocalRouteReorderBannerProps {
  ruleCount: number;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

export function LocalRouteReorderBanner({
  ruleCount,
  onSave,
  onCancel,
  saving,
}: LocalRouteReorderBannerProps) {
  return (
    <PolicyReorderBanner
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      title={`Reordering ${ruleCount} rule${ruleCount !== 1 ? "s" : ""}`}
      description="Rules will be renumbered sequentially when you save"
      compact
    />
  );
}
