"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Globe, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showService } from "@/lib/api/show";
import { ethernetService } from "@/lib/api/ethernet";
import { formatInterfaceDisplayName } from "@/lib/utils";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "./serviceTabHelpers";

interface PrefixConfig {
  prefix: string;
  decrementLifetime: boolean;
  deprecatePrefix: boolean;
  noAutonomousFlag: boolean;
  noOnLinkFlag: boolean;
  preferredLifetime: string;
  validLifetime: string;
}

interface Nat64PrefixConfig {
  prefix: string;
  validLifetime: string;
}

interface InterfaceConfig {
  name: string;
  hopLimit: string;
  managedFlag: boolean;
  otherConfigFlag: boolean;
  linkMtu: string;
  defaultLifetime: string;
  reachableTime: string;
  retransTimer: string;
  defaultPreference: "" | "low" | "medium" | "high";
  intervalMin: string;
  intervalMax: string;
  noSendAdvert: boolean;
  noSendInterval: boolean;
  captivePortal: string;
  nameServers: string[];
  dnssl: string[];
  autoIgnore: string[];
  prefixes: PrefixConfig[];
  nat64Prefixes: Nat64PrefixConfig[];
}

interface RouterAdvertState {
  enabled: boolean;
  interfaces: InterfaceConfig[];
}

interface InterfaceOption {
  value: string;
  label: string;
}

const EMPTY_INTERFACE: InterfaceConfig = {
  name: "",
  hopLimit: "",
  managedFlag: false,
  otherConfigFlag: false,
  linkMtu: "",
  defaultLifetime: "",
  reachableTime: "",
  retransTimer: "",
  defaultPreference: "",
  intervalMin: "",
  intervalMax: "",
  noSendAdvert: false,
  noSendInterval: false,
  captivePortal: "",
  nameServers: [],
  dnssl: [],
  autoIgnore: [],
  prefixes: [],
  nat64Prefixes: [],
};

const EMPTY_STATE: RouterAdvertState = {
  enabled: false,
  interfaces: [],
};

interface RouterAdvertServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function toCsv(values: string[]): string {
  return values.join(", ");
}

function fromCsv(value: string): string[] {
  return uniqueNonEmpty(value.split(",").map((entry) => entry.trim()).filter(Boolean));
}

function parsePrefixNode(prefix: string, rawNode: unknown): PrefixConfig {
  const node = toRecord(rawNode);
  return {
    prefix,
    decrementLifetime: Object.prototype.hasOwnProperty.call(node, "decrement-lifetime"),
    deprecatePrefix: Object.prototype.hasOwnProperty.call(node, "deprecate-prefix"),
    noAutonomousFlag: Object.prototype.hasOwnProperty.call(node, "no-autonomous-flag"),
    noOnLinkFlag: Object.prototype.hasOwnProperty.call(node, "no-on-link-flag"),
    preferredLifetime: asString(node["preferred-lifetime"]) ?? "",
    validLifetime: asString(node["valid-lifetime"]) ?? "",
  };
}

function parseNat64PrefixNode(prefix: string, rawNode: unknown): Nat64PrefixConfig {
  const node = toRecord(rawNode);
  return {
    prefix,
    validLifetime: asString(node["valid-lifetime"]) ?? "",
  };
}

