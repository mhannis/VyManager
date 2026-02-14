"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Plus, Save, Trash2, Wifi } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { serviceWrappersApi } from "@/lib/api/service-wrappers";
import { asString, objectKeys, quoteCliValue, toRecord, uniqueNonEmpty } from "./serviceTabHelpers";

interface InterfaceEntry {
  interface: string;
  mode: "" | "l2" | "l3";
  network: "" | "shared" | "vlan";
  vlan: string;
  clientSubnet: string;
  externalDhcpRelay: string;
  externalDhcpGiaddr: string;
}

interface ClientPoolEntry {
  name: string;
  ranges: string[];
  nextPool: string;
}

interface LocalMacEntry {
  interface: string;
  mac: string;
  vlan: string;
  downloadRate: string;
  uploadRate: string;
}

interface RadiusServerEntry {
  address: string;
  key: string;
  port: string;
  disabled: boolean;
}

interface IpoeServerState {
  enabled: boolean;
  description: string;
  gatewayAddress: string;
  defaultPool: string;
  defaultIpv6Pool: string;
  maxConcurrentSessions: string;
  interfaces: InterfaceEntry[];
  nameServers: string[];
  clientPools: ClientPoolEntry[];
  authMode: "" | "local" | "radius";
  localMacAuth: LocalMacEntry[];
  radiusServers: RadiusServerEntry[];
  radiusNasIdentifier: string;
  radiusNasIpAddress: string;
  radiusSourceAddress: string;
  radiusTimeout: string;
  radiusAcctTimeout: string;
  radiusMaxTry: string;
}

const EMPTY_STATE: IpoeServerState = {
  enabled: false,
  description: "",
  gatewayAddress: "",
  defaultPool: "",
  defaultIpv6Pool: "",
  maxConcurrentSessions: "",
  interfaces: [],
  nameServers: [],
  clientPools: [],
  authMode: "",
  localMacAuth: [],
  radiusServers: [],
  radiusNasIdentifier: "",
  radiusNasIpAddress: "",
  radiusSourceAddress: "",
  radiusTimeout: "",
  radiusAcctTimeout: "",
  radiusMaxTry: "",
};

interface IpoeServerServiceTabProps {
  canEdit: boolean;
  active: boolean;
  refreshNonce: number;
}

function parseDirectOrKey(value: unknown): string {
  const direct = asString(value);
  if (direct) return direct;
  const root = toRecord(value);
  const first = Object.keys(root)[0];
  return first ?? "";
}

function parseListFromObject(value: unknown): string[] {
  return Object.keys(toRecord(value)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function parseInterfaces(root: Record<string, unknown>): InterfaceEntry[] {
  return Object.keys(root)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => {
      const cfg = toRecord(root[name]);
      const externalDhcp = toRecord(cfg["external-dhcp"]);
      return {
        interface: name,
        mode: (parseDirectOrKey(cfg.mode) as "l2" | "l3" | "") ?? "",
        network: (parseDirectOrKey(cfg.network) as "shared" | "vlan" | "") ?? "",
        vlan: parseDirectOrKey(cfg.vlan),
        clientSubnet: asString(cfg["client-subnet"]) ?? "",
        externalDhcpRelay: asString(externalDhcp["dhcp-relay"]) ?? "",
        externalDhcpGiaddr: asString(externalDhcp.giaddr) ?? "",
      };
    });
}

function parseClientPools(root: Record<string, unknown>): ClientPoolEntry[] {
  return Object.keys(root)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => {
      const cfg = toRecord(root[name]);
      return {
        name,
        ranges: parseListFromObject(cfg.range),
        nextPool: asString(cfg["next-pool"]) ?? "",
      };
    });
}

