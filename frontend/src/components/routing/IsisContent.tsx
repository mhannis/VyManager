"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { isisService } from "@/lib/api/isis";

export function IsisContent() {
  return (
    <ProtocolCommandContent
      title="IS-IS"
      description="Configure IS-IS system NET, interfaces, and protocol timers."
      service={isisService}
      defaultCommands={[
        "set protocols isis area-tag 1 net 49.0001.1921.6800.1001.00",
        "set protocols isis interface eth2",
      ]}
    />
  );
}
