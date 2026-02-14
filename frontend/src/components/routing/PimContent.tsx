"use client";

import { ProtocolSimpleListEditor, asRecord, asString } from "./ProtocolSimpleListEditor";
import { pimService } from "@/lib/api/pim";

function parseMode(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  const modeObj = asRecord(value);
  const first = Object.keys(modeObj)[0];
  return asString(first) || "sm";
}

export function PimContent() {
  return (
    <ProtocolSimpleListEditor
      title="PIM"
      description="Configure IPv4 PIM interfaces and mode in a guided editor."
      service={pimService}
      rootKey="pim"
      fields={[
        { key: "interface", label: "PIM Interface", placeholder: "eth1" },
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
      setCommand={(item) => `set protocols pim interface ${item.interface} mode ${item.mode}`}
      deleteCommand={(item) => `delete protocols pim interface ${item.interface}`}
      supportedSettings={["PIM Interfaces", "Per-interface Mode"]}      coverageNote="This page configures PIM interface participation and mode for IPv4 multicast."
      emptyStateMessage="No PIM interfaces configured yet."
    />
  );
}