function parseRouterAdvertConfig(serviceNode: Record<string, unknown>): RouterAdvertState {
  const interfacesNode = toRecord(serviceNode.interface);
  const interfaces: InterfaceConfig[] = [];

  for (const interfaceName of Object.keys(interfacesNode).sort((left, right) => left.localeCompare(right))) {
    const node = toRecord(interfacesNode[interfaceName]);
    const intervalNode = toRecord(node.interval);
    const prefixNode = toRecord(node.prefix);
    const nat64PrefixNode = toRecord(node.nat64prefix);

    interfaces.push({
      name: interfaceName,
      hopLimit: asString(node["hop-limit"]) ?? "",
      managedFlag: Object.prototype.hasOwnProperty.call(node, "managed-flag"),
      otherConfigFlag: Object.prototype.hasOwnProperty.call(node, "other-config-flag"),
      linkMtu: asString(node["link-mtu"]) ?? "",
      defaultLifetime: asString(node["default-lifetime"]) ?? "",
      reachableTime: asString(node["reachable-time"]) ?? "",
      retransTimer: asString(node["retrans-timer"]) ?? "",
      defaultPreference:
        (asString(node["default-preference"]) as "low" | "medium" | "high" | null) ?? "",
      intervalMin: asString(intervalNode.minimum) ?? "",
      intervalMax: asString(intervalNode.maximum) ?? "",
      noSendAdvert: Object.prototype.hasOwnProperty.call(node, "no-send-advert"),
      noSendInterval: Object.prototype.hasOwnProperty.call(node, "no-send-interval"),
      captivePortal: asString(node["captive-portal"]) ?? "",
      nameServers: objectKeys(node["name-server"]),
      dnssl: objectKeys(node.dnssl),
      autoIgnore: objectKeys(node["auto-ignore"]),
      prefixes: Object.keys(prefixNode)
        .sort((left, right) => left.localeCompare(right))
        .map((prefix) => parsePrefixNode(prefix, prefixNode[prefix])),
      nat64Prefixes: Object.keys(nat64PrefixNode)
        .sort((left, right) => left.localeCompare(right))
        .map((prefix) => parseNat64PrefixNode(prefix, nat64PrefixNode[prefix])),
    });
  }

  return {
    enabled: Object.keys(serviceNode).length > 0,
    interfaces,
  };
}

