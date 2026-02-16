"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { ethernetService } from "@/lib/api/ethernet";
import { pageGuides } from "@/lib/help/pageGuides";
import { FeatureGroup } from "@/lib/api/user-management";
import { sessionService } from "@/lib/api/session";
import { useSessionStore } from "@/store/session-store";
import {
  containersService,
  type ContainerBootstrapStatusResponse,
  type ContainerDeviceMapping,
  type ContainerEnvironmentVar,
  type ContainerImageSummary,
  type ContainerImagesResponse,
  type ContainerInspectResponse,
  type ContainerKeyValue,
  type ContainerNetworkAttachment,
  type ContainerRegistrySummary,
  type ContainerInitialSetupRequest,
  type ContainerNetworkSummary,
  type ContainerTmpfsMapping,
  type ContainerWebLink,
  type ContainerPortMapping,
  type ContainerSummary,
  type ContainerUpsertRequest,
  type ContainerVolumeMapping,
  type ContainersOverviewResponse,
} from "@/lib/api/containers";
import type { EthernetInterface } from "@/lib/api/types/ethernet";
import {
  AlertCircle,
  Boxes,
  ClipboardList,
  Database,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Network,
  Square,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { cn, formatInterfaceDisplayName } from "@/lib/utils";

interface ContainerDraft {
  name: string;
  image: string;
  description: string;
  entrypoint: string;
  command: string;
  arguments: string;
  host_name: string;
  restart: "no" | "on-failure" | "always";
  enabled: boolean;
  allow_host_networks: boolean;
  allow_host_pid: boolean;
  network: string;
  network_address: string;
  networks: ContainerNetworkAttachment[];
  name_servers: string[];
  uid: string;
  gid: string;
  cpu_quota: string;
  memory: string;
  capabilities: string[];
  tmpfs: ContainerTmpfsMapping[];
  devices: ContainerDeviceMapping[];
  sysctls: ContainerKeyValue[];
  labels: ContainerKeyValue[];
  health_check_enabled: boolean;
  health_check_command: string;
  health_check_interval: string;
  health_check_timeout: string;
  health_check_retries: string;
  log_driver: "" | "k8s-file" | "journald" | "none";
  environment: ContainerEnvironmentVar[];
  ports: ContainerPortMapping[];
  volumes: ContainerVolumeMapping[];
}

interface ParsedIPv4Cidr {
  ip: string;
  prefix: number;
  ipInt: number;
  networkInt: number;
  broadcastInt: number;
}

interface LanSegmentHint {
  id: string;
  interfaceName: string;
  interfaceDescription: string | null;
  interfaceIp: string;
  subnetCidr: string;
  parsed: ParsedIPv4Cidr;
}

interface ContainerTemplateContext {
  timezone: string;
}

interface ContainerTemplateDefinition {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  lanHint: string;
  buildDraft: (context: ContainerTemplateContext) => ContainerDraft;
}

interface ContainerLinkHostOption {
  id: string;
  label: string;
  host: string;
}

interface ContainerNetworkDraft {
  name: string;
  description: string;
  prefixes: string;
  mtu: string;
  vrf: string;
  dnsDisabled: boolean;
}

interface ContainerRegistryDraft {
  name: string;
  enabled: boolean;
  insecure: boolean;
  username: string;
  password: string;
  mirrorAddress: string;
  mirrorHostName: string;
  mirrorPort: string;
  mirrorPath: string;
}

interface InspectSummaryRow {
  key: string;
  value: string;
}

const EMPTY_DRAFT: ContainerDraft = {
  name: "",
  image: "",
  description: "",
  entrypoint: "",
  command: "",
  arguments: "",
  host_name: "",
  restart: "on-failure",
  enabled: true,
  allow_host_networks: true,
  allow_host_pid: false,
  network: "",
  network_address: "",
  networks: [],
  name_servers: [],
  uid: "",
  gid: "",
  cpu_quota: "",
  memory: "",
  capabilities: [],
  tmpfs: [],
  devices: [],
  sysctls: [],
  labels: [],
  health_check_enabled: false,
  health_check_command: "",
  health_check_interval: "",
  health_check_timeout: "",
  health_check_retries: "",
  log_driver: "",
  environment: [],
  ports: [],
  volumes: [],
};

const EMPTY_NETWORK_DRAFT: ContainerNetworkDraft = {
  name: "",
  description: "",
  prefixes: "172.20.20.0/24",
  mtu: "",
  vrf: "",
  dnsDisabled: false,
};

const EMPTY_REGISTRY_DRAFT: ContainerRegistryDraft = {
  name: "",
  enabled: true,
  insecure: false,
  username: "",
  password: "",
  mirrorAddress: "",
  mirrorHostName: "",
  mirrorPort: "",
  mirrorPath: "",
};

function hasAdvancedRuntimeOverrides(draft: ContainerDraft): boolean {
  return Boolean(draft.entrypoint.trim() || draft.command.trim() || draft.arguments.trim());
}

function hasExtendedAdvancedSettings(draft: ContainerDraft): boolean {
  return Boolean(
    draft.allow_host_pid ||
      draft.name_servers.some((value) => value.trim().length > 0) ||
      draft.uid.trim() ||
      draft.gid.trim() ||
      draft.cpu_quota.trim() ||
      draft.memory.trim() ||
      draft.capabilities.some((value) => value.trim().length > 0) ||
      draft.tmpfs.length > 0 ||
      draft.devices.length > 0 ||
      draft.sysctls.some((pair) => pair.key.trim().length > 0) ||
      draft.labels.some((pair) => pair.key.trim().length > 0) ||
      draft.health_check_enabled ||
      draft.health_check_command.trim() ||
      draft.health_check_interval.trim() ||
      draft.health_check_timeout.trim() ||
      draft.health_check_retries.trim() ||
      draft.log_driver
  );
}

function parseIPv4(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }

  return (
    ((numbers[0] << 24) >>> 0) +
    ((numbers[1] << 16) >>> 0) +
    ((numbers[2] << 8) >>> 0) +
    (numbers[3] >>> 0)
  ) >>> 0;
}

function formatIPv4(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function parseIPv4Cidr(cidr: string): ParsedIPv4Cidr | null {
  const trimmed = cidr.trim();
  const [ip, prefixRaw] = trimmed.split("/");
  if (!ip || !prefixRaw) return null;

  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;

  const ipInt = parseIPv4(ip);
  if (ipInt === null) return null;

  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  const networkInt = (ipInt & mask) >>> 0;
  const broadcastInt = (networkInt | (~mask >>> 0)) >>> 0;

  return { ip, prefix, ipInt, networkInt, broadcastInt };
}

function ipv4NetworksOverlap(left: ParsedIPv4Cidr, right: ParsedIPv4Cidr): boolean {
  return left.networkInt <= right.broadcastInt && right.networkInt <= left.broadcastInt;
}

function parseInspectSummaryRows(rawOutput: string): InspectSummaryRow[] {
  const trimmed = rawOutput.trim();
  if (!trimmed || trimmed === "(no inspect output)") return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>)
        .slice(0, 24)
        .map(([key, value]) => ({
          key,
          value: typeof value === "string" ? value : JSON.stringify(value),
        }));
    }
  } catch {
    // Fall through to lightweight key-value line parsing.
  }

  const rows: InspectSummaryRow[] = [];
  for (const line of rawOutput.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || !value) continue;
    rows.push({ key, value });
    if (rows.length >= 24) break;
  }

  return rows;
}

function isPrivateIPv4(ipInt: number): boolean {
  const first = (ipInt >>> 24) & 255;
  const second = (ipInt >>> 16) & 255;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isIpInSubnet(ip: string, subnet: ParsedIPv4Cidr): boolean {
  const ipInt = parseIPv4(ip);
  if (ipInt === null) return false;

  const mask =
    subnet.prefix === 0 ? 0 : ((0xffffffff << (32 - subnet.prefix)) >>> 0);
  return ((ipInt & mask) >>> 0) === subnet.networkInt;
}

function isUsableHostAddress(ipInt: number, subnet: ParsedIPv4Cidr): boolean {
  if (subnet.prefix >= 31) return true;
  return ipInt > subnet.networkInt && ipInt < subnet.broadcastInt;
}

function getUsableHostRange(subnet: ParsedIPv4Cidr): string {
  if (subnet.prefix >= 31) {
    return `${formatIPv4(subnet.networkInt)} - ${formatIPv4(subnet.broadcastInt)}`;
  }
  return `${formatIPv4(subnet.networkInt + 1)} - ${formatIPv4(subnet.broadcastInt - 1)}`;
}

function detectLanSegments(interfaces: EthernetInterface[]): LanSegmentHint[] {
  const segments: LanSegmentHint[] = [];
  const seen = new Set<string>();

  for (const iface of interfaces) {
    for (const address of iface.addresses) {
      if (!address || address === "dhcp") continue;
      const parsed = parseIPv4Cidr(address);
      if (!parsed || !isPrivateIPv4(parsed.ipInt)) continue;

      const subnetCidr = `${formatIPv4(parsed.networkInt)}/${parsed.prefix}`;
      const key = `${iface.name}:${subnetCidr}`;
      if (seen.has(key)) continue;
      seen.add(key);

      segments.push({
        id: key,
        interfaceName: iface.name,
        interfaceDescription: iface.description ?? null,
        interfaceIp: parsed.ip,
        subnetCidr,
        parsed,
      });
    }
  }

  return segments.sort((left, right) => {
    const iface = left.interfaceName.localeCompare(right.interfaceName);
    if (iface !== 0) return iface;
    return left.subnetCidr.localeCompare(right.subnetCidr);
  });
}

function suggestServiceIp(segment: LanSegmentHint | null): string {
  if (!segment) return "";

  const subnet = segment.parsed;
  if (subnet.prefix >= 31) return "";

  const firstHost = subnet.networkInt + 1;
  const lastHost = subnet.broadcastInt - 1;
  if (firstHost > lastHost) return "";

  let candidate = subnet.networkInt + 10;
  if (candidate < firstHost || candidate > lastHost) {
    candidate = firstHost;
  }

  if (candidate === subnet.ipInt && candidate + 1 <= lastHost) {
    candidate += 1;
  } else if (candidate === subnet.ipInt && candidate - 1 >= firstHost) {
    candidate -= 1;
  }

  if (candidate === subnet.ipInt) return "";
  return formatIPv4(candidate);
}

function detectBrowserTimezone(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timeZone && timeZone.trim() ? timeZone.trim() : "UTC";
  } catch {
    return "UTC";
  }
}

function normalizeDraftToPayload(draft: ContainerDraft): ContainerUpsertRequest {
  const parseOptionalNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return Math.trunc(parsed);
  };

  return {
    image: draft.image.trim(),
    description: draft.description.trim() || null,
    entrypoint: draft.entrypoint.trim() || null,
    command: draft.command.trim() || null,
    arguments: draft.arguments.trim() || null,
    host_name: draft.host_name.trim() || null,
    restart: draft.restart,
    enabled: draft.enabled,
    allow_host_networks: draft.allow_host_networks,
    allow_host_pid: draft.allow_host_pid,
    network: draft.network.trim() || null,
    network_address: draft.network_address.trim() || null,
    networks: draft.networks
      .map((entry) => ({
        name: entry.name.trim(),
        address: entry.address?.trim() || null,
      }))
      .filter((entry) => entry.name.length > 0 || (entry.address ?? "").length > 0),
    name_servers: draft.name_servers.map((server) => server.trim()).filter((server) => server.length > 0),
    uid: parseOptionalNumber(draft.uid),
    gid: parseOptionalNumber(draft.gid),
    cpu_quota: parseOptionalNumber(draft.cpu_quota),
    memory: parseOptionalNumber(draft.memory),
    capabilities: draft.capabilities.map((value) => value.trim()).filter((value) => value.length > 0),
    tmpfs: draft.tmpfs
      .map((entry) => ({
        name: entry.name.trim(),
        destination: entry.destination.trim(),
        size_mb:
          entry.size_mb == null || String(entry.size_mb).trim() === ""
            ? null
            : Number(entry.size_mb),
      }))
      .filter((entry) => entry.name.length > 0 || entry.destination.length > 0),
    devices: draft.devices
      .map((device) => ({
        name: device.name.trim(),
        source: device.source.trim(),
        destination: device.destination.trim(),
      }))
      .filter(
        (device) =>
          device.name.length > 0 || device.source.length > 0 || device.destination.length > 0,
      ),
    sysctls: draft.sysctls
      .map((pair) => ({ key: pair.key.trim(), value: pair.value }))
      .filter((pair) => pair.key.length > 0),
    labels: draft.labels
      .map((pair) => ({ key: pair.key.trim(), value: pair.value }))
      .filter((pair) => pair.key.length > 0),
    health_check_enabled: draft.health_check_enabled,
    health_check_command: draft.health_check_command.trim() || null,
    health_check_interval: draft.health_check_interval.trim() || null,
    health_check_timeout: draft.health_check_timeout.trim() || null,
    health_check_retries: parseOptionalNumber(draft.health_check_retries),
    log_driver: draft.log_driver || null,
    environment: draft.environment
      .map((env) => ({ key: env.key.trim(), value: env.value }))
      .filter((env) => env.key.length > 0),
    ports: draft.ports.map((port) => ({
      name: port.name.trim(),
      source: Number(port.source),
      destination: Number(port.destination),
      protocol: port.protocol,
    })),
    volumes: draft.volumes
      .map((volume) => ({
        name: volume.name.trim(),
        source: volume.source.trim(),
        destination: volume.destination.trim(),
        mode: volume.mode,
      }))
      .filter((volume) => volume.name.length > 0 || volume.source.length > 0 || volume.destination.length > 0),
  };
}

