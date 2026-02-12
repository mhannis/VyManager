"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ethernetService } from "@/lib/api/ethernet";
import { showService, type InterfacePhysical } from "@/lib/api/show";
import type { EthernetInterface } from "@/lib/api/types/ethernet";
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
}

interface InterfaceRow {
  name: string;
  role: "WAN" | "LAN" | null;
  description: string | null;
  addresses: string[];
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

function interfaceRoleMap(interfaces: EthernetInterface[]): Map<string, "WAN" | "LAN"> {
  const roleMap = new Map<string, "WAN" | "LAN">();
  if (interfaces.length === 0) return roleMap;

  const sorted = [...interfaces].sort((left, right) => left.name.localeCompare(right.name));
  const wan =
    sorted.find((iface) => iface.addresses.includes("dhcp")) ??
    sorted.find((iface) => iface.addresses.some((address) => !parsePrivateIpv4(address) && address !== "dhcp")) ??
    sorted[0];
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

function summarizeAddresses(addresses: string[]): string {
  if (addresses.length === 0) return "-";

  if (addresses.includes("dhcp")) {
    return "DHCP";
  }

  const filtered = addresses.filter((address) => address && address !== "dhcp");
  if (filtered.length === 0) return "-";
  if (filtered.length <= 2) return filtered.join(", ");
  return `${filtered[0]}, ${filtered[1]} (+${filtered.length - 2} more)`;
}

export function InterfaceOverviewCard({
  onRemove,
  span = 2,
  onSpanChange,
}: InterfaceOverviewCardProps) {
  const [rows, setRows] = useState<InterfaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = async () => {
    try {
      setError(null);
      const [ethernetConfig, physicalResponse] = await Promise.all([
        ethernetService.getConfig(),
        showService.getInterfacePhysical(),
      ]);

      const roleMap = interfaceRoleMap(ethernetConfig.interfaces);
      const physicalByName = new Map<string, InterfacePhysical>();
      for (const detail of physicalResponse.interfaces) {
        physicalByName.set(detail.interface, detail);
      }

      const mapped = ethernetConfig.interfaces
        .map((iface) => {
          const physical = physicalByName.get(iface.name);
          return {
            name: iface.name,
            role: roleMap.get(iface.name) ?? null,
            description: iface.description ?? null,
            addresses: iface.addresses ?? [],
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

  const summary = useMemo(() => {
    let up = 0;
    let down = 0;
    let unknown = 0;

    for (const row of rows) {
      if (row.linkUp === true) up += 1;
      else if (row.linkUp === false) down += 1;
      else unknown += 1;
    }

    return { up, down, unknown };
  }, [rows]);

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
          {onSpanChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No interfaces available.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Up: {summary.up}</Badge>
              <Badge variant="secondary">Down: {summary.down}</Badge>
              {summary.unknown > 0 && <Badge variant="outline">Unknown: {summary.unknown}</Badge>}
            </div>

            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.name} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{row.name}</span>
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
                      {row.description && (
                        <p className="text-xs text-muted-foreground truncate">{row.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">Address: {summarizeAddresses(row.addresses)}</p>
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
