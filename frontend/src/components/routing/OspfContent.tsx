"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { ospfService } from "@/lib/api/ospf";

export function OspfContent() {
  return (
    <ProtocolCommandContent
      title="OSPF"
      description="Configure OSPF areas, interfaces, and network advertisements."
      service={ospfService}
      defaultCommands={[
        "set protocols ospf parameters router-id 10.0.0.1",
        "set protocols ospf area 0.0.0.0 network 10.0.0.0/24",
      ]}
    />
  );
}
