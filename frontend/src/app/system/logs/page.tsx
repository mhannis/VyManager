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
import { systemService, type SystemLogsResponse, type SystemLogSource } from "@/lib/api/system";
import { AlertCircle, Download, RefreshCw, Search } from "lucide-react";

type LogServiceFilter =
  | "all"
  | "ipsec"
  | "dhcp"
  | "dns"
  | "ssh"
  | "ntp"
  | "lldp"
  | "mdns"
  | "container"
  | `process:${string}`;

const SERVICE_FILTERS: Array<{ value: Exclude<LogServiceFilter, `process:${string}`>; label: string; tokens: string[] }> = [
  { value: "all", label: "All services", tokens: [] },
  { value: "ipsec", label: "IPsec / IKE", tokens: ["charon", "pluto", "ipsec", "ike"] },
  { value: "dhcp", label: "DHCP", tokens: ["dhcp", "kea"] },
  { value: "dns", label: "DNS", tokens: ["dns", "unbound", "bind", "named", "resolver"] },
  { value: "ssh", label: "SSH", tokens: ["ssh", "sshd"] },
  { value: "ntp", label: "NTP", tokens: ["ntp", "chrony", "chronyd"] },
  { value: "lldp", label: "LLDP", tokens: ["lldp", "lldpd"] },
  { value: "mdns", label: "mDNS", tokens: ["mdns", "avahi"] },
  { value: "container", label: "Containers", tokens: ["container", "docker", "podman"] },
];

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
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [lineCount, setLineCount] = useState("200");
  const [logSource, setLogSource] = useState<SystemLogSource>("auto");
  const [serviceFilter, setServiceFilter] = useState<LogServiceFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [logs, setLogs] = useState<SystemLogsResponse | null>(null);

  const parsedLineCount = Number.parseInt(lineCount, 10);
  const effectiveLineCount = Number.isNaN(parsedLineCount) ? 200 : parsedLineCount;

  const loadData = async () => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemService.getLogs(effectiveLineCount, searchFilter || undefined, logSource);
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
  }, [lineCount, searchFilter, logSource]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, lineCount, searchFilter, logSource]);

  const entries = useMemo(() => logs?.entries || [], [logs]);
  const availableProcesses = useMemo(() => {
    const discovered = new Set<string>();
    for (const entry of entries) {
      const processValue = (entry.process || "").trim();
      if (!processValue) {
        continue;
      }
      discovered.add(processValue);
    }
    return Array.from(discovered).sort((left, right) => left.localeCompare(right));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (serviceFilter === "all") {
      return entries;
    }

    if (serviceFilter.startsWith("process:")) {
      const expected = serviceFilter.slice("process:".length).toLowerCase();
      return entries.filter((entry) => (entry.process || "").toLowerCase() === expected);
    }

    const filter = SERVICE_FILTERS.find((item) => item.value === serviceFilter);
    if (!filter || filter.tokens.length === 0) {
      return entries;
    }

    return entries.filter((entry) => {
      const processValue = (entry.process || "").toLowerCase();
      const messageValue = (entry.message || "").toLowerCase();
      const rawValue = (entry.raw || "").toLowerCase();
      return filter.tokens.some(
        (token) => processValue.includes(token) || messageValue.includes(token) || rawValue.includes(token),
      );
    });
  }, [entries, serviceFilter]);

  const handleDownload = async () => {
    try {
      setError(null);
      setDownloading(true);

      if (serviceFilter !== "all") {
        if (filteredEntries.length === 0) {
          throw new Error("No log entries match the selected service filter.");
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const serviceLabel =
          serviceFilter.startsWith("process:") ? serviceFilter.slice("process:".length) : serviceFilter;
        const content = filteredEntries.map((entry) => entry.raw || entry.message || "").join("\n");
        const blob = new Blob([content.endsWith("\n") ? content : `${content}\n`], { type: "text/plain" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `vyos-${logSource}-logs-${serviceLabel}-${timestamp}.log`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
        return;
      }

      const params = new URLSearchParams({
        lines: String(effectiveLineCount),
        source: logSource,
      });
      if (searchFilter && searchFilter.trim()) {
        params.set("contains", searchFilter.trim());
      }

      const response = await fetch(`/api/vyos/system/logs/download?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        let message = `Failed to download logs (${response.status})`;

        if (contentType.includes("application/json")) {
          const payload = await response.json();
          const detail = payload?.detail || payload?.error || payload?.message;
          if (typeof detail === "string" && detail.trim()) {
            message = detail.trim();
          }
        } else {
          const raw = await response.text();
          const trimmed = raw.trim();
          if (trimmed) {
            message = trimmed.slice(0, 300);
          }
        }

        throw new Error(message);
      }

      const disposition = response.headers.get("content-disposition") || "";
      const filenameMatch = /filename=\"?([^\";]+)\"?/i.exec(disposition);
      const filename = filenameMatch?.[1] || `vyos-${logSource}-logs.log`;

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download logs");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">System Logs</h1>
            <p className="text-muted-foreground mt-1">
              View recent VyOS log messages and filter by text or service.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleDownload} disabled={downloading}>
              <Download className="mr-2 h-4 w-4" />
              {downloading ? "Downloading..." : "Download"}
            </Button>
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
              <p className="mt-1 text-2xl font-bold">{filteredEntries.length}</p>
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
          <CardContent className="grid gap-3 md:grid-cols-5">
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
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Log Source</p>
              <Select value={logSource} onValueChange={(value) => setLogSource(value as SystemLogSource)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="syslog">Syslog (show log)</SelectItem>
                  <SelectItem value="tail">Tail (show log tail)</SelectItem>
                  <SelectItem value="system">System (show system logs)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Service</p>
              <Select value={serviceFilter} onValueChange={(value) => setServiceFilter(value as LogServiceFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_FILTERS.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                  {availableProcesses.map((processName) => (
                    <SelectItem key={processName} value={`process:${processName}`}>
                      Process: {processName}
                    </SelectItem>
                  ))}
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
            ) : filteredEntries.length === 0 ? (
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
                    {filteredEntries.map((entry, index) => (
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
