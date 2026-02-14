"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { pim6Service } from "@/lib/api/pim6";

export function Pim6Content() {
  return (
    <ProtocolCommandContent
      title="PIM6"
      description="Configure IPv6 Protocol Independent Multicast interfaces and rendezvous points."
      service={pim6Service}
      defaultCommands={[
        "set protocols pim6 interface eth1 mode sm",
        "set protocols pim6 rp address 2001:db8::10",
      ]}
    />
  );
}
