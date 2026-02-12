"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  HardDrive,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";
import { systemService, type DiskStatus } from "@/lib/api/system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DiskUsageCardProps {
  onRemove?: () => void;
  span?: number;
  onSpanChange?: (newSpan: number) => void;
}

function displayOrDash(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function DiskUsageCard({ onRemove, span = 1, onSpanChange }: DiskUsageCardProps) {
  const [disk, setDisk] = useState<DiskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = async () => {
    try {
      setError(null);
      const response = await systemService.getDiskStatus();
      setDisk(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load disk status");
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">Disk Usage</CardTitle>
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
        ) : disk ? (
          !disk.available ? (
            <div className="space-y-2">
              <Badge variant="secondary">Storage Unavailable</Badge>
              <p className="text-sm text-muted-foreground">
                Disk statistics are not available on this instance.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Filesystem</p>
                  <p className="font-mono text-xs">{displayOrDash(disk.filesystem)}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-muted-foreground">Size</p>
                    <p className="font-medium">{displayOrDash(disk.size_human)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Used</p>
                    <p className="font-medium">{displayOrDash(disk.used_human)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Free</p>
                    <p className="font-medium">{displayOrDash(disk.available_human)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Usage</span>
                  <span className="font-medium">{displayOrDash(disk.used_percent)}%</span>
                </div>
                <Progress value={disk.used_percent ?? 0} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{displayOrDash(disk.used_percent)}% used</span>
                  <span>{displayOrDash(disk.available_percent)}% free</span>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="text-sm text-muted-foreground">No disk information available.</div>
        )}
      </CardContent>
    </Card>
  );
}
