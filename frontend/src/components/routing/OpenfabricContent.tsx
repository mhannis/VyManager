"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { openfabricService } from "@/lib/api/openfabric";

export function OpenfabricContent() {
  return (
    <ProtocolCommandContent
      title="OpenFabric"
      description="Configure OpenFabric dynamic routing protocol settings."
      service={openfabricService}
      defaultCommands={[
        "set protocols openfabric net 49.0001.1921.6800.1001.00",
        "set protocols openfabric interface eth2",
      ]}
    />
  );
}
