"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ethernetService } from "@/lib/api/ethernet";
import { openfabricService } from "@/lib/api/openfabric";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";

type InterfaceOption = {
  value: string;
  label: string;
};

type PasswordType = "" | "plaintext-password" | "md5";

type DomainEntry = {
  name: string;
  net: string;
  domainPasswordType: PasswordType;
  domainPasswordValue: string;
  fabricTier: string;
  lspGenInterval: string;
  lspRefreshInterval: string;
  maxLspLifetime: string;
  spfInterval: string;
  purgeOriginator: boolean;
  logAdjacencyChanges: boolean;
  setOverloadBit: boolean;
};

type DomainInterfaceEntry = {
  domain: string;
  interface: string;
  addressFamilyIpv4: boolean;
  addressFamilyIpv6: boolean;
  helloMultiplier: string;
  metric: string;
  password: string;
  csnpInterval: string;
  psnpInterval: string;
};

type OpenfabricState = {
  domains: DomainEntry[];
  domainInterfaces: DomainInterfaceEntry[];
};

const EMPTY_DOMAIN_DRAFT: DomainEntry = {
  name: "",
  net: "",
  domainPasswordType: "",
  domainPasswordValue: "",
  fabricTier: "",
  lspGenInterval: "",
  lspRefreshInterval: "",
  maxLspLifetime: "",
  spfInterval: "",
  purgeOriginator: false,
  logAdjacencyChanges: false,
  setOverloadBit: false,
};

