"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, Check, Loader2, X } from "lucide-react";

interface PolicyReorderBannerProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  description: string;
  saveLabel?: string;
  savingLabel?: string;
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  saveButtonClassName?: string;
  cancelButtonClassName?: string;
  compact?: boolean;
}

export function PolicyReorderBanner({
  onSave,
  onCancel,
  saving,
  title,
  description,
  saveLabel = "Save Order",
  savingLabel = "Saving...",
  className = "bg-primary/10 border-y border-primary/20 px-6 py-3",
  iconClassName = "h-5 w-5 text-primary",
  titleClassName = "text-sm font-medium text-foreground",
  descriptionClassName = "text-xs text-muted-foreground",
  saveButtonClassName,
  cancelButtonClassName,
  compact = false,
}: PolicyReorderBannerProps) {
  return (
    <div
      className={`${className} flex items-center justify-between${compact ? " shrink-0" : ""}`}
    >
      <div className="flex items-center gap-3">
        <AlertCircle className={iconClassName} />
        <div>
          <p className={titleClassName}>{title}</p>
          <p className={descriptionClassName}>{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          className={cancelButtonClassName}
        >
          {!compact && <X className="h-4 w-4 mr-2" />}
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving}
          className={saveButtonClassName}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          {saving ? savingLabel : saveLabel}
        </Button>
      </div>
    </div>
  );
}
