"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { DhcpServerWorkspace } from "@/components/services/DhcpServerWorkspace";

export default function DHCPPage() {
  return (
    <AppLayout>
      <DhcpServerWorkspace />
    </AppLayout>
  );
}
