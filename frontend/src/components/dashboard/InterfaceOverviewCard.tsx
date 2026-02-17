"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ethernetService } from "@/lib/api/ethernet";
import { showService, type InterfacePhysical, type InterfaceRuntimeAddress } from "@/lib/api/show";
import type { EthernetInterface } from "@/lib/api/types/ethernet";
import { formatInterfaceDisplayName } from "@/lib/utils";
import {
  Link2,
  RefreshCw,
  Settings,
  Unplug,
  X,
} from "lucide-react";

interface InterfaceOverviewCardProps {
  onRemove?: () => void;
  span?: number;
  onSpanChange?: (newSpan: number) => void;
  config?: {
    interfaces?: string[];
  };
  onConfigChange?: (config: { interfaces?: string[] }) => void;
}

interface InterfaceRow {
  name: string;
  role: "WAN" | "LAN" | null;
  description: string | null;
  addresses: string[];
  addressingMode: "DHCP" | "Static" | "Mixed" | "Unconfigured";
  addressDetails: string[];
  nicModel: string | null;
  driver: string | null;
  linkUp: boolean | null;
  speed: string | null;
  duplex: string | null;
}

function normalizeLinkDetail(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower.includes("unknown") || lower.includes("(255)")) {
    return null;
  }
  return trimmed;
}

function parsePrivateIpv4(cidrOrIp: string): boolean {
  const ip = cidrOrIp.split("/")[0];
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function interfaceRoleMap(
  interfaces: EthernetInterface[],
  inferredWanInterfaceName: string | null = null
): Map<string, "WAN" | "LAN"> {
  const roleMap = new Map<string, "WAN" | "LAN">();
  if (interfaces.length === 0) return roleMap;

  const sorted = [...interfaces].sort((left, right) => left.name.localeCompare(right.name));
  const normalizedWanInterface = inferredWanInterfaceName?.trim() || null;
  const dhcpCandidates = sorted.filter((iface) =>
    iface.addresses.some((address) => address.trim().toLowerCase() === "dhcp")
  );
  const publicStaticCandidates = sorted.filter((iface) =>
    iface.addresses.some((address) => {
      const cleaned = address.trim();
      return cleaned.length > 0 && cleaned.toLowerCase() !== "dhcp" && !parsePrivateIpv4(cleaned);
    })
  );

  const wan =
    (normalizedWanInterface
      ? sorted.find((iface) => iface.name === normalizedWanInterface)
      : undefined) ??
    (dhcpCandidates.length === 1 ? dhcpCandidates[0] : undefined) ??
    (publicStaticCandidates.length === 1 ? publicStaticCandidates[0] : undefined);

  if (wan) {
    roleMap.set(wan.name, "WAN");
  }

  const lan = sorted.find(
    (iface) =>
      iface.name !== wan?.name &&
      iface.addresses.some((address) => address !== "dhcp" && parsePrivateIpv4(address))
  );
  if (lan) {
    roleMap.set(lan.name, "LAN");
  }

  return roleMap;
}

function prefixToNetmask(prefix: number): string | null {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return null;
  }

  const octets: number[] = [];
  for (let index = 0; index < 4; index++) {
    const remainingBits = Math.max(Math.min(prefix - index * 8, 8), 0);
    const value = remainingBits === 0 ? 0 : (0xff << (8 - remainingBits)) & 0xff;
    octets.push(value);
  }
  return octets.join(".");
}

function formatAddressWithMask(address: string): string {
  const trimmed = address.trim();
  if (!trimmed || trimmed.toLowerCase() === "dhcp") return trimmed;

  const [ip, prefixText] = trimmed.split("/");
  if (!ip || !prefixText) return trimmed;

  const prefix = Number(prefixText);
  if (ip.includes(":")) {
    return `${ip}/${prefixText}`;
  }

  const netmask = prefixToNetmask(prefix);
  if (!netmask) return trimmed;
  return `${ip} (${netmask})`;
}

