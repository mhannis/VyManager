"use client";

import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BookOpenText, ListChecks, Route, Shield } from "lucide-react";

const policyAreas = [
  {
    title: "Access Control Lists",
    description: "Match and filter packets by source, destination, and protocol.",
    href: "/policies/access-list",
    icon: Shield,
  },
  {
    title: "Prefix Lists",
    description: "Constrain route advertisements and imports with CIDR + GE/LE logic.",
    href: "/policies/prefix-list",
    icon: ListChecks,
  },
  {
    title: "Route Policies",
    description: "Apply route and route6 policy decisions per rule order.",
    href: "/policies/route",
    icon: Route,
  },
  {
    title: "Route Maps",
    description: "Advanced match/set routing policy for BGP and policy routing workflows.",
    href: "/policies/route-map",
    icon: Route,
  },
];

export default function PoliciesOverviewPage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Policy Overview</CardTitle>
                <CardDescription>
                  Central entry point for policy configuration and operational guidance.
                </CardDescription>
              </div>
              <Badge variant="outline">Parity Slice: Policy</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Policy controls are order-sensitive. Create rule objects first, then bind them where needed
              (protocols, interfaces, or firewall contexts).
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/policies/examples"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <BookOpenText className="h-4 w-4" />
                Open Policy Examples
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="https://docs.vyos.io/en/latest/configuration/policy/index.html"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                VyOS Policy Documentation
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {policyAreas.map((area) => {
            const Icon = area.icon;
            return (
              <Link key={area.title} href={area.href}>
                <Card className="h-full transition-colors hover:border-primary/60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="h-4 w-4 text-primary" />
                      {area.title}
                    </CardTitle>
                    <CardDescription>{area.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