function parseLocalMacAuth(root: Record<string, unknown>): LocalMacEntry[] {
  const rows: LocalMacEntry[] = [];
  for (const [ifaceName, ifaceCfg] of Object.entries(root)) {
    const macRoot = toRecord(toRecord(ifaceCfg).mac);
    for (const [macAddress, macCfg] of Object.entries(macRoot)) {
      const cfg = toRecord(macCfg);
      const rateLimit = toRecord(cfg["rate-limit"]);
      rows.push({
        interface: ifaceName,
        mac: macAddress,
        vlan: asString(cfg.vlan) ?? "",
        downloadRate: asString(rateLimit.download) ?? "",
        uploadRate: asString(rateLimit.upload) ?? "",
      });
    }
  }

  return rows.sort((left, right) => {
    const ifaceCompare = left.interface.localeCompare(right.interface, undefined, { numeric: true });
    if (ifaceCompare !== 0) return ifaceCompare;
    return left.mac.localeCompare(right.mac);
  });
}

function parseRadiusServers(root: Record<string, unknown>): RadiusServerEntry[] {
  return Object.keys(root)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((address) => {
      const cfg = toRecord(root[address]);
      return {
        address,
        key: asString(cfg.key) ?? "",
        port: asString(cfg.port) ?? "",
        disabled: Object.prototype.hasOwnProperty.call(cfg, "disable"),
      };
    });
}

function parseConfig(serviceNode: Record<string, unknown>): IpoeServerState {
  const auth = toRecord(serviceNode.authentication);
  const radius = toRecord(auth.radius);

  return {
    enabled: Object.keys(serviceNode).length > 0,
    description: asString(serviceNode.description) ?? "",
    gatewayAddress: asString(serviceNode["gateway-address"]) ?? "",
    defaultPool: asString(serviceNode["default-pool"]) ?? "",
    defaultIpv6Pool: asString(serviceNode["default-ipv6-pool"]) ?? "",
    maxConcurrentSessions: asString(serviceNode["max-concurrent-sessions"]) ?? "",
    interfaces: parseInterfaces(toRecord(serviceNode.interface)),
    nameServers: objectKeys(serviceNode["name-server"]),
    clientPools: parseClientPools(toRecord(serviceNode["client-ip-pool"])),
    authMode: (parseDirectOrKey(auth.mode) as "local" | "radius" | "") ?? "",
    localMacAuth: parseLocalMacAuth(toRecord(auth.interface)),
    radiusServers: parseRadiusServers(toRecord(radius.server)),
    radiusNasIdentifier: asString(radius["nas-identifier"]) ?? "",
    radiusNasIpAddress: asString(radius["nas-ip-address"]) ?? "",
    radiusSourceAddress: asString(radius["source-address"]) ?? "",
    radiusTimeout: asString(radius.timeout) ?? "",
    radiusAcctTimeout: asString(radius["acct-timeout"]) ?? "",
    radiusMaxTry: asString(radius["max-try"]) ?? "",
  };
}

function updateList(values: string[], index: number, value: string): string[] {
  const next = [...values];
  next[index] = value;
  return next;
}

