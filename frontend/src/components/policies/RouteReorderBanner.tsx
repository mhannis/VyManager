"use client";

import { PolicyReorderBanner } from "@/components/policies/PolicyReorderBanner";

interface RouteReorderBannerProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  count: number;
}

export function RouteReorderBanner({
  onSave,
  onCancel,
  saving,
  count,
}: RouteReorderBannerProps) {
  return (
    <PolicyReorderBanner
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      title="Rule Order Changed"
      description={`${count} rule${count !== 1 ? "s" : ""} will be reordered`}
      className="bg-blue-50 dark:bg-blue-950 border-y border-blue-200 dark:border-blue-800 px-6 py-3"
      iconClassName="h-5 w-5 text-blue-600 dark:text-blue-400"
      titleClassName="text-sm font-medium text-blue-900 dark:text-blue-100"
      descriptionClassName="text-xs text-blue-700 dark:text-blue-300"
      cancelButtonClassName="border-blue-300 dark:border-blue-700"
      saveButtonClassName="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
    />
  );
}
