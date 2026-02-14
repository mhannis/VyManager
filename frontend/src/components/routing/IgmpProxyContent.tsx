"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { igmpProxyService } from "@/lib/api/igmp-proxy";

export function IgmpProxyContent() {
  return (
    <ProtocolCommandContent
      title="IGMP Proxy"
      description="Configure upstream/downstream multicast forwarding interfaces and options."
      service={igmpProxyService}
      defaultCommands={[
        "set protocols igmp-proxy interface eth0 role upstream",
        "set protocols igmp-proxy interface eth2 role downstream",
      ]}
    />
  );
}