function summarizeAddressing(addresses: string[], runtimeIpv4Addresses: string[] = []): {
  mode: "DHCP" | "Static" | "Mixed" | "Unconfigured";
  details: string[];
} {
  const cleaned = addresses.map((address) => address.trim()).filter((address) => address.length > 0);
  const hasDhcp = cleaned.some((address) => address.toLowerCase() === "dhcp");
  const staticAddresses = cleaned.filter((address) => address.toLowerCase() !== "dhcp");
  const runtimeIpv4 = runtimeIpv4Addresses
    .map((address) => address.trim())
    .filter((address) => address.length > 0);

  let mode: "DHCP" | "Static" | "Mixed" | "Unconfigured" = "Unconfigured";
  if (hasDhcp && staticAddresses.length > 0) mode = "Mixed";
  else if (hasDhcp) mode = "DHCP";
  else if (staticAddresses.length > 0) mode = "Static";

  const staticDetails = staticAddresses.map(formatAddressWithMask);
  const runtimeDetails = runtimeIpv4.map(formatAddressWithMask);
  const details = [...staticDetails];

  if (mode === "DHCP" || mode === "Mixed") {
    for (const runtimeAddress of runtimeDetails) {
      if (!details.includes(runtimeAddress)) {
        details.push(runtimeAddress);
      }
    }
  }

  if (mode === "DHCP" && details.length === 0) {
    details.push("Address assigned by DHCP");
  } else if (details.length === 0) {
    details.push("No IP configured");
  }

  return { mode, details };
}

