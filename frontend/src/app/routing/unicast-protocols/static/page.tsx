"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";

export default function StaticProtocolPage() {
  const router = useRouter();
  const { canRead, isLoading } = usePermissions();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (canRead(FeatureGroup.STATIC_ROUTES)) {
      router.replace("/routing/static-failover/static-routes");
      return;
    }

    if (canRead(FeatureGroup.FAILOVER)) {
      router.replace("/routing/static-failover/failover");
      return;
    }

    router.replace("/routing/unicast-protocols");
  }, [canRead, isLoading, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}
