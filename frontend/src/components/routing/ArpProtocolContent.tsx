"use client";

import { ProtocolCommandContent } from "./ProtocolCommandContent";
import { arpService } from "@/lib/api/arp";

export function ArpProtocolContent() {
  return (
    <ProtocolCommandContent
      title="ARP"
      description="Manage static ARP entries used by protocols-level ARP configuration."
      service={arpService}
      defaultCommands={[
        "set protocols static arp interface eth2 address 192.168.20.10 mac aa:bb:cc:dd:ee:ff",
      ]}
    />
  );
}
