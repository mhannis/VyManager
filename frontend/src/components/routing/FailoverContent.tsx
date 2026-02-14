"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { failoverService } from "@/lib/api/failover";

export function FailoverContent() {
  return (
    <ProtocolCommandContent
      title="Failover"
      description="Configure protocol-level failover groups and route tracking."
      service={failoverService}
      defaultCommands={[
        "set protocols failover route 0.0.0.0/0 next-hop 192.168.10.1 interface eth0",
      ]}
    />
  );
}
