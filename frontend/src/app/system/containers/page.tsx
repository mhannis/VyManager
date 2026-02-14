"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { FeatureGroup } from "@/lib/api/user-management";
import {
  containersService,
  type ContainerBootstrapStatusResponse,
  type ContainerEnvironmentVar,
  type ContainerPortMapping,
  type ContainerSummary,
  type ContainerUpsertRequest,
  type ContainerVolumeMapping,
  type ContainersOverviewResponse,
} from "@/lib/api/containers";
import type { EthernetInterface } from "@/lib/api/types/ethernet";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Square,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  network: string;
  network_address: string;
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
  network: "",
  network_address: "",
  environment: [],
  ports: [],
  volumes: [],
};

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
    network: draft.network.trim() || null,
    network_address: draft.network_address.trim() || null,
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

function toDraft(container: ContainerSummary): ContainerDraft {
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
    network: container.network ?? "",
    network_address: container.network_address ?? "",
    environment: container.environment.map((item) => ({ ...item })),
    ports: container.ports.map((item) => ({ ...item })),
    volumes: container.volumes.map((item) => ({ ...item })),
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
  const canEditSystem = canWrite(FeatureGroup.SYSTEM);

  const localTimezone = useMemo(() => detectBrowserTimezone(), []);
  const [bootstrapStatus, setBootstrapStatus] = useState<ContainerBootstrapStatusResponse | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [overview, setOverview] = useState<ContainersOverviewResponse | null>(null);
  const [draft, setDraft] = useState<ContainerDraft>({ ...EMPTY_DRAFT });
  const [selectedContainerName, setSelectedContainerName] = useState<string | null>(null);
  const [logsContainerName, setLogsContainerName] = useState<string | null>(null);
  const [logsText, setLogsText] = useState("");
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
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedTemplate = useMemo(() => {
    return CONTAINER_TEMPLATES.find((template) => template.id === selectedTemplateId) ?? CONTAINER_TEMPLATES[0];
  }, [selectedTemplateId]);

  const selectedContainer = useMemo(() => {
    if (!overview || !selectedContainerName) return null;
    return overview.containers.find((container) => container.name === selectedContainerName) ?? null;
  }, [overview, selectedContainerName]);

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
      const description = segment.interfaceDescription?.trim();
      const labelPrefix = description ? `${description} (${segment.interfaceName})` : segment.interfaceName;
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
    loadLanSegments();
  }, [loadBootstrapStatus, loadLanSegments, loadOverview]);

  useEffect(() => {
    const instanceHost = overview?.connection_host?.trim();
    if (!instanceHost || linkHostOptions.length === 0) return;

    const storageKey = `vymanager.containers.linkHost:${instanceHost}`;
    setSelectedLinkHostId((previous) => {
      if (previous && linkHostOptions.some((option) => option.id === previous)) {
        return previous;
      }

      const stored = window.localStorage.getItem(storageKey);
      if (stored && linkHostOptions.some((option) => option.id === stored)) {
        return stored;
      }

      // Default to the first detected LAN segment (private static interface),
      // otherwise fall back to the instance host.
      const defaultOption =
        linkHostOptions.find((option) => option.id.startsWith("iface:")) ??
        linkHostOptions[0];
      return defaultOption?.id ?? previous;
    });
  }, [linkHostOptions, overview?.connection_host]);

  useEffect(() => {
    const instanceHost = overview?.connection_host?.trim();
    if (!instanceHost || !selectedLinkHostId) return;
    const storageKey = `vymanager.containers.linkHost:${instanceHost}`;
    window.localStorage.setItem(storageKey, selectedLinkHostId);
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
    setSuccess(null);
    setError(null);
  };

  const editContainer = (container: ContainerSummary) => {
    setSelectedContainerName(container.name);
    setDraft(toDraft(container));
    setSuccess(null);
    setError(null);
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

    setBootstrapping(true);
    setBootstrapError(null);
    setError(null);
    setSuccess(null);
    try {
      const status = await containersService.bootstrapAutomation();
      setBootstrapStatus(status);
      await loadOverview(true);
      setSuccess("Container automation is ready.");
    } catch (err) {
      setBootstrapError(err instanceof Error ? err.message : "Failed to enable container automation.");
    } finally {
      setBootstrapping(false);
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
      const response = await containersService.getLogs(name, 400);
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

  const containerAutomationReady = Boolean(
    bootstrapStatus?.ssh_enabled && bootstrapStatus?.ssh_key_installed
  );

  if (loadingBootstrap) {
    return (
      <AppLayout>
        <div className="p-8 space-y-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="h-8 w-8" />
            Container Management
          </h1>
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
            {overview?.connection_host && (
              <p className="text-xs text-muted-foreground mt-1">
                Instance host: <span className="font-mono">{overview.connection_host}</span>
              </p>
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
          <div className="flex flex-wrap gap-2">
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
            <Button variant="outline" onClick={resetDraft} disabled={saving || installing}>
              <Plus className="h-4 w-4 mr-2" />
              New Container
            </Button>
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
              ) : !overview || overview.containers.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No containers configured yet.
                </div>
              ) : (
                overview.containers.map((container) => {
                  const isSelected = selectedContainerName === container.name;
                  const busy = actionTarget === container.name;
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
                        </div>
                      </div>

                      {container.description && (
                        <p className="text-xs text-muted-foreground">{container.description}</p>
                      )}

                      {container.ports.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {container.ports.map((port) => (
                            <Badge key={port.name} variant="secondary" className="text-xs">
                              {`${port.name}: ${port.source}->${port.destination}/${port.protocol}`}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {container.links.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {container.links.map((link) => (
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
                    <Label>Logs: {logsContainerName}</Label>
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
            </CardContent>
          </Card>

          <Card>
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
                    Populate
                  </Button>
                </div>

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

              <div className="rounded-md border p-4 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <Label>LAN Planning Helper</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pick a LAN subnet to validate service IP planning and quickly copy a network address.
                    </p>
                  </div>
                  <Button
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
                            {segment.interfaceName} - {segment.subnetCidr}
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
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
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

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Entrypoint (optional)</Label>
                  <Input
                    value={draft.entrypoint}
                    onChange={(event) => setDraft((previous) => ({ ...previous, entrypoint: event.target.value }))}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Command (optional)</Label>
                  <Input
                    value={draft.command}
                    onChange={(event) => setDraft((previous) => ({ ...previous, command: event.target.value }))}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Arguments (optional)</Label>
                  <Input
                    value={draft.arguments}
                    onChange={(event) => setDraft((previous) => ({ ...previous, arguments: event.target.value }))}
                    disabled={saving}
                  />
                </div>
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

              <div className="grid gap-4 md:grid-cols-2">
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
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Environment Variables</Label>
                  <Button
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
                    Add
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
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Port Mappings</Label>
                  <Button
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
                    Add
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
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Volume Mappings</Label>
                  <Button
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
                    Add
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
