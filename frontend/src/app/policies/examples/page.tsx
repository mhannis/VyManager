"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const snippets = [
  {
    title: "Permit RFC1918 Source Prefixes",
    description: "Prefix list example for private IPv4 space.",
    lines: [
      "set policy prefix-list RFC1918 rule 10 action 'permit'",
      "set policy prefix-list RFC1918 rule 10 prefix '10.0.0.0/8'",
      "set policy prefix-list RFC1918 rule 20 action 'permit'",
      "set policy prefix-list RFC1918 rule 20 prefix '172.16.0.0/12'",
      "set policy prefix-list RFC1918 rule 30 action 'permit'",
      "set policy prefix-list RFC1918 rule 30 prefix '192.168.0.0/16'",
    ],
  },
  {
    title: "Drop Bogon Routes with Route-Map",
    description: "Route-map references a prefix-list and denies matches.",
    lines: [
      "set policy route-map INBOUND-FILTER rule 10 action 'deny'",
      "set policy route-map INBOUND-FILTER rule 10 match ip address prefix-list 'BOGONS'",
      "set policy route-map INBOUND-FILTER rule 20 action 'permit'",
      "set protocols bgp address-family ipv4-unicast neighbor 203.0.113.2 route-map import 'INBOUND-FILTER'",
    ],
  },
  {
    title: "BGP Community Tagging",
    description: "Attach standard community values before export.",
    lines: [
      "set policy route-map OUTBOUND-TAGS rule 10 action 'permit'",
      "set policy route-map OUTBOUND-TAGS rule 10 set community add '65000:100'",
      "set policy route-map OUTBOUND-TAGS rule 10 set local-preference '200'",
      "set protocols bgp address-family ipv4-unicast neighbor 198.51.100.2 route-map export 'OUTBOUND-TAGS'",
    ],
  },
];

export default function PolicyExamplesPage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Policy Examples</CardTitle>
                <CardDescription>
                  Practical starting patterns that map directly to VyOS CLI policy trees.
                </CardDescription>
              </div>
              <Badge variant="outline">Docs Coverage: policy/examples</Badge>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-4">
          {snippets.map((snippet) => (
            <Card key={snippet.title}>
              <CardHeader>
                <CardTitle className="text-base">{snippet.title}</CardTitle>
                <CardDescription>{snippet.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  <code>{snippet.lines.join("\n")}</code>
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
