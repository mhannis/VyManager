"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { rpkiService } from "@/lib/api/rpki";

export function RpkiContent() {
  return (
    <ProtocolCommandContent
      title="RPKI"
      description="Configure RPKI cache servers and route validation behavior."
      service={rpkiService}
      defaultCommands={[
        "set protocols rpki cache 192.0.2.10 port 3323",
        "set protocols rpki timer poll-interval 300",
      ]}
    />
  );
}