export function InterfaceOverviewCard({
  onRemove,
  span = 2,
  onSpanChange,
  config = {},
  onConfigChange,
}: InterfaceOverviewCardProps) {
  const [rows, setRows] = useState<InterfaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const selectedInterfaces = Array.isArray(config.interfaces) ? config.interfaces : [];
  const customInterfaceFilterEnabled = selectedInterfaces.length > 0;

  const availableInterfaces = useMemo(
    () => [...new Set(rows.map((row) => row.name))].sort((left, right) => left.localeCompare(right)),
    [rows]
  );
  const interfaceLabelByName = useMemo(
    () =>
      new Map(
        rows.map((row) => [row.name, formatInterfaceDisplayName(row.name, row.description)])
      ),
    [rows]
  );

  const updateInterfaceSelection = (names: string[]) => {
    if (!onConfigChange) return;
    const next = [...new Set(names.filter((name) => availableInterfaces.includes(name)))].sort();

    // Empty list means "all interfaces" mode.
    if (next.length === 0 || next.length === availableInterfaces.length) {
      onConfigChange({ ...(config || {}), interfaces: [] });
      return;
    }
    onConfigChange({ ...(config || {}), interfaces: next });
  };

  const toggleInterfaceSelection = (interfaceName: string, checked: boolean) => {
    if (!onConfigChange) return;

    if (!customInterfaceFilterEnabled) {
      // Switch from "all" mode to an explicit subset when an item is unchecked.
      if (!checked) {
        updateInterfaceSelection(availableInterfaces.filter((name) => name !== interfaceName));
      }
      return;
    }

    const current = new Set(selectedInterfaces);
    if (checked) {
      current.add(interfaceName);
    } else {
      current.delete(interfaceName);
    }
    updateInterfaceSelection(Array.from(current));
  };

  const loadData = async () => {
    try {
      setError(null);
      const [ethernetConfig, physicalResponse, runtimeResponse, gatewaySummary] = await Promise.all([
        ethernetService.getConfig(),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getInterfaceRuntimeAddresses().catch(() => ({ interfaces: [], total: 0 })),
        showService.getGatewaySummary().catch(() => null),
      ]);

      const inferredWanInterface =
        gatewaySummary?.ipv4_default?.interface ??
        gatewaySummary?.interface?.name ??
        gatewaySummary?.configured_ipv4_default?.dhcp_interfaces?.[0] ??
        null;

      const roleMap = interfaceRoleMap(ethernetConfig.interfaces, inferredWanInterface);
      const physicalByName = new Map<string, InterfacePhysical>();
      for (const detail of physicalResponse.interfaces) {
        physicalByName.set(detail.interface, detail);
      }
      const runtimeByName = new Map<string, InterfaceRuntimeAddress>();
      for (const detail of runtimeResponse.interfaces) {
        runtimeByName.set(detail.interface, detail);
      }

      const mapped = ethernetConfig.interfaces
        .map((iface) => {
          const physical = physicalByName.get(iface.name);
          const runtimeDetail = runtimeByName.get(iface.name);
          const addressing = summarizeAddressing(
            iface.addresses ?? [],
            runtimeDetail?.ipv4_addresses ?? []
          );
          return {
            name: iface.name,
            role: roleMap.get(iface.name) ?? null,
            description: iface.description ?? null,
            addresses: iface.addresses ?? [],
            addressingMode: addressing.mode,
            addressDetails: addressing.details,
            nicModel: physical?.nic_model ?? null,
            driver: physical?.driver ?? null,
            linkUp: physical?.link_up ?? null,
            speed: normalizeLinkDetail(physical?.speed),
            duplex: normalizeLinkDetail(physical?.duplex),
          } satisfies InterfaceRow;
        })
        .sort((left, right) => {
          const roleWeight = (role: InterfaceRow["role"]) => {
            if (role === "WAN") return 0;
            if (role === "LAN") return 1;
            return 2;
          };
          const byRole = roleWeight(left.role) - roleWeight(right.role);
          if (byRole !== 0) return byRole;
          return left.name.localeCompare(right.name);
        });

      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interface overview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (!autoRefresh) return;

    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const filteredRows = useMemo(() => {
    if (!customInterfaceFilterEnabled) return rows;
    return rows.filter((row) => selectedInterfaces.includes(row.name));
  }, [rows, selectedInterfaces, customInterfaceFilterEnabled]);

  const summary = useMemo(() => {
    let up = 0;
    let down = 0;
    let unknown = 0;

    for (const row of filteredRows) {
      if (row.linkUp === true) up += 1;
      else if (row.linkUp === false) down += 1;
      else unknown += 1;
    }

    return { up, down, unknown };
  }, [filteredRows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">Interface Overview</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh((previous) => !previous)}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${autoRefresh ? "animate-spin" : ""}`} />
            Auto-refresh
          </Button>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {(onSpanChange || onConfigChange) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onSpanChange && (
                  <>
                    <DropdownMenuLabel>Card Width</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onSpanChange(1)}>
                      <div className="flex items-center justify-between w-full">
                        <span>Small (1 column)</span>
                        {span === 1 && <span className="ml-2 text-primary">✓</span>}
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSpanChange(2)}>
                      <div className="flex items-center justify-between w-full">
                        <span>Medium (2 columns)</span>
                        {span === 2 && <span className="ml-2 text-primary">✓</span>}
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSpanChange(3)}>
                      <div className="flex items-center justify-between w-full">
                        <span>Large (3 columns)</span>
                        {span === 3 && <span className="ml-2 text-primary">✓</span>}
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSpanChange(4)}>
                      <div className="flex items-center justify-between w-full">
                        <span>Full (4 columns)</span>
                        {span === 4 && <span className="ml-2 text-primary">✓</span>}
                      </div>
                    </DropdownMenuItem>
                  </>
                )}
                {onConfigChange && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Interfaces</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                      checked={!customInterfaceFilterEnabled}
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          updateInterfaceSelection([]);
                        }
                      }}
                    >
                      All Interfaces
                    </DropdownMenuCheckboxItem>
                    {availableInterfaces.map((interfaceName) => (
                      <DropdownMenuCheckboxItem
                        key={interfaceName}
                        checked={
                          !customInterfaceFilterEnabled ||
                          selectedInterfaces.includes(interfaceName)
                        }
                        onCheckedChange={(checked) =>
                          toggleInterfaceSelection(interfaceName, checked === true)
                        }
                      >
                        {interfaceLabelByName.get(interfaceName) ?? interfaceName}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : loading ? (
          <div className="text-center text-muted-foreground py-6">Loading...</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No interfaces available.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Up: {summary.up}</Badge>
              <Badge variant="secondary">Down: {summary.down}</Badge>
              {summary.unknown > 0 && <Badge variant="outline">Unknown: {summary.unknown}</Badge>}
            </div>

            <div className="space-y-2">
              {filteredRows.map((row) => (
                <div key={row.name} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">
                          {formatInterfaceDisplayName(row.name, row.description)}
                        </span>
                        {row.role && (
                          <Badge variant={row.role === "WAN" ? "default" : "secondary"}>{row.role}</Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={
                            row.linkUp === true
                              ? "bg-green-500/10 text-green-600 border-green-500/20"
                              : row.linkUp === false
                                ? "bg-red-500/10 text-red-600 border-red-500/20"
                                : "text-muted-foreground"
                          }
                        >
                          {row.linkUp === true ? "Link Up" : row.linkUp === false ? "Link Down" : "Link Unknown"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Addressing: {row.addressingMode}
                      </p>
                      <div className="space-y-1">
                        {row.addressDetails.slice(0, 2).map((addressLine, index) => (
                          <p key={`${row.name}-${index}`} className="text-xs text-muted-foreground font-mono">
                            {addressLine}
                          </p>
                        ))}
                        {row.addressDetails.length > 2 && (
                          <p className="text-xs text-muted-foreground">
                            +{row.addressDetails.length - 2} additional addresses
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground text-right space-y-1">
                      <p>
                        {row.speed || row.duplex
                          ? [row.speed, row.duplex].filter(Boolean).join(" / ")
                          : "No link detail"}
                      </p>
                      {(row.nicModel || row.driver) && (
                        <p className="max-w-[260px] truncate">
                          {[row.nicModel, row.driver].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {!row.nicModel && !row.driver && (
                        <p className="inline-flex items-center gap-1">
                          <Unplug className="h-3 w-3" />
                          Hardware details unavailable
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