const EMPTY_DOMAIN_INTERFACE_DRAFT: DomainInterfaceEntry = {
  domain: "",
  interface: "",
  addressFamilyIpv4: true,
  addressFamilyIpv6: false,
  helloMultiplier: "",
  metric: "",
  password: "",
  csnpInterval: "",
  psnpInterval: "",
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseDomainPassword(value: unknown): { type: PasswordType; value: string } {
  const raw = asObject(value);
  const plain = asString(raw["plaintext-password"] ?? raw.plaintext_password);
  if (plain) return { type: "plaintext-password", value: plain };
  const md5 = asString(raw.md5);
  if (md5) return { type: "md5", value: md5 };
  return { type: "", value: "" };
}

function parseDomains(root: Record<string, unknown>): DomainEntry[] {
  const domainRoot = asObject(root.domain);
  const rows: DomainEntry[] = [];

  for (const [name, rawDomain] of Object.entries(domainRoot)) {
    const domain = asObject(rawDomain);
    const password = parseDomainPassword(domain["domain-password"] ?? domain.domain_password);
    rows.push({
      name,
      net: asString(domain.net),
      domainPasswordType: password.type,
      domainPasswordValue: password.value,
      fabricTier: asString(domain["fabric-tier"] ?? domain.fabric_tier),
      lspGenInterval: asString(domain["lsp-gen-interval"] ?? domain.lsp_gen_interval),
      lspRefreshInterval: asString(domain["lsp-refresh-interval"] ?? domain.lsp_refresh_interval),
      maxLspLifetime: asString(domain["max-lsp-lifetime"] ?? domain.max_lsp_lifetime),
      spfInterval: asString(domain["spf-interval"] ?? domain.spf_interval),
      purgeOriginator: Object.prototype.hasOwnProperty.call(domain, "purge-originator"),
      logAdjacencyChanges: Object.prototype.hasOwnProperty.call(domain, "log-adjacency-changes"),
      setOverloadBit: Object.prototype.hasOwnProperty.call(domain, "set-overload-bit"),
    });
  }

  return rows.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
}

function parseDomainInterfaces(root: Record<string, unknown>): DomainInterfaceEntry[] {
  const domainRoot = asObject(root.domain);
  const rows: DomainInterfaceEntry[] = [];

  for (const [domainName, rawDomain] of Object.entries(domainRoot)) {
    const interfaceRoot = asObject(asObject(rawDomain).interface);
    for (const [ifaceName, rawInterface] of Object.entries(interfaceRoot)) {
      const iface = asObject(rawInterface);
      const afRoot = asObject(iface["address-family"] ?? iface.address_family);
      rows.push({
        domain: domainName,
        interface: ifaceName,
        addressFamilyIpv4: Object.prototype.hasOwnProperty.call(afRoot, "ipv4"),
        addressFamilyIpv6: Object.prototype.hasOwnProperty.call(afRoot, "ipv6"),
        helloMultiplier: asString(iface["hello-multiplier"] ?? iface.hello_multiplier),
        metric: asString(iface.metric),
        password: asString(
          asObject(iface.password)["plaintext-password"] ?? asObject(iface.password).plaintext_password
        ),
        csnpInterval: asString(iface["csnp-interval"] ?? iface.csnp_interval),
        psnpInterval: asString(iface["psnp-interval"] ?? iface.psnp_interval),
      });
    }
  }

  return rows.sort((left, right) => {
    const domainOrder = left.domain.localeCompare(right.domain, undefined, { numeric: true });
    if (domainOrder !== 0) return domainOrder;
    return left.interface.localeCompare(right.interface, undefined, { numeric: true });
  });
}

function normalizeDomain(value: DomainEntry): DomainEntry {
  return {
    name: value.name.trim(),
    net: value.net.trim(),
    domainPasswordType: value.domainPasswordType,
    domainPasswordValue: value.domainPasswordValue.trim(),
    fabricTier: value.fabricTier.trim(),
    lspGenInterval: value.lspGenInterval.trim(),
    lspRefreshInterval: value.lspRefreshInterval.trim(),
    maxLspLifetime: value.maxLspLifetime.trim(),
    spfInterval: value.spfInterval.trim(),
    purgeOriginator: Boolean(value.purgeOriginator),
    logAdjacencyChanges: Boolean(value.logAdjacencyChanges),
    setOverloadBit: Boolean(value.setOverloadBit),
  };
}

function normalizeDomainInterface(value: DomainInterfaceEntry): DomainInterfaceEntry {
  return {
    domain: value.domain.trim(),
    interface: value.interface.trim(),
    addressFamilyIpv4: Boolean(value.addressFamilyIpv4),
    addressFamilyIpv6: Boolean(value.addressFamilyIpv6),
    helloMultiplier: value.helloMultiplier.trim(),
    metric: value.metric.trim(),
    password: value.password.trim(),
    csnpInterval: value.csnpInterval.trim(),
    psnpInterval: value.psnpInterval.trim(),
  };
}

function domainEqual(left: DomainEntry, right: DomainEntry): boolean {
  return (
    left.name === right.name &&
    left.net === right.net &&
    left.domainPasswordType === right.domainPasswordType &&
    left.domainPasswordValue === right.domainPasswordValue &&
    left.fabricTier === right.fabricTier &&
    left.lspGenInterval === right.lspGenInterval &&
    left.lspRefreshInterval === right.lspRefreshInterval &&
    left.maxLspLifetime === right.maxLspLifetime &&
    left.spfInterval === right.spfInterval &&
    left.purgeOriginator === right.purgeOriginator &&
    left.logAdjacencyChanges === right.logAdjacencyChanges &&
    left.setOverloadBit === right.setOverloadBit
  );
}

function domainInterfaceEqual(left: DomainInterfaceEntry, right: DomainInterfaceEntry): boolean {
  return (
    left.domain === right.domain &&
    left.interface === right.interface &&
    left.addressFamilyIpv4 === right.addressFamilyIpv4 &&
    left.addressFamilyIpv6 === right.addressFamilyIpv6 &&
    left.helloMultiplier === right.helloMultiplier &&
    left.metric === right.metric &&
    left.password === right.password &&
    left.csnpInterval === right.csnpInterval &&
    left.psnpInterval === right.psnpInterval
  );
}

function domainSetCommands(value: DomainEntry): string[] {
  const domain = value.name;
  const commands: string[] = [`set protocols openfabric domain ${domain}`];
  commands.push(`set protocols openfabric domain ${domain} net ${value.net}`);
  if (value.domainPasswordType && value.domainPasswordValue) {
    commands.push(
      `set protocols openfabric domain ${domain} domain-password ${value.domainPasswordType} ${value.domainPasswordValue}`
    );
  }
  if (value.fabricTier) {
    commands.push(`set protocols openfabric domain ${domain} fabric-tier ${value.fabricTier}`);
  }
  if (value.lspGenInterval) {
    commands.push(`set protocols openfabric domain ${domain} lsp-gen-interval ${value.lspGenInterval}`);
  }
  if (value.lspRefreshInterval) {
    commands.push(`set protocols openfabric domain ${domain} lsp-refresh-interval ${value.lspRefreshInterval}`);
  }
  if (value.maxLspLifetime) {
    commands.push(`set protocols openfabric domain ${domain} max-lsp-lifetime ${value.maxLspLifetime}`);
  }
  if (value.spfInterval) {
    commands.push(`set protocols openfabric domain ${domain} spf-interval ${value.spfInterval}`);
  }
  if (value.purgeOriginator) {
    commands.push(`set protocols openfabric domain ${domain} purge-originator`);
  }
  if (value.logAdjacencyChanges) {
    commands.push(`set protocols openfabric domain ${domain} log-adjacency-changes`);
  }
  if (value.setOverloadBit) {
    commands.push(`set protocols openfabric domain ${domain} set-overload-bit`);
  }
  return commands;
}

function domainInterfaceSetCommands(value: DomainInterfaceEntry): string[] {
  const commands: string[] = [`set protocols openfabric domain ${value.domain} interface ${value.interface}`];
  if (value.addressFamilyIpv4) {
    commands.push(
      `set protocols openfabric domain ${value.domain} interface ${value.interface} address-family ipv4`
    );
  }
  if (value.addressFamilyIpv6) {
    commands.push(
      `set protocols openfabric domain ${value.domain} interface ${value.interface} address-family ipv6`
    );
  }
  if (value.helloMultiplier) {
    commands.push(
      `set protocols openfabric domain ${value.domain} interface ${value.interface} hello-multiplier ${value.helloMultiplier}`
    );
  }
  if (value.metric) {
    commands.push(
      `set protocols openfabric domain ${value.domain} interface ${value.interface} metric ${value.metric}`
    );
  }
  if (value.password) {
    commands.push(
      `set protocols openfabric domain ${value.domain} interface ${value.interface} password plaintext-password ${value.password}`
    );
  }
  if (value.csnpInterval) {
    commands.push(
      `set protocols openfabric domain ${value.domain} interface ${value.interface} csnp-interval ${value.csnpInterval}`
    );
  }
  if (value.psnpInterval) {
    commands.push(
      `set protocols openfabric domain ${value.domain} interface ${value.interface} psnp-interval ${value.psnpInterval}`
    );
  }
  return commands;
}

export function OpenfabricContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<OpenfabricState | null>(null);
  const [domains, setDomains] = useState<DomainEntry[]>([]);
  const [domainInterfaces, setDomainInterfaces] = useState<DomainInterfaceEntry[]>([]);

  const [domainDraft, setDomainDraft] = useState<DomainEntry>(EMPTY_DOMAIN_DRAFT);
  const [domainInterfaceDraft, setDomainInterfaceDraft] = useState<DomainInterfaceEntry>(
    EMPTY_DOMAIN_INTERFACE_DRAFT
  );

  const [interfaceOptions, setInterfaceOptions] = useState<InterfaceOption[]>([]);

  const interfaceLabelByName = useMemo(
    () =>
      interfaceOptions.reduce<Record<string, string>>((acc, option) => {
        acc[option.value] = option.label;
        return acc;
      }, {}),
    [interfaceOptions]
  );

  const domainNames = useMemo(
    () => domains.map((entry) => entry.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [domains]
  );

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const [openfabricConfig, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        openfabricService.getConfig(refresh),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const root = asObject((openfabricConfig as { openfabric?: unknown }).openfabric);
      const parsedDomains = parseDomains(root);
      const parsedInterfaces = parseDomainInterfaces(root);
      const parsedState: OpenfabricState = {
        domains: parsedDomains,
        domainInterfaces: parsedInterfaces,
      };

      setCurrentState(parsedState);
      setDomains(parsedDomains);
      setDomainInterfaces(parsedInterfaces);

      const ethernetInterfaces =
        (ethernetConfig as { interfaces?: Array<{ name: string; description?: string | null }> })
          .interfaces ?? [];
      const descriptionByName = ethernetInterfaces.reduce<Record<string, string | null>>(
        (acc, iface) => {
          acc[iface.name] = iface.description ?? null;
          return acc;
        },
        {}
      );

      const names = new Set<string>();
      ethernetInterfaces.forEach((iface) => names.add(iface.name));
      ((physicalConfig as { interfaces?: Array<{ interface: string }> }).interfaces ?? []).forEach(
        (iface) => names.add(iface.interface)
      );
      ((allInterfacesConfig as { interfaces?: Array<{ name: string }> }).interfaces ?? []).forEach(
        (iface) => names.add(iface.name)
      );
      parsedInterfaces.forEach((entry) => names.add(entry.interface));

      const options = [...names]
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setInterfaceOptions(options);
      setDomainInterfaceDraft((prev) => ({
        ...prev,
        domain: prev.domain || parsedDomains[0]?.name || "",
        interface: prev.interface || options[0]?.value || "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load OpenFabric configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddOrUpdateDomain = () => {
    const normalized = normalizeDomain(domainDraft);
    if (!normalized.name) {
      setError("Domain name is required.");
      return;
    }
    if (!normalized.net) {
      setError("NET is required for each OpenFabric domain.");
      return;
    }

    setError(null);
    setDomains((prev) => {
      const withoutCurrent = prev.filter((entry) => entry.name !== normalized.name);
      return [...withoutCurrent, normalized].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    });
    setDomainDraft(EMPTY_DOMAIN_DRAFT);
  };

  const handleAddOrUpdateDomainInterface = () => {
    const normalized = normalizeDomainInterface(domainInterfaceDraft);
    if (!normalized.domain) {
      setError("Domain is required.");
      return;
    }
    if (!normalized.interface) {
      setError("Interface is required.");
      return;
    }
    if (!normalized.addressFamilyIpv4 && !normalized.addressFamilyIpv6) {
      setError("Select at least one address-family.");
      return;
    }

    setError(null);
    setDomainInterfaces((prev) => {
      const key = `${normalized.domain}|${normalized.interface}`;
      const withoutCurrent = prev.filter((entry) => `${entry.domain}|${entry.interface}` !== key);
      return [...withoutCurrent, normalized].sort((a, b) => {
        const byDomain = a.domain.localeCompare(b.domain, undefined, { numeric: true });
        if (byDomain !== 0) return byDomain;
        return a.interface.localeCompare(b.interface, undefined, { numeric: true });
      });
    });
  };

  const handleSave = async () => {
    if (!currentState) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const currentDomainMap = new Map(
        currentState.domains.map((entry) => [entry.name, normalizeDomain(entry)])
      );
      const desiredDomainMap = new Map(
        domains
          .map(normalizeDomain)
          .filter((entry) => entry.name && entry.net)
          .map((entry) => [entry.name, entry])
      );

      for (const [domain] of currentDomainMap) {
        if (!desiredDomainMap.has(domain)) {
          operations.push(`delete protocols openfabric domain ${domain}`);
        }
      }

      for (const [domain, desiredEntry] of desiredDomainMap) {
        const currentEntry = currentDomainMap.get(domain);
        if (currentEntry && domainEqual(currentEntry, desiredEntry)) {
          continue;
        }
        if (currentEntry) {
          operations.push(`delete protocols openfabric domain ${domain}`);
        }
        operations.push(...domainSetCommands(desiredEntry));
      }

      const currentDomainInterfaceMap = new Map(
        currentState.domainInterfaces.map((entry) => [
          `${entry.domain}|${entry.interface}`,
          normalizeDomainInterface(entry),
        ])
      );
      const desiredDomainInterfaceMap = new Map(
        domainInterfaces
          .map(normalizeDomainInterface)
          .filter((entry) => entry.domain && entry.interface)
          .map((entry) => [`${entry.domain}|${entry.interface}`, entry])
      );

      for (const [key, currentEntry] of currentDomainInterfaceMap) {
        if (!desiredDomainInterfaceMap.has(key)) {
          operations.push(
            `delete protocols openfabric domain ${currentEntry.domain} interface ${currentEntry.interface}`
          );
        }
      }

      for (const [key, desiredEntry] of desiredDomainInterfaceMap) {
        const currentEntry = currentDomainInterfaceMap.get(key);
        if (currentEntry && domainInterfaceEqual(currentEntry, desiredEntry)) {
          continue;
        }
        if (currentEntry) {
          operations.push(
            `delete protocols openfabric domain ${currentEntry.domain} interface ${currentEntry.interface}`
          );
        }
        operations.push(...domainInterfaceSetCommands(desiredEntry));
      }

      const finalOperations = [...new Set(operations.map((item) => item.trim()).filter(Boolean))];
      if (finalOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await openfabricService.batchConfigure({ operations: finalOperations });
      if (!result.success) {
        throw new Error(result.error || "Failed to apply OpenFabric configuration");
      }

      setMessage("OpenFabric configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save OpenFabric configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">OpenFabric</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure OpenFabric domains (NET mandatory), domain timers/options, and domain interface settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadData(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {message && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="p-3 text-sm text-emerald-400">{message}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Domains</CardTitle>
          <CardDescription>OpenFabric requires `domain` + `net`; configure those first, then optional controls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">No OpenFabric domains configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>NET</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>LSP (gen/refresh/lifetime)</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((entry) => (
                  <TableRow key={entry.name}>
                    <TableCell>{entry.name}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.net || "-"}</TableCell>
                    <TableCell>
                      {entry.domainPasswordType
                        ? `${entry.domainPasswordType} (${entry.domainPasswordValue ? "set" : "empty"})`
                        : "-"}
                    </TableCell>
                    <TableCell>{entry.fabricTier || "-"}</TableCell>
                    <TableCell>
                      {entry.lspGenInterval || "-"} / {entry.lspRefreshInterval || "-"} / {entry.maxLspLifetime || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {[
                        entry.purgeOriginator ? "purge-originator" : "",
                        entry.logAdjacencyChanges ? "log-adjacency-changes" : "",
                        entry.setOverloadBit ? "set-overload-bit" : "",
                        entry.spfInterval ? `spf:${entry.spfInterval}` : "",
                      ]
                        .filter(Boolean)
                        .join(", ") || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setDomains((prev) => prev.filter((item) => item.name !== entry.name))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            <Input
              value={domainDraft.name}
              placeholder="Domain name"
              onChange={(event) => setDomainDraft((prev) => ({ ...prev, name: event.target.value }))}
            />
            <Input
              value={domainDraft.net}
              placeholder="NET (required)"
              onChange={(event) => setDomainDraft((prev) => ({ ...prev, net: event.target.value }))}
            />
            <Select
              value={domainDraft.domainPasswordType || "__none__"}
              onValueChange={(value) =>
                setDomainDraft((prev) => ({
                  ...prev,
                  domainPasswordType: value === "__none__" ? "" : (value as PasswordType),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Password type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No domain password</SelectItem>
                <SelectItem value="plaintext-password">plaintext-password</SelectItem>
                <SelectItem value="md5">md5</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={domainDraft.domainPasswordValue}
              placeholder="Domain password value"
              onChange={(event) =>
                setDomainDraft((prev) => ({ ...prev, domainPasswordValue: event.target.value }))
              }
            />
            <Input
              type="number"
              value={domainDraft.fabricTier}
              placeholder="Fabric tier"
              onChange={(event) => setDomainDraft((prev) => ({ ...prev, fabricTier: event.target.value }))}
            />
            <Input
              type="number"
              value={domainDraft.lspGenInterval}
              placeholder="LSP gen interval"
              onChange={(event) =>
                setDomainDraft((prev) => ({ ...prev, lspGenInterval: event.target.value }))
              }
            />
            <Input
              type="number"
              value={domainDraft.lspRefreshInterval}
              placeholder="LSP refresh interval"
              onChange={(event) =>
                setDomainDraft((prev) => ({ ...prev, lspRefreshInterval: event.target.value }))
              }
            />
            <Input
              type="number"
              value={domainDraft.maxLspLifetime}
              placeholder="Max LSP lifetime"
              onChange={(event) =>
                setDomainDraft((prev) => ({ ...prev, maxLspLifetime: event.target.value }))
              }
            />
            <Input
              type="number"
              value={domainDraft.spfInterval}
              placeholder="SPF interval"
              onChange={(event) => setDomainDraft((prev) => ({ ...prev, spfInterval: event.target.value }))}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="openfabric-domain-purge-originator"
                checked={domainDraft.purgeOriginator}
                onCheckedChange={(checked) =>
                  setDomainDraft((prev) => ({ ...prev, purgeOriginator: Boolean(checked) }))
                }
              />
              <Label htmlFor="openfabric-domain-purge-originator">Purge originator</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="openfabric-domain-log-adjacency-changes"
                checked={domainDraft.logAdjacencyChanges}
                onCheckedChange={(checked) =>
                  setDomainDraft((prev) => ({ ...prev, logAdjacencyChanges: Boolean(checked) }))
                }
              />
              <Label htmlFor="openfabric-domain-log-adjacency-changes">Log adjacency changes</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="openfabric-domain-set-overload-bit"
                checked={domainDraft.setOverloadBit}
                onCheckedChange={(checked) =>
                  setDomainDraft((prev) => ({ ...prev, setOverloadBit: Boolean(checked) }))
                }
              />
              <Label htmlFor="openfabric-domain-set-overload-bit">Set overload bit</Label>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={handleAddOrUpdateDomain}>
              <Plus className="mr-2 h-4 w-4" />
              Add / Update Domain
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Domain Interfaces</CardTitle>
          <CardDescription>Attach interfaces to domains with address-family and per-interface settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {domainInterfaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No domain interface bindings configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>AF</TableHead>
                  <TableHead>Hello/Metric</TableHead>
                  <TableHead>CSNP/PSNP</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domainInterfaces.map((entry) => (
                  <TableRow key={`${entry.domain}|${entry.interface}`}>
                    <TableCell>{entry.domain}</TableCell>
                    <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                    <TableCell>
                      {[
                        entry.addressFamilyIpv4 ? "ipv4" : "",
                        entry.addressFamilyIpv6 ? "ipv6" : "",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </TableCell>
                    <TableCell>
                      {entry.helloMultiplier || "-"} / {entry.metric || "-"}
                    </TableCell>
                    <TableCell>
                      {entry.csnpInterval || "-"} / {entry.psnpInterval || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setDomainInterfaces((prev) =>
                            prev.filter(
                              (item) =>
                                !(item.domain === entry.domain && item.interface === entry.interface)
                            )
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            <Select
              value={domainInterfaceDraft.domain || "__none__"}
              onValueChange={(value) =>
                setDomainInterfaceDraft((prev) => ({
                  ...prev,
                  domain: value === "__none__" ? "" : value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select domain</SelectItem>
                {domainNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={domainInterfaceDraft.interface || "__none__"}
              onValueChange={(value) =>
                setDomainInterfaceDraft((prev) => ({
                  ...prev,
                  interface: value === "__none__" ? "" : value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select interface" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select interface</SelectItem>
                {interfaceOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number"
              value={domainInterfaceDraft.helloMultiplier}
              placeholder="Hello multiplier"
              onChange={(event) =>
                setDomainInterfaceDraft((prev) => ({ ...prev, helloMultiplier: event.target.value }))
              }
            />
            <Input
              type="number"
              value={domainInterfaceDraft.metric}
              placeholder="Metric"
              onChange={(event) =>
                setDomainInterfaceDraft((prev) => ({ ...prev, metric: event.target.value }))
              }
            />
            <Input
              value={domainInterfaceDraft.password}
              placeholder="Interface password (optional)"
              onChange={(event) =>
                setDomainInterfaceDraft((prev) => ({ ...prev, password: event.target.value }))
              }
            />
            <Input
              type="number"
              value={domainInterfaceDraft.csnpInterval}
              placeholder="CSNP interval"
              onChange={(event) =>
                setDomainInterfaceDraft((prev) => ({ ...prev, csnpInterval: event.target.value }))
              }
            />
            <Input
              type="number"
              value={domainInterfaceDraft.psnpInterval}
              placeholder="PSNP interval"
              onChange={(event) =>
                setDomainInterfaceDraft((prev) => ({ ...prev, psnpInterval: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="openfabric-domain-interface-af-ipv4"
                checked={domainInterfaceDraft.addressFamilyIpv4}
                onCheckedChange={(checked) =>
                  setDomainInterfaceDraft((prev) => ({
                    ...prev,
                    addressFamilyIpv4: Boolean(checked),
                  }))
                }
              />
              <Label htmlFor="openfabric-domain-interface-af-ipv4">Address-family IPv4</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
              <Checkbox
                id="openfabric-domain-interface-af-ipv6"
                checked={domainInterfaceDraft.addressFamilyIpv6}
                onCheckedChange={(checked) =>
                  setDomainInterfaceDraft((prev) => ({
                    ...prev,
                    addressFamilyIpv6: Boolean(checked),
                  }))
                }
              />
              <Label htmlFor="openfabric-domain-interface-af-ipv6">Address-family IPv6</Label>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={handleAddOrUpdateDomainInterface}>
              <Plus className="mr-2 h-4 w-4" />
              Add / Update Domain Interface
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

