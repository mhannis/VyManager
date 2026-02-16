"use client";

import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export default function SystemGuidedSetupPage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Guided Setup</h1>
            <p className="mt-1 text-muted-foreground">
              Run the baseline onboarding flow for network and firewall policy scaffolding.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Initial Configuration Path
            </CardTitle>
            <CardDescription>
              Use these three guided pages in order for a clean first deployment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full justify-start">
              <Link href="/network/setup-wizard">1. Network Setup Wizard</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/firewall/zones">2. Zone Guided Setup</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/firewall/policies">3. Firewall Policies</Link>
            </Button>
            <p className="pt-2 text-xs text-muted-foreground">
              Recommended order: complete the network wizard first, then build zones, then validate policy rules.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
