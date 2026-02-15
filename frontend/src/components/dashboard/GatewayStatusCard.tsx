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
import { showService, type GatewaySummaryResponse } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";
import { ExternalLink, RefreshCw, Route, Settings, X } from "lucide-react";

interface GatewayStatusCardProps {
  onRemove?: () => void;
  span?: number;
  onSpanChange?: (newSpan: number) => void;
}

function displayOrDash(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatMetric(value: number | null | undefined, suffix: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}${suffix}`;
}

type GatewayCardState = "ok" | "warning" | "down" | "empty";

export function GatewayStatusCard({ onRemove, span = 1, onSpanChange }: GatewayStatusCardProps) {
  const [summary, setSummary] = useState<GatewaySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = async (forceRefresh: boolean = false) => {
    try {
      setError(null);
      const response = await showService.getGatewaySummary(forceRefresh);
      setSummary(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load gateway status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);

    if (!autoRefresh) return;
    const interval = setInterval(() => loadData(false), 15000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const cardState: GatewayCardState = useMemo(() => {
    if (!summary) return "empty";
    const active = summary.ipv4_default;
    const configured = summary.configured_ipv4_default;
    if (!active && !configured) return "empty";

    const linkUp = summary.interface?.link_up;
    const hasWarnings = (summary.warnings?.length ?? 0) > 0;

    if (linkUp === false) return "down";
    if (!active && configured) return "warning";
    if (hasWarnings || linkUp === null || linkUp === undefined) return "warning";
    if (active && (!active.next_hop || !active.interface)) return "warning";
    return "ok";
  }, [summary]);

  const statusBadge = useMemo(() => {
    switch (cardState) {
      case "ok":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
            Up
          </Badge>
        );
      case "down":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
            Down
          </Badge>
        );
      case "warning":
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20">
            Warning
          </Badge>
        );
      default:
        return <Badge variant="secondary">No default gateway</Badge>;
    }
  }, [cardState]);

  const active = summary?.ipv4_default ?? null;
  const configured = summary?.configured_ipv4_default ?? null;
  const iface = summary?.interface ?? null;
  const showProbeMetrics = summary?.probe_supported !== false;
  const activeInterfaceName = active?.interface || iface?.name || "";
  const egressInterfaceLabel = activeInterfaceName ? formatInterfaceDisplayName(activeInterfaceName, null) : "-";
  const dhcpInterfacesLabel =
    configured?.dhcp_interfaces
      ?.map((interfaceName) =>
        formatInterfaceDisplayName(interfaceName, null)
      )
      .join(", ") || "-";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <Route className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">Gateway Status</CardTitle>
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
          <Button variant="outline" size="sm" onClick={() => loadData(true)}>
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
        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : loading ? (
          <div className="text-center text-muted-foreground py-6">Loading...</div>
        ) : cardState === "empty" ? (
          <div className="space-y-2">
            {statusBadge}
            <p className="text-sm text-muted-foreground">
              No default gateway configured on this instance.
            </p>
            <Link
              href="/routing/static-failover/static-routes"
              className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80"
            >
              <ExternalLink className="h-4 w-4" />
              View Static Routes
            </Link>
            {summary?.warnings?.length ? (
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-1">
                <p className="text-sm font-medium text-yellow-700">Warnings</p>
                <ul className="text-xs text-muted-foreground list-disc pl-4">
                  {summary.warnings.slice(0, 5).map((warning, idx) => (
                    <li key={`${warning}-${idx}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {statusBadge}
              {active?.source && active.source !== "opstate" && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {active.source}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Active Gateway</p>
                <p className="font-medium font-mono text-xs">{displayOrDash(active?.next_hop)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Egress Interface</p>
                <p className="font-medium font-mono text-xs">{egressInterfaceLabel}</p>
              </div>
            </div>

            {showProbeMetrics && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">RTT</p>
                  <p className="font-medium font-mono text-xs">{formatMetric(summary?.rtt_ms, " ms")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">RTTsd</p>
                  <p className="font-medium font-mono text-xs">{formatMetric(summary?.rttsd_ms, " ms")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Loss</p>
                  <p className="font-medium font-mono text-xs">{formatMetric(summary?.loss_percent, "%")}</p>
                </div>
              </div>
            )}

            {configured && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">Configured Default Route</p>
                  <Link
                    href="/routing/static-failover/static-routes"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <div className="text-xs text-muted-foreground">
                  Next-hops:{" "}
                  <span className="font-mono">
                    {configured.next_hops.length > 0 ? configured.next_hops.join(", ") : "-"}
                  </span>
                </div>
                {configured.dhcp_interfaces.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    DHCP interfaces:{" "}
                    <span className="font-mono">{dhcpInterfacesLabel}</span>
                  </div>
                )}
                {configured.description && (
                  <div className="text-xs text-muted-foreground">
                    Description: <span className="font-mono">{configured.description}</span>
                  </div>
                )}
              </div>
            )}

            {summary?.warnings?.length ? (
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-1">
                <p className="text-sm font-medium text-yellow-700">Warnings</p>
                <ul className="text-xs text-muted-foreground list-disc pl-4">
                  {summary.warnings.slice(0, 5).map((warning, idx) => (
                    <li key={`${warning}-${idx}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
