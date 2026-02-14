"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { pimService } from "@/lib/api/pim";

export function PimContent() {
  return (
    <ProtocolCommandContent
      title="PIM"
      description="Configure IPv4 Protocol Independent Multicast interfaces, RP settings, and behavior."
      service={pimService}
      defaultCommands={[
        "set protocols pim interface eth1 mode sm",
        "set protocols pim rp address 192.0.2.10",
      ]}
    />
  );
}
