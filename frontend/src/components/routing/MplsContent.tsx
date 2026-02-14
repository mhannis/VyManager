"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { mplsService } from "@/lib/api/mpls";

export function MplsContent() {
  return (
    <ProtocolCommandContent
      title="MPLS"
      description="Configure MPLS protocol and label forwarding behavior."
      service={mplsService}
      defaultCommands={[
        "set protocols mpls interface eth2",
        "set protocols mpls static-label-block 16000 23999",
      ]}
    />
  );
}
