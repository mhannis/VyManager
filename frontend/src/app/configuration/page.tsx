import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SECTIONS = [
  { title: "System", href: "/system/options", note: "Core host, user, and system settings" },
  { title: "Interfaces", href: "/network/interfaces", note: "Physical, VLAN, and address configuration" },
  { title: "Firewall", href: "/firewall/policies", note: "Policy, groups, zones, and bridge rules" },
  { title: "NAT", href: "/network/nat", note: "Source and destination NAT rules" },
  { title: "Policies", href: "/policies", note: "Routing policy objects and maps" },
  { title: "Services", href: "/system/services", note: "NTP, DNS, DHCP relay, and service controls" },
  { title: "Routing", href: "/routing/protocols", note: "Unicast, multicast, and infrastructure protocols" },
  { title: "VPN", href: "/vpn", note: "IPsec, WireGuard, L2TP, and remote-access VPN" },
  { title: "High Availability", href: "/network/high-availability", note: "VRRP groups and sync-groups" },
  { title: "VRF", href: "/network/vrf", note: "Virtual routing instances and static routes" },
  { title: "Load Balancing", href: "/network/load-balancing", note: "WAN and HAProxy balancing" },
  { title: "Traffic Policy", href: "/network/traffic-policy", note: "Shaping and queue policies" },
  { title: "PKI", href: "/system/pki", note: "CA and certificate object references" },
  { title: "Containers", href: "/system/containers", note: "Container engine and workloads" },
];

export default function ConfigurationGuidePage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuration Guide Coverage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Jump to each major configuration domain from a single index page.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map((section) => (
            <Link key={section.title} href={section.href}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-lg">
                    <span>{section.title}</span>
                    <Badge variant="secondary">GUI</Badge>
                  </CardTitle>
                  <CardDescription>{section.note}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Open {section.title} settings</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