export function RouterAdvertServiceTab({ canEdit, active, refreshNonce }: RouterAdvertServiceTabProps) {
  const [config, setConfig] = useState<RouterAdvertState>(EMPTY_STATE);
  const [interfaceOptions, setInterfaceOptions] = useState<InterfaceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const disableInputs = !canEdit || saving;

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getRouterAdvertConfig(refresh);
      setConfig(parseRouterAdvertConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load router advertisement settings.");
    } finally {
      setLoading(false);
    }
  };

  const loadInterfaceOptions = async () => {
    try {
      const [allInterfaces, ethernetConfig] = await Promise.all([
        showService.getAllInterfaces(),
        ethernetService.getConfig(),
      ]);

      const descriptionByInterface = new Map<string, string>();
      for (const iface of ethernetConfig.interfaces || []) {
        const name = iface.name?.trim();
        const description = iface.description?.trim();
        if (!name || !description) continue;
        descriptionByInterface.set(name, description);
      }

      const options = (allInterfaces.interfaces || [])
        .map((entry) => entry.name?.trim())
        .filter((name): name is string => Boolean(name))
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByInterface.get(name)),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));

      setInterfaceOptions(options);
    } catch {
      setInterfaceOptions([]);
    }
  };

  useEffect(() => {
    if (!active) return;
    loadConfig(false);
    loadInterfaceOptions();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    loadConfig(true);
  }, [active, refreshNonce]);

  const updateInterface = (index: number, update: Partial<InterfaceConfig>) => {
    setConfig((previous) => {
      const next = [...previous.interfaces];
      next[index] = { ...next[index], ...update };
      return { ...previous, interfaces: next };
    });
  };

  const removeInterface = (index: number) => {
    setConfig((previous) => ({
      ...previous,
      interfaces: previous.interfaces.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const addPrefix = (interfaceIndex: number) => {
    setConfig((previous) => {
      const next = [...previous.interfaces];
      const iface = next[interfaceIndex];
      if (!iface) return previous;
      iface.prefixes = [
        ...iface.prefixes,
        {
          prefix: "",
          decrementLifetime: false,
          deprecatePrefix: false,
          noAutonomousFlag: false,
          noOnLinkFlag: false,
          preferredLifetime: "",
          validLifetime: "",
        },
      ];
      next[interfaceIndex] = { ...iface };
      return { ...previous, interfaces: next };
    });
  };

  const updatePrefix = (interfaceIndex: number, prefixIndex: number, update: Partial<PrefixConfig>) => {
    setConfig((previous) => {
      const next = [...previous.interfaces];
      const iface = next[interfaceIndex];
      if (!iface) return previous;
      const prefixes = [...iface.prefixes];
      prefixes[prefixIndex] = { ...prefixes[prefixIndex], ...update };
      next[interfaceIndex] = { ...iface, prefixes };
      return { ...previous, interfaces: next };
    });
  };

  const removePrefix = (interfaceIndex: number, prefixIndex: number) => {
    setConfig((previous) => {
      const next = [...previous.interfaces];
      const iface = next[interfaceIndex];
      if (!iface) return previous;
      next[interfaceIndex] = {
        ...iface,
        prefixes: iface.prefixes.filter((_, currentIndex) => currentIndex !== prefixIndex),
      };
      return { ...previous, interfaces: next };
    });
  };

  const addNat64Prefix = (interfaceIndex: number) => {
    setConfig((previous) => {
      const next = [...previous.interfaces];
      const iface = next[interfaceIndex];
      if (!iface) return previous;
      iface.nat64Prefixes = [...iface.nat64Prefixes, { prefix: "", validLifetime: "" }];
      next[interfaceIndex] = { ...iface };
      return { ...previous, interfaces: next };
    });
  };

  const updateNat64Prefix = (
    interfaceIndex: number,
    nat64Index: number,
    update: Partial<Nat64PrefixConfig>,
  ) => {
    setConfig((previous) => {
      const next = [...previous.interfaces];
      const iface = next[interfaceIndex];
      if (!iface) return previous;
      const nat64Prefixes = [...iface.nat64Prefixes];
      nat64Prefixes[nat64Index] = { ...nat64Prefixes[nat64Index], ...update };
      next[interfaceIndex] = { ...iface, nat64Prefixes };
      return { ...previous, interfaces: next };
    });
  };

  const removeNat64Prefix = (interfaceIndex: number, nat64Index: number) => {
    setConfig((previous) => {
      const next = [...previous.interfaces];
      const iface = next[interfaceIndex];
      if (!iface) return previous;
      next[interfaceIndex] = {
        ...iface,
        nat64Prefixes: iface.nat64Prefixes.filter((_, currentIndex) => currentIndex !== nat64Index),
      };
      return { ...previous, interfaces: next };
    });
  };

  const validatePositiveIntegerField = (label: string, value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return `${label} must be a non-negative integer.`;
    }
    return null;
  };

  const handleSave = async () => {
    if (config.enabled) {
      if (config.interfaces.length === 0) {
        setError("At least one interface is required when router advertisements are enabled.");
        setSuccess(null);
        return;
      }

      const seenInterfaces = new Set<string>();
      for (const iface of config.interfaces) {
        const name = iface.name.trim();
        if (!name) {
          setError("Each router advertisement row requires an interface name.");
          setSuccess(null);
          return;
        }
        if (seenInterfaces.has(name)) {
          setError(`Duplicate interface '${name}' in router advertisements.`);
          setSuccess(null);
          return;
        }
        seenInterfaces.add(name);

        const numericErrors = [
          validatePositiveIntegerField("Hop limit", iface.hopLimit),
          validatePositiveIntegerField("Link MTU", iface.linkMtu),
          validatePositiveIntegerField("Default lifetime", iface.defaultLifetime),
          validatePositiveIntegerField("Reachable time", iface.reachableTime),
          validatePositiveIntegerField("Retrans timer", iface.retransTimer),
          validatePositiveIntegerField("Minimum interval", iface.intervalMin),
          validatePositiveIntegerField("Maximum interval", iface.intervalMax),
        ].filter(Boolean) as string[];
        if (numericErrors.length > 0) {
          setError(numericErrors[0]);
          setSuccess(null);
          return;
        }
      }
    }

    const operations: string[] = ["delete service router-advert"];
    if (config.enabled) {
      operations.push("set service router-advert");

      for (const iface of config.interfaces) {
        const name = iface.name.trim();
        if (!name) continue;
        const base = `set service router-advert interface ${quoteCliValue(name)}`;
        operations.push(base);

        if (iface.hopLimit.trim()) operations.push(`${base} hop-limit ${iface.hopLimit.trim()}`);
        if (iface.managedFlag) operations.push(`${base} managed-flag`);
        if (iface.otherConfigFlag) operations.push(`${base} other-config-flag`);
        if (iface.linkMtu.trim()) operations.push(`${base} link-mtu ${iface.linkMtu.trim()}`);
        if (iface.defaultLifetime.trim()) operations.push(`${base} default-lifetime ${iface.defaultLifetime.trim()}`);
        if (iface.reachableTime.trim()) operations.push(`${base} reachable-time ${iface.reachableTime.trim()}`);
        if (iface.retransTimer.trim()) operations.push(`${base} retrans-timer ${iface.retransTimer.trim()}`);
        if (iface.defaultPreference) operations.push(`${base} default-preference ${iface.defaultPreference}`);
        if (iface.intervalMin.trim()) operations.push(`${base} interval minimum ${iface.intervalMin.trim()}`);
        if (iface.intervalMax.trim()) operations.push(`${base} interval maximum ${iface.intervalMax.trim()}`);
        if (iface.noSendAdvert) operations.push(`${base} no-send-advert`);
        if (iface.noSendInterval) operations.push(`${base} no-send-interval`);
        if (iface.captivePortal.trim()) {
          operations.push(`${base} captive-portal ${quoteCliValue(iface.captivePortal)}`);
        }

        for (const address of uniqueNonEmpty(iface.nameServers)) {
          operations.push(`${base} name-server ${quoteCliValue(address)}`);
        }
        for (const domain of uniqueNonEmpty(iface.dnssl)) {
          operations.push(`${base} dnssl ${quoteCliValue(domain)}`);
        }
        for (const prefix of uniqueNonEmpty(iface.autoIgnore)) {
          operations.push(`${base} auto-ignore ${quoteCliValue(prefix)}`);
        }

        for (const prefix of iface.prefixes) {
          const prefixValue = prefix.prefix.trim();
          if (!prefixValue) continue;
          const prefixBase = `${base} prefix ${quoteCliValue(prefixValue)}`;
          operations.push(prefixBase);
          if (prefix.decrementLifetime) operations.push(`${prefixBase} decrement-lifetime`);
          if (prefix.deprecatePrefix) operations.push(`${prefixBase} deprecate-prefix`);
          if (prefix.noAutonomousFlag) operations.push(`${prefixBase} no-autonomous-flag`);
          if (prefix.noOnLinkFlag) operations.push(`${prefixBase} no-on-link-flag`);
          if (prefix.preferredLifetime.trim()) {
            operations.push(`${prefixBase} preferred-lifetime ${prefix.preferredLifetime.trim()}`);
          }
          if (prefix.validLifetime.trim()) {
            operations.push(`${prefixBase} valid-lifetime ${prefix.validLifetime.trim()}`);
          }
        }

        for (const nat64Prefix of iface.nat64Prefixes) {
          const prefixValue = nat64Prefix.prefix.trim();
          if (!prefixValue) continue;
          const nat64Base = `${base} nat64prefix ${quoteCliValue(prefixValue)}`;
          operations.push(nat64Base);
          if (nat64Prefix.validLifetime.trim()) {
            operations.push(`${nat64Base} valid-lifetime ${nat64Prefix.validLifetime.trim()}`);
          }
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureRouterAdvert(uniqueNonEmpty(operations));
      await loadConfig(true);
      setSuccess("Router advertisement settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update router advertisement settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Router Advertisements
        </CardTitle>
        <CardDescription>
          Configure IPv6 router advertisement behavior for LAN interfaces, including prefix and NAT64 announcements.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading router advertisement settings...</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={config.enabled}
                onCheckedChange={(checked) =>
                  setConfig((previous) => ({ ...previous, enabled: checked === true }))
                }
                disabled={disableInputs}
              />
              <Label className="text-sm font-medium">Enable router advertisements</Label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Interfaces</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      interfaces: [...previous.interfaces, { ...EMPTY_INTERFACE }],
                    }))
                  }
                  disabled={disableInputs || !config.enabled}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Interface
                </Button>
              </div>
              {interfaceOptions.length > 0 ? (
                <>
                  <datalist id="router-advert-interface-options">
                    {interfaceOptions.map((option) => (
                      <option key={option.value} value={option.value} label={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </datalist>
                  <p className="text-[11px] text-muted-foreground">
                    Interface suggestions show descriptions first when available.
                  </p>
                </>
              ) : null}

              {config.interfaces.length === 0 ? (
                <p className="text-xs text-muted-foreground">No router advertisement interfaces configured.</p>
              ) : (
                <div className="space-y-4">
                  {config.interfaces.map((iface, interfaceIndex) => (
                    <div key={`router-advert-interface-${interfaceIndex}`} className="rounded-md border p-4 space-y-4">
                      <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
                        <Input
                          list="router-advert-interface-options"
                          value={iface.name}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, { name: event.target.value })
                          }
                          placeholder="eth2"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeInterface(interfaceIndex)}
                          disabled={disableInputs || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-3 xl:grid-cols-3">
                        <Input
                          value={iface.hopLimit}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, { hopLimit: event.target.value })
                          }
                          placeholder="Hop limit"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={iface.linkMtu}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, { linkMtu: event.target.value })
                          }
                          placeholder="Link MTU"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={iface.defaultLifetime}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, { defaultLifetime: event.target.value })
                          }
                          placeholder="Default lifetime (s)"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={iface.reachableTime}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, { reachableTime: event.target.value })
                          }
                          placeholder="Reachable time (ms)"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={iface.retransTimer}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, { retransTimer: event.target.value })
                          }
                          placeholder="Retrans timer (ms)"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Select
                          value={iface.defaultPreference || "unset"}
                          onValueChange={(value) =>
                            updateInterface(interfaceIndex, {
                              defaultPreference:
                                value === "unset" ? "" : (value as "low" | "medium" | "high"),
                            })
                          }
                          disabled={disableInputs || !config.enabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Default preference" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unset">Default preference (unset)</SelectItem>
                            <SelectItem value="low">low</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="high">high</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={iface.intervalMin}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, { intervalMin: event.target.value })
                          }
                          placeholder="Interval minimum (s)"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={iface.intervalMax}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, { intervalMax: event.target.value })
                          }
                          placeholder="Interval maximum (s)"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={iface.captivePortal}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, { captivePortal: event.target.value })
                          }
                          placeholder="Captive portal URL"
                          disabled={disableInputs || !config.enabled}
                        />
                      </div>

                      <div className="grid gap-3 xl:grid-cols-3">
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={iface.managedFlag}
                            onCheckedChange={(checked) =>
                              updateInterface(interfaceIndex, { managedFlag: checked === true })
                            }
                            disabled={disableInputs || !config.enabled}
                          />
                          Managed flag
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={iface.otherConfigFlag}
                            onCheckedChange={(checked) =>
                              updateInterface(interfaceIndex, { otherConfigFlag: checked === true })
                            }
                            disabled={disableInputs || !config.enabled}
                          />
                          Other config flag
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={iface.noSendAdvert}
                            onCheckedChange={(checked) =>
                              updateInterface(interfaceIndex, { noSendAdvert: checked === true })
                            }
                            disabled={disableInputs || !config.enabled}
                          />
                          No send advert
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={iface.noSendInterval}
                            onCheckedChange={(checked) =>
                              updateInterface(interfaceIndex, { noSendInterval: checked === true })
                            }
                            disabled={disableInputs || !config.enabled}
                          />
                          No send interval
                        </label>
                      </div>

                      <div className="grid gap-3 xl:grid-cols-3">
                        <Input
                          value={toCsv(iface.nameServers)}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, {
                              nameServers: fromCsv(event.target.value),
                            })
                          }
                          placeholder="DNS servers (comma-separated)"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={toCsv(iface.dnssl)}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, {
                              dnssl: fromCsv(event.target.value),
                            })
                          }
                          placeholder="DNSSL domains (comma-separated)"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={toCsv(iface.autoIgnore)}
                          onChange={(event) =>
                            updateInterface(interfaceIndex, {
                              autoIgnore: fromCsv(event.target.value),
                            })
                          }
                          placeholder="Auto-ignore prefixes"
                          disabled={disableInputs || !config.enabled}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium">Advertised Prefixes</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addPrefix(interfaceIndex)}
                            disabled={disableInputs || !config.enabled}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add Prefix
                          </Button>
                        </div>
                        {iface.prefixes.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No prefixes configured.</p>
                        ) : (
                          <div className="space-y-2">
                            {iface.prefixes.map((prefix, prefixIndex) => (
                              <div
                                key={`router-advert-prefix-${interfaceIndex}-${prefixIndex}`}
                                className="rounded-md border p-3 space-y-2"
                              >
                                <div className="grid gap-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
                                  <Input
                                    value={prefix.prefix}
                                    onChange={(event) =>
                                      updatePrefix(interfaceIndex, prefixIndex, { prefix: event.target.value })
                                    }
                                    placeholder="2001:db8:2::/64"
                                    disabled={disableInputs || !config.enabled}
                                  />
                                  <Input
                                    value={prefix.preferredLifetime}
                                    onChange={(event) =>
                                      updatePrefix(interfaceIndex, prefixIndex, {
                                        preferredLifetime: event.target.value,
                                      })
                                    }
                                    placeholder="Preferred lifetime"
                                    disabled={disableInputs || !config.enabled}
                                  />
                                  <Input
                                    value={prefix.validLifetime}
                                    onChange={(event) =>
                                      updatePrefix(interfaceIndex, prefixIndex, {
                                        validLifetime: event.target.value,
                                      })
                                    }
                                    placeholder="Valid lifetime"
                                    disabled={disableInputs || !config.enabled}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removePrefix(interfaceIndex, prefixIndex)}
                                    disabled={disableInputs || !config.enabled}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="grid gap-2 xl:grid-cols-2">
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={prefix.decrementLifetime}
                                      onCheckedChange={(checked) =>
                                        updatePrefix(interfaceIndex, prefixIndex, {
                                          decrementLifetime: checked === true,
                                        })
                                      }
                                      disabled={disableInputs || !config.enabled}
                                    />
                                    Decrement lifetime
                                  </label>
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={prefix.deprecatePrefix}
                                      onCheckedChange={(checked) =>
                                        updatePrefix(interfaceIndex, prefixIndex, {
                                          deprecatePrefix: checked === true,
                                        })
                                      }
                                      disabled={disableInputs || !config.enabled}
                                    />
                                    Deprecate on shutdown
                                  </label>
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={prefix.noAutonomousFlag}
                                      onCheckedChange={(checked) =>
                                        updatePrefix(interfaceIndex, prefixIndex, {
                                          noAutonomousFlag: checked === true,
                                        })
                                      }
                                      disabled={disableInputs || !config.enabled}
                                    />
                                    No autonomous flag
                                  </label>
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={prefix.noOnLinkFlag}
                                      onCheckedChange={(checked) =>
                                        updatePrefix(interfaceIndex, prefixIndex, {
                                          noOnLinkFlag: checked === true,
                                        })
                                      }
                                      disabled={disableInputs || !config.enabled}
                                    />
                                    No on-link flag
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium">Advertised NAT64 Prefixes</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addNat64Prefix(interfaceIndex)}
                            disabled={disableInputs || !config.enabled}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add NAT64 Prefix
                          </Button>
                        </div>
                        {iface.nat64Prefixes.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No NAT64 prefixes configured.</p>
                        ) : (
                          <div className="space-y-2">
                            {iface.nat64Prefixes.map((prefix, nat64Index) => (
                              <div
                                key={`router-advert-nat64-${interfaceIndex}-${nat64Index}`}
                                className="grid gap-2 xl:grid-cols-[1fr_1fr_auto] rounded-md border p-3"
                              >
                                <Input
                                  value={prefix.prefix}
                                  onChange={(event) =>
                                    updateNat64Prefix(interfaceIndex, nat64Index, {
                                      prefix: event.target.value,
                                    })
                                  }
                                  placeholder="64:ff9b::/96"
                                  disabled={disableInputs || !config.enabled}
                                />
                                <Input
                                  value={prefix.validLifetime}
                                  onChange={(event) =>
                                    updateNat64Prefix(interfaceIndex, nat64Index, {
                                      validLifetime: event.target.value,
                                    })
                                  }
                                  placeholder="Valid lifetime"
                                  disabled={disableInputs || !config.enabled}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeNat64Prefix(interfaceIndex, nat64Index)}
                                  disabled={disableInputs || !config.enabled}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <span>{error}</span>
                </div>
              </div>
            )}
            {success && (
              <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700">
                {success}
              </div>
            )}

            <Button onClick={handleSave} disabled={disableInputs}>
              <Save className="mr-2 h-4 w-4" />
              Save Router Advertisements
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
