"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Lock, RefreshCw } from "lucide-react";
import { vpnOverviewApi } from "@/lib/api/vpn-overview";
import { toRecord } from "@/components/system/serviceTabHelpers";

type VpnProtocolItem = {
  key: string;
  title: string;
  description: string;
  href: string;
};

const VPN_PROTOCOLS: VpnProtocolItem[] = [
  {
    key: "ipsec",
    title: "IPsec",
    description: "Site-to-site and mobile IPsec tunnel configuration.",
    href: "/vpn/ipsec",
  },
  {
    key: "wireguard",
    title: "WireGuard",
    description: "WireGuard interface and peer management.",
    href: "/vpn/wireguard",
  },
  {
    key: "l2tp",
    title: "L2TP",
    description: "L2TP remote-access VPN with local/radius authentication.",
    href: "/vpn/l2tp",
  },
  {
    key: "openconnect",
    title: "OpenConnect",
    description: "OpenConnect SSL VPN server settings and user auth.",
    href: "/vpn/openconnect",
  },
  {
    key: "pptp",
    title: "PPTP Server",
    description: "PPTP remote-access VPN settings and client pools.",
    href: "/vpn/pptp",
  },
  {
    key: "sstp",
    title: "SSTP Server",
    description: "SSTP server settings, certificates, and client pools.",
    href: "/vpn/sstp",
  },
  {
    key: "rsa-keys",
    title: "RSA Keys",
    description: "Shared RSA public key entries for VPN peers.",
    href: "/vpn/rsa-keys",
  },
  {
    key: "dmvpn",
    title: "DMVPN",
    description: "mGRE + NHRP + IPsec profile binding workflow.",
    href: "/vpn/dmvpn",
  },
];

export default function VpnOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configuredProtocols, setConfiguredProtocols] = useState<Set<string>>(new Set());

  const load = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await vpnOverviewApi.getOverview(refresh);
      const root = toRecord(payload.vpn);
      setConfiguredProtocols(new Set(Object.keys(root)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load VPN overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  const configuredCount = useMemo(() => configuredProtocols.size, [configuredProtocols]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">VPN Overview</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure VPN protocols and monitor which stacks are active on this instance.
            </p>
          </div>
          <Button variant="outline" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              VPN Coverage
            </CardTitle>
            <CardDescription>
              {loading ? "Loading status..." : `${configuredCount} VPN subtree(s) currently configured`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {VPN_PROTOCOLS.map((item) => {
                const configured = configuredProtocols.has(item.key);
                return (
                  <Link key={item.key} href={item.href} className="rounded border p-4 hover:border-primary/60 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <Badge variant={configured ? "default" : "secondary"}>
                        {configured ? "Configured" : "Not configured"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{item.description}</p>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

