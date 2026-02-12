"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { systemService, type SystemLogsResponse } from "@/lib/api/system";
import { AlertCircle, RefreshCw, Search } from "lucide-react";

function severityColor(severity?: string | null): string {
  const normalized = (severity || "").toLowerCase();
  if (["emerg", "alert", "crit", "err"].includes(normalized)) {
    return "bg-red-500/10 text-red-600 border-red-500/20";
  }
  if (normalized === "warning") {
    return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  }
  if (normalized === "notice" || normalized === "info") {
    return "bg-blue-500/10 text-blue-600 border-blue-500/20";
  }
  if (normalized === "debug") {
    return "bg-muted text-muted-foreground border-border";
  }
  return "bg-muted text-muted-foreground border-border";
}

export default function SystemLogsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [lineCount, setLineCount] = useState("200");
  const [searchInput, setSearchInput] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [logs, setLogs] = useState<SystemLogsResponse | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      setRefreshing(true);
      const count = Number.parseInt(lineCount, 10);
      const response = await systemService.getLogs(Number.isNaN(count) ? 200 : count, searchFilter || undefined);
      setLogs(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system logs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [lineCount, searchFilter]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, lineCount, searchFilter]);

  const entries = useMemo(() => logs?.entries || [], [logs]);

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">System Logs</h1>
            <p className="text-muted-foreground mt-1">
              View recent VyOS log messages and filter by text.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={autoRefresh ? "default" : "outline"}
              onClick={() => setAutoRefresh((previous) => !previous)}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`} />
              Auto-refresh
            </Button>
            <Button variant="outline" onClick={loadData} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Source</p>
              <p className="mt-1 text-sm font-medium">{logs?.source_command || "-"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Returned</p>
              <p className="mt-1 text-2xl font-bold">{logs?.returned_lines || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total in Output</p>
              <p className="mt-1 text-2xl font-bold">{logs?.total_lines || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1">
                <Badge variant={logs?.available ? "default" : "secondary"}>
                  {logs?.available ? "Available" : "Unavailable"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Line Count</p>
              <Select value={lineCount} onValueChange={setLineCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1000</SelectItem>
                  <SelectItem value="2000">2000</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Search</p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Match in raw log lines..."
                    className="pl-9"
                  />
                </div>
                <Button onClick={() => setSearchFilter(searchInput.trim())}>Apply</Button>
                {searchFilter && (
                  <Button variant="ghost" onClick={() => {
                    setSearchInput("");
                    setSearchFilter("");
                  }}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading logs...</div>
            ) : entries.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No log entries found.</div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Timestamp</TableHead>
                      <TableHead className="w-[180px]">Process</TableHead>
                      <TableHead className="w-[110px]">Severity</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry, index) => (
                      <TableRow key={`${entry.timestamp || "ts"}-${entry.process || "proc"}-${index}`}>
                        <TableCell className="font-mono text-xs">
                          {entry.timestamp || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {entry.process || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={severityColor(entry.severity)}>
                            {(entry.severity || "unknown").toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{entry.message || entry.raw}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
