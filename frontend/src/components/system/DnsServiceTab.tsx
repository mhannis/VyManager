"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Globe, Plus, Save, Trash2 } from "lucide-react";
import {
  systemService,
  type DnsConfig,
  type DnsForwardingDomainOverride,
  type DnsHostOverride,
} from "@/lib/api/system";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";

interface DnsServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

interface ResolverListenAddressOption {
  interfaceName: string;
  address: string;
  interfaceLabel: string;
}

const EMPTY_DOMAIN_OVERRIDE: DnsForwardingDomainOverride = {
  domain: "",
  name_servers: [],
};

const EMPTY_HOST_OVERRIDE: DnsHostOverride = {
  hostname: "",
  addresses: [],
  aliases: [],
};

function toCsv(values: string[]): string {
  return values.join(", ");
}

function fromCsv(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
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

function isValidIPv4(value: string): boolean {
  const match = value.trim().match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (!match) return false;
  return value
    .trim()
    .split(".")
    .every((octet) => {
      const parsed = Number.parseInt(octet, 10);
      return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
    });
}

function isValidIPv6(value: string): boolean {
  const candidate = value.trim();
  if (!candidate.includes(":")) return false;
  if (!/^[0-9A-Fa-f:]+$/.test(candidate)) return false;
  const parts = candidate.split(":");
  if (parts.length < 2 || parts.length > 8) return false;
  let emptySegments = 0;
  for (const segment of parts) {
    if (segment.length === 0) {
      emptySegments += 1;
      continue;
    }
    if (segment.length > 4) return false;
  }
  // Allow at most one compressed section ("::"), represented by two empty segments.
  if (emptySegments > 2) return false;
  return true;
}

function isValidIpAddress(value: string): boolean {
  return isValidIPv4(value) || isValidIPv6(value);
}

function isValidCidr(value: string): boolean {
  const [address, prefixRaw] = value.trim().split("/");
  if (!address || prefixRaw === undefined) return false;
  const prefix = Number.parseInt(prefixRaw, 10);
  if (!Number.isInteger(prefix)) return false;
  if (isValidIPv4(address)) {
    return prefix >= 0 && prefix <= 32;
  }
  if (isValidIPv6(address)) {
    return prefix >= 0 && prefix <= 128;
  }
  return false;
}

function isValidDnsServerToken(value: string): boolean {
  const candidate = value.trim();
  return isValidIpAddress(candidate) || isValidHostnameLike(candidate);
}

function isPrivateIPv4Address(value: string): boolean {
  const candidate = value.trim();
  const parts = candidate.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function normalizeIpAddressToken(value: string): string {
  return value.trim().split("/")[0].trim();
}

function buildResolverListenAddressOptions(
  interfaces: Array<{ interface: string; ipv4_addresses: string[]; ipv6_addresses: string[] }>,
  interfaceDescriptions: Record<string, string | null>
): ResolverListenAddressOption[] {
  const seen = new Set<string>();
  const options: ResolverListenAddressOption[] = [];

  for (const entry of interfaces) {
    const interfaceName = entry.interface.trim();
    if (!interfaceName) continue;
    const interfaceLabel = formatInterfaceDisplayName(interfaceName, interfaceDescriptions[interfaceName] ?? null);

    for (const rawAddress of [...entry.ipv4_addresses, ...entry.ipv6_addresses]) {
      const address = normalizeIpAddressToken(rawAddress);
      if (!address || !isValidIpAddress(address)) continue;

      const dedupeKey = `${interfaceName}|${address}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      options.push({ interfaceName, address, interfaceLabel });
    }
  }

  return options.sort((left, right) => {
    if (left.interfaceName !== right.interfaceName) {
      return left.interfaceName.localeCompare(right.interfaceName, undefined, { numeric: true });
    }
    return left.address.localeCompare(right.address, undefined, { numeric: true });
  });
}

function suggestListenAddresses(
  options: ResolverListenAddressOption[],
  inferredWanInterfaceName: string | null
): string[] {
  if (options.length === 0) return [];

  const normalizedWan = inferredWanInterfaceName?.trim() || null;
  let candidates = normalizedWan
    ? options.filter((option) => option.interfaceName !== normalizedWan)
    : [...options];

  if (candidates.length === 0) {
    candidates = [...options];
  }

  const privateIpv4Candidates = candidates.filter(
    (option) => isValidIPv4(option.address) && isPrivateIPv4Address(option.address)
  );
  if (privateIpv4Candidates.length > 0) {
    candidates = privateIpv4Candidates;
  }

  const seen = new Set<string>();
  const suggested: string[] = [];
  for (const option of candidates) {
    const address = normalizeIpAddressToken(option.address);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    suggested.push(address);
  }
  return suggested;
}

export function DnsServiceTab({ canEdit, active, refreshNonce }: DnsServiceTabProps) {
  const [config, setConfig] = useState<DnsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [listenAddressOptions, setListenAddressOptions] = useState<ResolverListenAddressOption[]>([]);
  const [listenAddressOptionsError, setListenAddressOptionsError] = useState<string | null>(null);
  const [inferredWanInterfaceName, setInferredWanInterfaceName] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await systemService.getDnsConfig(refresh);
      setConfig({
        ...data,
        system_name_servers: data.system_name_servers ?? [],
        system_domain_search: data.system_domain_search ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DNS configuration.");
    } finally {
      setLoading(false);
    }
  };

  const loadListenAddressOptions = async () => {
    setListenAddressOptionsError(null);

    try {
      const [runtimeResult, ethernetResult, gatewayResult] = await Promise.allSettled([
        showService.getInterfaceRuntimeAddresses(),
        ethernetService.getConfig(),
        showService.getGatewaySummary(),
      ]);

      if (runtimeResult.status !== "fulfilled") {
        throw runtimeResult.reason;
      }

      const interfaceDescriptions: Record<string, string | null> = {};
      if (ethernetResult.status === "fulfilled") {
        for (const iface of ethernetResult.value.interfaces || []) {
          const name = iface.name?.trim();
          if (!name) continue;
          interfaceDescriptions[name] = iface.description ?? null;
        }
      }

      if (gatewayResult.status === "fulfilled") {
        const wanCandidate =
          gatewayResult.value.ipv4_default?.interface ??
          gatewayResult.value.interface?.name ??
          gatewayResult.value.configured_ipv4_default?.dhcp_interfaces?.[0] ??
          null;
        setInferredWanInterfaceName(wanCandidate ? wanCandidate.trim() : null);
      } else {
        setInferredWanInterfaceName(null);
      }

      setListenAddressOptions(
        buildResolverListenAddressOptions(runtimeResult.value.interfaces || [], interfaceDescriptions)
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load interface addresses.";
      setListenAddressOptions([]);
      setListenAddressOptionsError(message);
      setInferredWanInterfaceName(null);
    }
  };

  useEffect(() => {
    if (!active || config) return;
    loadConfig(false);
  }, [active, config]);

  useEffect(() => {
    if (!active || listenAddressOptions.length > 0) return;
    void loadListenAddressOptions();
  }, [active, listenAddressOptions.length]);

  useEffect(() => {
    if (!active) return;
    void loadConfig(true);
    void loadListenAddressOptions();
  }, [active, refreshNonce]);

  const updateDomainOverride = (index: number, update: Partial<DnsForwardingDomainOverride>) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.domain_overrides];
      next[index] = { ...next[index], ...update };
      return { ...previous, domain_overrides: next };
    });
  };

  const removeDomainOverride = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        domain_overrides: previous.domain_overrides.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const updateHostOverride = (index: number, update: Partial<DnsHostOverride>) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.host_overrides];
      next[index] = { ...next[index], ...update };
      return { ...previous, host_overrides: next };
    });
  };

  const removeHostOverride = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        host_overrides: previous.host_overrides.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const handleSave = async () => {
    if (!config) return;

    const normalizedListenAddresses = fromCsv(toCsv(config.listen_addresses));
    const normalizedAllowFrom = fromCsv(toCsv(config.allow_from));
    const normalizedNameServers = fromCsv(toCsv(config.name_servers));
    const normalizedSystemNameServers = fromCsv(toCsv(config.system_name_servers ?? []));
    const normalizedSystemDomainSearch = fromCsv(toCsv(config.system_domain_search ?? []));
    const normalizedAuthoritativeDomains = fromCsv(toCsv(config.authoritative_domains));
    const normalizedLocalDomain = config.local_domain_name?.trim() || null;

    for (const address of normalizedListenAddresses) {
      if (!isValidIpAddress(address)) {
        setError(`Invalid listen address '${address}'.`);
        setSuccess(null);
        return;
      }
    }

    for (const network of normalizedAllowFrom) {
      if (!isValidCidr(network)) {
        setError(`Invalid allow-from network '${network}'.`);
        setSuccess(null);
        return;
      }
    }

    for (const server of normalizedNameServers) {
      if (!isValidDnsServerToken(server)) {
        setError(`Invalid DNS name server '${server}'.`);
        setSuccess(null);
        return;
      }
    }

    for (const server of normalizedSystemNameServers) {
      if (!isValidDnsServerToken(server)) {
        setError(`Invalid system DNS name server '${server}'.`);
        setSuccess(null);
        return;
      }
    }

    if (
      config.enabled &&
      normalizedNameServers.length === 0 &&
      !config.use_system_name_servers &&
      normalizedSystemNameServers.length === 0
    ) {
      setError("Configure at least one DNS name server or enable 'Use System Name Servers'.");
      setSuccess(null);
      return;
    }

    for (const domain of normalizedSystemDomainSearch) {
      if (!isValidHostnameLike(domain)) {
        setError(`Invalid system domain-search value '${domain}'.`);
        setSuccess(null);
        return;
      }
    }

    for (const domain of normalizedAuthoritativeDomains) {
      if (!isValidHostnameLike(domain)) {
        setError(`Invalid authoritative domain '${domain}'.`);
        setSuccess(null);
        return;
      }
    }

    if (normalizedLocalDomain && !isValidHostnameLike(normalizedLocalDomain)) {
      setError(`Invalid local domain name '${normalizedLocalDomain}'.`);
      setSuccess(null);
      return;
    }

    const normalizedDomainOverrides = config.domain_overrides.map((entry) => ({
      domain: entry.domain.trim(),
      name_servers: fromCsv(toCsv(entry.name_servers)),
    }));
    for (let index = 0; index < normalizedDomainOverrides.length; index += 1) {
      const entry = normalizedDomainOverrides[index];
      const hasDomain = entry.domain.length > 0;
      const hasServers = entry.name_servers.length > 0;
      if (hasDomain !== hasServers) {
        setError(`Domain override row ${index + 1} requires both domain and at least one name server.`);
        setSuccess(null);
        return;
      }
      if (hasDomain && !isValidHostnameLike(entry.domain)) {
        setError(`Domain override row ${index + 1} has an invalid domain name.`);
        setSuccess(null);
        return;
      }
      for (const server of entry.name_servers) {
        if (!isValidDnsServerToken(server)) {
          setError(`Domain override row ${index + 1} has an invalid name server '${server}'.`);
          setSuccess(null);
          return;
        }
      }
    }

    const normalizedHostOverrides = config.host_overrides.map((entry) => ({
      hostname: entry.hostname.trim(),
      addresses: fromCsv(toCsv(entry.addresses)),
      aliases: fromCsv(toCsv(entry.aliases)),
    }));
    const seenHostnames = new Set<string>();
    for (let index = 0; index < normalizedHostOverrides.length; index += 1) {
      const entry = normalizedHostOverrides[index];
      const hasHostname = entry.hostname.length > 0;
      const hasAddresses = entry.addresses.length > 0;
      const hasAliases = entry.aliases.length > 0;

      if (!hasHostname && !hasAddresses && !hasAliases) {
        continue;
      }

      if (hasHostname !== hasAddresses) {
        setError(`Host override row ${index + 1} requires both hostname and at least one address.`);
        setSuccess(null);
        return;
      }
      if (!isValidHostnameLike(entry.hostname)) {
        setError(`Host override row ${index + 1} has an invalid hostname.`);
        setSuccess(null);
        return;
      }
      const normalizedHostname = entry.hostname.toLowerCase();
      if (seenHostnames.has(normalizedHostname)) {
        setError(`Host override row ${index + 1} duplicates hostname '${entry.hostname}'.`);
        setSuccess(null);
        return;
      }
      seenHostnames.add(normalizedHostname);

      for (const alias of entry.aliases) {
        if (!isValidHostnameLike(alias)) {
          setError(`Host override row ${index + 1} has an invalid alias '${alias}'.`);
          setSuccess(null);
          return;
        }
      }
      for (const address of entry.addresses) {
        if (!isValidIpAddress(address)) {
          setError(`Host override row ${index + 1} has an invalid address '${address}'.`);
          setSuccess(null);
          return;
        }
      }
    }

    const payload = {
      enabled: config.enabled,
      local_domain_name: normalizedLocalDomain,
      listen_addresses: normalizedListenAddresses,
      allow_from: normalizedAllowFrom,
      name_servers: normalizedNameServers,
      use_system_name_servers: config.use_system_name_servers,
      cache_size: config.cache_size,
      authoritative_domains: normalizedAuthoritativeDomains,
      domain_overrides: normalizedDomainOverrides
        .filter((entry) => entry.domain.length > 0 && entry.name_servers.length > 0),
      host_overrides: normalizedHostOverrides
        .filter((entry) => entry.hostname.length > 0 && entry.addresses.length > 0),
    };

    if (payload.cache_size !== null && payload.cache_size !== undefined && payload.cache_size < 0) {
      setError("Cache size must be zero or greater.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await systemService.updateDnsConfig(payload as DnsConfig);
      setConfig(updated);
      setSuccess("DNS configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update DNS configuration.");
    } finally {
      setSaving(false);
    }
  };

  const toggleListenAddressSelection = (address: string, checked: boolean) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const current = new Set(
        previous.listen_addresses
          .map((entry) => normalizeIpAddressToken(entry))
          .filter(Boolean)
      );
      const normalizedAddress = normalizeIpAddressToken(address);
      if (checked) {
        current.add(normalizedAddress);
      } else {
        current.delete(normalizedAddress);
      }
      return { ...previous, listen_addresses: Array.from(current).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })) };
    });
  };

  const populateSuggestedDefaults = () => {
    if (!config) return;

    const suggestedListen = suggestListenAddresses(listenAddressOptions, inferredWanInterfaceName);
    const normalizedSystemNameServers = fromCsv(toCsv(config.system_name_servers ?? []));
    const normalizedSystemSearch = fromCsv(toCsv(config.system_domain_search ?? []));

    const nextListenAddresses =
      config.listen_addresses.length > 0 ? fromCsv(toCsv(config.listen_addresses)) : suggestedListen;
    const nextAllowFrom =
      config.allow_from.length > 0 ? fromCsv(toCsv(config.allow_from)) : ["0.0.0.0/0"];
    const nextNameServers = config.name_servers.length > 0 ? fromCsv(toCsv(config.name_servers)) : [];
    const nextLocalDomain =
      config.local_domain_name?.trim() ||
      (normalizedSystemSearch.length > 0 ? normalizedSystemSearch[0] : null);
    const nextAuthoritativeDomains =
      config.authoritative_domains.length > 0
        ? fromCsv(toCsv(config.authoritative_domains))
        : nextLocalDomain && isValidHostnameLike(nextLocalDomain)
          ? [nextLocalDomain]
          : [];

    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        enabled: true,
        listen_addresses: nextListenAddresses,
        allow_from: nextAllowFrom,
        name_servers: nextNameServers,
        local_domain_name: nextLocalDomain,
        authoritative_domains: nextAuthoritativeDomains,
        use_system_name_servers:
          previous.use_system_name_servers ||
          (nextNameServers.length === 0 && normalizedSystemNameServers.length > 0),
      };
    });
    setError(null);
    if (nextNameServers.length === 0 && normalizedSystemNameServers.length === 0) {
      setSuccess(
        "Suggested DNS defaults populated. Add at least one DNS name server or enable 'Use System Name Servers' before saving."
      );
      return;
    }
    setSuccess("Suggested DNS defaults populated from detected interfaces. Review and save.");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            DNS Service (Forwarder + Resolver)
          </CardTitle>
          <CardDescription>
            Configure DNS forwarding/resolver behavior, local domain settings, and authoritative host/domain overrides from one page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading || !config ? (
            <p className="text-sm text-muted-foreground">Loading DNS configuration...</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.enabled}
                  onCheckedChange={(checked) =>
                    setConfig((previous) =>
                      previous ? { ...previous, enabled: checked === true } : previous
                    )
                  }
                  disabled={!canEdit || saving}
                />
                <Label className="text-sm font-medium">Enable DNS service</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                System resolver defaults (`system name-server` and `system domain-search`) are configured under
                System Options.
              </p>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <Label>Local Domain Name</Label>
                  <Input
                    value={config.local_domain_name ?? ""}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, local_domain_name: event.target.value } : previous
                      )
                    }
                    placeholder="lab.local"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cache Size</Label>
                  <Input
                    type="number"
                    min={0}
                    value={config.cache_size ?? ""}
                    onChange={(event) =>
                      setConfig((previous) => {
                        if (!previous) return previous;
                        const parsed = Number.parseInt(event.target.value, 10);
                        return {
                          ...previous,
                          cache_size: Number.isNaN(parsed) ? null : parsed,
                        };
                      })
                    }
                    placeholder="150"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <Label>Listen Addresses (comma separated)</Label>
                  <Input
                    value={toCsv(config.listen_addresses)}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, listen_addresses: fromCsv(event.target.value) } : previous
                      )
                    }
                    placeholder="192.168.1.1, 10.0.0.1"
                    disabled={!canEdit || saving}
                  />
                  <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Select from detected interface addresses
                    </p>
                    {listenAddressOptionsError ? (
                      <p className="text-xs text-amber-500">
                        {listenAddressOptionsError} Enter addresses manually if needed.
                      </p>
                    ) : listenAddressOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No runtime interface addresses detected yet.
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {listenAddressOptions.map((option) => {
                          const checked = config.listen_addresses
                            .map((entry) => normalizeIpAddressToken(entry))
                            .includes(option.address);
                          return (
                            <label
                              key={`${option.interfaceName}-${option.address}`}
                              className="flex items-center gap-2 rounded border border-border/60 px-2 py-1.5 text-xs"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) =>
                                  toggleListenAddressSelection(option.address, value === true)
                                }
                                disabled={!canEdit || saving}
                              />
                              <span className="font-medium">{option.interfaceLabel}</span>
                              <span className="text-muted-foreground">{option.address}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Allow-From Networks (comma separated)</Label>
                  <Input
                    value={toCsv(config.allow_from)}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, allow_from: fromCsv(event.target.value) } : previous
                      )
                    }
                    placeholder="192.168.1.0/24"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <Label>Upstream Name Servers (comma separated)</Label>
                  <Input
                    value={toCsv(config.name_servers)}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous ? { ...previous, name_servers: fromCsv(event.target.value) } : previous
                      )
                    }
                    placeholder="1.1.1.1, 9.9.9.9"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Authoritative Domains (comma separated)</Label>
                  <Input
                    value={toCsv(config.authoritative_domains)}
                    onChange={(event) =>
                      setConfig((previous) =>
                        previous
                          ? { ...previous, authoritative_domains: fromCsv(event.target.value) }
                          : previous
                      )
                    }
                    placeholder="lab.local, 10.in-addr.arpa"
                    disabled={!canEdit || saving || !config.enabled}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.use_system_name_servers}
                  onCheckedChange={(checked) =>
                    setConfig((previous) =>
                      previous ? { ...previous, use_system_name_servers: checked === true } : previous
                    )
                  }
                  disabled={!canEdit || saving || !config.enabled}
                />
                <Label className="text-sm font-medium">Use system name servers as upstreams</Label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Domain Overrides</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) =>
                        previous
                          ? { ...previous, domain_overrides: [...previous.domain_overrides, { ...EMPTY_DOMAIN_OVERRIDE }] }
                          : previous
                      )
                    }
                    disabled={!canEdit || saving || !config.enabled}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Override
                  </Button>
                </div>
                {config.domain_overrides.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No domain overrides configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.domain_overrides.map((entry, index) => (
                      <div key={`domain-override-${index}`} className="grid gap-2 xl:grid-cols-[1fr_2fr_auto]">
                        <Input
                          value={entry.domain}
                          onChange={(event) =>
                            updateDomainOverride(index, { domain: event.target.value })
                          }
                          placeholder="corp.example.com"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Input
                          value={toCsv(entry.name_servers)}
                          onChange={(event) =>
                            updateDomainOverride(index, { name_servers: fromCsv(event.target.value) })
                          }
                          placeholder="10.0.0.2, 10.0.0.3"
                          disabled={!canEdit || saving || !config.enabled}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDomainOverride(index)}
                          disabled={!canEdit || saving || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Host Overrides</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) =>
                        previous ? { ...previous, host_overrides: [...previous.host_overrides, { ...EMPTY_HOST_OVERRIDE }] } : previous
                      )
                    }
                    disabled={!canEdit || saving}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Host
                  </Button>
                </div>
                {config.host_overrides.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No host overrides configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.host_overrides.map((entry, index) => (
                      <div key={`host-override-${index}`} className="grid gap-2 xl:grid-cols-[1fr_1.5fr_1.5fr_auto]">
                        <Input
                          value={entry.hostname}
                          onChange={(event) =>
                            updateHostOverride(index, { hostname: event.target.value })
                          }
                          placeholder="pihole.lab.local"
                          disabled={!canEdit || saving}
                        />
                        <Input
                          value={toCsv(entry.addresses)}
                          onChange={(event) =>
                            updateHostOverride(index, { addresses: fromCsv(event.target.value) })
                          }
                          placeholder="192.168.1.2"
                          disabled={!canEdit || saving}
                        />
                        <Input
                          value={toCsv(entry.aliases)}
                          onChange={(event) =>
                            updateHostOverride(index, { aliases: fromCsv(event.target.value) })
                          }
                          placeholder="dns, resolver"
                          disabled={!canEdit || saving}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeHostOverride(index)}
                          disabled={!canEdit || saving}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700">
                  {success}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={populateSuggestedDefaults}
                  disabled={!canEdit || saving || loading}
                >
                  Populate Suggested Defaults
                </Button>
                <Button onClick={handleSave} disabled={!canEdit || saving || loading}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Saving..." : "Save DNS Settings"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
