"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  openvpnInterfaceService,
  type OpenvpnInterfaceConfig,
} from "@/lib/api/openvpn-interface";
import { pageGuides } from "@/lib/help/pageGuides";

const MODE_OPTIONS = ["site-to-site", "server", "client"] as const;
const PROTOCOL_OPTIONS = ["udp", "tcp-passive", "tcp-active"] as const;
const DEVICE_TYPE_OPTIONS = ["tun", "tap"] as const;
const CIPHER_OPTIONS = [
  "3des",
  "aes128",
  "aes128gcm",
  "aes192",
  "aes192gcm",
  "aes256",
  "aes256gcm",
  "none",
] as const;
const HASH_OPTIONS = ["md5", "sha1", "sha256", "sha384", "sha512"] as const;
const TLS_ROLE_OPTIONS = ["active", "passive"] as const;
const TLS_MIN_OPTIONS = ["1.0", "1.1", "1.2", "1.3"] as const;
const TOPOLOGY_OPTIONS = ["net30", "point-to-point", "subnet"] as const;

interface OpenvpnFormState {
  name: string;
  description: string;
  addressesText: string;
  mtu: string;
  vrf: string;
  disable: boolean;
  mode: string;
  protocol: string;
  deviceType: string;
  hash: string;
  localAddress: string;
  remoteAddress: string;
  localHost: string;
  localPort: string;
  remoteHost: string;
  remotePort: string;
  keepAliveInterval: string;
  keepAliveFailureCount: string;
  authenticationUsername: string;
  authenticationPassword: string;
  sharedSecretKey: string;
  redirectInterface: string;
  mirrorIngress: string;
  mirrorEgress: string;
  openvpnOptionsText: string;
  encryptionCipher: string;
  encryptionDataCiphersText: string;
  encryptionDataCiphersFallback: string;
  tlsAuthKey: string;
  tlsCaCertificate: string;
  tlsCertificate: string;
  tlsPeerFingerprint: string;
  tlsRole: string;
  tlsVersionMin: string;
  persistentTunnel: boolean;
  replaceDefaultRoute: boolean;
  useLzoCompression: boolean;
  offloadDco: boolean;
  tlsCryptKey: boolean;
  tlsDhParams: boolean;
  serverSubnet: string;
  serverTopology: string;
  serverDomainName: string;
  serverMaxConnections: string;
  serverRejectUnconfiguredClient: boolean;
  serverNameServersText: string;
  serverPushRoutesText: string;
  serverClientIpPoolStart: string;
  serverClientIpPoolStop: string;
  serverClientIpPoolSubnet: string;
  serverClientIpv6PoolBase: string;
  serverBridgeDisable: boolean;
  serverBridgeGateway: string;
  serverBridgeStart: string;
  serverBridgeStop: string;
  serverBridgeSubnetMask: string;
}

