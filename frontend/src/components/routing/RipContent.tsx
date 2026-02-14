"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { ripService } from "@/lib/api/rip";

export function RipContent() {
  return (
    <ProtocolCommandContent
      title="RIP"
      description="Configure RIP interfaces, networks, and redistribution parameters."
      service={ripService}
      defaultCommands={[
        "set protocols rip network 10.0.0.0/24",
        "set protocols rip interface eth2",
      ]}
    />
  );
}
