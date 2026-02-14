"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { systemService, type SystemConfig } from "@/lib/api/system";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { AlertCircle, BookOpen, RefreshCw, Save, Settings2, Sparkles, Wrench } from "lucide-react";

export default function SystemOptionsPage() {
  const { canWrite } = usePermissions();
  const canEditSystem = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemConfig | null>(null);

  const [hostname, setHostname] = useState("");
  const [timezone, setTimezone] = useState("");
  const [domainName, setDomainName] = useState("");

  const hasUnsavedChanges = useMemo(() => {
    if (!config) return false;
    return (
      hostname !== (config.hostname || "") ||
      timezone !== (config.timezone || "") ||
      domainName !== (config.domain_name || "")
    );
  }, [config, domainName, hostname, timezone]);

  const loadConfig = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await systemService.getConfig(refresh);
      setConfig(response);
      setHostname(response.hostname || "");
      setTimezone(response.timezone || "");
      setDomainName(response.domain_name || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system options.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig(false);
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await systemService.updateConfig({
        hostname: hostname.trim() || null,
        timezone: timezone.trim() || null,
        domain_name: domainName.trim() || null,
        // Name servers are managed under Services > DNS Resolver to avoid split ownership.
        name_servers: config?.name_servers ?? [],
      });
      setConfig(updated);
      setHostname(updated.hostname || "");
      setTimezone(updated.timezone || "");
      setDomainName(updated.domain_name || "");
      setSuccess("System options saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save system options.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">System Options</h1>
            <p className="mt-1 text-muted-foreground">
              Core system identity, bootstrap wizards, and high-signal operating controls.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadConfig(true)} disabled={loading || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4 text-primary" />
                System Identity
              </CardTitle>
              <CardDescription>
                Updates `system host-name`, `system time-zone`, `system name-server`, and `system domain-name`.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hostname">Hostname</Label>
                  <Input
                    id="hostname"
                    value={hostname}
                    onChange={(event) => setHostname(event.target.value)}
                    placeholder="vyos-edge-1"
                    disabled={!canEditSystem || loading || saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    placeholder="America/New_York"
                    disabled={!canEditSystem || loading || saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain-name">Domain Name</Label>
                <Input
                  id="domain-name"
                  value={domainName}
                  onChange={(event) => setDomainName(event.target.value)}
                  placeholder="lab.local"
                  disabled={!canEditSystem || loading || saving}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                DNS server management lives under{" "}
                <Link href="/system/services?tab=dns-resolver&view=single" className="text-primary hover:text-primary/80">
                  Services - DNS Resolver
                </Link>
                .
              </p>

              {!canEditSystem && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-700">
                  You currently have read-only access for System features.
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <Badge variant={hasUnsavedChanges ? "default" : "secondary"}>
                  {hasUnsavedChanges ? "Unsaved Changes" : "In Sync"}
                </Badge>
                <Button onClick={saveConfig} disabled={!canEditSystem || loading || saving || !hasUnsavedChanges}>
                  <Save className="mr-2 h-4 w-4" />
                  Save System Options
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Guided Setup
              </CardTitle>
              <CardDescription>
                One-time bootstrap flow for WAN/LAN and firewall boundaries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full justify-start">
                <Link href="/network/setup-wizard">Network Setup Wizard</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/firewall/zones">Zone Guided Setup</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/firewall/policies">Firewall Policies</Link>
              </Button>
              <p className="pt-2 text-xs text-muted-foreground">
                Start with Network Wizard, then run Zone Guided Setup once for baseline WAN/LAN policy scaffolding.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-primary" />
              System Coverage
            </CardTitle>
            <CardDescription>
              Non-redundant shortcuts for system options and documentation.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <Button asChild variant="outline" className="justify-start">
              <Link href="/system/services?tab=ssh&view=single">SSH Service</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <a href="https://docs.vyos.io/en/latest/configuration/system/" target="_blank" rel="noreferrer">
                <BookOpen className="mr-2 h-4 w-4" />
                VyOS System Docs
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
