"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ipsecService, type IPsecConfig, type IPsecStatus, type PeerSummary } from "@/lib/api/ipsec";
import {
  AlertCircle,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
} from "lucide-react";

function valueOrDash(value?: string | null): string {
  if (!value) return "-";
  const trimmed = value.trim();
  return trimmed || "-";
}

export default function IPsecPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [config, setConfig] = useState<IPsecConfig | null>(null);
  const [peers, setPeers] = useState<PeerSummary[]>([]);
  const [status, setStatus] = useState<IPsecStatus | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      setRefreshing(true);
      const [configData, peerData, statusData] = await Promise.all([
        ipsecService.getConfig(),
        ipsecService.getPeers(),
        ipsecService.getStatus().catch(() => null),
      ]);
      setConfig(configData);
      setPeers(peerData);
      setStatus(statusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load IPsec data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredPeers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return peers;
    return peers.filter((peer) => {
      const values = [
        peer.peer_id,
        peer.description,
        peer.local_address,
        peer.remote_address,
        peer.ike_group,
        peer.vti_interface,
        peer.connection_type,
      ];
      return values.some((value) => value?.toLowerCase().includes(needle));
    });
  }, [peers, search]);

  const ikeGroupCount = Object.keys(config?.["ike-group"] || {}).length;
  const espGroupCount = Object.keys(config?.["esp-group"] || {}).length;
  const pskCount = Object.keys(config?.psk_secrets || {}).length;

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">IPsec VPN</h1>
            <p className="text-muted-foreground mt-1">
              View IPsec groups, peers, and runtime tunnel status.
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Peers</p>
              <p className="mt-1 text-2xl font-bold">{peers.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">IKE Groups</p>
              <p className="mt-1 text-2xl font-bold">{ikeGroupCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">ESP Groups</p>
              <p className="mt-1 text-2xl font-bold">{espGroupCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">PSK Entries</p>
              <p className="mt-1 text-2xl font-bold">{pskCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Runtime</p>
              <div className="mt-1 flex items-center gap-2">
                {!status?.available ? (
                  <Badge variant="outline">
                    <ShieldQuestion className="mr-1 h-3 w-3" />
                    Unavailable
                  </Badge>
                ) : status.established_count > 0 ? (
                  <Badge className="bg-green-600 hover:bg-green-600">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Established
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <ShieldOff className="mr-1 h-3 w-3" />
                    Idle
                  </Badge>
                )}
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
            <CardTitle className="text-lg">Site-to-Site Peers</CardTitle>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by peer, endpoint, IKE group, or VTI..."
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading IPsec peers...</div>
            ) : filteredPeers.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No peers found.</div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Peer</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Local Address</TableHead>
                      <TableHead>Remote Address</TableHead>
                      <TableHead>IKE Group</TableHead>
                      <TableHead>Connection Type</TableHead>
                      <TableHead>VTI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPeers.map((peer) => (
                      <TableRow key={peer.peer_id}>
                        <TableCell className="font-mono font-medium">{peer.peer_id}</TableCell>
                        <TableCell>{valueOrDash(peer.description)}</TableCell>
                        <TableCell className="font-mono">{valueOrDash(peer.local_address)}</TableCell>
                        <TableCell className="font-mono">{valueOrDash(peer.remote_address)}</TableCell>
                        <TableCell>{valueOrDash(peer.ike_group)}</TableCell>
                        <TableCell>{valueOrDash(peer.connection_type)}</TableCell>
                        <TableCell className="font-mono">{valueOrDash(peer.vti_interface)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">IKE Groups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(config?.["ike-group"] || {}).length === 0 ? (
                <p className="text-muted-foreground">No IKE groups configured.</p>
              ) : (
                Object.entries(config?.["ike-group"] || {}).map(([name, group]) => (
                  <div key={name} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{name}</span>
                      <Badge variant="outline">{valueOrDash(group["key-exchange"])}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Lifetime: {valueOrDash(group.lifetime)}</span>
                      <span>Proposals: {Object.keys(group.proposals || {}).length}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ESP Groups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(config?.["esp-group"] || {}).length === 0 ? (
                <p className="text-muted-foreground">No ESP groups configured.</p>
              ) : (
                Object.entries(config?.["esp-group"] || {}).map(([name, group]) => (
                  <div key={name} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{name}</span>
                      <Badge variant="outline">
                        <KeyRound className="mr-1 h-3 w-3" />
                        {valueOrDash(group.pfs)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Mode: {valueOrDash(group.mode)}</span>
                      <span>Lifetime: {valueOrDash(group.lifetime)}</span>
                      <span>Proposals: {Object.keys(group.proposals || {}).length}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
