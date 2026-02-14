"use client";

import { ProtocolSimpleListEditor, asRecord, asString } from "./ProtocolSimpleListEditor";
import { arpService } from "@/lib/api/arp";

export function ArpProtocolContent() {
  return (
    <ProtocolSimpleListEditor
      title="Static ARP (Protocols)"
      description="Manage protocol-level static ARP bindings with interface, IP, and MAC fields."
      service={arpService}
      rootKey="arp"
      fields={[
        { key: "interface", label: "Interface", placeholder: "eth2" },
        { key: "ip", label: "IP Address", placeholder: "192.168.20.10" },
        { key: "mac", label: "MAC Address", placeholder: "aa:bb:cc:dd:ee:ff" },
      ]}
      parseItems={(root) => {
        const rows: Array<Record<string, string>> = [];
        const interfaceRoot = asRecord(root.interface);
        for (const [iface, ifaceConfig] of Object.entries(interfaceRoot)) {
          const addressRoot = asRecord(asRecord(ifaceConfig).address);
          for (const [ip, ipConfig] of Object.entries(addressRoot)) {
            rows.push({
              interface: iface,
              ip,
              mac: asString(asRecord(ipConfig).mac),
            });
          }
        }
        return rows;
      }}
      setCommand={(item) => `set protocols static arp interface ${item.interface} address ${item.ip} mac ${item.mac}`}
      deleteCommand={(item) => `delete protocols static arp interface ${item.interface} address ${item.ip}`}
      supportedSettings={["Static ARP Bindings (Interface/IP/MAC)"]}      coverageNote="This page configures static ARP bindings under the protocol static ARP tree."
      emptyStateMessage="No static ARP bindings configured yet."
    />
  );
}