function buildWebUrl(host: string, sourcePort: number, destinationPort: number): string {
  const port = Number(sourcePort);
  const destination = Number(destinationPort);
  const scheme = port === 443 || destination === 443 ? "https" : "http";
  const isDefaultPort =
    (scheme === "http" && port === 80) || (scheme === "https" && port === 443);
  return isDefaultPort ? `${scheme}://${host}` : `${scheme}://${host}:${port}`;
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isEndpointUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /\b404\b/.test(message) ||
    /\b405\b/.test(message) ||
    /not found/i.test(message) ||
    /method not allowed/i.test(message)
  );
}

function toDraft(container: ContainerSummary): ContainerDraft {
  const parsedNetworks = ensureArray<ContainerNetworkAttachment>(container.networks).map((entry) => ({
    name: entry.name ?? "",
    address: entry.address ?? "",
  }));
  const primaryNetwork = parsedNetworks[0];
  const additionalNetworks = primaryNetwork ? parsedNetworks.slice(1) : parsedNetworks;

  return {
    name: container.name,
    image: container.image ?? "",
    description: container.description ?? "",
    entrypoint: container.entrypoint ?? "",
    command: container.command ?? "",
    arguments: container.arguments ?? "",
    host_name: container.host_name ?? "",
    restart: container.restart ?? "on-failure",
    enabled: container.enabled,
    allow_host_networks: container.allow_host_networks,
    allow_host_pid: container.allow_host_pid,
    network: primaryNetwork?.name ?? container.network ?? "",
    network_address: (primaryNetwork?.address as string | undefined) ?? container.network_address ?? "",
    networks: additionalNetworks,
    name_servers: ensureArray<string>(container.name_servers).map((value) => String(value)),
    uid: container.uid != null ? String(container.uid) : "",
    gid: container.gid != null ? String(container.gid) : "",
    cpu_quota: container.cpu_quota != null ? String(container.cpu_quota) : "",
    memory: container.memory != null ? String(container.memory) : "",
    capabilities: ensureArray<string>(container.capabilities).map((value) => String(value)),
    tmpfs: ensureArray<ContainerTmpfsMapping>(container.tmpfs).map((item) => ({ ...item })),
    devices: ensureArray<ContainerDeviceMapping>(container.devices).map((item) => ({ ...item })),
    sysctls: ensureArray<ContainerKeyValue>(container.sysctls).map((item) => ({ ...item })),
    labels: ensureArray<ContainerKeyValue>(container.labels).map((item) => ({ ...item })),
    health_check_enabled: container.health_check_enabled,
    health_check_command: container.health_check_command ?? "",
    health_check_interval: container.health_check_interval ?? "",
    health_check_timeout: container.health_check_timeout ?? "",
    health_check_retries:
      container.health_check_retries != null ? String(container.health_check_retries) : "",
    log_driver: container.log_driver ?? "",
    environment: ensureArray<ContainerEnvironmentVar>(container.environment).map((item) => ({ ...item })),
    ports: ensureArray<ContainerPortMapping>(container.ports).map((item) => ({ ...item })),
    volumes: ensureArray<ContainerVolumeMapping>(container.volumes).map((item) => ({ ...item })),
  };
}

function getValidationError(draft: ContainerDraft): string | null {
  const name = draft.name.trim();
  if (!name) return "Container name is required.";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(name)) {
    return "Container name can include letters, numbers, dot, dash, underscore.";
  }
  if (!draft.image.trim()) return "Container image is required.";

  const envKeys = new Set<string>();
  for (const env of draft.environment) {
    const key = env.key.trim();
    if (!key) continue;
    if (envKeys.has(key)) return `Duplicate environment key: ${key}`;
    envKeys.add(key);
  }

  const portNames = new Set<string>();
  for (const port of draft.ports) {
    const nameText = port.name.trim();
    if (!nameText) return "Every port mapping needs a name.";
    if (portNames.has(nameText)) return `Duplicate port mapping name: ${nameText}`;
    portNames.add(nameText);
    if (!Number.isInteger(Number(port.source)) || Number(port.source) < 1 || Number(port.source) > 65535) {
      return `Invalid source port for ${nameText}.`;
    }
    if (
      !Number.isInteger(Number(port.destination)) ||
      Number(port.destination) < 1 ||
      Number(port.destination) > 65535
    ) {
      return `Invalid destination port for ${nameText}.`;
    }
  }

  const volumeNames = new Set<string>();
  for (const volume of draft.volumes) {
    const nameText = volume.name.trim();
    if (!nameText) return "Every volume mapping needs a name.";
    if (volumeNames.has(nameText)) return `Duplicate volume mapping name: ${nameText}`;
    volumeNames.add(nameText);
    if (!volume.source.trim() || !volume.destination.trim()) {
      return `Volume ${nameText} requires source and destination.`;
    }
  }

  if (draft.allow_host_networks && draft.network.trim()) {
    return "Host networking cannot be combined with custom container network.";
  }
  if (draft.network_address.trim() && !draft.network.trim()) {
    return "Set a network name before setting a network address.";
  }

  const attachedNetworks = [
    ...(draft.network.trim()
      ? [{ name: draft.network.trim(), address: draft.network_address.trim() || "" }]
      : []),
    ...draft.networks.map((entry) => ({
      name: entry.name.trim(),
      address: entry.address?.trim() || "",
    })),
  ].filter((entry) => entry.name || entry.address);

  const networkNames = new Set<string>();
  for (const entry of attachedNetworks) {
    if (!entry.name) return "Every network attachment needs a network name.";
    if (networkNames.has(entry.name)) return `Duplicate network attachment: ${entry.name}`;
    networkNames.add(entry.name);
  }
  if (draft.allow_host_networks && attachedNetworks.length > 0) {
    return "Host networking cannot be combined with container network attachments.";
  }

  const nameServers = new Set<string>();
  for (const nameServer of draft.name_servers) {
    const value = nameServer.trim();
    if (!value) continue;
    if (nameServers.has(value)) return `Duplicate name server: ${value}`;
    nameServers.add(value);
    if (!/^[0-9a-fA-F:.]+$/.test(value)) {
      return `Name server must be an IP address: ${value}`;
    }
  }

  for (const [label, value] of [
    ["UID", draft.uid],
    ["GID", draft.gid],
    ["CPU Quota", draft.cpu_quota],
    ["Memory (MB)", draft.memory],
    ["Health Check Retries", draft.health_check_retries],
  ] as const) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!/^\d+$/.test(trimmed)) return `${label} must be a positive integer.`;
  }

  const capabilities = new Set<string>();
  for (const capability of draft.capabilities) {
    const value = capability.trim();
    if (!value) continue;
    if (capabilities.has(value)) return `Duplicate capability: ${value}`;
    capabilities.add(value);
  }

  const tmpfsNames = new Set<string>();
  for (const entry of draft.tmpfs) {
    const name = entry.name.trim();
    const destination = entry.destination.trim();
    if (!name && !destination) continue;
    if (!name) return "Every tmpfs entry needs a name.";
    if (tmpfsNames.has(name)) return `Duplicate tmpfs name: ${name}`;
    tmpfsNames.add(name);
    if (!destination) return `tmpfs ${name} requires a destination path.`;
    const sizeText = entry.size_mb == null ? "" : String(entry.size_mb).trim();
    if (sizeText && !/^\d+$/.test(sizeText)) return `tmpfs ${name} size must be numeric.`;
  }

  const deviceNames = new Set<string>();
  for (const device of draft.devices) {
    const name = device.name.trim();
    const source = device.source.trim();
    const destination = device.destination.trim();
    if (!name && !source && !destination) continue;
    if (!name) return "Every device mapping needs a name.";
    if (deviceNames.has(name)) return `Duplicate device mapping name: ${name}`;
    deviceNames.add(name);
    if (!source || !destination) return `Device ${name} requires source and destination.`;
  }

  const sysctlKeys = new Set<string>();
  for (const item of draft.sysctls) {
    const key = item.key.trim();
    if (!key) continue;
    if (sysctlKeys.has(key)) return `Duplicate sysctl key: ${key}`;
    sysctlKeys.add(key);
  }

  const labelKeys = new Set<string>();
  for (const item of draft.labels) {
    const key = item.key.trim();
    if (!key) continue;
    if (labelKeys.has(key)) return `Duplicate label key: ${key}`;
    labelKeys.add(key);
  }

  return null;
}

const CONTAINER_TEMPLATES: ContainerTemplateDefinition[] = [
  {
    id: "pihole",
    name: "Pi-hole",
    description: "DNS sinkhole and web UI for ad/tracker blocking.",
    docsUrl: "https://docs.pi-hole.net/docker/",
    lanHint:
      "Use a dedicated LAN IP if clients should query Pi-hole directly on port 53.",
    buildDraft: ({ timezone }) => ({
      ...EMPTY_DRAFT,
      name: "pihole",
      image: "pihole/pihole:latest",
      description: "Pi-hole DNS and ad-blocking service",
      entrypoint: "",
      command: "",
      arguments: "",
      host_name: "pihole",
      restart: "always",
      enabled: true,
      allow_host_networks: false,
      network: "",
      network_address: "",
      environment: [
        { key: "TZ", value: timezone },
        { key: "WEBPASSWORD", value: "changeme" },
        { key: "DNSMASQ_LISTENING", value: "all" },
      ],
      ports: [
        { name: "dns-tcp", source: 53, destination: 53, protocol: "tcp" },
        { name: "dns-udp", source: 53, destination: 53, protocol: "udp" },
        { name: "web", source: 8081, destination: 80, protocol: "tcp" },
      ],
      volumes: [
        {
          name: "etc-pihole",
          source: "/config/containers/pihole/etc-pihole",
          destination: "/etc/pihole",
          mode: "rw",
        },
        {
          name: "etc-dnsmasq",
          source: "/config/containers/pihole/etc-dnsmasq.d",
          destination: "/etc/dnsmasq.d",
          mode: "rw",
        },
      ],
    }),
  },
  {
    id: "adguard-home",
    name: "AdGuard Home",
    description: "DNS filtering and parental-control resolver.",
    docsUrl: "https://github.com/AdguardTeam/AdGuardHome/wiki/Docker",
    lanHint:
      "Like Pi-hole, AdGuard is best with a LAN-facing DNS address and free port 53.",
    buildDraft: ({ timezone }) => ({
      ...EMPTY_DRAFT,
      name: "adguard-home",
      image: "adguard/adguardhome:latest",
      description: "AdGuard Home DNS filtering service",
      entrypoint: "",
      command: "",
      arguments: "",
      host_name: "adguard-home",
      restart: "always",
      enabled: true,
      allow_host_networks: false,
      network: "",
      network_address: "",
      environment: [{ key: "TZ", value: timezone }],
      ports: [
        { name: "dns-tcp", source: 53, destination: 53, protocol: "tcp" },
        { name: "dns-udp", source: 53, destination: 53, protocol: "udp" },
        { name: "setup", source: 3000, destination: 3000, protocol: "tcp" },
      ],
      volumes: [
        {
          name: "adguard-work",
          source: "/config/containers/adguard/work",
          destination: "/opt/adguardhome/work",
          mode: "rw",
        },
        {
          name: "adguard-conf",
          source: "/config/containers/adguard/conf",
          destination: "/opt/adguardhome/conf",
          mode: "rw",
        },
      ],
    }),
  },
  {
    id: "uptime-kuma",
    name: "Uptime Kuma",
    description: "Self-hosted service and endpoint monitoring dashboard.",
    docsUrl: "https://uptime.kuma.pet/",
    lanHint: "Good fit for LAN-only visibility and alerting.",
    buildDraft: () => ({
      ...EMPTY_DRAFT,
      name: "uptime-kuma",
      image: "louislam/uptime-kuma:1",
      description: "Uptime Kuma monitoring dashboard",
      entrypoint: "",
      command: "",
      arguments: "",
      host_name: "uptime-kuma",
      restart: "always",
      enabled: true,
      allow_host_networks: false,
      network: "",
      network_address: "",
      environment: [],
      ports: [{ name: "web", source: 3001, destination: 3001, protocol: "tcp" }],
      volumes: [
        {
          name: "kuma-data",
          source: "/config/containers/uptime-kuma/data",
          destination: "/app/data",
          mode: "rw",
        },
      ],
    }),
  },
  {
    id: "nginx-proxy-manager",
    name: "Nginx Proxy Manager",
    description: "Reverse proxy and Let's Encrypt certificate manager.",
    docsUrl: "https://nginxproxymanager.com/guide/",
    lanHint:
      "Plan WAN/LAN firewall and port-forwarding before exposing this externally.",
    buildDraft: () => ({
      ...EMPTY_DRAFT,
      name: "nginx-proxy-manager",
      image: "jc21/nginx-proxy-manager:latest",
      description: "Nginx Proxy Manager reverse proxy",
      entrypoint: "",
      command: "",
      arguments: "",
      host_name: "nginx-proxy-manager",
      restart: "always",
      enabled: true,
      allow_host_networks: false,
      network: "",
      network_address: "",
      environment: [],
      ports: [
        { name: "http", source: 80, destination: 80, protocol: "tcp" },
        { name: "https", source: 443, destination: 443, protocol: "tcp" },
        { name: "admin", source: 81, destination: 81, protocol: "tcp" },
      ],
      volumes: [
        {
          name: "npm-data",
          source: "/config/containers/npm/data",
          destination: "/data",
          mode: "rw",
        },
        {
          name: "npm-letsencrypt",
          source: "/config/containers/npm/letsencrypt",
          destination: "/etc/letsencrypt",
          mode: "rw",
        },
      ],
    }),
  },
  {
    id: "portainer",
    name: "Portainer CE",
    description: "Container lifecycle management dashboard.",
    docsUrl: "https://docs.portainer.io/start/install-ce/server/docker/linux",
    lanHint:
      "Use this to operate containers after initial bootstrap from VyManager.",
    buildDraft: () => ({
      ...EMPTY_DRAFT,
      name: "portainer",
      image: "portainer/portainer-ce:latest",
      description: "Portainer container management UI",
      entrypoint: "",
      command: "",
      arguments: "",
      host_name: "portainer",
      restart: "always",
      enabled: true,
      allow_host_networks: false,
      network: "",
      network_address: "",
      environment: [],
      ports: [
        { name: "https", source: 9443, destination: 9443, protocol: "tcp" },
        { name: "legacy-http", source: 9000, destination: 9000, protocol: "tcp" },
      ],
      volumes: [
        {
          name: "portainer-data",
          source: "/config/containers/portainer/data",
          destination: "/data",
          mode: "rw",
        },
        {
          name: "podman-socket",
          source: "/run/podman/podman.sock",
          destination: "/var/run/docker.sock",
          mode: "rw",
        },
      ],
    }),
  },
  {
    id: "home-assistant",
    name: "Home Assistant",
    description: "Home automation core service.",
    docsUrl: "https://www.home-assistant.io/installation/linux#install-home-assistant-container",
    lanHint:
      "Host networking is enabled by default for local discovery integrations.",
    buildDraft: ({ timezone }) => ({
      ...EMPTY_DRAFT,
      name: "home-assistant",
      image: "ghcr.io/home-assistant/home-assistant:stable",
      description: "Home Assistant core",
      entrypoint: "",
      command: "",
      arguments: "",
      host_name: "home-assistant",
      restart: "always",
      enabled: true,
      allow_host_networks: true,
      network: "",
      network_address: "",
      environment: [{ key: "TZ", value: timezone }],
      ports: [],
      volumes: [
        {
          name: "ha-config",
          source: "/config/containers/home-assistant/config",
          destination: "/config",
          mode: "rw",
        },
      ],
    }),
  },
];

