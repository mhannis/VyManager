"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dhcpService } from "@/lib/api/dhcp";
import { systemService } from "@/lib/api/system";
import { Activity, ExternalLink, RefreshCw, Settings, X } from "lucide-react";

type ServiceState = "enabled" | "disabled" | "unknown";

interface ServiceRow {
  key: string;
  name: string;
  state: ServiceState;
  detail: string;
  href: string;
}

interface ServicesStatusCardProps {
  onRemove?: () => void;
  span?: number;
  onSpanChange?: (newSpan: number) => void;
}

function ServiceStateBadge({ state }: { state: ServiceState }) {
  if (state === "enabled") {
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
        Enabled
      </Badge>
    );
  }
  if (state === "disabled") {
    return (
      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20">
        Disabled
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground">
      Unknown
    </Badge>
  );
}

export function ServicesStatusCard({ onRemove, span = 1, onSpanChange }: ServicesStatusCardProps) {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = async () => {
    try {
      setError(null);

      const [
        sshResult,
        ntpResult,
        lldpResult,
        mdnsResult,
        dnsResult,
        dhcpResult,
      ] = await Promise.allSettled([
        systemService.getSshConfig(),
        systemService.getNtpStatus(),
        systemService.getLldpStatus(true),
        systemService.getMdnsStatus(),
        systemService.getDnsConfig(),
        dhcpService.getConfig(),
      ]);

      const nextRows: ServiceRow[] = [];
      let failedCalls = 0;

      if (sshResult.status === "fulfilled") {
        nextRows.push({
          key: "ssh",
          name: "SSH",
          state: sshResult.value.enabled ? "enabled" : "disabled",
          detail: sshResult.value.enabled
            ? `Port ${sshResult.value.port ?? 22}`
            : "Remote CLI disabled",
          href: "/system/services?tab=ssh&view=single",
        });
      } else {
        failedCalls += 1;
        nextRows.push({
          key: "ssh",
          name: "SSH",
          state: "unknown",
          detail: "Status unavailable",
          href: "/system/services?tab=ssh&view=single",
        });
      }

      if (ntpResult.status === "fulfilled") {
        nextRows.push({
          key: "ntp",
          name: "NTP",
          state: ntpResult.value.enabled ? "enabled" : "disabled",
          detail: ntpResult.value.enabled
            ? ntpResult.value.synchronized === true
              ? "Synchronized"
              : ntpResult.value.synchronized === false
                ? "Not synchronized"
                : "Sync status unknown"
            : "Time service disabled",
          href: "/system/services?tab=ntp&view=single",
        });
      } else {
        failedCalls += 1;
        nextRows.push({
          key: "ntp",
          name: "NTP",
          state: "unknown",
          detail: "Status unavailable",
          href: "/system/services?tab=ntp&view=single",
        });
      }

      if (lldpResult.status === "fulfilled") {
        const neighborCount = lldpResult.value.neighbors?.length ?? 0;
        nextRows.push({
          key: "lldp",
          name: "LLDP",
          state: lldpResult.value.enabled ? "enabled" : "disabled",
          detail: lldpResult.value.enabled
            ? `${neighborCount} neighbor${neighborCount === 1 ? "" : "s"}`
            : "Discovery disabled",
          href: "/system/services?tab=lldp&view=single",
        });
      } else {
        failedCalls += 1;
        nextRows.push({
          key: "lldp",
          name: "LLDP",
          state: "unknown",
          detail: "Status unavailable",
          href: "/system/services?tab=lldp&view=single",
        });
      }

      if (mdnsResult.status === "fulfilled") {
        nextRows.push({
          key: "mdns",
          name: "mDNS Repeater",
          state: mdnsResult.value.enabled ? "enabled" : "disabled",
          detail: mdnsResult.value.enabled ? "Forwarding active" : "Forwarding disabled",
          href: "/system/services?tab=mdns&view=single",
        });
      } else {
        failedCalls += 1;
        nextRows.push({
          key: "mdns",
          name: "mDNS Repeater",
          state: "unknown",
          detail: "Status unavailable",
          href: "/system/services?tab=mdns&view=single",
        });
      }

      if (dnsResult.status === "fulfilled") {
        const resolverCount = dnsResult.value.name_servers?.length ?? 0;
        nextRows.push({
          key: "dns",
          name: "DNS",
          state: dnsResult.value.enabled ? "enabled" : "disabled",
          detail: dnsResult.value.enabled
            ? `${resolverCount} upstream resolver${resolverCount === 1 ? "" : "s"}`
            : "Service disabled",
          href: "/system/services?tab=dns&view=single",
        });
      } else {
        failedCalls += 1;
        nextRows.push({
          key: "dns",
          name: "DNS",
          state: "unknown",
          detail: "Status unavailable",
          href: "/system/services?tab=dns&view=single",
        });
      }

      if (dhcpResult.status === "fulfilled") {
        const subnetCount = dhcpResult.value.total_subnets ?? 0;
        nextRows.push({
          key: "dhcp-server",
          name: "DHCP Server",
          state: subnetCount > 0 ? "enabled" : "disabled",
          detail: subnetCount > 0
            ? `${subnetCount} active subnet${subnetCount === 1 ? "" : "s"}`
            : "No subnet scopes configured",
          href: "/system/services?tab=dhcp-server&view=single",
        });
      } else {
        failedCalls += 1;
        nextRows.push({
          key: "dhcp-server",
          name: "DHCP Server",
          state: "unknown",
          detail: "Status unavailable",
          href: "/system/services?tab=dhcp-server&view=single",
        });
      }

      setRows(nextRows);
      if (failedCalls > 0) {
        setError(`${failedCalls} service check${failedCalls === 1 ? "" : "s"} unavailable.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load service status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    if (!autoRefresh) return;
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const summary = useMemo(() => {
    let enabled = 0;
    let disabled = 0;
    let unknown = 0;

    for (const row of rows) {
      if (row.state === "enabled") enabled += 1;
      else if (row.state === "disabled") disabled += 1;
      else unknown += 1;
    }
    return { enabled, disabled, unknown };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">Services Status</CardTitle>
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
          <Button variant="outline" size="sm" onClick={() => loadData()}>
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
                <DropdownMenuItem onClick={() => onSpanChange(4)}>
                  <div className="flex items-center justify-between w-full">
                    <span>Full (4 columns)</span>
                    {span === 4 && <span className="ml-2 text-primary">✓</span>}
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
        {loading ? (
          <div className="text-center text-muted-foreground py-6">Loading...</div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="text-xs text-yellow-700 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1">
                {error}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                Enabled: {summary.enabled}
              </Badge>
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20">
                Disabled: {summary.disabled}
              </Badge>
              {summary.unknown > 0 && (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  Unknown: {summary.unknown}
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="rounded-md border px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.detail}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ServiceStateBadge state={row.state} />
                    <Link
                      href={row.href}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                    >
                      Open
                      <ExternalLink className="h-3 w-3" />
                    </Link>
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