export function IpoeServerServiceTab({ canEdit, active, refreshNonce }: IpoeServerServiceTabProps) {
  const [config, setConfig] = useState<IpoeServerState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await serviceWrappersApi.getIpoeServerConfig(refresh);
      setConfig(parseConfig(toRecord(payload.service)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load IPoE server configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    loadConfig(false);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    loadConfig(true);
  }, [active, refreshNonce]);

  const handleSave = async () => {
    const operations: string[] = ["delete service ipoe-server"];

    if (config.enabled) {
      operations.push("set service ipoe-server");

      if (config.description.trim()) {
        operations.push(`set service ipoe-server description ${quoteCliValue(config.description)}`);
      }
      if (config.gatewayAddress.trim()) {
        operations.push(`set service ipoe-server gateway-address ${quoteCliValue(config.gatewayAddress)}`);
      }
      if (config.defaultPool.trim()) {
        operations.push(`set service ipoe-server default-pool ${quoteCliValue(config.defaultPool)}`);
      }
      if (config.defaultIpv6Pool.trim()) {
        operations.push(
          `set service ipoe-server default-ipv6-pool ${quoteCliValue(config.defaultIpv6Pool)}`,
        );
      }
      if (config.maxConcurrentSessions.trim()) {
        operations.push(
          `set service ipoe-server max-concurrent-sessions ${quoteCliValue(config.maxConcurrentSessions)}`,
        );
      }

      for (const iface of config.interfaces) {
        const ifaceName = iface.interface.trim();
        if (!ifaceName) continue;
        const base = `set service ipoe-server interface ${quoteCliValue(ifaceName)}`;
        operations.push(base);
        if (iface.mode) {
          operations.push(`${base} mode ${iface.mode}`);
        }
        if (iface.network) {
          operations.push(`${base} network ${iface.network}`);
        }
        if (iface.vlan.trim()) {
          operations.push(`${base} vlan ${quoteCliValue(iface.vlan)}`);
        }
        if (iface.clientSubnet.trim()) {
          operations.push(`${base} client-subnet ${quoteCliValue(iface.clientSubnet)}`);
        }
        if (iface.externalDhcpRelay.trim()) {
          operations.push(
            `${base} external-dhcp dhcp-relay ${quoteCliValue(iface.externalDhcpRelay)}`,
          );
        }
        if (iface.externalDhcpGiaddr.trim()) {
          operations.push(`${base} external-dhcp giaddr ${quoteCliValue(iface.externalDhcpGiaddr)}`);
        }
      }

      for (const dnsServer of uniqueNonEmpty(config.nameServers)) {
        operations.push(`set service ipoe-server name-server ${quoteCliValue(dnsServer)}`);
      }

      for (const pool of config.clientPools) {
        const name = pool.name.trim();
        if (!name) continue;
        const base = `set service ipoe-server client-ip-pool ${quoteCliValue(name)}`;
        operations.push(base);
        for (const range of uniqueNonEmpty(pool.ranges)) {
          operations.push(`${base} range ${quoteCliValue(range)}`);
        }
        if (pool.nextPool.trim()) {
          operations.push(`${base} next-pool ${quoteCliValue(pool.nextPool)}`);
        }
      }

      if (config.authMode) {
        operations.push(`set service ipoe-server authentication mode ${config.authMode}`);
      }

      for (const entry of config.localMacAuth) {
        const iface = entry.interface.trim();
        const mac = entry.mac.trim();
        if (!iface || !mac) continue;
        const base =
          `set service ipoe-server authentication interface ${quoteCliValue(iface)} mac ${quoteCliValue(mac)}`;
        operations.push(base);
        if (entry.vlan.trim()) {
          operations.push(`${base} vlan ${quoteCliValue(entry.vlan)}`);
        }
        if (entry.downloadRate.trim()) {
          operations.push(`${base} rate-limit download ${quoteCliValue(entry.downloadRate)}`);
        }
        if (entry.uploadRate.trim()) {
          operations.push(`${base} rate-limit upload ${quoteCliValue(entry.uploadRate)}`);
        }
      }

      if (config.authMode === "radius") {
        if (config.radiusNasIdentifier.trim()) {
          operations.push(
            `set service ipoe-server authentication radius nas-identifier ${quoteCliValue(config.radiusNasIdentifier)}`,
          );
        }
        if (config.radiusNasIpAddress.trim()) {
          operations.push(
            `set service ipoe-server authentication radius nas-ip-address ${quoteCliValue(config.radiusNasIpAddress)}`,
          );
        }
        if (config.radiusSourceAddress.trim()) {
          operations.push(
            `set service ipoe-server authentication radius source-address ${quoteCliValue(config.radiusSourceAddress)}`,
          );
        }
        if (config.radiusTimeout.trim()) {
          operations.push(
            `set service ipoe-server authentication radius timeout ${quoteCliValue(config.radiusTimeout)}`,
          );
        }
        if (config.radiusAcctTimeout.trim()) {
          operations.push(
            `set service ipoe-server authentication radius acct-timeout ${quoteCliValue(config.radiusAcctTimeout)}`,
          );
        }
        if (config.radiusMaxTry.trim()) {
          operations.push(
            `set service ipoe-server authentication radius max-try ${quoteCliValue(config.radiusMaxTry)}`,
          );
        }

        for (const server of config.radiusServers) {
          const address = server.address.trim();
          if (!address) continue;
          const base =
            `set service ipoe-server authentication radius server ${quoteCliValue(address)}`;
          if (server.key.trim()) {
            operations.push(`${base} key ${quoteCliValue(server.key)}`);
          }
          if (server.port.trim()) {
            operations.push(`${base} port ${quoteCliValue(server.port)}`);
          }
          if (server.disabled) {
            operations.push(`${base} disable`);
          }
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await serviceWrappersApi.configureIpoeServer(operations);
      await loadConfig(true);
      setSuccess("IPoE server configuration updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update IPoE server configuration.");
    } finally {
      setSaving(false);
    }
  };

  const disableInputs = !canEdit || saving;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wifi className="h-5 w-5 text-primary" />
          IPoE Server
        </CardTitle>
        <CardDescription>
          Configure IPoE interfaces, client pools, and MAC-based local/RADIUS authentication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading IPoE server configuration...</p>
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
              <Label className="text-sm font-medium">Enable IPoE server</Label>
            </div>

            <div className="grid gap-3 xl:grid-cols-4">
              <Input
                value={config.description}
                onChange={(event) =>
                  setConfig((previous) => ({ ...previous, description: event.target.value }))
                }
                placeholder="Description"
                disabled={disableInputs || !config.enabled}
              />
              <Input
                value={config.gatewayAddress}
                onChange={(event) =>
                  setConfig((previous) => ({ ...previous, gatewayAddress: event.target.value }))
                }
                placeholder="Gateway address/CIDR"
                disabled={disableInputs || !config.enabled}
              />
              <Input
                value={config.defaultPool}
                onChange={(event) =>
                  setConfig((previous) => ({ ...previous, defaultPool: event.target.value }))
                }
                placeholder="Default IPv4 pool"
                disabled={disableInputs || !config.enabled}
              />
              <Input
                value={config.defaultIpv6Pool}
                onChange={(event) =>
                  setConfig((previous) => ({ ...previous, defaultIpv6Pool: event.target.value }))
                }
                placeholder="Default IPv6 pool"
                disabled={disableInputs || !config.enabled}
              />
              <Input
                value={config.maxConcurrentSessions}
                onChange={(event) =>
                  setConfig((previous) => ({
                    ...previous,
                    maxConcurrentSessions: event.target.value,
                  }))
                }
                placeholder="Max concurrent sessions"
                disabled={disableInputs || !config.enabled}
              />
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Interfaces</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfig((previous) => ({
                      ...previous,
                      interfaces: [
                        ...previous.interfaces,
                        {
                          interface: "",
                          mode: "",
                          network: "",
                          vlan: "",
                          clientSubnet: "",
                          externalDhcpRelay: "",
                          externalDhcpGiaddr: "",
                        },
                      ],
                    }))
                  }
                  disabled={disableInputs || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Interface
                </Button>
              </div>
              {config.interfaces.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No interfaces configured.</p>
              ) : (
                <div className="space-y-2">
                  {config.interfaces.map((entry, index) => (
                    <div key={`ipoe-if-${index}`} className="rounded border p-2 space-y-2">
                      <div className="grid gap-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
                        <Input
                          value={entry.interface}
                          onChange={(event) =>
                            setConfig((previous) => {
                              const next = [...previous.interfaces];
                              next[index] = { ...next[index], interface: event.target.value };
                              return { ...previous, interfaces: next };
                            })
                          }
                          placeholder="eth3"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Select
                          value={entry.mode || "__unset__"}
                          onValueChange={(value) =>
                            setConfig((previous) => {
                              const next = [...previous.interfaces];
                              next[index] = {
                                ...next[index],
                                mode: value === "__unset__" ? "" : (value as "l2" | "l3"),
                              };
                              return { ...previous, interfaces: next };
                            })
                          }
                          disabled={disableInputs || !config.enabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Mode" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unset__">Mode (default)</SelectItem>
                            <SelectItem value="l2">L2</SelectItem>
                            <SelectItem value="l3">L3</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={entry.network || "__unset__"}
                          onValueChange={(value) =>
                            setConfig((previous) => {
                              const next = [...previous.interfaces];
                              next[index] = {
                                ...next[index],
                                network:
                                  value === "__unset__" ? "" : (value as "shared" | "vlan"),
                              };
                              return { ...previous, interfaces: next };
                            })
                          }
                          disabled={disableInputs || !config.enabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Network mode" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unset__">Network (default)</SelectItem>
                            <SelectItem value="shared">Shared</SelectItem>
                            <SelectItem value="vlan">VLAN</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setConfig((previous) => ({
                              ...previous,
                              interfaces: previous.interfaces.filter((_, i) => i !== index),
                            }))
                          }
                          disabled={disableInputs || !config.enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-2 xl:grid-cols-4">
                        <Input
                          value={entry.vlan}
                          onChange={(event) =>
                            setConfig((previous) => {
                              const next = [...previous.interfaces];
                              next[index] = { ...next[index], vlan: event.target.value };
                              return { ...previous, interfaces: next };
                            })
                          }
                          placeholder="VLAN/range"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={entry.clientSubnet}
                          onChange={(event) =>
                            setConfig((previous) => {
                              const next = [...previous.interfaces];
                              next[index] = { ...next[index], clientSubnet: event.target.value };
                              return { ...previous, interfaces: next };
                            })
                          }
                          placeholder="Client subnet"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={entry.externalDhcpRelay}
                          onChange={(event) =>
                            setConfig((previous) => {
                              const next = [...previous.interfaces];
                              next[index] = {
                                ...next[index],
                                externalDhcpRelay: event.target.value,
                              };
                              return { ...previous, interfaces: next };
                            })
                          }
                          placeholder="External DHCP relay"
                          disabled={disableInputs || !config.enabled}
                        />
                        <Input
                          value={entry.externalDhcpGiaddr}
                          onChange={(event) =>
                            setConfig((previous) => {
                              const next = [...previous.interfaces];
                              next[index] = {
                                ...next[index],
                                externalDhcpGiaddr: event.target.value,
                              };
                              return { ...previous, interfaces: next };
                            })
                          }
                          placeholder="External DHCP giaddr"
                          disabled={disableInputs || !config.enabled}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Name Servers</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfig((previous) => ({ ...previous, nameServers: [...previous.nameServers, ""] }))}
                  disabled={disableInputs || !config.enabled}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add DNS
                </Button>
              </div>
              {config.nameServers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No name servers configured.</p>
              ) : (
                <div className="space-y-2">
                  {config.nameServers.map((server, index) => (
                    <div key={`ipoe-dns-${index}`} className="grid gap-2 xl:grid-cols-[1fr_auto]">
                      <Input
                        value={server}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            nameServers: updateList(previous.nameServers, index, event.target.value),
                          }))
                        }
                        disabled={disableInputs || !config.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfig((previous) => ({
                            ...previous,
                            nameServers: previous.nameServers.filter((_, i) => i !== index),
                          }))
                        }
                        disabled={disableInputs || !config.enabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Client Pools</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) => ({
                        ...previous,
                        clientPools: [...previous.clientPools, { name: "", ranges: [], nextPool: "" }],
                      }))
                    }
                    disabled={disableInputs || !config.enabled}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Pool
                  </Button>
                </div>
                {config.clientPools.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No IPv4 pools configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.clientPools.map((pool, index) => (
                      <div key={`ipoe-pool-${index}`} className="rounded border p-2 space-y-2">
                        <div className="grid gap-2 xl:grid-cols-[1fr_1fr_auto]">
                          <Input
                            value={pool.name}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.clientPools];
                                next[index] = { ...next[index], name: event.target.value };
                                return { ...previous, clientPools: next };
                              })
                            }
                            placeholder="POOL-NAME"
                            disabled={disableInputs || !config.enabled}
                          />
                          <Input
                            value={pool.nextPool}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.clientPools];
                                next[index] = { ...next[index], nextPool: event.target.value };
                                return { ...previous, clientPools: next };
                              })
                            }
                            placeholder="Next pool"
                            disabled={disableInputs || !config.enabled}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setConfig((previous) => ({
                                ...previous,
                                clientPools: previous.clientPools.filter((_, i) => i !== index),
                              }))
                            }
                            disabled={disableInputs || !config.enabled}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Ranges</Label>
                          {(pool.ranges.length === 0 ? [""] : pool.ranges).map((range, rangeIndex) => (
                            <div key={`ipoe-range-${index}-${rangeIndex}`} className="grid gap-2 xl:grid-cols-[1fr_auto]">
                              <Input
                                value={range}
                                onChange={(event) =>
                                  setConfig((previous) => {
                                    const next = [...previous.clientPools];
                                    const ranges = pool.ranges.length === 0 ? [""] : [...pool.ranges];
                                    ranges[rangeIndex] = event.target.value;
                                    next[index] = { ...pool, ranges };
                                    return { ...previous, clientPools: next };
                                  })
                                }
                                placeholder="192.168.20.10-192.168.20.200"
                                disabled={disableInputs || !config.enabled}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setConfig((previous) => {
                                    const next = [...previous.clientPools];
                                    next[index] = {
                                      ...pool,
                                      ranges: pool.ranges.filter((_, i) => i !== rangeIndex),
                                    };
                                    return { ...previous, clientPools: next };
                                  })
                                }
                                disabled={disableInputs || !config.enabled}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setConfig((previous) => {
                                const next = [...previous.clientPools];
                                next[index] = { ...pool, ranges: [...pool.ranges, ""] };
                                return { ...previous, clientPools: next };
                              })
                            }
                            disabled={disableInputs || !config.enabled}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Range
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Local MAC Authentication</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) => ({
                        ...previous,
                        localMacAuth: [
                          ...previous.localMacAuth,
                          {
                            interface: "",
                            mac: "",
                            vlan: "",
                            downloadRate: "",
                            uploadRate: "",
                          },
                        ],
                      }))
                    }
                    disabled={disableInputs || !config.enabled}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add MAC Entry
                  </Button>
                </div>
                {config.localMacAuth.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No local MAC entries configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.localMacAuth.map((entry, index) => (
                      <div key={`ipoe-mac-${index}`} className="rounded border p-2 space-y-2">
                        <div className="grid gap-2 xl:grid-cols-[1fr_1fr_auto]">
                          <Input
                            value={entry.interface}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.localMacAuth];
                                next[index] = { ...next[index], interface: event.target.value };
                                return { ...previous, localMacAuth: next };
                              })
                            }
                            placeholder="Interface"
                            disabled={disableInputs || !config.enabled}
                          />
                          <Input
                            value={entry.mac}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.localMacAuth];
                                next[index] = { ...next[index], mac: event.target.value };
                                return { ...previous, localMacAuth: next };
                              })
                            }
                            placeholder="MAC address"
                            disabled={disableInputs || !config.enabled}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setConfig((previous) => ({
                                ...previous,
                                localMacAuth: previous.localMacAuth.filter((_, i) => i !== index),
                              }))
                            }
                            disabled={disableInputs || !config.enabled}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid gap-2 xl:grid-cols-3">
                          <Input
                            value={entry.vlan}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.localMacAuth];
                                next[index] = { ...next[index], vlan: event.target.value };
                                return { ...previous, localMacAuth: next };
                              })
                            }
                            placeholder="VLAN"
                            disabled={disableInputs || !config.enabled}
                          />
                          <Input
                            value={entry.downloadRate}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.localMacAuth];
                                next[index] = { ...next[index], downloadRate: event.target.value };
                                return { ...previous, localMacAuth: next };
                              })
                            }
                            placeholder="Download rate"
                            disabled={disableInputs || !config.enabled}
                          />
                          <Input
                            value={entry.uploadRate}
                            onChange={(event) =>
                              setConfig((previous) => {
                                const next = [...previous.localMacAuth];
                                next[index] = { ...next[index], uploadRate: event.target.value };
                                return { ...previous, localMacAuth: next };
                              })
                            }
                            placeholder="Upload rate"
                            disabled={disableInputs || !config.enabled}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <Label className="text-sm font-medium">Authentication</Label>
              <div className="grid gap-3 xl:grid-cols-3">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select
                    value={config.authMode || "__unset__"}
                    onValueChange={(value) =>
                      setConfig((previous) => ({
                        ...previous,
                        authMode: value === "__unset__" ? "" : (value as "local" | "radius"),
                      }))
                    }
                    disabled={disableInputs || !config.enabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">Default</SelectItem>
                      <SelectItem value="local">Local</SelectItem>
                      <SelectItem value="radius">RADIUS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  value={config.radiusNasIdentifier}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, radiusNasIdentifier: event.target.value }))
                  }
                  placeholder="RADIUS NAS identifier"
                  disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                />
                <Input
                  value={config.radiusNasIpAddress}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, radiusNasIpAddress: event.target.value }))
                  }
                  placeholder="RADIUS NAS IP"
                  disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                />
                <Input
                  value={config.radiusSourceAddress}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, radiusSourceAddress: event.target.value }))
                  }
                  placeholder="RADIUS source address"
                  disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                />
                <Input
                  value={config.radiusTimeout}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, radiusTimeout: event.target.value }))
                  }
                  placeholder="RADIUS timeout"
                  disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                />
                <Input
                  value={config.radiusAcctTimeout}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, radiusAcctTimeout: event.target.value }))
                  }
                  placeholder="RADIUS acct-timeout"
                  disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                />
                <Input
                  value={config.radiusMaxTry}
                  onChange={(event) =>
                    setConfig((previous) => ({ ...previous, radiusMaxTry: event.target.value }))
                  }
                  placeholder="RADIUS max-try"
                  disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">RADIUS Servers</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig((previous) => ({
                        ...previous,
                        radiusServers: [
                          ...previous.radiusServers,
                          { address: "", key: "", port: "", disabled: false },
                        ],
                      }))
                    }
                    disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add RADIUS Server
                  </Button>
                </div>
                {config.radiusServers.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No RADIUS servers configured.</p>
                ) : (
                  <div className="space-y-2">
                    {config.radiusServers.map((server, index) => (
                      <div key={`ipoe-radius-${index}`} className="grid gap-2 xl:grid-cols-[1fr_1fr_140px_auto_auto]">
                        <Input
                          value={server.address}
                          onChange={(event) =>
                            setConfig((previous) => {
                              const next = [...previous.radiusServers];
                              next[index] = { ...next[index], address: event.target.value };
                              return { ...previous, radiusServers: next };
                            })
                          }
                          placeholder="Server IP"
                          disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                        />
                        <Input
                          type="password"
                          value={server.key}
                          onChange={(event) =>
                            setConfig((previous) => {
                              const next = [...previous.radiusServers];
                              next[index] = { ...next[index], key: event.target.value };
                              return { ...previous, radiusServers: next };
                            })
                          }
                          placeholder="Secret"
                          disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                        />
                        <Input
                          value={server.port}
                          onChange={(event) =>
                            setConfig((previous) => {
                              const next = [...previous.radiusServers];
                              next[index] = { ...next[index], port: event.target.value };
                              return { ...previous, radiusServers: next };
                            })
                          }
                          placeholder="1812"
                          disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={server.disabled}
                            onCheckedChange={(checked) =>
                              setConfig((previous) => {
                                const next = [...previous.radiusServers];
                                next[index] = { ...next[index], disabled: checked === true };
                                return { ...previous, radiusServers: next };
                              })
                            }
                            disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                          />
                          <Label className="text-xs">Disable</Label>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setConfig((previous) => ({
                              ...previous,
                              radiusServers: previous.radiusServers.filter((_, i) => i !== index),
                            }))
                          }
                          disabled={disableInputs || !config.enabled || config.authMode !== "radius"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error ? (
              <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : null}

            {success ? (
              <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                {success}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={disableInputs}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save IPoE Server"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