const EMPTY_FORM: OpenvpnFormState = {
  name: "",
  description: "",
  addressesText: "",
  mtu: "",
  vrf: "",
  disable: false,
  mode: "site-to-site",
  protocol: "udp",
  deviceType: "tun",
  hash: "",
  localAddress: "",
  remoteAddress: "",
  localHost: "",
  localPort: "",
  remoteHost: "",
  remotePort: "",
  keepAliveInterval: "",
  keepAliveFailureCount: "",
  authenticationUsername: "",
  authenticationPassword: "",
  sharedSecretKey: "",
  redirectInterface: "",
  mirrorIngress: "",
  mirrorEgress: "",
  openvpnOptionsText: "",
  encryptionCipher: "",
  encryptionDataCiphersText: "",
  encryptionDataCiphersFallback: "",
  tlsAuthKey: "",
  tlsCaCertificate: "",
  tlsCertificate: "",
  tlsPeerFingerprint: "",
  tlsRole: "",
  tlsVersionMin: "",
  persistentTunnel: false,
  replaceDefaultRoute: false,
  useLzoCompression: false,
  offloadDco: false,
  tlsCryptKey: false,
  tlsDhParams: false,
  serverSubnet: "",
  serverTopology: "",
  serverDomainName: "",
  serverMaxConnections: "",
  serverRejectUnconfiguredClient: false,
  serverNameServersText: "",
  serverPushRoutesText: "",
  serverClientIpPoolStart: "",
  serverClientIpPoolStop: "",
  serverClientIpPoolSubnet: "",
  serverClientIpv6PoolBase: "",
  serverBridgeDisable: false,
  serverBridgeGateway: "",
  serverBridgeStart: "",
  serverBridgeStop: "",
  serverBridgeSubnetMask: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseLines(raw: string): string[] {
  return uniqueNonEmpty(raw.split("\n"));
}

function toFormState(value: OpenvpnInterfaceConfig): OpenvpnFormState {
  return {
    name: value.name,
    description: value.description,
    addressesText: value.addresses.join("\n"),
    mtu: value.mtu,
    vrf: value.vrf,
    disable: value.disable,
    mode: value.mode || "site-to-site",
    protocol: value.protocol || "udp",
    deviceType: value.deviceType || "tun",
    hash: value.hash,
    localAddress: value.localAddress,
    remoteAddress: value.remoteAddress,
    localHost: value.localHost,
    localPort: value.localPort,
    remoteHost: value.remoteHost,
    remotePort: value.remotePort,
    keepAliveInterval: value.keepAliveInterval,
    keepAliveFailureCount: value.keepAliveFailureCount,
    authenticationUsername: value.authenticationUsername,
    authenticationPassword: value.authenticationPassword,
    sharedSecretKey: value.sharedSecretKey,
    redirectInterface: value.redirectInterface,
    mirrorIngress: value.mirrorIngress,
    mirrorEgress: value.mirrorEgress,
    openvpnOptionsText: value.openvpnOptions.join("\n"),
    encryptionCipher: value.encryptionCipher,
    encryptionDataCiphersText: value.encryptionDataCiphers.join("\n"),
    encryptionDataCiphersFallback: value.encryptionDataCiphersFallback,
    tlsAuthKey: value.tlsAuthKey,
    tlsCaCertificate: value.tlsCaCertificate,
    tlsCertificate: value.tlsCertificate,
    tlsPeerFingerprint: value.tlsPeerFingerprint,
    tlsRole: value.tlsRole,
    tlsVersionMin: value.tlsVersionMin,
    persistentTunnel: value.persistentTunnel,
    replaceDefaultRoute: value.replaceDefaultRoute,
    useLzoCompression: value.useLzoCompression,
    offloadDco: value.offloadDco,
    tlsCryptKey: value.tlsCryptKey,
    tlsDhParams: value.tlsDhParams,
    serverSubnet: value.serverSubnet,
    serverTopology: value.serverTopology,
    serverDomainName: value.serverDomainName,
    serverMaxConnections: value.serverMaxConnections,
    serverRejectUnconfiguredClient: value.serverRejectUnconfiguredClient,
    serverNameServersText: value.serverNameServers.join("\n"),
    serverPushRoutesText: value.serverPushRoutes.join("\n"),
    serverClientIpPoolStart: value.serverClientIpPoolStart,
    serverClientIpPoolStop: value.serverClientIpPoolStop,
    serverClientIpPoolSubnet: value.serverClientIpPoolSubnet,
    serverClientIpv6PoolBase: value.serverClientIpv6PoolBase,
    serverBridgeDisable: value.serverBridgeDisable,
    serverBridgeGateway: value.serverBridgeGateway,
    serverBridgeStart: value.serverBridgeStart,
    serverBridgeStop: value.serverBridgeStop,
    serverBridgeSubnetMask: value.serverBridgeSubnetMask,
  };
}

function syncScalar(
  operations: string[],
  base: string,
  token: string,
  desired: string,
  current: string,
): void {
  if (desired === current) return;
  if (desired) {
    operations.push(`set ${base} ${token} ${quoteCliValue(desired)}`);
  } else {
    operations.push(`delete ${base} ${token}`);
  }
}

function syncFlag(
  operations: string[],
  base: string,
  token: string,
  desired: boolean,
  current: boolean,
): void {
  if (desired === current) return;
  operations.push(desired ? `set ${base} ${token}` : `delete ${base} ${token}`);
}

function syncTagList(
  operations: string[],
  base: string,
  token: string,
  desired: string[],
  current: string[],
): void {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  for (const entry of current) {
    if (!desiredSet.has(entry)) {
      operations.push(`delete ${base} ${token} ${quoteCliValue(entry)}`);
    }
  }
  for (const entry of desired) {
    if (!currentSet.has(entry)) {
      operations.push(`set ${base} ${token} ${quoteCliValue(entry)}`);
    }
  }
}

function buildOpenvpnOperations(
  candidate: OpenvpnFormState,
  current: OpenvpnInterfaceConfig | null,
): string[] {
  const operations: string[] = [];
  const base = `interfaces openvpn ${candidate.name.trim()}`;
  const currentSafe =
    current ||
    ({
      name: candidate.name.trim(),
      description: "",
      addresses: [],
      mtu: "",
      vrf: "",
      disable: false,
      mode: "",
      protocol: "",
      deviceType: "",
      hash: "",
      localAddress: "",
      remoteAddress: "",
      localHost: "",
      localPort: "",
      remoteHost: "",
      remotePort: "",
      keepAliveInterval: "",
      keepAliveFailureCount: "",
      authenticationUsername: "",
      authenticationPassword: "",
      sharedSecretKey: "",
      redirectInterface: "",
      mirrorIngress: "",
      mirrorEgress: "",
      openvpnOptions: [],
      encryptionCipher: "",
      encryptionDataCiphers: [],
      encryptionDataCiphersFallback: "",
      tlsAuthKey: "",
      tlsCaCertificate: "",
      tlsCertificate: "",
      tlsPeerFingerprint: "",
      tlsRole: "",
      tlsVersionMin: "",
      persistentTunnel: false,
      replaceDefaultRoute: false,
      useLzoCompression: false,
      offloadDco: false,
      tlsCryptKey: false,
      tlsDhParams: false,
      serverSubnet: "",
      serverTopology: "",
      serverDomainName: "",
      serverMaxConnections: "",
      serverRejectUnconfiguredClient: false,
      serverNameServers: [],
      serverPushRoutes: [],
      serverClientIpPoolStart: "",
      serverClientIpPoolStop: "",
      serverClientIpPoolSubnet: "",
      serverClientIpv6PoolBase: "",
      serverBridgeDisable: false,
      serverBridgeGateway: "",
      serverBridgeStart: "",
      serverBridgeStop: "",
      serverBridgeSubnetMask: "",
    } satisfies OpenvpnInterfaceConfig);

  syncScalar(operations, base, "description", candidate.description.trim(), currentSafe.description);
  syncScalar(operations, base, "mtu", candidate.mtu.trim(), currentSafe.mtu);
  syncScalar(operations, base, "vrf", candidate.vrf.trim(), currentSafe.vrf);
  syncScalar(operations, base, "mode", candidate.mode.trim(), currentSafe.mode);
  syncScalar(operations, base, "protocol", candidate.protocol.trim(), currentSafe.protocol);
  syncScalar(operations, base, "device-type", candidate.deviceType.trim(), currentSafe.deviceType);
  syncScalar(operations, base, "hash", candidate.hash.trim(), currentSafe.hash);
  syncScalar(
    operations,
    base,
    "local-address",
    candidate.localAddress.trim(),
    currentSafe.localAddress,
  );
  syncScalar(
    operations,
    base,
    "remote-address",
    candidate.remoteAddress.trim(),
    currentSafe.remoteAddress,
  );
  syncScalar(operations, base, "local-host", candidate.localHost.trim(), currentSafe.localHost);
  syncScalar(operations, base, "local-port", candidate.localPort.trim(), currentSafe.localPort);
  syncScalar(operations, base, "remote-host", candidate.remoteHost.trim(), currentSafe.remoteHost);
  syncScalar(operations, base, "remote-port", candidate.remotePort.trim(), currentSafe.remotePort);
  syncScalar(
    operations,
    base,
    "keep-alive interval",
    candidate.keepAliveInterval.trim(),
    currentSafe.keepAliveInterval,
  );
  syncScalar(
    operations,
    base,
    "keep-alive failure-count",
    candidate.keepAliveFailureCount.trim(),
    currentSafe.keepAliveFailureCount,
  );
  syncScalar(
    operations,
    base,
    "authentication username",
    candidate.authenticationUsername.trim(),
    currentSafe.authenticationUsername,
  );
  syncScalar(
    operations,
    base,
    "authentication password",
    candidate.authenticationPassword.trim(),
    currentSafe.authenticationPassword,
  );
  syncScalar(
    operations,
    base,
    "shared-secret-key",
    candidate.sharedSecretKey.trim(),
    currentSafe.sharedSecretKey,
  );
  syncScalar(operations, base, "redirect", candidate.redirectInterface.trim(), currentSafe.redirectInterface);
  syncScalar(operations, base, "mirror ingress", candidate.mirrorIngress.trim(), currentSafe.mirrorIngress);
  syncScalar(operations, base, "mirror egress", candidate.mirrorEgress.trim(), currentSafe.mirrorEgress);
  syncScalar(
    operations,
    base,
    "encryption cipher",
    candidate.encryptionCipher.trim(),
    currentSafe.encryptionCipher,
  );
  syncTagList(
    operations,
    base,
    "encryption data-ciphers",
    parseLines(candidate.encryptionDataCiphersText),
    currentSafe.encryptionDataCiphers,
  );
  syncScalar(
    operations,
    base,
    "encryption data-ciphers-fallback",
    candidate.encryptionDataCiphersFallback.trim(),
    currentSafe.encryptionDataCiphersFallback,
  );
  syncScalar(operations, base, "tls auth-key", candidate.tlsAuthKey.trim(), currentSafe.tlsAuthKey);
  syncScalar(
    operations,
    base,
    "tls ca-certificate",
    candidate.tlsCaCertificate.trim(),
    currentSafe.tlsCaCertificate,
  );
  syncScalar(
    operations,
    base,
    "tls certificate",
    candidate.tlsCertificate.trim(),
    currentSafe.tlsCertificate,
  );
  syncScalar(
    operations,
    base,
    "tls peer-fingerprint",
    candidate.tlsPeerFingerprint.trim(),
    currentSafe.tlsPeerFingerprint,
  );
  syncScalar(operations, base, "tls role", candidate.tlsRole.trim(), currentSafe.tlsRole);
  syncScalar(
    operations,
    base,
    "tls tls-version-min",
    candidate.tlsVersionMin.trim(),
    currentSafe.tlsVersionMin,
  );
  syncScalar(operations, base, "server subnet", candidate.serverSubnet.trim(), currentSafe.serverSubnet);
  syncScalar(
    operations,
    base,
    "server topology",
    candidate.serverTopology.trim(),
    currentSafe.serverTopology,
  );
  syncScalar(
    operations,
    base,
    "server domain-name",
    candidate.serverDomainName.trim(),
    currentSafe.serverDomainName,
  );
  syncScalar(
    operations,
    base,
    "server max-connections",
    candidate.serverMaxConnections.trim(),
    currentSafe.serverMaxConnections,
  );
  syncTagList(
    operations,
    base,
    "server name-server",
    parseLines(candidate.serverNameServersText),
    currentSafe.serverNameServers,
  );
  syncTagList(
    operations,
    base,
    "server push-route",
    parseLines(candidate.serverPushRoutesText),
    currentSafe.serverPushRoutes,
  );
  syncScalar(
    operations,
    base,
    "server client-ip-pool start",
    candidate.serverClientIpPoolStart.trim(),
    currentSafe.serverClientIpPoolStart,
  );
  syncScalar(
    operations,
    base,
    "server client-ip-pool stop",
    candidate.serverClientIpPoolStop.trim(),
    currentSafe.serverClientIpPoolStop,
  );
  syncScalar(
    operations,
    base,
    "server client-ip-pool subnet",
    candidate.serverClientIpPoolSubnet.trim(),
    currentSafe.serverClientIpPoolSubnet,
  );
  syncScalar(
    operations,
    base,
    "server client-ipv6-pool base",
    candidate.serverClientIpv6PoolBase.trim(),
    currentSafe.serverClientIpv6PoolBase,
  );
  syncScalar(
    operations,
    base,
    "server bridge gateway",
    candidate.serverBridgeGateway.trim(),
    currentSafe.serverBridgeGateway,
  );
  syncScalar(
    operations,
    base,
    "server bridge start",
    candidate.serverBridgeStart.trim(),
    currentSafe.serverBridgeStart,
  );
  syncScalar(
    operations,
    base,
    "server bridge stop",
    candidate.serverBridgeStop.trim(),
    currentSafe.serverBridgeStop,
  );
  syncScalar(
    operations,
    base,
    "server bridge subnet-mask",
    candidate.serverBridgeSubnetMask.trim(),
    currentSafe.serverBridgeSubnetMask,
  );

  syncFlag(operations, base, "disable", candidate.disable, currentSafe.disable);
  syncFlag(
    operations,
    base,
    "persistent-tunnel",
    candidate.persistentTunnel,
    currentSafe.persistentTunnel,
  );
  syncFlag(
    operations,
    base,
    "replace-default-route",
    candidate.replaceDefaultRoute,
    currentSafe.replaceDefaultRoute,
  );
  syncFlag(
    operations,
    base,
    "use-lzo-compression",
    candidate.useLzoCompression,
    currentSafe.useLzoCompression,
  );
  syncFlag(operations, base, "offload dco", candidate.offloadDco, currentSafe.offloadDco);
  syncFlag(operations, base, "tls crypt-key", candidate.tlsCryptKey, currentSafe.tlsCryptKey);
  syncFlag(operations, base, "tls dh-params", candidate.tlsDhParams, currentSafe.tlsDhParams);
  syncFlag(
    operations,
    base,
    "server reject-unconfigured-client",
    candidate.serverRejectUnconfiguredClient,
    currentSafe.serverRejectUnconfiguredClient,
  );
  syncFlag(
    operations,
    base,
    "server bridge disable",
    candidate.serverBridgeDisable,
    currentSafe.serverBridgeDisable,
  );

  syncTagList(
    operations,
    base,
    "openvpn-option",
    parseLines(candidate.openvpnOptionsText),
    currentSafe.openvpnOptions,
  );
  syncTagList(operations, base, "address", parseLines(candidate.addressesText), currentSafe.addresses);

  return operations;
}

export default function OpenvpnInterfacesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<OpenvpnInterfaceConfig[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<OpenvpnFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const config = await openvpnInterfaceService.getConfig(refresh);
      setInterfaces(config.interfaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load OpenVPN interfaces.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const resetForm = () => {
    setEditingName(null);
    setForm(EMPTY_FORM);
    setError(null);
    setSuccess(null);
  };

  const editInterface = (value: OpenvpnInterfaceConfig) => {
    setEditingName(value.name);
    setForm(toFormState(value));
    setError(null);
    setSuccess(null);
  };

  const deleteInterface = async (name: string) => {
    if (!window.confirm(`Delete OpenVPN interface '${name}'?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await openvpnInterfaceService.batchConfigure([
        `delete interfaces openvpn ${quoteCliValue(name)}`,
      ]);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected OpenVPN interface delete.");
      }
      await loadData(true);
      if (editingName === name) {
        resetForm();
      }
      setSuccess(`OpenVPN interface '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete OpenVPN interface.");
    } finally {
      setSaving(false);
    }
  };

  const saveInterface = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Interface name is required.");
      return;
    }
    if (editingName && editingName !== name) {
      setError("Renaming OpenVPN interfaces is not supported. Create a new interface and delete the old one.");
      return;
    }
    if (!form.mode.trim()) {
      setError("Mode is required.");
      return;
    }

    if (form.mode === "server" && !form.serverSubnet.trim()) {
      setError("Server mode requires a server subnet.");
      return;
    }

    if (form.mode === "client" && !form.remoteHost.trim()) {
      setError("Client mode requires a remote host.");
      return;
    }

    const numericFields = [
      { label: "MTU", value: form.mtu },
      { label: "Local Port", value: form.localPort },
      { label: "Remote Port", value: form.remotePort },
      { label: "Keepalive Interval", value: form.keepAliveInterval },
      { label: "Keepalive Failure Count", value: form.keepAliveFailureCount },
      { label: "Server Max Connections", value: form.serverMaxConnections },
    ];
    for (const field of numericFields) {
      const trimmed = field.value.trim();
      if (!trimmed) continue;
      if (!/^\d+$/.test(trimmed)) {
        setError(`${field.label} must be a whole number.`);
        return;
      }
    }

    const current = interfaces.find((entry) => entry.name === name) || null;
    const operations = buildOpenvpnOperations({ ...form, name }, current);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await openvpnInterfaceService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected OpenVPN interface update.");
      }
      await loadData(true);
      setSuccess(current ? `OpenVPN '${name}' updated.` : `OpenVPN '${name}' created.`);
      setEditingName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save OpenVPN interface.");
    } finally {
      setSaving(false);
    }
  };

  const disabledCount = useMemo(() => interfaces.filter((entry) => entry.disable).length, [interfaces]);
  const serverCount = useMemo(
    () => interfaces.filter((entry) => entry.mode === "server").length,
    [interfaces],
  );

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">OpenVPN Interfaces</h1>
            <p className="mt-1 text-muted-foreground">
              Configure `interfaces openvpn` for site-to-site, client, and server deployments.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              New OpenVPN
            </Button>
            <PageGuideDialog guide={pageGuides.openvpnInterfaces} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Interfaces</p>
              <p className="mt-1 text-2xl font-bold">{interfaces.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Server Mode</p>
              <p className="mt-1 text-2xl font-bold">{serverCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Disabled</p>
              <p className="mt-1 text-2xl font-bold">{disabledCount}</p>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Configured OpenVPN Interfaces</CardTitle>
              <CardDescription>Select an interface to edit or delete.</CardDescription>
            </CardHeader>
            <CardContent>
              {interfaces.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No OpenVPN interfaces configured.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Remote</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.map((entry) => (
                      <TableRow key={entry.name}>
                        <TableCell className="font-medium">{entry.name}</TableCell>
                        <TableCell>{entry.mode || "-"}</TableCell>
                        <TableCell>{entry.remoteHost || entry.remoteAddress || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={entry.disable ? "destructive" : "default"}>
                            {entry.disable ? "Disabled" : "Enabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => editInterface(entry)} disabled={saving}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteInterface(entry.name)}
                              disabled={saving}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{editingName ? `Edit ${editingName}` : "Create OpenVPN Interface"}</CardTitle>
              <CardDescription>Guide-aligned OpenVPN interface configuration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="openvpn-name">Interface Name</Label>
                  <Input
                    id="openvpn-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="vtun0"
                    disabled={Boolean(editingName)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-description">Description</Label>
                  <Input
                    id="openvpn-description"
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Site-to-site tunnel"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={form.mode} onValueChange={(value) => setForm((prev) => ({ ...prev, mode: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Protocol</Label>
                  <Select
                    value={form.protocol}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, protocol: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROTOCOL_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Device Type</Label>
                  <Select
                    value={form.deviceType}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, deviceType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEVICE_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="openvpn-remote-host">Remote Host</Label>
                  <Input
                    id="openvpn-remote-host"
                    value={form.remoteHost}
                    onChange={(event) => setForm((prev) => ({ ...prev, remoteHost: event.target.value }))}
                    placeholder="vpn.example.net"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-local-host">Local Host</Label>
                  <Input
                    id="openvpn-local-host"
                    value={form.localHost}
                    onChange={(event) => setForm((prev) => ({ ...prev, localHost: event.target.value }))}
                    placeholder="198.51.100.10"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="openvpn-local-port">Local Port</Label>
                  <Input
                    id="openvpn-local-port"
                    value={form.localPort}
                    onChange={(event) => setForm((prev) => ({ ...prev, localPort: event.target.value }))}
                    placeholder="1194"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-remote-port">Remote Port</Label>
                  <Input
                    id="openvpn-remote-port"
                    value={form.remotePort}
                    onChange={(event) => setForm((prev) => ({ ...prev, remotePort: event.target.value }))}
                    placeholder="1194"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-keepalive-interval">Keepalive Interval</Label>
                  <Input
                    id="openvpn-keepalive-interval"
                    value={form.keepAliveInterval}
                    onChange={(event) => setForm((prev) => ({ ...prev, keepAliveInterval: event.target.value }))}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-keepalive-failure">Keepalive Failure Count</Label>
                  <Input
                    id="openvpn-keepalive-failure"
                    value={form.keepAliveFailureCount}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, keepAliveFailureCount: event.target.value }))
                    }
                    placeholder="60"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="openvpn-auth-user">Authentication Username</Label>
                  <Input
                    id="openvpn-auth-user"
                    value={form.authenticationUsername}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, authenticationUsername: event.target.value }))
                    }
                    placeholder="vpn-user"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-auth-pass">Authentication Password</Label>
                  <Input
                    id="openvpn-auth-pass"
                    value={form.authenticationPassword}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, authenticationPassword: event.target.value }))
                    }
                    placeholder="secret"
                    type="password"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Encryption Cipher</Label>
                  <Select
                    value={form.encryptionCipher || "__empty__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, encryptionCipher: value === "__empty__" ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">None</SelectItem>
                      {CIPHER_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hash</Label>
                  <Select
                    value={form.hash || "__empty__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, hash: value === "__empty__" ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">None</SelectItem>
                      {HASH_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>TLS Minimum Version</Label>
                  <Select
                    value={form.tlsVersionMin || "__empty__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, tlsVersionMin: value === "__empty__" ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">Default</SelectItem>
                      {TLS_MIN_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="openvpn-tls-ca">TLS CA Certificate</Label>
                  <Input
                    id="openvpn-tls-ca"
                    value={form.tlsCaCertificate}
                    onChange={(event) => setForm((prev) => ({ ...prev, tlsCaCertificate: event.target.value }))}
                    placeholder="LAB-CA"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-tls-cert">TLS Certificate</Label>
                  <Input
                    id="openvpn-tls-cert"
                    value={form.tlsCertificate}
                    onChange={(event) => setForm((prev) => ({ ...prev, tlsCertificate: event.target.value }))}
                    placeholder="VPN-CERT"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="openvpn-server-subnet">Server Subnet</Label>
                  <Input
                    id="openvpn-server-subnet"
                    value={form.serverSubnet}
                    onChange={(event) => setForm((prev) => ({ ...prev, serverSubnet: event.target.value }))}
                    placeholder="10.70.0.0/24"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Server Topology</Label>
                  <Select
                    value={form.serverTopology || "__empty__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, serverTopology: value === "__empty__" ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">Default</SelectItem>
                      {TOPOLOGY_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-server-max">Server Max Connections</Label>
                  <Input
                    id="openvpn-server-max"
                    value={form.serverMaxConnections}
                    onChange={(event) => setForm((prev) => ({ ...prev, serverMaxConnections: event.target.value }))}
                    placeholder="64"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="openvpn-addresses">Interface Addresses</Label>
                  <Textarea
                    id="openvpn-addresses"
                    value={form.addressesText}
                    onChange={(event) => setForm((prev) => ({ ...prev, addressesText: event.target.value }))}
                    placeholder={"10.10.10.1/24\n2001:db8::1/64"}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-data-ciphers">Encryption Data Ciphers</Label>
                  <Textarea
                    id="openvpn-data-ciphers"
                    value={form.encryptionDataCiphersText}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, encryptionDataCiphersText: event.target.value }))
                    }
                    placeholder={"aes256gcm\naes128gcm"}
                    rows={3}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="openvpn-server-dns">Server Name Servers</Label>
                  <Textarea
                    id="openvpn-server-dns"
                    value={form.serverNameServersText}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, serverNameServersText: event.target.value }))
                    }
                    placeholder={"10.0.0.1\n1.1.1.1"}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-server-routes">Server Push Routes</Label>
                  <Textarea
                    id="openvpn-server-routes"
                    value={form.serverPushRoutesText}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, serverPushRoutesText: event.target.value }))
                    }
                    placeholder={"10.0.0.0/24\n172.16.0.0/16"}
                    rows={3}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="openvpn-mtu">MTU</Label>
                  <Input
                    id="openvpn-mtu"
                    value={form.mtu}
                    onChange={(event) => setForm((prev) => ({ ...prev, mtu: event.target.value }))}
                    placeholder="1500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvpn-vrf">VRF</Label>
                  <Input
                    id="openvpn-vrf"
                    value={form.vrf}
                    onChange={(event) => setForm((prev) => ({ ...prev, vrf: event.target.value }))}
                    placeholder="BLUE"
                  />
                </div>
                <div className="space-y-2">
                  <Label>TLS Role</Label>
                  <Select
                    value={form.tlsRole || "__empty__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, tlsRole: value === "__empty__" ? "" : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">Default</SelectItem>
                      {TLS_ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.disable}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, disable: checked === true }))}
                  />
                  Disable
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.persistentTunnel}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, persistentTunnel: checked === true }))
                    }
                  />
                  Persistent Tunnel
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.replaceDefaultRoute}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, replaceDefaultRoute: checked === true }))
                    }
                  />
                  Replace Default Route
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.useLzoCompression}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, useLzoCompression: checked === true }))
                    }
                  />
                  Use LZO Compression
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.offloadDco}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, offloadDco: checked === true }))}
                  />
                  Offload DCO
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.serverRejectUnconfiguredClient}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({
                        ...prev,
                        serverRejectUnconfiguredClient: checked === true,
                      }))
                    }
                  />
                  Reject Unconfigured Clients
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={saveInterface} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {editingName ? "Save Changes" : "Create Interface"}
                </Button>
                <Button variant="outline" onClick={resetForm} disabled={saving}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
