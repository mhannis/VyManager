"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock3,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";
import { systemService, type NtpStatus } from "@/lib/api/system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface NtpStatusCardProps {
  onRemove?: () => void;
  span?: number;
  onSpanChange?: (newSpan: number) => void;
}

function displayOrDash(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function NtpStatusCard({ onRemove, span = 1, onSpanChange }: NtpStatusCardProps) {
  const [status, setStatus] = useState<NtpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = async () => {
    try {
      setError(null);
      const response = await systemService.getNtpStatus();
      setStatus(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load NTP status");
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
          <Clock3 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">NTP Status</CardTitle>
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
        ) : status ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status.enabled ? "default" : "secondary"}>
                {status.enabled ? "Service Enabled" : "Service Disabled"}
              </Badge>
              {status.enabled && (
                <Badge
                  variant="outline"
                  className={
                    status.synchronized === true
                      ? "bg-green-500/10 text-green-600 border-green-500/20"
                      : status.synchronized === false
                        ? "bg-red-500/10 text-red-600 border-red-500/20"
                        : "bg-muted text-muted-foreground"
                  }
                >
                  {status.synchronized === true
                    ? "Synchronized"
                    : status.synchronized === false
                      ? "Not synchronized"
                      : "Sync unknown"}
                </Badge>
              )}
            </div>

            {!status.enabled ? (
              <p className="text-sm text-muted-foreground">
                NTP service is not enabled on this VyOS instance.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Reference</p>
                    <p className="font-medium">
                      {displayOrDash(status.reference_name || status.reference_id)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Stratum</p>
                    <p className="font-medium">{displayOrDash(status.stratum)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Leap Status</p>
                    <p className="font-medium">{displayOrDash(status.leap_status)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Update Interval</p>
                    <p className="font-medium">{displayOrDash(status.update_interval)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Offset</p>
                    <p className="font-medium">{displayOrDash(status.last_offset)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">RMS Offset</p>
                    <p className="font-medium">{displayOrDash(status.rms_offset)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Online: {displayOrDash(status.sources_online)}</Badge>
                  <Badge variant="secondary">Offline: {displayOrDash(status.sources_offline)}</Badge>
                  <Badge variant="secondary">Unknown: {displayOrDash(status.sources_unknown)}</Badge>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Sources</p>
                  {status.sources.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No source table data returned.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Source</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Stratum</TableHead>
                            <TableHead className="text-right">Reach</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {status.sources.slice(0, 6).map((source, index) => (
                            <TableRow key={`${source.source}-${index}`}>
                              <TableCell className="font-mono text-xs">{displayOrDash(source.source)}</TableCell>
                              <TableCell>{`${source.mode ?? ""}${source.state ?? ""}`.trim() || "-"}</TableCell>
                              <TableCell className="text-right">{displayOrDash(source.stratum)}</TableCell>
                              <TableCell className="text-right">{displayOrDash(source.reach)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No NTP status available.</div>
        )}
      </CardContent>
    </Card>
  );
}
