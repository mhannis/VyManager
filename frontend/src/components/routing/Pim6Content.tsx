"use client";

import { ProtocolSimpleListEditor, asRecord, asString } from "./ProtocolSimpleListEditor";
import { pim6Service } from "@/lib/api/pim6";

function parseMode(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  const modeObj = asRecord(value);
  const first = Object.keys(modeObj)[0];
  return asString(first) || "sm";
}

export function Pim6Content() {
  return (
    <ProtocolSimpleListEditor
      title="PIM6"
      description="Configure IPv6 PIM interfaces and mode through structured fields."
      service={pim6Service}
      rootKey="pim6"
      fields={[
        { key: "interface", label: "Interface", placeholder: "eth1" },
        {
          key: "mode",
          label: "Mode",
          type: "select",
          options: [
            { value: "sm", label: "Sparse Mode (SM)" },
            { value: "dm", label: "Dense Mode (DM)" },
            { value: "sparse-dense", label: "Sparse-Dense" },
          ],
        },
      ]}
      parseItems={(root) => {
        const rows: Array<Record<string, string>> = [];
        const interfaceRoot = asRecord(root.interface);
        for (const [iface, ifaceConfig] of Object.entries(interfaceRoot)) {
          rows.push({
            interface: iface,
            mode: parseMode(asRecord(ifaceConfig).mode),
          });
        }
        return rows;
      }}
      setCommand={(item) => `set protocols pim6 interface ${item.interface} mode ${item.mode}`}
      deleteCommand={(item) => `delete protocols pim6 interface ${item.interface}`}
      supportedSettings={["PIM6 Interfaces", "Per-interface Mode"]}      coverageNote="This page configures PIM interface participation and mode for IPv6 multicast."
      emptyStateMessage="No PIM6 interfaces configured yet."
    />
  );
}