export default function SystemContainersPage() {
  const { canWrite } = usePermissions();
  const { activeSession, loadSession } = useSessionStore();
  const canEditSystem = canWrite(FeatureGroup.SYSTEM);

  const localTimezone = useMemo(() => detectBrowserTimezone(), []);
  const [bootstrapStatus, setBootstrapStatus] = useState<ContainerBootstrapStatusResponse | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapCreateDefaultNetwork, setBootstrapCreateDefaultNetwork] = useState(true);
  const [bootstrapNetworkName, setBootstrapNetworkName] = useState("containers-lan");
  const [bootstrapNetworkPrefix, setBootstrapNetworkPrefix] = useState("172.20.20.0/24");
  const [bootstrapNetworkDescription, setBootstrapNetworkDescription] = useState("VyManager default container network");
  const [bootstrapNetworkMtu, setBootstrapNetworkMtu] = useState("");
  const [bootstrapNetworkVrf, setBootstrapNetworkVrf] = useState("");
  const [bootstrapDisableNetworkDns, setBootstrapDisableNetworkDns] = useState(false);
  const [editingInstanceHost, setEditingInstanceHost] = useState(false);
  const [instanceHostDraft, setInstanceHostDraft] = useState("");
  const [savingInstanceHost, setSavingInstanceHost] = useState(false);
  const [networksExpanded, setNetworksExpanded] = useState(false);
  const [imagesExpanded, setImagesExpanded] = useState(false);
  const [registriesExpanded, setRegistriesExpanded] = useState(false);
  const [lanHelperExpanded, setLanHelperExpanded] = useState(false);
  const [runtimeOverridesExpanded, setRuntimeOverridesExpanded] = useState(false);
  const [advancedSettingsExpanded, setAdvancedSettingsExpanded] = useState(false);
  const [networkAttachmentsExpanded, setNetworkAttachmentsExpanded] = useState(false);
  const [environmentExpanded, setEnvironmentExpanded] = useState(false);
  const [portMappingsExpanded, setPortMappingsExpanded] = useState(true);
  const [volumeMappingsExpanded, setVolumeMappingsExpanded] = useState(false);

  const [overview, setOverview] = useState<ContainersOverviewResponse | null>(null);
  const [draft, setDraft] = useState<ContainerDraft>({ ...EMPTY_DRAFT });
  const [selectedContainerName, setSelectedContainerName] = useState<string | null>(null);
  const [logsContainerName, setLogsContainerName] = useState<string | null>(null);
  const [logsText, setLogsText] = useState("");
  const [networkDraft, setNetworkDraft] = useState<ContainerNetworkDraft>({ ...EMPTY_NETWORK_DRAFT });
  const [editingNetworkName, setEditingNetworkName] = useState<string | null>(null);
  const [registryDraft, setRegistryDraft] = useState<ContainerRegistryDraft>({ ...EMPTY_REGISTRY_DRAFT });
  const [editingRegistryName, setEditingRegistryName] = useState<string | null>(null);
  const [registries, setRegistries] = useState<ContainerRegistrySummary[]>([]);
  const [imageCatalog, setImageCatalog] = useState<ContainerImagesResponse | null>(null);
  const [imageLifecycleRef, setImageLifecycleRef] = useState("");
  const [imageDeleteTarget, setImageDeleteTarget] = useState("");
  const [imageDeleteForce, setImageDeleteForce] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    CONTAINER_TEMPLATES[0]?.id ?? "pihole"
  );
  const [lanSegments, setLanSegments] = useState<LanSegmentHint[]>([]);
  const [selectedLanSegmentId, setSelectedLanSegmentId] = useState<string>("");
  const [serviceLanIp, setServiceLanIp] = useState("");
  const [loadingLanSegments, setLoadingLanSegments] = useState(false);
  const [lanSegmentsError, setLanSegmentsError] = useState<string | null>(null);
  const [selectedLinkHostId, setSelectedLinkHostId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadingRegistries, setLoadingRegistries] = useState(false);
  const [processingImageAction, setProcessingImageAction] = useState<null | "pull" | "update" | "delete">(null);
  const [savingRegistry, setSavingRegistry] = useState(false);
  const [inspectContainerName, setInspectContainerName] = useState<string | null>(null);
  const [inspectText, setInspectText] = useState("");
  const [loadingInspect, setLoadingInspect] = useState(false);
  const [logsLines, setLogsLines] = useState(400);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const createFormRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTemplate = useMemo(() => {
    return CONTAINER_TEMPLATES.find((template) => template.id === selectedTemplateId) ?? CONTAINER_TEMPLATES[0];
  }, [selectedTemplateId]);

  const selectedContainer = useMemo(() => {
    if (!overview || !selectedContainerName) return null;
    return (
      ensureArray<ContainerSummary>(overview.containers).find(
        (container) => container.name === selectedContainerName
      ) ?? null
    );
  }, [overview, selectedContainerName]);

  const inspectSummaryRows = useMemo(
    () => parseInspectSummaryRows(inspectText),
    [inspectText],
  );

  const selectedLanSegment = useMemo(() => {
    if (!selectedLanSegmentId) return null;
    return lanSegments.find((segment) => segment.id === selectedLanSegmentId) ?? null;
  }, [lanSegments, selectedLanSegmentId]);

  const linkHostOptions = useMemo<ContainerLinkHostOption[]>(() => {
    const options: ContainerLinkHostOption[] = [];
    const instanceHost = overview?.connection_host?.trim();
    if (instanceHost) {
      options.push({
        id: `instance:${instanceHost}`,
        label: `Instance Host (${instanceHost})`,
        host: instanceHost,
      });
    }

    for (const segment of lanSegments) {
      const labelPrefix = formatInterfaceDisplayName(segment.interfaceName, segment.interfaceDescription);
      options.push({
        id: `iface:${segment.interfaceName}:${segment.interfaceIp}`,
        label: `${labelPrefix} - ${segment.interfaceIp} (${segment.subnetCidr})`,
        host: segment.interfaceIp,
      });
    }

    return options;
  }, [lanSegments, overview?.connection_host]);

  const selectedLinkHost = useMemo(() => {
    if (!linkHostOptions.length) return overview?.connection_host?.trim() ?? "";
    const match = linkHostOptions.find((option) => option.id === selectedLinkHostId);
    return match?.host ?? linkHostOptions[0]?.host ?? overview?.connection_host?.trim() ?? "";
  }, [linkHostOptions, overview?.connection_host, selectedLinkHostId]);

  const containerNetworks = useMemo(
    () => ensureArray<ContainerNetworkSummary>(bootstrapStatus?.networks),
    [bootstrapStatus?.networks],
  );
  const displayedInstanceHost = useMemo(
    () => activeSession?.host?.trim() || overview?.connection_host?.trim() || "",
    [activeSession?.host, overview?.connection_host],
  );

  const lanIpValidationIssue = useMemo(() => {
    if (!selectedLanSegment || !serviceLanIp.trim()) return null;

    const ipText = serviceLanIp.trim();
    const ipInt = parseIPv4(ipText);
    if (ipInt === null) return "Service IP must be a valid IPv4 address.";
    if (!isIpInSubnet(ipText, selectedLanSegment.parsed)) {
      return "Service IP must stay inside the selected LAN subnet.";
    }
    if (!isUsableHostAddress(ipInt, selectedLanSegment.parsed)) {
      return "Service IP must be a usable host in the selected LAN subnet.";
    }
    if (ipInt === selectedLanSegment.parsed.ipInt) {
      return "Service IP matches the selected interface address. Pick another host IP.";
    }
    return null;
  }, [selectedLanSegment, serviceLanIp]);

  const loadOverview = useCallback(async (refresh: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await containersService.getOverview(refresh);
      setOverview(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load container data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBootstrapStatus = useCallback(async () => {
    setLoadingBootstrap(true);
    setBootstrapError(null);
    try {
      const status = await containersService.getBootstrapStatus();
      setBootstrapStatus(status);
    } catch (err) {
      setBootstrapStatus(null);
      setBootstrapError(err instanceof Error ? err.message : "Failed to load container automation status.");
    } finally {
      setLoadingBootstrap(false);
    }
  }, []);

  const loadImageCatalog = useCallback(async (refresh: boolean = false) => {
    setLoadingImages(true);
    try {
      const response = await containersService.getImages(refresh);
      setImageCatalog(response);
    } catch (err) {
      setImageCatalog(null);
      if (isEndpointUnavailableError(err)) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load container image catalog.");
    } finally {
      setLoadingImages(false);
    }
  }, []);

  const loadRegistries = useCallback(async (refresh: boolean = false) => {
    setLoadingRegistries(true);
    try {
      const response = await containersService.getRegistries(refresh);
      setRegistries(response);
    } catch (err) {
      setRegistries([]);
      if (isEndpointUnavailableError(err)) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load container registries.");
    } finally {
      setLoadingRegistries(false);
    }
  }, []);

  const loadLanSegments = useCallback(async () => {
    setLoadingLanSegments(true);
    setLanSegmentsError(null);
    try {
      const response = await ethernetService.getConfig();
      const detected = detectLanSegments(response.interfaces ?? []);
      setLanSegments(detected);
      setSelectedLanSegmentId((previous) => {
        if (previous && detected.some((segment) => segment.id === previous)) {
          return previous;
        }
        return detected[0]?.id ?? "";
      });
    } catch (err) {
      setLanSegments([]);
      setSelectedLanSegmentId("");
      setLanSegmentsError(err instanceof Error ? err.message : "Failed to load LAN interface data.");
    } finally {
      setLoadingLanSegments(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrapStatus();
    loadOverview(true);
    loadImageCatalog(true);
    loadRegistries(true);
    loadLanSegments();
    loadSession();
  }, [loadBootstrapStatus, loadImageCatalog, loadLanSegments, loadOverview, loadRegistries, loadSession]);

  useEffect(() => {
    if (!editingInstanceHost) {
      setInstanceHostDraft(displayedInstanceHost);
    }
  }, [displayedInstanceHost, editingInstanceHost]);

  useEffect(() => {
    const instanceHost = overview?.connection_host?.trim();
    if (!instanceHost || linkHostOptions.length === 0) return;

    const storageKey = `vymanager.containers.linkHost:${instanceHost}`;
    setSelectedLinkHostId((previous) => {
      if (previous && linkHostOptions.some((option) => option.id === previous)) {
        return previous;
      }

      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(storageKey);
      } catch {
        stored = null;
      }
      if (stored && linkHostOptions.some((option) => option.id === stored)) {
        return stored;
      }

      // Default to the first detected LAN segment (private static interface),
      // otherwise fall back to the instance host.
      const defaultOption =
        linkHostOptions.find(
          (option) => option.id.startsWith("iface:") && option.host !== instanceHost
        ) ??
        linkHostOptions.find((option) => option.id.startsWith("iface:")) ??
        linkHostOptions[0];
      return defaultOption?.id ?? previous;
    });
  }, [linkHostOptions, overview?.connection_host]);

  useEffect(() => {
    const instanceHost = overview?.connection_host?.trim();
    if (!instanceHost || !selectedLinkHostId) return;
    const storageKey = `vymanager.containers.linkHost:${instanceHost}`;
    try {
      window.localStorage.setItem(storageKey, selectedLinkHostId);
    } catch {
      // Ignore storage failures; selection still works for this session.
    }
  }, [overview?.connection_host, selectedLinkHostId]);

  useEffect(() => {
    if (!selectedLanSegment) {
      setServiceLanIp("");
      return;
    }

    const suggested = suggestServiceIp(selectedLanSegment);
    setServiceLanIp((previous) => {
      const trimmed = previous.trim();
      if (trimmed && isIpInSubnet(trimmed, selectedLanSegment.parsed)) {
        return trimmed;
      }
      return suggested;
    });
  }, [selectedLanSegment]);

  const resetDraft = () => {
    setSelectedContainerName(null);
    setDraft({ ...EMPTY_DRAFT });
    setLanHelperExpanded(false);
    setRuntimeOverridesExpanded(false);
    setAdvancedSettingsExpanded(false);
    setNetworkAttachmentsExpanded(false);
    setEnvironmentExpanded(false);
    setPortMappingsExpanded(true);
    setVolumeMappingsExpanded(false);
    setSuccess(null);
    setError(null);
  };

  const startNewContainer = () => {
    const wasEditing = selectedContainerName !== null;
    resetDraft();
    setSuccess(
      wasEditing
        ? "Switched to create mode. Configure the new container and click Install."
        : "Create form reset. Configure the new container and click Install."
    );
    requestAnimationFrame(() => {
      createFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      nameInputRef.current?.focus();
    });
  };

  const resetNetworkDraft = () => {
    setEditingNetworkName(null);
    setNetworkDraft({ ...EMPTY_NETWORK_DRAFT });
    setError(null);
    setSuccess(null);
  };

  const editNetwork = (network: ContainerNetworkSummary) => {
    setEditingNetworkName(network.name);
    setNetworkDraft({
      name: network.name,
      description: network.description ?? "",
      prefixes: ensureArray<string>(network.prefixes).join(", "),
      mtu: network.mtu != null ? String(network.mtu) : "",
      vrf: network.vrf ?? "",
      dnsDisabled: Boolean(network.dns_disabled),
    });
    setError(null);
    setSuccess(null);
  };

  const editContainer = (container: ContainerSummary) => {
    const nextDraft = toDraft(container);
    setSelectedContainerName(container.name);
    setDraft(nextDraft);
    setRuntimeOverridesExpanded(hasAdvancedRuntimeOverrides(nextDraft));
    setAdvancedSettingsExpanded(hasExtendedAdvancedSettings(nextDraft));
    setNetworkAttachmentsExpanded(nextDraft.networks.length > 0);
    setEnvironmentExpanded(nextDraft.environment.length > 0);
    setPortMappingsExpanded(nextDraft.ports.length > 0);
    setVolumeMappingsExpanded(nextDraft.volumes.length > 0);
    setSuccess(null);
    setError(null);
  };

  const saveNetwork = async () => {
    const networkName = networkDraft.name.trim();
    if (!networkName) {
      setError("Container network name is required.");
      return;
    }

    const prefixes = Array.from(
      new Set(
        networkDraft.prefixes
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    );
    if (prefixes.length === 0) {
      setError("At least one container network prefix is required.");
      return;
    }

    const desiredIpv4Prefixes = prefixes
      .map((prefix) => ({ prefix, parsed: parseIPv4Cidr(prefix) }))
      .filter((entry): entry is { prefix: string; parsed: ParsedIPv4Cidr } => Boolean(entry.parsed));
    const existingIpv4Prefixes = containerNetworks
      .filter((network) => network.name !== networkName)
      .flatMap((network) =>
        ensureArray<string>(network.prefixes)
          .map((prefix) => ({ network: network.name, prefix, parsed: parseIPv4Cidr(prefix) }))
          .filter((entry): entry is { network: string; prefix: string; parsed: ParsedIPv4Cidr } =>
            Boolean(entry.parsed),
          ),
      );

    for (const desired of desiredIpv4Prefixes) {
      for (const existing of existingIpv4Prefixes) {
        if (ipv4NetworksOverlap(desired.parsed, existing.parsed)) {
          setError(
            `Network prefix ${desired.prefix} overlaps with existing network '${existing.network}' prefix ${existing.prefix}.`,
          );
          return;
        }
      }
    }

    const mtuValue = networkDraft.mtu.trim();
    if (mtuValue && !/^\d+$/.test(mtuValue)) {
      setError("MTU must be a numeric value.");
      return;
    }

    setSavingNetwork(true);
    setError(null);
    setSuccess(null);
    try {
      await containersService.upsertNetwork(networkName, {
        description: networkDraft.description.trim() || null,
        prefixes,
        mtu: mtuValue ? Number(mtuValue) : null,
        vrf: networkDraft.vrf.trim() || null,
        dns_disabled: networkDraft.dnsDisabled,
      });
      await loadBootstrapStatus();
      setEditingNetworkName(null);
      setNetworkDraft({ ...EMPTY_NETWORK_DRAFT });
      setSuccess(
        editingNetworkName
          ? `Container network '${networkName}' updated.`
          : `Container network '${networkName}' created.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save container network.");
    } finally {
      setSavingNetwork(false);
    }
  };

  const removeNetwork = async (name: string) => {
    if (!canEditSystem) return;
    if (!window.confirm(`Delete container network '${name}'?`)) return;

    setSavingNetwork(true);
    setError(null);
    setSuccess(null);
    try {
      await containersService.deleteNetwork(name);
      await loadBootstrapStatus();
      if (editingNetworkName === name) {
        resetNetworkDraft();
      }
      setSuccess(`Container network '${name}' deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete container network.");
    } finally {
      setSavingNetwork(false);
    }
  };

  const saveContainer = async (candidateDraft: ContainerDraft = draft) => {
    const validationError = getValidationError(candidateDraft);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const name = candidateDraft.name.trim();
      await containersService.upsertContainer(name, normalizeDraftToPayload(candidateDraft));
      await loadOverview(true);
      setSelectedContainerName(name);
      setDraft(candidateDraft);
      setSuccess(`Container ${name} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save container.");
    } finally {
      setSaving(false);
    }
  };

  const runBootstrapAutomation = async () => {
    if (!canEditSystem) {
      setBootstrapError("You currently have read-only access for System features.");
      return;
    }

    const setupNetwork = bootstrapCreateDefaultNetwork;
    const networkName = bootstrapNetworkName.trim();
    const networkPrefix = bootstrapNetworkPrefix.trim();
    const networkDescription = bootstrapNetworkDescription.trim();
    const networkMtuRaw = bootstrapNetworkMtu.trim();
    const networkVrf = bootstrapNetworkVrf.trim();

    if (setupNetwork && !networkName) {
      setBootstrapError("Container network name is required when default network setup is enabled.");
      return;
    }
    if (setupNetwork && !networkPrefix) {
      setBootstrapError("Container network prefix is required when default network setup is enabled.");
      return;
    }

    let networkMtu: number | null = null;
    if (setupNetwork && networkMtuRaw) {
      if (!/^\d+$/.test(networkMtuRaw)) {
        setBootstrapError("Network MTU must be a numeric value.");
        return;
      }
      networkMtu = Number(networkMtuRaw);
    }

    const payload: ContainerInitialSetupRequest = {
      enable_automation: true,
      create_default_network: setupNetwork,
      network_name: networkName || "containers-lan",
      network_prefix: networkPrefix || "172.20.20.0/24",
      network_description: networkDescription || null,
      network_mtu: networkMtu,
      network_vrf: networkVrf || null,
      disable_network_dns: bootstrapDisableNetworkDns,
    };

    setBootstrapping(true);
    setBootstrapError(null);
    setError(null);
    setSuccess(null);
    try {
      const status = await containersService.bootstrapAutomation(payload);
      setBootstrapStatus(status);
      await loadOverview(true);
      setSuccess(
        setupNetwork
          ? "Container automation is ready. Default container network applied."
          : "Container automation is ready."
      );
    } catch (err) {
      setBootstrapError(err instanceof Error ? err.message : "Failed to enable container automation.");
    } finally {
      setBootstrapping(false);
    }
  };

  const saveInstanceHost = async () => {
    if (!canEditSystem) {
      setError("You currently have read-only access for System features.");
      return;
    }

    const instanceId = activeSession?.instance_id;
    const host = instanceHostDraft.trim();

    if (!instanceId) {
      setError("No active instance is connected.");
      return;
    }
    if (!host) {
      setError("Instance host is required.");
      return;
    }

    setSavingInstanceHost(true);
    setError(null);
    setSuccess(null);
    try {
      await sessionService.updateInstance(instanceId, { host });
      await loadSession();
      await loadOverview(true);
      await loadBootstrapStatus();
      setEditingInstanceHost(false);
      setSuccess(`Instance host updated to ${host}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update instance host.");
    } finally {
      setSavingInstanceHost(false);
    }
  };

  const installContainer = async (candidateDraft: ContainerDraft = draft) => {
    const validationError = getValidationError(candidateDraft);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    if (!canEditSystem) {
      setSuccess(null);
      setError("You currently have read-only access for System features.");
      return;
    }

    setInstalling(true);
    setError(null);
    setSuccess(null);
    try {
      const name = candidateDraft.name.trim();
      const response = await containersService.installContainer(name, normalizeDraftToPayload(candidateDraft));
      await loadOverview(true);
      setSelectedContainerName(name);
      setDraft(toDraft(response.container));

      const createdPaths = response.created_volume_paths.length
        ? ` Created ${response.created_volume_paths.length} host path(s).`
        : "";
      setSuccess(`Container ${name} installed.${createdPaths}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install container.");
    } finally {
      setInstalling(false);
    }
  };

  const applyTemplate = async () => {
    if (!selectedTemplate) return;

    const nextDraft = selectedTemplate.buildDraft({ timezone: localTimezone });
    setSelectedContainerName(null);
    setDraft(nextDraft);
    setRuntimeOverridesExpanded(hasAdvancedRuntimeOverrides(nextDraft));
    setAdvancedSettingsExpanded(hasExtendedAdvancedSettings(nextDraft));
    setNetworkAttachmentsExpanded(nextDraft.networks.length > 0);
    setEnvironmentExpanded(nextDraft.environment.length > 0);
    setPortMappingsExpanded(nextDraft.ports.length > 0);
    setVolumeMappingsExpanded(nextDraft.volumes.length > 0);
    setError(null);
    const helperNote =
      selectedLanSegment && serviceLanIp.trim()
        ? ` LAN helper suggestion: ${serviceLanIp.trim()} on ${selectedLanSegment.subnetCidr}.`
        : "";
    setSuccess(`${selectedTemplate.name} template loaded.${helperNote} Review settings, then click Install.`);
  };

  const applyLanHelperIp = () => {
    const value = serviceLanIp.trim();
    if (!value || lanIpValidationIssue) return;
    setDraft((previous) => ({ ...previous, network_address: value }));
    setError(null);
    setSuccess(`Network address set to ${value}.`);
  };

  const runAction = async (name: string, action: "start" | "stop" | "restart") => {
    setActionTarget(name);
    setError(null);
    setSuccess(null);
    try {
      const response = await containersService.action(name, action);
      await loadOverview(true);
      setSuccess(response.warning ? `${response.message} (${response.warning})` : response.message ?? "Action completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} container.`);
    } finally {
      setActionTarget(null);
    }
  };

  const removeContainer = async (name: string) => {
    const confirmed = window.confirm(`Delete container ${name}?`);
    if (!confirmed) return;

    setActionTarget(name);
    setError(null);
    setSuccess(null);
    try {
      await containersService.deleteContainer(name);
      if (selectedContainerName === name) {
        resetDraft();
      }
      if (logsContainerName === name) {
        setLogsContainerName(null);
        setLogsText("");
      }
      await loadOverview(true);
      setSuccess(`Container ${name} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete container.");
    } finally {
      setActionTarget(null);
    }
  };

  const loadLogs = async (name: string) => {
    setLoadingLogs(true);
    setError(null);
    try {
      const response = await containersService.getLogs(name, logsLines);
      setLogsContainerName(name);
      setLogsText(response.logs || "(no logs)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load container logs.");
    } finally {
      setLoadingLogs(false);
    }
  };

  const updateEnv = (index: number, key: keyof ContainerEnvironmentVar, value: string) => {
    setDraft((previous) => {
      const environment = [...previous.environment];
      environment[index] = { ...environment[index], [key]: value };
      return { ...previous, environment };
    });
  };

  const updatePort = (index: number, key: keyof ContainerPortMapping, value: string | number) => {
    setDraft((previous) => {
      const ports = [...previous.ports];
      if (key === "source" || key === "destination") {
        ports[index] = { ...ports[index], [key]: Number(value) };
      } else {
        ports[index] = {
          ...ports[index],
          [key]: value as ContainerPortMapping[typeof key],
        };
      }
      return { ...previous, ports };
    });
  };

  const updateVolume = (index: number, key: keyof ContainerVolumeMapping, value: string) => {
    setDraft((previous) => {
      const volumes = [...previous.volumes];
      volumes[index] = {
        ...volumes[index],
        [key]: value as ContainerVolumeMapping[typeof key],
      };
      return { ...previous, volumes };
    });
  };

  const updateNameServer = (index: number, value: string) => {
    setDraft((previous) => {
      const nameServers = [...previous.name_servers];
      nameServers[index] = value;
      return { ...previous, name_servers: nameServers };
    });
  };

  const updateCapability = (index: number, value: string) => {
    setDraft((previous) => {
      const capabilities = [...previous.capabilities];
      capabilities[index] = value;
      return { ...previous, capabilities };
    });
  };

  const updateTmpfs = (index: number, key: keyof ContainerTmpfsMapping, value: string) => {
    setDraft((previous) => {
      const tmpfs = [...previous.tmpfs];
      if (key === "size_mb") {
        tmpfs[index] = {
          ...tmpfs[index],
          size_mb: value.trim() ? Number(value) : null,
        };
      } else {
        tmpfs[index] = {
          ...tmpfs[index],
          [key]: value as ContainerTmpfsMapping[typeof key],
        };
      }
      return { ...previous, tmpfs };
    });
  };

  const updateDevice = (index: number, key: keyof ContainerDeviceMapping, value: string) => {
    setDraft((previous) => {
      const devices = [...previous.devices];
      devices[index] = {
        ...devices[index],
        [key]: value as ContainerDeviceMapping[typeof key],
      };
      return { ...previous, devices };
    });
  };

  const updateSysctl = (index: number, key: keyof ContainerKeyValue, value: string) => {
    setDraft((previous) => {
      const sysctls = [...previous.sysctls];
      sysctls[index] = {
        ...sysctls[index],
        [key]: value,
      };
      return { ...previous, sysctls };
    });
  };

  const updateLabel = (index: number, key: keyof ContainerKeyValue, value: string) => {
    setDraft((previous) => {
      const labels = [...previous.labels];
      labels[index] = {
        ...labels[index],
        [key]: value,
      };
      return { ...previous, labels };
    });
  };

  const updateAttachedNetwork = (
    index: number,
    key: keyof ContainerNetworkAttachment,
    value: string,
  ) => {
    setDraft((previous) => {
      const networks = [...previous.networks];
      const current = networks[index] ?? { name: "", address: "" };
      networks[index] = {
        ...current,
        [key]: value,
      };
      return { ...previous, networks };
    });
  };

  const loadInspect = async (name: string) => {
    setLoadingInspect(true);
    setError(null);
    try {
      const response: ContainerInspectResponse = await containersService.inspectContainer(name);
      setInspectContainerName(name);
      setInspectText(response.output || "(no inspect output)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to inspect container.");
    } finally {
      setLoadingInspect(false);
    }
  };

  const runImageAction = async (
    action: "pull" | "update" | "delete",
    targetOverride?: string,
  ) => {
    if (!canEditSystem) {
      setError("You currently have read-only access for System features.");
      return;
    }

    setProcessingImageAction(action);
    setError(null);
    setSuccess(null);
    try {
      if (action === "delete") {
        const target = (targetOverride ?? imageDeleteTarget).trim();
        if (!target) {
          setError("Image delete target is required.");
          return;
        }
        const response = await containersService.deleteImage({
          target,
          force: imageDeleteForce,
        });
        setSuccess(`Image delete requested for ${response.target}.`);
      } else {
        const image = (targetOverride ?? imageLifecycleRef).trim();
        if (!image) {
          setError("Image reference is required.");
          return;
        }
        if (action === "pull") {
          const response = await containersService.pullImage({ image });
          setSuccess(`Image pull requested for ${response.target}.`);
        } else {
          const response = await containersService.updateImage({ image });
          setSuccess(`Image update requested for ${response.target}.`);
        }
      }

      await Promise.all([
        loadImageCatalog(true),
        loadOverview(true),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run image action.");
    } finally {
      setProcessingImageAction(null);
    }
  };

  const editRegistry = (registry: ContainerRegistrySummary) => {
    setEditingRegistryName(registry.name);
    setRegistryDraft({
      name: registry.name,
      enabled: registry.enabled,
      insecure: registry.insecure,
      username: registry.username ?? "",
      password: "",
      mirrorAddress: registry.mirror?.address ?? "",
      mirrorHostName: registry.mirror?.host_name ?? "",
      mirrorPort: registry.mirror?.port != null ? String(registry.mirror.port) : "",
      mirrorPath: registry.mirror?.path ?? "",
    });
  };

  const resetRegistryDraft = () => {
    setEditingRegistryName(null);
    setRegistryDraft({ ...EMPTY_REGISTRY_DRAFT });
  };

  const saveRegistry = async () => {
    if (!canEditSystem) {
      setError("You currently have read-only access for System features.");
      return;
    }

    const name = registryDraft.name.trim();
    if (!name) {
      setError("Registry name is required.");
      return;
    }

    const mirrorPortText = registryDraft.mirrorPort.trim();
    if (mirrorPortText && !/^\d+$/.test(mirrorPortText)) {
      setError("Registry mirror port must be numeric.");
      return;
    }

    setSavingRegistry(true);
    setError(null);
    setSuccess(null);
    try {
      await containersService.upsertRegistry(name, {
        enabled: registryDraft.enabled,
        insecure: registryDraft.insecure,
        username: registryDraft.username.trim() || null,
        password: registryDraft.password.trim() || null,
        mirror:
          registryDraft.mirrorAddress.trim() ||
          registryDraft.mirrorHostName.trim() ||
          registryDraft.mirrorPort.trim() ||
          registryDraft.mirrorPath.trim()
            ? {
                address: registryDraft.mirrorAddress.trim() || null,
                host_name: registryDraft.mirrorHostName.trim() || null,
                port: mirrorPortText ? Number(mirrorPortText) : null,
                path: registryDraft.mirrorPath.trim() || null,
              }
            : null,
      });
      await loadRegistries(true);
      resetRegistryDraft();
      setSuccess(`Registry ${name} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save registry.");
    } finally {
      setSavingRegistry(false);
    }
  };

  const removeRegistry = async (name: string) => {
    if (!canEditSystem) return;
    if (!window.confirm(`Delete container registry '${name}'?`)) return;

    setSavingRegistry(true);
    setError(null);
    setSuccess(null);
    try {
      await containersService.deleteRegistry(name);
      await loadRegistries(true);
      if (editingRegistryName === name) {
        resetRegistryDraft();
      }
      setSuccess(`Registry ${name} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete registry.");
    } finally {
      setSavingRegistry(false);
    }
  };

  const containerAutomationReady = Boolean(
    bootstrapStatus?.ssh_enabled && bootstrapStatus?.ssh_key_installed
  );
  const containers = ensureArray<ContainerSummary>(overview?.containers);

  if (loadingBootstrap) {
    return (
      <AppLayout>
        <div className="p-8 space-y-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="h-8 w-8" />
            Container Management
          </h1>
          <PageGuideDialog guide={pageGuides.containers} />
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading container automation status...
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!containerAutomationReady) {
    return (
      <AppLayout>
        <div className="p-8 space-y-6 max-w-3xl">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Server className="h-8 w-8" />
              Container Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Container installs require one-time setup on the VyOS instance.
            </p>
            <div className="mt-3">
              <PageGuideDialog guide={pageGuides.containers} />
            </div>
            {overview?.connection_host && (
              <p className="text-xs text-muted-foreground mt-1">
                Instance host: <span className="font-mono">{overview.connection_host}</span>
              </p>
            )}
          </div>

          {bootstrapError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{bootstrapError}</span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Setup Required</CardTitle>
              <CardDescription>
                VyOS HTTPS API cannot pull container images. VyManager uses SSH automation for safe, restricted install steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">SSH Service</div>
                  <div className="flex items-center gap-2">
                    <Badge variant={bootstrapStatus?.ssh_enabled ? "default" : "secondary"}>
                      {bootstrapStatus?.ssh_enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">service ssh</span>
                  </div>
                </div>
                <div className="rounded-md border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Automation Key</div>
                  <div className="flex items-center gap-2">
                    <Badge variant={bootstrapStatus?.ssh_key_installed ? "default" : "secondary"}>
                      {bootstrapStatus?.ssh_key_installed ? "Installed" : "Missing"}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {bootstrapStatus?.ssh_key_identifier ?? "vymanager"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="bootstrap-create-network"
                    checked={bootstrapCreateDefaultNetwork}
                    onCheckedChange={(checked) => setBootstrapCreateDefaultNetwork(checked === true)}
                    disabled={!canEditSystem || bootstrapping}
                  />
                  <Label htmlFor="bootstrap-create-network">
                    Create default container network during setup
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Current configured networks: {containerNetworks.length}
                </p>
                {bootstrapCreateDefaultNetwork && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Network Name</Label>
                      <Input
                        value={bootstrapNetworkName}
                        onChange={(event) => setBootstrapNetworkName(event.target.value)}
                        placeholder="containers-lan"
                        disabled={!canEditSystem || bootstrapping}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Prefix (CIDR)</Label>
                      <Input
                        value={bootstrapNetworkPrefix}
                        onChange={(event) => setBootstrapNetworkPrefix(event.target.value)}
                        placeholder="172.20.20.0/24"
                        disabled={!canEditSystem || bootstrapping}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Description</Label>
                      <Input
                        value={bootstrapNetworkDescription}
                        onChange={(event) => setBootstrapNetworkDescription(event.target.value)}
                        placeholder="VyManager default container network"
                        disabled={!canEditSystem || bootstrapping}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>MTU (optional)</Label>
                      <Input
                        value={bootstrapNetworkMtu}
                        onChange={(event) => setBootstrapNetworkMtu(event.target.value)}
                        placeholder="1500"
                        disabled={!canEditSystem || bootstrapping}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>VRF (optional)</Label>
                      <Input
                        value={bootstrapNetworkVrf}
                        onChange={(event) => setBootstrapNetworkVrf(event.target.value)}
                        placeholder="main"
                        disabled={!canEditSystem || bootstrapping}
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-2">
                      <Checkbox
                        id="bootstrap-disable-network-dns"
                        checked={bootstrapDisableNetworkDns}
                        onCheckedChange={(checked) => setBootstrapDisableNetworkDns(checked === true)}
                        disabled={!canEditSystem || bootstrapping}
                      />
                      <Label htmlFor="bootstrap-disable-network-dns">
                        Disable DNS for this container network (`no-name-server`)
                      </Label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={runBootstrapAutomation}
                  disabled={!canEditSystem || bootstrapping}
                >
                  {bootstrapping ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {bootstrapping ? "Applying Setup..." : "Enable Container Automation"}
                </Button>
                <Button variant="outline" onClick={loadBootstrapStatus} disabled={bootstrapping}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Status
                </Button>
              </div>

              {!canEditSystem && (
                <p className="text-xs text-muted-foreground">
                  You currently have read-only access for System features.
                </p>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                <p>This applies:</p>
                <p className="font-mono">set service ssh</p>
                <p className="font-mono">
                  set system login user vyos authentication public-keys vymanager (key)
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Server className="h-8 w-8" />
              Container Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Configure and control VyOS containers, then launch exposed web UIs directly.
            </p>
            {displayedInstanceHost && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Instance host: <span className="font-mono">{displayedInstanceHost}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setEditingInstanceHost((previous) => !previous)}
                  disabled={!canEditSystem || savingInstanceHost}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  {editingInstanceHost ? "Close" : "Edit Host"}
                </Button>
              </div>
            )}
            {editingInstanceHost && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={instanceHostDraft}
                  onChange={(event) => setInstanceHostDraft(event.target.value)}
                  placeholder="192.168.10.242"
                  className="h-8 w-full sm:w-[300px] font-mono text-xs"
                  disabled={savingInstanceHost}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveInstanceHost} disabled={savingInstanceHost || !canEditSystem}>
                    {savingInstanceHost ? "Saving..." : "Save Host"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingInstanceHost(false);
                      setInstanceHostDraft(displayedInstanceHost);
                    }}
                    disabled={savingInstanceHost}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {linkHostOptions.length > 0 && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="text-xs text-muted-foreground">Open links using</span>
                <Select
                  value={selectedLinkHostId}
                  onValueChange={setSelectedLinkHostId}
                  disabled={saving || installing || loadingLanSegments}
                >
                  <SelectTrigger className="h-8 w-full sm:w-[420px]">
                    <SelectValue placeholder="Select a host address" />
                  </SelectTrigger>
                  <SelectContent>
                    {linkHostOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap gap-2">
            <PageGuideDialog guide={pageGuides.containers} />
            <Button
              variant="outline"
              onClick={() => {
                loadOverview(true);
                loadLanSegments();
              }}
              disabled={loading || saving || installing || loadingLanSegments}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={startNewContainer} disabled={saving || installing}>
              <Plus className="h-4 w-4 mr-2" />
              New Container
            </Button>
            </div>
            {selectedContainerName && (
              <p className="text-xs text-muted-foreground">
                Editing <span className="font-medium text-foreground">{selectedContainerName}</span>. Click{" "}
                <span className="font-medium text-foreground">New Container</span> to reset the form and switch to
                create mode.
              </p>
            )}
          </div>
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

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="h-4 w-4" />
                Image Lifecycle
              </CardTitle>
              <CardDescription>
                Pull, update, and delete container images with bootstrap safety checks.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={imagesExpanded ? "default" : "outline"}
              onClick={() => setImagesExpanded((previous) => !previous)}
            >
              {imagesExpanded ? "Collapse" : "Manage Images"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={imageCatalog?.automation_ready ? "default" : "secondary"}>
                {imageCatalog?.automation_ready ? "Automation Ready" : "Automation Required"}
              </Badge>
              <Badge variant={imageCatalog?.ssh_enabled ? "default" : "secondary"}>
                SSH {imageCatalog?.ssh_enabled ? "Enabled" : "Disabled"}
              </Badge>
              <Badge variant={imageCatalog?.ssh_key_installed ? "default" : "secondary"}>
                Key {imageCatalog?.ssh_key_installed ? "Installed" : "Missing"}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadImageCatalog(true)}
                disabled={loadingImages || processingImageAction !== null}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingImages ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            <Collapsible open={imagesExpanded} onOpenChange={setImagesExpanded}>
              <CollapsibleContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Image Reference</Label>
                    <Input
                      value={imageLifecycleRef}
                      onChange={(event) => setImageLifecycleRef(event.target.value)}
                      placeholder="pihole/pihole:latest"
                      disabled={processingImageAction !== null}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => runImageAction("pull")}
                        disabled={!canEditSystem || processingImageAction !== null}
                      >
                        {processingImageAction === "pull" ? "Pulling..." : "Pull Image"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => runImageAction("update")}
                        disabled={!canEditSystem || processingImageAction !== null}
                      >
                        {processingImageAction === "update" ? "Updating..." : "Update Image"}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Delete Target</Label>
                    <Input
                      value={imageDeleteTarget}
                      onChange={(event) => setImageDeleteTarget(event.target.value)}
                      placeholder="image-ref or all"
                      disabled={processingImageAction !== null}
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={imageDeleteForce}
                        onCheckedChange={(checked) => setImageDeleteForce(checked === true)}
                        disabled={processingImageAction !== null}
                      />
                      <Label>Force delete</Label>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => runImageAction("delete")}
                      disabled={!canEditSystem || processingImageAction !== null}
                    >
                      {processingImageAction === "delete" ? "Deleting..." : "Delete Image"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Configured Images</Label>
                    <div className="rounded-md border p-3 min-h-20 space-y-1">
                      {(imageCatalog?.configured_images ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No configured images.</p>
                      ) : (
                        imageCatalog!.configured_images.map((image) => (
                          <div
                            key={`configured-image-${image}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 p-2"
                          >
                            <span className="text-xs font-mono break-all">{image}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => {
                                  setImageLifecycleRef(image);
                                  setImageDeleteTarget(image);
                                }}
                                disabled={processingImageAction !== null}
                              >
                                Use
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => runImageAction("update", image)}
                                disabled={!canEditSystem || processingImageAction !== null}
                              >
                                Update
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => runImageAction("delete", image)}
                                disabled={!canEditSystem || processingImageAction !== null}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Runtime Images</Label>
                    <div className="rounded-md border p-3 min-h-20 space-y-1">
                      {(imageCatalog?.runtime_images ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No runtime images reported.</p>
                      ) : (
                        imageCatalog!.runtime_images.map((image: ContainerImageSummary) => (
                          <div
                            key={`runtime-image-${image.reference}-${image.source}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 p-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono break-all">{image.reference}</span>
                              <Badge variant="outline">{image.source}</Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => {
                                  setImageLifecycleRef(image.reference);
                                  setImageDeleteTarget(image.reference);
                                }}
                                disabled={processingImageAction !== null}
                              >
                                Use
                              </Button>
                              <Button
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => runImageAction("pull", image.reference)}
                                disabled={!canEditSystem || processingImageAction !== null}
                              >
                                Pull
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => runImageAction("update", image.reference)}
                                disabled={!canEditSystem || processingImageAction !== null}
                              >
                                Update
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Container Registries
              </CardTitle>
              <CardDescription>
                Configure registry mirrors, credentials, and trust behavior.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={registriesExpanded ? "default" : "outline"}
              onClick={() => setRegistriesExpanded((previous) => !previous)}
            >
              {registriesExpanded ? "Collapse" : "Manage Registries"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{registries.length} registries</Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadRegistries(true)}
                disabled={loadingRegistries || savingRegistry}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingRegistries ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            <Collapsible open={registriesExpanded} onOpenChange={setRegistriesExpanded}>
              <CollapsibleContent className="space-y-4">
                {registries.length > 0 && (
                  <div className="space-y-2">
                    {registries.map((registry) => (
                      <div key={registry.name} className="rounded-md border p-3 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">{registry.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {registry.username ? `user: ${registry.username}` : "No username configured"}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={registry.enabled ? "default" : "secondary"}>
                              {registry.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                            {registry.insecure && <Badge variant="destructive">Insecure</Badge>}
                            {registry.password_set && <Badge variant="outline">Password Set</Badge>}
                            <Button size="sm" variant="outline" onClick={() => editRegistry(registry)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeRegistry(registry.name)}
                              disabled={!canEditSystem || savingRegistry}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                        {registry.mirror && (
                          <div className="text-xs text-muted-foreground font-mono">
                            mirror: {registry.mirror.address ?? "-"} host:{registry.mirror.host_name ?? "-"} port:
                            {registry.mirror.port ?? "-"} path:{registry.mirror.path ?? "-"}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                      {editingRegistryName ? `Edit Registry: ${editingRegistryName}` : "Create Registry"}
                    </h3>
                    {editingRegistryName && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={resetRegistryDraft}
                        disabled={savingRegistry}
                      >
                        Cancel Edit
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={registryDraft.name}
                        onChange={(event) =>
                          setRegistryDraft((previous) => ({ ...previous, name: event.target.value }))
                        }
                        placeholder="docker.io"
                        disabled={savingRegistry || Boolean(editingRegistryName)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Username (optional)</Label>
                      <Input
                        value={registryDraft.username}
                        onChange={(event) =>
                          setRegistryDraft((previous) => ({ ...previous, username: event.target.value }))
                        }
                        disabled={savingRegistry}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password (optional)</Label>
                      <Input
                        type="password"
                        value={registryDraft.password}
                        onChange={(event) =>
                          setRegistryDraft((previous) => ({ ...previous, password: event.target.value }))
                        }
                        placeholder={editingRegistryName ? "Leave empty to keep existing" : ""}
                        disabled={savingRegistry}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mirror Address (optional)</Label>
                      <Input
                        value={registryDraft.mirrorAddress}
                        onChange={(event) =>
                          setRegistryDraft((previous) => ({ ...previous, mirrorAddress: event.target.value }))
                        }
                        placeholder="192.168.1.1"
                        disabled={savingRegistry}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mirror Host Name (optional)</Label>
                      <Input
                        value={registryDraft.mirrorHostName}
                        onChange={(event) =>
                          setRegistryDraft((previous) => ({ ...previous, mirrorHostName: event.target.value }))
                        }
                        disabled={savingRegistry}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mirror Port (optional)</Label>
                      <Input
                        value={registryDraft.mirrorPort}
                        onChange={(event) =>
                          setRegistryDraft((previous) => ({ ...previous, mirrorPort: event.target.value }))
                        }
                        placeholder="8080"
                        disabled={savingRegistry}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Mirror Path (optional)</Label>
                      <Input
                        value={registryDraft.mirrorPath}
                        onChange={(event) =>
                          setRegistryDraft((previous) => ({ ...previous, mirrorPath: event.target.value }))
                        }
                        placeholder="/mirror"
                        disabled={savingRegistry}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={registryDraft.enabled}
                        onCheckedChange={(checked) =>
                          setRegistryDraft((previous) => ({ ...previous, enabled: checked === true }))
                        }
                        disabled={savingRegistry}
                      />
                      <Label>Enabled</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={registryDraft.insecure}
                        onCheckedChange={(checked) =>
                          setRegistryDraft((previous) => ({ ...previous, insecure: checked === true }))
                        }
                        disabled={savingRegistry}
                      />
                      <Label>Insecure</Label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveRegistry} disabled={!canEditSystem || savingRegistry}>
                      <Save className="h-4 w-4 mr-1" />
                      {savingRegistry ? "Saving..." : "Save Registry"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => loadRegistries(true)}
                      disabled={savingRegistry || loadingRegistries}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Refresh Registries
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                Container Networks
              </CardTitle>
              <CardDescription>
                Configure user-defined container networks for service isolation and static addressing.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={networksExpanded ? "default" : "outline"}
              onClick={() => setNetworksExpanded((previous) => !previous)}
            >
              {networksExpanded ? "Collapse" : "Manage Networks"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {containerNetworks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No container networks configured yet.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{containerNetworks.length} configured</Badge>
                {containerNetworks.slice(0, 3).map((network) => (
                  <Badge key={`summary-${network.name}`} variant="secondary">
                    {network.name}
                  </Badge>
                ))}
                {containerNetworks.length > 3 && (
                  <Badge variant="secondary">+{containerNetworks.length - 3} more</Badge>
                )}
              </div>
            )}
            <Collapsible open={networksExpanded} onOpenChange={setNetworksExpanded}>
              <CollapsibleContent className="space-y-4">
                {containerNetworks.length > 0 && (
                  <div className="space-y-2">
                    {containerNetworks.map((network) => (
                      <div key={network.name} className="rounded-md border p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-medium">{network.name}</div>
                            {network.description && (
                              <div className="text-xs text-muted-foreground">{network.description}</div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {network.dns_disabled && <Badge variant="secondary">DNS Disabled</Badge>}
                            {network.mtu != null && <Badge variant="outline">MTU {network.mtu}</Badge>}
                            {network.vrf && <Badge variant="outline">VRF {network.vrf}</Badge>}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => editNetwork(network)}
                              disabled={savingNetwork || saving || installing}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeNetwork(network.name)}
                              disabled={!canEditSystem || savingNetwork || saving || installing}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {ensureArray<string>(network.prefixes).map((prefix) => (
                            <Badge key={`${network.name}-${prefix}`} variant="secondary" className="font-mono">
                              {prefix}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                      {editingNetworkName ? `Edit Network: ${editingNetworkName}` : "Create Network"}
                    </h3>
                    {editingNetworkName && (
                      <Button size="sm" variant="ghost" onClick={resetNetworkDraft} disabled={savingNetwork}>
                        Cancel Edit
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={networkDraft.name}
                        onChange={(event) =>
                          setNetworkDraft((previous) => ({ ...previous, name: event.target.value }))
                        }
                        placeholder="containers-lan"
                        disabled={savingNetwork || saving || installing || Boolean(editingNetworkName)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Prefixes (comma-separated)</Label>
                      <Input
                        value={networkDraft.prefixes}
                        onChange={(event) =>
                          setNetworkDraft((previous) => ({ ...previous, prefixes: event.target.value }))
                        }
                        placeholder="172.20.20.0/24"
                        disabled={savingNetwork || saving || installing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description (optional)</Label>
                      <Input
                        value={networkDraft.description}
                        onChange={(event) =>
                          setNetworkDraft((previous) => ({ ...previous, description: event.target.value }))
                        }
                        placeholder="Container services network"
                        disabled={savingNetwork || saving || installing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>VRF (optional)</Label>
                      <Input
                        value={networkDraft.vrf}
                        onChange={(event) =>
                          setNetworkDraft((previous) => ({ ...previous, vrf: event.target.value }))
                        }
                        placeholder="main"
                        disabled={savingNetwork || saving || installing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>MTU (optional)</Label>
                      <Input
                        value={networkDraft.mtu}
                        onChange={(event) =>
                          setNetworkDraft((previous) => ({ ...previous, mtu: event.target.value }))
                        }
                        placeholder="1500"
                        disabled={savingNetwork || saving || installing}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-7">
                      <Checkbox
                        checked={networkDraft.dnsDisabled}
                        onCheckedChange={(checked) =>
                          setNetworkDraft((previous) => ({ ...previous, dnsDisabled: checked === true }))
                        }
                        disabled={savingNetwork || saving || installing}
                      />
                      <Label>Disable DNS name server for this network</Label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={saveNetwork}
                      disabled={!canEditSystem || savingNetwork || saving || installing}
                    >
                      <Save className={`h-4 w-4 mr-2 ${savingNetwork ? "animate-pulse" : ""}`} />
                      {savingNetwork ? "Saving..." : editingNetworkName ? "Update Network" : "Create Network"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={loadBootstrapStatus}
                      disabled={savingNetwork || saving || installing}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Networks
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Containers</CardTitle>
              <CardDescription>
                {overview
                  ? `${overview.configured_total} configured, ${overview.active_total ?? 0} active`
                  : "Loading containers..."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading containers...
                </div>
              ) : !overview || containers.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No containers configured yet.
                </div>
              ) : (
                containers.map((container) => {
                  const isSelected = selectedContainerName === container.name;
                  const busy = actionTarget === container.name;
                  const containerPorts = ensureArray<ContainerPortMapping>(container.ports);
                  const containerLinks = ensureArray<ContainerWebLink>(container.links);
                  return (
                    <div
                      key={container.name}
                      className={cn(
                        "rounded-md border p-4 space-y-3",
                        isSelected && "border-primary bg-primary/5"
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{container.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {container.image ?? "(no image)"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{container.status ?? "unknown"}</Badge>
                          <Badge variant={container.enabled ? "default" : "secondary"}>
                            {container.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                          {container.health_status && (
                            <Badge
                              variant={
                                container.health_status === "healthy"
                                  ? "default"
                                  : container.health_status === "unhealthy"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              Health: {container.health_status}
                            </Badge>
                          )}
                          {container.uptime && (
                            <Badge variant="outline">Uptime: {container.uptime}</Badge>
                          )}
                        </div>
                      </div>

                      {container.description && (
                        <p className="text-xs text-muted-foreground">{container.description}</p>
                      )}

                      {containerPorts.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {containerPorts.map((port) => (
                            <Badge key={port.name} variant="secondary" className="text-xs">
                              {`${port.name}: ${port.source}->${port.destination}/${port.protocol}`}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {containerLinks.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {containerLinks.map((link) => (
                            <a
                              key={`${container.name}-${link.label}-${link.url}`}
                              href={
                                selectedLinkHost
                                  ? buildWebUrl(selectedLinkHost, link.source_port, link.destination_port)
                                  : link.url
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => editContainer(container)}>
                          Edit
                        </Button>
                        {container.enabled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runAction(container.name, "stop")}
                            disabled={!canEditSystem || busy || saving}
                          >
                            <Square className="h-3.5 w-3.5 mr-1" />
                            Stop
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runAction(container.name, "start")}
                            disabled={!canEditSystem || busy || saving}
                          >
                            <Play className="h-3.5 w-3.5 mr-1" />
                            Start
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runAction(container.name, "restart")}
                          disabled={!canEditSystem || busy || saving}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Restart
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadLogs(container.name)}
                          disabled={loadingLogs}
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          Logs
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadInspect(container.name)}
                          disabled={loadingInspect}
                        >
                          <ClipboardList className="h-3.5 w-3.5 mr-1" />
                          Inspect
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeContainer(container.name)}
                          disabled={!canEditSystem || busy || saving}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}

              {logsContainerName && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Label>Logs: {logsContainerName}</Label>
                      <Select
                        value={String(logsLines)}
                        onValueChange={(value) => setLogsLines(Number(value))}
                      >
                        <SelectTrigger className="h-7 w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="100">100 lines</SelectItem>
                          <SelectItem value="400">400 lines</SelectItem>
                          <SelectItem value="1000">1000 lines</SelectItem>
                          <SelectItem value="2000">2000 lines</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadLogs(logsContainerName)}
                        disabled={loadingLogs}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingLogs ? "animate-spin" : ""}`} />
                        Refresh
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLogsContainerName(null);
                        setLogsText("");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea value={logsText} readOnly className="min-h-56 font-mono text-xs" />
                </div>
              )}

              {inspectContainerName && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Label>Inspect: {inspectContainerName}</Label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadInspect(inspectContainerName)}
                        disabled={loadingInspect}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingInspect ? "animate-spin" : ""}`} />
                        Refresh
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setInspectContainerName(null);
                        setInspectText("");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {inspectSummaryRows.length > 0 && (
                    <div className="mb-2 rounded-md border p-3">
                      <div className="mb-2 text-xs font-medium text-muted-foreground">
                        Parsed Inspect Fields
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {inspectSummaryRows.map((row) => (
                          <div key={`inspect-summary-${row.key}`} className="space-y-0.5">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              {row.key}
                            </div>
                            <div className="text-xs break-all">{row.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <Textarea value={inspectText} readOnly className="min-h-56 font-mono text-xs" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card ref={createFormRef}>
            <CardHeader>
              <CardTitle>{selectedContainer ? `Edit: ${selectedContainer.name}` : "Create Container"}</CardTitle>
              <CardDescription>
                Define image, networking, ports, environment, and volumes for this container.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-md border bg-muted/20 p-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label>Template Catalog</Label>
                    <Select
                      value={selectedTemplateId}
                      onValueChange={setSelectedTemplateId}
                      disabled={saving || installing}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTAINER_TEMPLATES.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={applyTemplate} disabled={saving || installing}>
                    <WandSparkles className="h-4 w-4 mr-2" />
                    Load Template
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Loads template values into the form only. Review and click Install when ready.
                </p>

                {selectedTemplate && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>{selectedTemplate.description}</p>
                    <p>{selectedTemplate.lanHint}</p>
                    <a
                      href={selectedTemplate.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Template documentation
                    </a>
                  </div>
                )}
              </div>

              <div className="rounded-md border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-semibold">LAN Planning Helper</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional helper for planning static service IPs on LAN segments.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{lanSegments.length} segments</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setLanHelperExpanded((previous) => !previous)}
                    >
                      {lanHelperExpanded ? "Collapse" : "Open Helper"}
                    </Button>
                  </div>
                </div>
                <Collapsible open={lanHelperExpanded} onOpenChange={setLanHelperExpanded}>
                  <CollapsibleContent className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <p className="text-xs text-muted-foreground">
                        Pick a LAN subnet to validate service IP planning and copy a network address.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={loadLanSegments}
                        disabled={saving || loadingLanSegments}
                      >
                        <RefreshCw
                          className={`h-4 w-4 mr-2 ${loadingLanSegments ? "animate-spin" : ""}`}
                        />
                        Rescan LAN
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Detected LAN Segment</Label>
                        <Select
                          value={selectedLanSegmentId || "none"}
                          onValueChange={(value) => setSelectedLanSegmentId(value === "none" ? "" : value)}
                          disabled={saving || loadingLanSegments}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a segment" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {lanSegments.map((segment) => (
                              <SelectItem key={segment.id} value={segment.id}>
                                {formatInterfaceDisplayName(
                                  segment.interfaceName,
                                  segment.interfaceDescription,
                                )}{" "}
                                - {segment.subnetCidr}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Service IP Suggestion</Label>
                        <Input
                          value={serviceLanIp}
                          onChange={(event) => setServiceLanIp(event.target.value)}
                          placeholder="192.168.1.10"
                          disabled={saving || !selectedLanSegment}
                        />
                      </div>
                    </div>

                    {selectedLanSegment ? (
                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">
                          Interface address:{" "}
                          <span className="font-mono">{selectedLanSegment.interfaceIp}</span> on{" "}
                          <span className="font-mono">{selectedLanSegment.subnetCidr}</span>
                        </p>
                        <p className="text-muted-foreground">
                          Usable host range:{" "}
                          <span className="font-mono">{getUsableHostRange(selectedLanSegment.parsed)}</span>
                        </p>
                        {selectedLanSegment.interfaceDescription && (
                          <p className="text-muted-foreground">{selectedLanSegment.interfaceDescription}</p>
                        )}
                        {serviceLanIp.trim() && (
                          <p className={lanIpValidationIssue ? "text-destructive" : "text-green-700"}>
                            {lanIpValidationIssue ?? "Service IP is valid for this LAN segment."}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No private static LAN subnet selected. You can still configure containers manually.
                      </p>
                    )}

                    {lanSegmentsError && (
                      <p className="text-xs text-destructive">{lanSegmentsError}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={applyLanHelperIp}
                        disabled={
                          saving ||
                          !draft.network.trim() ||
                          !serviceLanIp.trim() ||
                          Boolean(lanIpValidationIssue)
                        }
                      >
                        Use Service IP as Network Address
                      </Button>
                      {!draft.network.trim() && (
                        <span className="text-xs text-muted-foreground">
                          Set Network Name first to use Network Address.
                        </span>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    ref={nameInputRef}
                    value={draft.name}
                    onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
                    placeholder="pihole"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Image</Label>
                  <Input
                    value={draft.image}
                    onChange={(event) => setDraft((previous) => ({ ...previous, image: event.target.value }))}
                    placeholder="pihole/pihole:latest"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Restart Policy</Label>
                  <Select
                    value={draft.restart}
                    onValueChange={(value: "no" | "on-failure" | "always") =>
                      setDraft((previous) => ({ ...previous, restart: value }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">no</SelectItem>
                      <SelectItem value="on-failure">on-failure</SelectItem>
                      <SelectItem value="always">always</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hostname (optional)</Label>
                  <Input
                    value={draft.host_name}
                    onChange={(event) =>
                      setDraft((previous) => ({ ...previous, host_name: event.target.value }))
                    }
                    placeholder="pihole"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  value={draft.description}
                  onChange={(event) => setDraft((previous) => ({ ...previous, description: event.target.value }))}
                  disabled={saving}
                />
              </div>

              <div className="rounded-md border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-semibold">Runtime Overrides</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional advanced overrides for entrypoint, command, and arguments.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRuntimeOverridesExpanded((previous) => !previous)}
                  >
                    {runtimeOverridesExpanded ? "Collapse" : "Edit"}
                  </Button>
                </div>
                <Collapsible open={runtimeOverridesExpanded} onOpenChange={setRuntimeOverridesExpanded}>
                  <CollapsibleContent className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Entrypoint (optional)</Label>
                      <Input
                        value={draft.entrypoint}
                        onChange={(event) =>
                          setDraft((previous) => ({ ...previous, entrypoint: event.target.value }))
                        }
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Command (optional)</Label>
                      <Input
                        value={draft.command}
                        onChange={(event) =>
                          setDraft((previous) => ({ ...previous, command: event.target.value }))
                        }
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Arguments (optional)</Label>
                      <Input
                        value={draft.arguments}
                        onChange={(event) =>
                          setDraft((previous) => ({ ...previous, arguments: event.target.value }))
                        }
                        disabled={saving}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Network Name (optional)</Label>
                  <Input
                    value={draft.network}
                    onChange={(event) => setDraft((previous) => ({ ...previous, network: event.target.value }))}
                    placeholder="trusted-net"
                    disabled={saving}
                  />
                  {containerNetworks.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {containerNetworks.map((network) => (
                        <Button
                          key={`network-suggest-${network.name}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          onClick={() => setDraft((previous) => ({ ...previous, network: network.name }))}
                          disabled={saving}
                        >
                          {network.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Network Address (optional)</Label>
                  <Input
                    value={draft.network_address}
                    onChange={(event) =>
                      setDraft((previous) => ({ ...previous, network_address: event.target.value }))
                    }
                    placeholder="192.168.100.50"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={draft.enabled}
                    onCheckedChange={(checked) =>
                      setDraft((previous) => ({ ...previous, enabled: checked === true }))
                    }
                    disabled={saving}
                  />
                  <Label>Enabled</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={draft.allow_host_networks}
                    onCheckedChange={(checked) =>
                      setDraft((previous) => ({ ...previous, allow_host_networks: checked === true }))
                    }
                    disabled={saving}
                  />
                  <Label>Allow Host Networks</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={draft.allow_host_pid}
                    onCheckedChange={(checked) =>
                      setDraft((previous) => ({ ...previous, allow_host_pid: checked === true }))
                    }
                    disabled={saving}
                  />
                  <Label>Allow Host PID</Label>
                </div>
              </div>

              <div className="rounded-md border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-semibold">Advanced Runtime and Security</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional container limits, identity, capabilities, health checks, and metadata.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAdvancedSettingsExpanded((previous) => !previous)}
                  >
                    {advancedSettingsExpanded ? "Collapse" : "Edit"}
                  </Button>
                </div>
                <Collapsible open={advancedSettingsExpanded} onOpenChange={setAdvancedSettingsExpanded}>
                  <CollapsibleContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>UID (optional)</Label>
                        <Input
                          type="number"
                          value={draft.uid}
                          onChange={(event) =>
                            setDraft((previous) => ({ ...previous, uid: event.target.value }))
                          }
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>GID (optional)</Label>
                        <Input
                          type="number"
                          value={draft.gid}
                          onChange={(event) =>
                            setDraft((previous) => ({ ...previous, gid: event.target.value }))
                          }
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>CPU Quota (optional)</Label>
                        <Input
                          type="number"
                          value={draft.cpu_quota}
                          onChange={(event) =>
                            setDraft((previous) => ({ ...previous, cpu_quota: event.target.value }))
                          }
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Memory MB (optional)</Label>
                        <Input
                          type="number"
                          value={draft.memory}
                          onChange={(event) =>
                            setDraft((previous) => ({ ...previous, memory: event.target.value }))
                          }
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Log Driver (optional)</Label>
                        <Select
                          value={draft.log_driver || "none-selected"}
                          onValueChange={(value) =>
                            setDraft((previous) => ({
                              ...previous,
                              log_driver: value === "none-selected" ? "" : (value as ContainerDraft["log_driver"]),
                            }))
                          }
                          disabled={saving}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none-selected">Not set</SelectItem>
                            <SelectItem value="k8s-file">k8s-file</SelectItem>
                            <SelectItem value="journald">journald</SelectItem>
                            <SelectItem value="none">none</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Container Name Servers</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDraft((previous) => ({
                              ...previous,
                              name_servers: [...previous.name_servers, ""],
                            }))
                          }
                          disabled={saving}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                      </div>
                      {draft.name_servers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No container-specific DNS servers.</p>
                      ) : (
                        <div className="space-y-2">
                          {draft.name_servers.map((server, index) => (
                            <div key={`nameserver-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto]">
                              <Input
                                placeholder="1.1.1.1"
                                value={server}
                                onChange={(event) => updateNameServer(index, event.target.value)}
                                disabled={saving}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDraft((previous) => ({
                                    ...previous,
                                    name_servers: previous.name_servers.filter((_, i) => i !== index),
                                  }))
                                }
                                disabled={saving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Capabilities</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDraft((previous) => ({
                              ...previous,
                              capabilities: [...previous.capabilities, ""],
                            }))
                          }
                          disabled={saving}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                      </div>
                      {draft.capabilities.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No extra capabilities configured.</p>
                      ) : (
                        <div className="space-y-2">
                          {draft.capabilities.map((capability, index) => (
                            <div key={`capability-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto]">
                              <Input
                                placeholder="NET_ADMIN"
                                value={capability}
                                onChange={(event) => updateCapability(index, event.target.value)}
                                disabled={saving}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDraft((previous) => ({
                                    ...previous,
                                    capabilities: previous.capabilities.filter((_, i) => i !== index),
                                  }))
                                }
                                disabled={saving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Tmpfs Mounts</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDraft((previous) => ({
                              ...previous,
                              tmpfs: [...previous.tmpfs, { name: "", destination: "", size_mb: null }],
                            }))
                          }
                          disabled={saving}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                      </div>
                      {draft.tmpfs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tmpfs mounts configured.</p>
                      ) : (
                        <div className="space-y-2">
                          {draft.tmpfs.map((entry, index) => (
                            <div
                              key={`tmpfs-${index}`}
                              className="grid gap-2 md:grid-cols-[1fr_1fr_140px_auto]"
                            >
                              <Input
                                placeholder="cache"
                                value={entry.name}
                                onChange={(event) => updateTmpfs(index, "name", event.target.value)}
                                disabled={saving}
                              />
                              <Input
                                placeholder="/tmp/cache"
                                value={entry.destination}
                                onChange={(event) => updateTmpfs(index, "destination", event.target.value)}
                                disabled={saving}
                              />
                              <Input
                                type="number"
                                placeholder="64"
                                value={entry.size_mb == null ? "" : String(entry.size_mb)}
                                onChange={(event) => updateTmpfs(index, "size_mb", event.target.value)}
                                disabled={saving}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDraft((previous) => ({
                                    ...previous,
                                    tmpfs: previous.tmpfs.filter((_, i) => i !== index),
                                  }))
                                }
                                disabled={saving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Device Mappings</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDraft((previous) => ({
                              ...previous,
                              devices: [...previous.devices, { name: "", source: "", destination: "" }],
                            }))
                          }
                          disabled={saving}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                      </div>
                      {draft.devices.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No devices configured.</p>
                      ) : (
                        <div className="space-y-2">
                          {draft.devices.map((device, index) => (
                            <div
                              key={`device-${index}`}
                              className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"
                            >
                              <Input
                                placeholder="tun"
                                value={device.name}
                                onChange={(event) => updateDevice(index, "name", event.target.value)}
                                disabled={saving}
                              />
                              <Input
                                placeholder="/dev/net/tun"
                                value={device.source}
                                onChange={(event) => updateDevice(index, "source", event.target.value)}
                                disabled={saving}
                              />
                              <Input
                                placeholder="/dev/net/tun"
                                value={device.destination}
                                onChange={(event) => updateDevice(index, "destination", event.target.value)}
                                disabled={saving}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDraft((previous) => ({
                                    ...previous,
                                    devices: previous.devices.filter((_, i) => i !== index),
                                  }))
                                }
                                disabled={saving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Sysctl Parameters</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDraft((previous) => ({
                              ...previous,
                              sysctls: [...previous.sysctls, { key: "", value: "" }],
                            }))
                          }
                          disabled={saving}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                      </div>
                      {draft.sysctls.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No sysctl parameters configured.</p>
                      ) : (
                        <div className="space-y-2">
                          {draft.sysctls.map((pair, index) => (
                            <div key={`sysctl-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                              <Input
                                placeholder="net.ipv4.ip_forward"
                                value={pair.key}
                                onChange={(event) => updateSysctl(index, "key", event.target.value)}
                                disabled={saving}
                              />
                              <Input
                                placeholder="1"
                                value={pair.value}
                                onChange={(event) => updateSysctl(index, "value", event.target.value)}
                                disabled={saving}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDraft((previous) => ({
                                    ...previous,
                                    sysctls: previous.sysctls.filter((_, i) => i !== index),
                                  }))
                                }
                                disabled={saving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Container Labels</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDraft((previous) => ({
                              ...previous,
                              labels: [...previous.labels, { key: "", value: "" }],
                            }))
                          }
                          disabled={saving}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                      </div>
                      {draft.labels.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No labels configured.</p>
                      ) : (
                        <div className="space-y-2">
                          {draft.labels.map((pair, index) => (
                            <div key={`label-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                              <Input
                                placeholder="com.example.role"
                                value={pair.key}
                                onChange={(event) => updateLabel(index, "key", event.target.value)}
                                disabled={saving}
                              />
                              <Input
                                placeholder="dns"
                                value={pair.value}
                                onChange={(event) => updateLabel(index, "value", event.target.value)}
                                disabled={saving}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDraft((previous) => ({
                                    ...previous,
                                    labels: previous.labels.filter((_, i) => i !== index),
                                  }))
                                }
                                disabled={saving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={draft.health_check_enabled}
                          onCheckedChange={(checked) =>
                            setDraft((previous) => ({
                              ...previous,
                              health_check_enabled: checked === true,
                            }))
                          }
                          disabled={saving}
                        />
                        <Label>Enable Health Check</Label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <Label>Command (optional)</Label>
                          <Input
                            value={draft.health_check_command}
                            onChange={(event) =>
                              setDraft((previous) => ({
                                ...previous,
                                health_check_command: event.target.value,
                              }))
                            }
                            placeholder="/usr/bin/check-health.sh"
                            disabled={saving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Interval (optional)</Label>
                          <Input
                            value={draft.health_check_interval}
                            onChange={(event) =>
                              setDraft((previous) => ({
                                ...previous,
                                health_check_interval: event.target.value,
                              }))
                            }
                            placeholder="30s"
                            disabled={saving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Timeout (optional)</Label>
                          <Input
                            value={draft.health_check_timeout}
                            onChange={(event) =>
                              setDraft((previous) => ({
                                ...previous,
                                health_check_timeout: event.target.value,
                              }))
                            }
                            placeholder="10s"
                            disabled={saving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Retries (optional)</Label>
                          <Input
                            type="number"
                            value={draft.health_check_retries}
                            onChange={(event) =>
                              setDraft((previous) => ({
                                ...previous,
                                health_check_retries: event.target.value,
                              }))
                            }
                            placeholder="3"
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="rounded-md border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-semibold">Environment Variables</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Optional advanced settings.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{draft.environment.length}</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEnvironmentExpanded((previous) => !previous)}
                    >
                      {environmentExpanded ? "Collapse" : "Edit"}
                    </Button>
                  </div>
                </div>
                <Collapsible open={environmentExpanded} onOpenChange={setEnvironmentExpanded}>
                  <CollapsibleContent className="space-y-3">
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDraft((previous) => ({
                            ...previous,
                            environment: [...previous.environment, { key: "", value: "" }],
                          }))
                        }
                        disabled={saving}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Variable
                      </Button>
                    </div>
                    {draft.environment.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No environment variables configured.</p>
                    ) : (
                      <div className="space-y-2">
                        {draft.environment.map((env, index) => (
                          <div key={`env-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                            <Input
                              placeholder="KEY"
                              value={env.key}
                              onChange={(event) => updateEnv(index, "key", event.target.value)}
                              disabled={saving}
                            />
                            <Input
                              placeholder="value"
                              value={env.value}
                              onChange={(event) => updateEnv(index, "value", event.target.value)}
                              disabled={saving}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDraft((previous) => ({
                                  ...previous,
                                  environment: previous.environment.filter((_, i) => i !== index),
                                }))
                              }
                              disabled={saving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="rounded-md border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-semibold">Port Mappings</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Publish container services to the host.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{draft.ports.length}</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPortMappingsExpanded((previous) => !previous)}
                    >
                      {portMappingsExpanded ? "Collapse" : "Edit"}
                    </Button>
                  </div>
                </div>
                <Collapsible open={portMappingsExpanded} onOpenChange={setPortMappingsExpanded}>
                  <CollapsibleContent className="space-y-3">
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDraft((previous) => ({
                            ...previous,
                            ports: [
                              ...previous.ports,
                              { name: "", source: 8080, destination: 80, protocol: "tcp" },
                            ],
                          }))
                        }
                        disabled={saving}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Mapping
                      </Button>
                    </div>
                    {draft.ports.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No published ports configured.</p>
                    ) : (
                      <div className="space-y-2">
                        {draft.ports.map((port, index) => (
                          <div
                            key={`port-${index}`}
                            className="grid gap-2 md:grid-cols-[1fr_120px_120px_120px_auto]"
                          >
                            <Input
                              placeholder="name"
                              value={port.name}
                              onChange={(event) => updatePort(index, "name", event.target.value)}
                              disabled={saving}
                            />
                            <Input
                              type="number"
                              value={String(port.source)}
                              onChange={(event) => updatePort(index, "source", Number(event.target.value))}
                              disabled={saving}
                            />
                            <Input
                              type="number"
                              value={String(port.destination)}
                              onChange={(event) => updatePort(index, "destination", Number(event.target.value))}
                              disabled={saving}
                            />
                            <Select
                              value={port.protocol}
                              onValueChange={(value: "tcp" | "udp") => updatePort(index, "protocol", value)}
                              disabled={saving}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="tcp">tcp</SelectItem>
                                <SelectItem value="udp">udp</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDraft((previous) => ({
                                  ...previous,
                                  ports: previous.ports.filter((_, i) => i !== index),
                                }))
                              }
                              disabled={saving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="rounded-md border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-semibold">Volume Mappings</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Optional persistent host paths.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{draft.volumes.length}</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setVolumeMappingsExpanded((previous) => !previous)}
                    >
                      {volumeMappingsExpanded ? "Collapse" : "Edit"}
                    </Button>
                  </div>
                </div>
                <Collapsible open={volumeMappingsExpanded} onOpenChange={setVolumeMappingsExpanded}>
                  <CollapsibleContent className="space-y-3">
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDraft((previous) => ({
                            ...previous,
                            volumes: [
                              ...previous.volumes,
                              { name: "", source: "", destination: "", mode: "rw" },
                            ],
                          }))
                        }
                        disabled={saving}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Mapping
                      </Button>
                    </div>
                    {draft.volumes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No volume mappings configured.</p>
                    ) : (
                      <div className="space-y-2">
                        {draft.volumes.map((volume, index) => (
                          <div
                            key={`volume-${index}`}
                            className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_120px_auto]"
                          >
                            <Input
                              placeholder="name"
                              value={volume.name}
                              onChange={(event) => updateVolume(index, "name", event.target.value)}
                              disabled={saving}
                            />
                            <Input
                              placeholder="/config/..."
                              value={volume.source}
                              onChange={(event) => updateVolume(index, "source", event.target.value)}
                              disabled={saving}
                            />
                            <Input
                              placeholder="/container/path"
                              value={volume.destination}
                              onChange={(event) => updateVolume(index, "destination", event.target.value)}
                              disabled={saving}
                            />
                            <Select
                              value={volume.mode}
                              onValueChange={(value: "rw" | "ro") => updateVolume(index, "mode", value)}
                              disabled={saving}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="rw">rw</SelectItem>
                                <SelectItem value="ro">ro</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDraft((previous) => ({
                                  ...previous,
                                  volumes: previous.volumes.filter((_, i) => i !== index),
                                }))
                              }
                              disabled={saving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {!canEditSystem && (
                <p className="text-xs text-muted-foreground">
                  You currently have read-only access for System features.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => installContainer()} disabled={!canEditSystem || saving || installing}>
                  {installing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {installing ? "Installing..." : "Install Container"}
                </Button>
                <Button variant="outline" onClick={() => saveContainer()} disabled={!canEditSystem || saving || installing}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Saving..." : "Save Container"}
                </Button>
                <Button variant="outline" onClick={resetDraft} disabled={saving || installing}>
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
