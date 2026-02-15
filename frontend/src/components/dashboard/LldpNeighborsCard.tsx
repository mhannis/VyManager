"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { systemService, type LldpNeighbor, type LldpStatus } from "@/lib/api/system";
import { RefreshCw, Settings, Waypoints, X } from "lucide-react";

interface LldpNeighborsCardProps {
  onRemove?: () => void;
  span?: number;
  onSpanChange?: (newSpan: number) => void;
}

function normalizeText(value?: string | null): string {
  return value && value.trim().length > 0 ? value.trim() : "-";
}

export function LldpNeighborsCard({ onRemove, span = 1, onSpanChange }: LldpNeighborsCardProps) {
  const [status, setStatus] = useState<LldpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = async (refresh: boolean = true) => {
    try {
      setError(null);
      const response = await systemService.getLldpStatus(refresh);
      setStatus(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load LLDP status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);

    if (!autoRefresh) return;
    const interval = setInterval(() => loadData(true), 15000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const neighbors = useMemo<LldpNeighbor[]>(() => status?.neighbors ?? [], [status?.neighbors]);
  const previewRows = neighbors.slice(0, 6);
  const hasMore = neighbors.length > previewRows.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <Waypoints className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">LLDP Neighbors</CardTitle>
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
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={
                  status?.enabled
                    ? "bg-green-500/10 text-green-600 border-green-500/20"
                    : "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
                }
              >
                {status?.enabled ? "LLDP Enabled" : "LLDP Disabled"}
              </Badge>
              <Badge variant="secondary">{neighbors.length} neighbor(s)</Badge>
            </div>

            {status?.error ? (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-800">
                {status.error}
              </div>
            ) : null}

            {neighbors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No LLDP neighbors discovered yet.
              </p>
            ) : (
              <div className="space-y-2">
                {previewRows.map((neighbor, index) => (
                  <div key={`${neighbor.local_interface}-${neighbor.system_name}-${index}`} className="rounded-md border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium">
                        {normalizeText(neighbor.local_interface)}
                      </span>
                      <span className="text-muted-foreground">
                        {normalizeText(neighbor.port_id)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {normalizeText(neighbor.system_name)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {normalizeText(neighbor.port_description)}
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <p className="text-xs text-muted-foreground">
                    +{neighbors.length - previewRows.length} additional neighbors not shown.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
