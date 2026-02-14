"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { protocolsService, ProtocolsCapabilities, ProtocolsConfigResponse } from "@/lib/api/protocols";

const SECTION_LINKS = [
  {
    title: "Unicast Protocols",
    description: "BGP, OSPF, IS-IS, RIP, and other unicast routing protocols.",
    href: "/routing/unicast-protocols",
  },
  {
    title: "Static & Failover",
    description: "Static routes and route failover/tracking configuration.",
    href: "/routing/static-failover/static-routes",
  },
  {
    title: "Infrastructure",
    description: "BFD, ARP, MPLS, segment routing, and RPKI.",
    href: "/routing/infrastructure",
  },
  {
    title: "Multicast",
    description: "IGMP Proxy, PIM, and PIM6 multicast routing features.",
    href: "/routing/multicast",
  },
];

export default function ProtocolsIndexPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<ProtocolsCapabilities | null>(null);
  const [config, setConfig] = useState<ProtocolsConfigResponse | null>(null);

  const loadData = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const [capabilitiesData, configData] = await Promise.all([
        protocolsService.getCapabilities(),
        protocolsService.getConfig(refresh),
      ]);
      setCapabilities(capabilitiesData);
      setConfig(configData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load protocols overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const configuredProtocols = useMemo(() => {
    const protocols = config?.protocols;
    if (!protocols || typeof protocols !== "object") {
      return [] as string[];
    }
    return Object.keys(protocols).sort((left, right) => left.localeCompare(right));
  }, [config]);

  return (
    <AppLayout>
      <div className="flex h-full flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Protocols</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Routing protocol overview and quick access to protocol configuration sections.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Protocol Status</CardTitle>
              <CardDescription>
                {loading ? "Loading protocol data..." : `Configured protocol sections: ${configuredProtocols.length}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading protocol configuration...</p>
              ) : configuredProtocols.length === 0 ? (
                <p className="text-sm text-muted-foreground">No protocol configuration detected.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {configuredProtocols.map((name) => (
                    <Badge key={name} variant="secondary" className="font-mono text-[11px]">
                      {name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Instance</CardTitle>
              <CardDescription>Current connected VyOS instance information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Version: </span>
                <span className="font-medium">{capabilities?.version ?? "Unknown"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Instance: </span>
                <span className="font-medium">{capabilities?.instance_name ?? "Active instance"}</span>
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {SECTION_LINKS.map((section) => (
            <Card key={section.href}>
              <CardHeader>
                <CardTitle className="text-lg">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={section.href}>Open {section.title}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
