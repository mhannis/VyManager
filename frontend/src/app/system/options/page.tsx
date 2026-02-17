"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { AlertCircle, CheckCircle2, RefreshCw, Save, Sparkles, Wrench } from "lucide-react";

interface SystemResolverConfig {
  name_servers: string[];
  domain_search: string[];
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = error.message.toLowerCase();
  return text.includes("not found") || text.includes("404");
}

function fromCsv(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of value.split(",")) {
    const trimmed = token.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function toCsv(values: string[]): string {
  return values.join(", ");
}

function isValidIPv4(value: string): boolean {
  const candidate = value.trim();
  const match = candidate.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (!match) return false;
  return candidate.split(".").every((octet) => {
    const parsed = Number.parseInt(octet, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
  });
}

function isValidIPv6(value: string): boolean {
  const candidate = value.trim();
  if (!candidate.includes(":")) return false;
  if (!/^[0-9A-Fa-f:]+$/.test(candidate)) return false;
  const segments = candidate.split(":");
  if (segments.length < 2 || segments.length > 8) return false;
  let emptySegments = 0;
  for (const segment of segments) {
    if (segment.length === 0) {
      emptySegments += 1;
      continue;
    }
    if (segment.length > 4) return false;
  }
  return emptySegments <= 2;
}

function isValidHostnameLike(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || candidate.length > 253) return false;
  const labels = candidate.split(".");
  return labels.every((label) => {
    if (!label || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    return /^[A-Za-z0-9-]+$/.test(label);
  });
}

function isValidDnsServerToken(value: string): boolean {
  const candidate = value.trim();
  return isValidIPv4(candidate) || isValidIPv6(candidate) || isValidHostnameLike(candidate);
}

export default function SystemOptionsPage() {
  const [nameServersInput, setNameServersInput] = useState("");
  const [domainSearchInput, setDomainSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const parsedNameServers = useMemo(() => fromCsv(nameServersInput), [nameServersInput]);
  const parsedDomainSearch = useMemo(() => fromCsv(domainSearchInput), [domainSearchInput]);

  const loadResolverConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      try {
        const data = await apiClient.get<SystemResolverConfig>("/vyos/system/resolver-config", {
          refresh: refresh.toString(),
        });
        setNameServersInput(toCsv(data.name_servers));
        setDomainSearchInput(toCsv(data.domain_search));
      } catch (resolverError) {
        if (!isNotFoundError(resolverError)) {
          throw resolverError;
        }
        const dnsData = await apiClient.get<{
          system_name_servers?: string[] | null;
          system_domain_search?: string[] | null;
        }>("/vyos/system/dns-config", {
          refresh: refresh.toString(),
        });
        setNameServersInput(toCsv(dnsData.system_name_servers ?? []));
        setDomainSearchInput(toCsv(dnsData.system_domain_search ?? []));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system options.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadResolverConfig(false);
  }, []);

  const handleSave = async () => {
    for (const nameServer of parsedNameServers) {
      if (!isValidDnsServerToken(nameServer)) {
        setError(`Invalid system name-server value '${nameServer}'.`);
        setSuccess(null);
        return;
      }
    }

    for (const domain of parsedDomainSearch) {
      if (!isValidHostnameLike(domain)) {
        setError(`Invalid domain-search suffix '${domain}'.`);
        setSuccess(null);
        return;
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      try {
        const updated = await apiClient.put<SystemResolverConfig>("/vyos/system/resolver-config", {
          name_servers: parsedNameServers,
          domain_search: parsedDomainSearch,
        });
        setNameServersInput(toCsv(updated.name_servers));
        setDomainSearchInput(toCsv(updated.domain_search));
      } catch (resolverError) {
        if (!isNotFoundError(resolverError)) {
          throw resolverError;
        }
        const updatedDns = await apiClient.put<{
          system_name_servers?: string[] | null;
          system_domain_search?: string[] | null;
        }>("/vyos/system/dns-config", {
          system_name_servers: parsedNameServers,
          system_domain_search: parsedDomainSearch,
        });
        setNameServersInput(toCsv(updatedDns.system_name_servers ?? parsedNameServers));
        setDomainSearchInput(toCsv(updatedDns.system_domain_search ?? parsedDomainSearch));
      }
      setSuccess("System resolver defaults updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update system options.");
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
              Configure system-wide resolver defaults and run first-time setup flows.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void loadResolverConfig(true)}
            disabled={loading || saving}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4 text-primary" />
                System Resolver Defaults
              </CardTitle>
              <CardDescription>
                These values write `system name-server` and `system domain-search` and are shared across services.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading system resolver defaults...</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>System Name Servers (comma separated)</Label>
                    <Input
                      value={nameServersInput}
                      onChange={(event) => setNameServersInput(event.target.value)}
                      placeholder="1.1.1.1, 9.9.9.9"
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>System Domain Search (comma separated)</Label>
                    <Input
                      value={domainSearchInput}
                      onChange={(event) => setDomainSearchInput(event.target.value)}
                      placeholder="lab.local, corp.example.com"
                      disabled={saving}
                    />
                  </div>
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving..." : "Save System Options"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

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
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
