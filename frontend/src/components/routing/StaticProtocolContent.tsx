"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { staticProtocolService } from "@/lib/api/static-protocol";

export function StaticProtocolContent() {
  return (
    <ProtocolCommandContent
      title="Static Protocol"
      description="Manage protocol-level static route and related settings."
      service={staticProtocolService}
      defaultCommands={[
        "set protocols static route 0.0.0.0/0 next-hop 192.168.10.1",
      ]}
    />
  );
}
