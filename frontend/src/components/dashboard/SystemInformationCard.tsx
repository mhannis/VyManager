"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Cpu,
  MemoryStick,
  RefreshCw,
  Server,
  Settings,
  X,
} from "lucide-react";
import { systemService, type SystemDashboardSummary } from "@/lib/api/system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SystemInformationCardProps {
  onRemove?: () => void;
  span?: number;
  onSpanChange?: (newSpan: number) => void;
}

function displayOrDash(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function SystemInformationCard({
  onRemove,
  span = 1,
  onSpanChange,
}: SystemInformationCardProps) {
  const [summary, setSummary] = useState<SystemDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = async () => {
    try {
      setError(null);
      const response = await systemService.getDashboardSummary();
      setSummary(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system information");
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">System Information</CardTitle>
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
        ) : summary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Hostname</p>
                <p className="font-medium">{displayOrDash(summary.hostname)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Version</p>
                <p className="font-medium">{displayOrDash(summary.version)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Hardware Model</p>
                <p className="font-medium">{displayOrDash(summary.hardware_model)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Architecture</p>
                <p className="font-medium">{displayOrDash(summary.architecture)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Uptime</p>
                <p className="font-medium">{displayOrDash(summary.uptime)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Load Average</p>
                <p className="font-medium">
                  {summary.load_1m_percent !== null && summary.load_1m_percent !== undefined
                    ? `${summary.load_1m_percent.toFixed(1)}% / ${
                        summary.load_5m_percent?.toFixed(1) ?? "-"
                      }% / ${summary.load_15m_percent?.toFixed(1) ?? "-"}%`
                    : "-"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  <p className="font-medium text-sm">CPU</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary.cpu_models.length > 0
                    ? summary.cpu_models.join(" | ")
                    : "Model information unavailable"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    Sockets: {displayOrDash(summary.cpu_socket_count)}
                  </Badge>
                  <Badge variant="secondary">Cores: {displayOrDash(summary.cpu_cores)}</Badge>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <MemoryStick className="h-4 w-4 text-primary" />
                  <p className="font-medium text-sm">Memory</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Used {displayOrDash(summary.memory_used_human)} / {displayOrDash(summary.memory_total_human)}
                </div>
                <Progress value={summary.memory_used_percent ?? 0} className="h-2" />
                <div className="text-xs font-medium">
                  {summary.memory_used_percent !== null && summary.memory_used_percent !== undefined
                    ? `${summary.memory_used_percent.toFixed(1)}% used`
                    : "Usage unavailable"}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No system information available.</div>
        )}
      </CardContent>
    </Card>
  );
}
