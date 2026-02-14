"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { showService } from "@/lib/api/show";
import { interfacesService } from "@/lib/api/interfaces";
import {
  systemService,
  type LldpConfig,
  type LldpInterfaceMode,
  type LldpStatus,
  type MdnsRepeaterConfig,
  type MdnsRepeaterStatus,
  type NtpConfig,
  type NtpServerConfig,
  type NtpStatus,
} from "@/lib/api/system";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Network,
  Plus,
  RefreshCw,
  Save,
  Server,
  Shield,
  Trash2,
  Wifi,
} from "lucide-react";
import { SshServiceTab } from "@/components/system/SshServiceTab";
import { DnsServiceTab } from "@/components/system/DnsServiceTab";
import { DynamicDnsServiceTab } from "@/components/system/DynamicDnsServiceTab";
import { DhcpRelayServiceTab } from "@/components/system/DhcpRelayServiceTab";
import { HttpsServiceTab } from "@/components/system/HttpsServiceTab";
import { SnmpServiceTab } from "@/components/system/SnmpServiceTab";
import { TftpServiceTab } from "@/components/system/TftpServiceTab";
import { ConsoleServerServiceTab } from "@/components/system/ConsoleServerServiceTab";
import { SaltMinionServiceTab } from "@/components/system/SaltMinionServiceTab";
import { SuricataServiceTab } from "@/components/system/SuricataServiceTab";
import { BroadcastRelayServiceTab } from "@/components/system/BroadcastRelayServiceTab";
import { ConntrackSyncServiceTab } from "@/components/system/ConntrackSyncServiceTab";
import { EventHandlerServiceTab } from "@/components/system/EventHandlerServiceTab";
import { formatInterfaceDisplayName } from "@/lib/utils";

const EMPTY_SERVER: NtpServerConfig = {
  address: "",
  prefer: false,
  pool: false,
  noselect: false,
  nts: false,
  interleave: false,
  ptp: false,
};

const LLDP_LEGACY_PROTOCOLS = ["cdp", "edp", "fdp", "sonmp"] as const;
const LLDP_MODE_OPTIONS: { value: LldpInterfaceMode; label: string }[] = [
  { value: "rx-tx", label: "RX/TX" },
  { value: "rx", label: "RX only" },
  { value: "tx", label: "TX only" },
  { value: "disable", label: "Disabled" },
];

type ServiceTab =
  | "broadcast-relay"
  | "console-server"
  | "conntrack-sync"
  | "ntp"
  | "lldp"
  | "mdns"
  | "ssh"
  | "salt-minion"
  | "https-api"
  | "snmp"
  | "suricata"
  | "tftp-server"
  | "dns-forwarder"
  | "dns-resolver"
  | "dynamic-dns"
  | "event-handler"
  | "dhcp-relay";

const SERVICE_TAB_VALUES: ServiceTab[] = [
  "broadcast-relay",
  "console-server",
  "conntrack-sync",
  "dhcp-relay",
  "dns-forwarder",
  "dns-resolver",
  "dynamic-dns",
  "event-handler",
  "https-api",
  "lldp",
  "mdns",
  "ntp",
  "salt-minion",
  "snmp",
  "ssh",
  "suricata",
  "tftp-server",
];

const SERVICE_TAB_LABELS: Record<ServiceTab, string> = {
  ntp: "NTP",
  lldp: "LLDP",
  mdns: "mDNS Repeater",
  ssh: "SSH",
  "broadcast-relay": "Broadcast Relay",
  "console-server": "Console Server",
  "conntrack-sync": "Conntrack Sync",
  "salt-minion": "Salt Minion",
  "https-api": "HTTP API",
  snmp: "SNMP",
  suricata: "Suricata",
  "tftp-server": "TFTP Server",
  "event-handler": "Event Handler",
  "dns-forwarder": "DNS Forwarder",
  "dns-resolver": "DNS Resolver",
  "dynamic-dns": "Dynamic DNS",
  "dhcp-relay": "DHCP Relay",
};

function normalizeServiceTab(raw: string | null): ServiceTab | null {
  if (!raw) return null;
  const normalized = raw === "dns" ? "dns-forwarder" : raw;
  if ((SERVICE_TAB_VALUES as string[]).includes(normalized)) {
    return normalized as ServiceTab;
  }
  return null;
}

function displayOrDash(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function normalizeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function SystemServicesPageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canWrite } = usePermissions();
  const canEditSystem = canWrite(FeatureGroup.SYSTEM);
  const singleServiceView = searchParams.get("view") === "single";

  const [activeTab, setActiveTab] = useState<ServiceTab>("ntp");
  const [serviceRefreshNonce, setServiceRefreshNonce] = useState(0);

  const [availableInterfaces, setAvailableInterfaces] = useState<string[]>([]);
  const [interfaceDisplayLabels, setInterfaceDisplayLabels] = useState<Record<string, string>>({});
  const [interfacesLoading, setInterfacesLoading] = useState(true);

  const [config, setConfig] = useState<NtpConfig | null>(null);
  const [status, setStatus] = useState<NtpStatus | null>(null);
  const [ntpLoading, setNtpLoading] = useState(true);

  const [lldpConfig, setLldpConfig] = useState<LldpConfig | null>(null);
  const [lldpStatus, setLldpStatus] = useState<LldpStatus | null>(null);
  const [lldpLoading, setLldpLoading] = useState(false);

  const [mdnsConfig, setMdnsConfig] = useState<MdnsRepeaterConfig | null>(null);
  const [mdnsStatus, setMdnsStatus] = useState<MdnsRepeaterStatus | null>(null);
  const [mdnsLoading, setMdnsLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeLoading = useMemo(() => {
    if (activeTab === "ntp") return ntpLoading;
    if (activeTab === "lldp") return lldpLoading;
    if (activeTab === "mdns") return mdnsLoading;
    return false;
  }, [activeTab, lldpLoading, mdnsLoading, ntpLoading]);

  useEffect(() => {
    const requested = normalizeServiceTab(searchParams.get("tab"));
    if (requested && requested !== activeTab) {
      setActiveTab(requested);
    }
  }, [activeTab, searchParams]);

  const handleTabChange = (value: string) => {
    const tab = normalizeServiceTab(value);
    if (!tab) return;

    setActiveTab(tab);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const loadInterfaces = async () => {
    setInterfacesLoading(true);
    try {
      const [countersResult, interfacesResult] = await Promise.allSettled([
        showService.getInterfaceCounters(),
        interfacesService.getConfig(),
      ]);

      const namesSet = new Set<string>();
      if (countersResult.status === "fulfilled") {
        for (const item of countersResult.value.interfaces) {
          const name = (item.interface || "").trim();
          if (name) namesSet.add(name);
        }
      }

      const descriptionByName: Record<string, string | null> = {};
      if (interfacesResult.status === "fulfilled") {
        for (const entry of interfacesResult.value.interfaces) {
          const name = (entry.name || "").trim();
          if (!name) continue;
          namesSet.add(name);
          descriptionByName[name] = entry.description ?? null;
        }
      }

      const names = Array.from(namesSet)
        .filter((name) => name !== "lo")
        .sort((left, right) => left.localeCompare(right));

      const labels: Record<string, string> = {};
      for (const name of names) {
        labels[name] = formatInterfaceDisplayName(name, descriptionByName[name] ?? null);
      }

      setAvailableInterfaces(names);
      setInterfaceDisplayLabels(labels);
    } catch {
      setAvailableInterfaces([]);
      setInterfaceDisplayLabels({});
    } finally {
      setInterfacesLoading(false);
    }
  };

  const loadNtpData = async (refresh: boolean = false) => {
    setNtpLoading(true);
    setError(null);

    try {
      const [configData, statusData] = await Promise.all([
        systemService.getNtpConfig(refresh),
        systemService.getNtpStatus(refresh),
      ]);
      setConfig(configData);
      setStatus(statusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load NTP service data.");
    } finally {
      setNtpLoading(false);
    }
  };

  const loadLldpData = async (refresh: boolean = false) => {
    setLldpLoading(true);
    setError(null);

    try {
      const [configData, statusData] = await Promise.all([
        systemService.getLldpConfig(refresh),
        systemService.getLldpStatus(refresh),
      ]);
      setLldpConfig(configData);
      setLldpStatus(statusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load LLDP service data.");
    } finally {
      setLldpLoading(false);
    }
  };

  const loadMdnsData = async (refresh: boolean = false) => {
    setMdnsLoading(true);
    setError(null);

    try {
      const [configData, statusData] = await Promise.all([
        systemService.getMdnsConfig(refresh),
        systemService.getMdnsStatus(refresh),
      ]);
      setMdnsConfig(configData);
      setMdnsStatus(statusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mDNS repeater data.");
    } finally {
      setMdnsLoading(false);
    }
  };

  useEffect(() => {
    loadInterfaces();
    loadNtpData(false);
  }, []);

  useEffect(() => {
    if (activeTab === "lldp" && !lldpConfig && !lldpLoading) {
      loadLldpData(false);
    }
    if (activeTab === "mdns" && !mdnsConfig && !mdnsLoading) {
      loadMdnsData(false);
    }
  }, [activeTab, lldpConfig, lldpLoading, mdnsConfig, mdnsLoading]);

  const handleRefresh = async () => {
    setSuccess(null);
    if (activeTab === "ntp") {
      await loadNtpData(true);
      return;
    }
    if (activeTab === "lldp") {
      await loadLldpData(true);
      return;
    }
    if (activeTab === "mdns") {
      await loadMdnsData(true);
      return;
    }
    setServiceRefreshNonce((previous) => previous + 1);
  };

  // ============================================================================
  // NTP: mutators (existing UI)
  // ============================================================================

  const addServer = () => {
    setConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, servers: [...previous.servers, { ...EMPTY_SERVER }] };
    });
  };

  const removeServer = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        servers: previous.servers.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const updateServer = <K extends keyof NtpServerConfig>(
    index: number,
    key: K,
    value: NtpServerConfig[K]
  ) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const nextServers = [...previous.servers];
      nextServers[index] = { ...nextServers[index], [key]: value };
      return { ...previous, servers: nextServers };
    });
  };

  const addAllowClient = () => {
    setConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, allow_clients: [...previous.allow_clients, ""] };
    });
  };

  const updateAllowClient = (index: number, value: string) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.allow_clients];
      next[index] = value;
      return { ...previous, allow_clients: next };
    });
  };

  const removeAllowClient = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        allow_clients: previous.allow_clients.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const addListenAddress = () => {
    setConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, listen_addresses: [...previous.listen_addresses, ""] };
    });
  };

  const updateListenAddress = (index: number, value: string) => {
    setConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.listen_addresses];
      next[index] = value;
      return { ...previous, listen_addresses: next };
    });
  };

  const removeListenAddress = (index: number) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        listen_addresses: previous.listen_addresses.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const handleSaveNtp = async () => {
    if (!config) return;

    const payload: NtpConfig = {
      enabled: config.enabled,
      servers: config.servers
        .map((server) => ({ ...server, address: server.address.trim() }))
        .filter((server) => server.address.length > 0),
      allow_clients: normalizeStringList(config.allow_clients),
      listen_addresses: normalizeStringList(config.listen_addresses),
    };

    if (payload.enabled && payload.servers.length === 0) {
      setError("At least one NTP server is required when the NTP service is enabled.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await systemService.updateNtpConfig(payload);
      setConfig(updated);
      const latestStatus = await systemService.getNtpStatus(true);
      setStatus(latestStatus);
      setSuccess("NTP service configuration updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update NTP service configuration.");
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // LLDP: config + save
  // ============================================================================

  const lldpSelectedInterfaces = useMemo(() => {
    if (!lldpConfig) return [];
    return [...new Set(lldpConfig.interfaces.map((entry) => entry.interface))]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }, [lldpConfig]);

  const toggleLldpInterface = (interfaceName: string, checked: boolean) => {
    setLldpConfig((previous) => {
      if (!previous) return previous;
      const name = interfaceName.trim();
      if (!name) return previous;

      const exists = previous.interfaces.some((entry) => entry.interface === name);
      let next = previous.interfaces;
      if (checked && !exists) next = [...previous.interfaces, { interface: name, mode: null }];
      if (!checked && exists) next = previous.interfaces.filter((entry) => entry.interface !== name);
      return { ...previous, interfaces: next };
    });
  };

  const updateLldpMode = (interfaceName: string, mode: LldpInterfaceMode | null) => {
    setLldpConfig((previous) => {
      if (!previous) return previous;
      const next = previous.interfaces.map((entry) => {
        if (entry.interface !== interfaceName) return entry;
        return { ...entry, mode };
      });
      return { ...previous, interfaces: next };
    });
  };

  const addLldpManagementAddress = () => {
    setLldpConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, management_addresses: [...previous.management_addresses, ""] };
    });
  };

  const updateLldpManagementAddress = (index: number, value: string) => {
    setLldpConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.management_addresses];
      next[index] = value;
      return { ...previous, management_addresses: next };
    });
  };

  const removeLldpManagementAddress = (index: number) => {
    setLldpConfig((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        management_addresses: previous.management_addresses.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const toggleLegacyProtocol = (protocol: (typeof LLDP_LEGACY_PROTOCOLS)[number], checked: boolean) => {
    setLldpConfig((previous) => {
      if (!previous) return previous;
      const current = new Set(previous.legacy_protocols);
      if (checked) current.add(protocol);
      else current.delete(protocol);
      return { ...previous, legacy_protocols: Array.from(current).sort() };
    });
  };

  const handleSaveLldp = async () => {
    if (!lldpConfig) return;

    const payload: LldpConfig = {
      enabled: lldpConfig.enabled,
      all_interfaces: lldpConfig.all_interfaces,
      interfaces: lldpConfig.all_interfaces
        ? []
        : lldpConfig.interfaces
            .map((entry) => ({
              interface: entry.interface.trim(),
              mode: entry.mode ?? null,
            }))
            .filter((entry) => entry.interface.length > 0),
      management_addresses: normalizeStringList(lldpConfig.management_addresses),
      snmp: lldpConfig.snmp,
      legacy_protocols: normalizeStringList(lldpConfig.legacy_protocols),
    };

    if (payload.enabled && !payload.all_interfaces && payload.interfaces.length === 0) {
      setError("Select at least one interface or enable 'All interfaces' when LLDP is enabled.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await systemService.updateLldpConfig(payload);
      setLldpConfig(updated);
      const latest = await systemService.getLldpStatus(true);
      setLldpStatus(latest);
      setSuccess("LLDP service configuration updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update LLDP service configuration.");
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // mDNS: config + save
  // ============================================================================

  const mdnsSelectedInterfaces = useMemo(() => {
    if (!mdnsConfig) return [];
    return [...new Set(mdnsConfig.interfaces)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [mdnsConfig]);

  const toggleMdnsInterface = (interfaceName: string, checked: boolean) => {
    setMdnsConfig((previous) => {
      if (!previous) return previous;
      const name = interfaceName.trim();
      if (!name) return previous;

      const current = new Set(previous.interfaces);
      if (checked) current.add(name);
      else current.delete(name);
      return { ...previous, interfaces: Array.from(current).sort() };
    });
  };

  const addMdnsAllowService = () => {
    setMdnsConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, allow_services: [...previous.allow_services, ""] };
    });
  };

  const updateMdnsAllowService = (index: number, value: string) => {
    setMdnsConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.allow_services];
      next[index] = value;
      return { ...previous, allow_services: next };
    });
  };

  const removeMdnsAllowService = (index: number) => {
    setMdnsConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, allow_services: previous.allow_services.filter((_, i) => i !== index) };
    });
  };

  const addMdnsBrowseDomain = () => {
    setMdnsConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, browse_domains: [...previous.browse_domains, ""] };
    });
  };

  const updateMdnsBrowseDomain = (index: number, value: string) => {
    setMdnsConfig((previous) => {
      if (!previous) return previous;
      const next = [...previous.browse_domains];
      next[index] = value;
      return { ...previous, browse_domains: next };
    });
  };

  const removeMdnsBrowseDomain = (index: number) => {
    setMdnsConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, browse_domains: previous.browse_domains.filter((_, i) => i !== index) };
    });
  };

  const handleSaveMdns = async () => {
    if (!mdnsConfig) return;

    const payload = {
      enabled: mdnsConfig.enabled,
      interfaces: normalizeStringList(mdnsConfig.interfaces),
      ip_version: mdnsConfig.ip_version,
      allow_services: normalizeStringList(mdnsConfig.allow_services),
      browse_domains: normalizeStringList(mdnsConfig.browse_domains),
      cache_entries: mdnsConfig.cache_entries ?? null,
    };

    if (payload.enabled && payload.interfaces.length < 2) {
      setError("mDNS repeater requires at least two interfaces when enabled.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await systemService.updateMdnsConfig(payload);
      setMdnsConfig(updated);
      const latest = await systemService.getMdnsStatus(true);
      setMdnsStatus(latest);
      setSuccess("mDNS repeater configuration updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update mDNS repeater configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Server className="h-8 w-8" />
              System Services
            </h1>
            <p className="text-muted-foreground mt-2">
              {singleServiceView
                ? `Configure and monitor ${SERVICE_TAB_LABELS[activeTab]}.`
                : "Configure and monitor system-level services such as NTP, LLDP, and mDNS."}
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={activeLoading || saving}>
            <RefreshCw className={`h-4 w-4 mr-2 ${activeLoading ? "animate-spin" : ""}`} />
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

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {!singleServiceView && (
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="broadcast-relay">Broadcast Relay</TabsTrigger>
              <TabsTrigger value="console-server">Console Server</TabsTrigger>
              <TabsTrigger value="conntrack-sync">Conntrack Sync</TabsTrigger>
              <TabsTrigger value="dhcp-relay">DHCP Relay</TabsTrigger>
              <TabsTrigger value="dns-forwarder">DNS Forwarder</TabsTrigger>
              <TabsTrigger value="dns-resolver">DNS Resolver</TabsTrigger>
              <TabsTrigger value="dynamic-dns">Dynamic DNS</TabsTrigger>
              <TabsTrigger value="event-handler">Event Handler</TabsTrigger>
              <TabsTrigger value="https-api">HTTP API</TabsTrigger>
              <TabsTrigger value="lldp">LLDP</TabsTrigger>
              <TabsTrigger value="mdns">mDNS Repeater</TabsTrigger>
              <TabsTrigger value="ntp">NTP</TabsTrigger>
              <TabsTrigger value="salt-minion">Salt Minion</TabsTrigger>
              <TabsTrigger value="snmp">SNMP</TabsTrigger>
              <TabsTrigger value="ssh">SSH</TabsTrigger>
              <TabsTrigger value="suricata">Suricata</TabsTrigger>
              <TabsTrigger value="tftp-server">TFTP Server</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="ntp" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock3 className="h-5 w-5 text-primary" />
                    NTP Service Configuration
                  </CardTitle>
                  <CardDescription>
                    Manage upstream NTP servers and which client subnets can query this router as an NTP source.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {ntpLoading || !config ? (
                    <div className="text-muted-foreground text-sm">Loading NTP configuration...</div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={config.enabled}
                          onCheckedChange={(checked) => {
                            setConfig((previous) => {
                              if (!previous) return previous;
                              return { ...previous, enabled: checked === true };
                            });
                          }}
                          disabled={!canEditSystem || saving}
                        />
                        <Label className="text-sm font-medium">Enable NTP service</Label>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">NTP Servers</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addServer}
                            disabled={!canEditSystem || saving || !config.enabled}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Server
                          </Button>
                        </div>

                        {config.servers.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No servers configured.</p>
                        ) : (
                          <div className="space-y-3">
                            {config.servers.map((server, index) => (
                              <div key={`server-${index}`} className="rounded-md border p-3 space-y-3">
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={server.address}
                                    placeholder="time.cloudflare.com or 1.1.1.1"
                                    onChange={(event) => updateServer(index, "address", event.target.value)}
                                    disabled={!canEditSystem || saving || !config.enabled}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeServer(index)}
                                    disabled={!canEditSystem || saving || !config.enabled}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={server.prefer}
                                      onCheckedChange={(checked) =>
                                        updateServer(index, "prefer", checked === true)
                                      }
                                      disabled={!canEditSystem || saving || !config.enabled}
                                    />
                                    Prefer
                                  </label>
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={server.pool}
                                      onCheckedChange={(checked) => updateServer(index, "pool", checked === true)}
                                      disabled={!canEditSystem || saving || !config.enabled}
                                    />
                                    Pool
                                  </label>
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={server.noselect}
                                      onCheckedChange={(checked) =>
                                        updateServer(index, "noselect", checked === true)
                                      }
                                      disabled={!canEditSystem || saving || !config.enabled}
                                    />
                                    No Select
                                  </label>
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={server.nts}
                                      onCheckedChange={(checked) => updateServer(index, "nts", checked === true)}
                                      disabled={!canEditSystem || saving || !config.enabled}
                                    />
                                    NTS
                                  </label>
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={server.interleave}
                                      onCheckedChange={(checked) =>
                                        updateServer(index, "interleave", checked === true)
                                      }
                                      disabled={!canEditSystem || saving || !config.enabled}
                                    />
                                    Interleave
                                  </label>
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={server.ptp}
                                      onCheckedChange={(checked) => updateServer(index, "ptp", checked === true)}
                                      disabled={!canEditSystem || saving || !config.enabled}
                                    />
                                    PTP
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Allow-Client Networks</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addAllowClient}
                            disabled={!canEditSystem || saving || !config.enabled}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Network
                          </Button>
                        </div>
                        {config.allow_clients.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No client networks configured.</p>
                        ) : (
                          <div className="space-y-2">
                            {config.allow_clients.map((entry, index) => (
                              <div key={`allow-${index}`} className="flex items-center gap-2">
                                <Input
                                  value={entry}
                                  placeholder="192.168.1.0/24"
                                  onChange={(event) => updateAllowClient(index, event.target.value)}
                                  disabled={!canEditSystem || saving || !config.enabled}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeAllowClient(index)}
                                  disabled={!canEditSystem || saving || !config.enabled}
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
                          <Label className="text-sm font-medium">Listen Addresses (Optional)</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addListenAddress}
                            disabled={!canEditSystem || saving || !config.enabled}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Address
                          </Button>
                        </div>
                        {config.listen_addresses.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Listening on default interfaces.</p>
                        ) : (
                          <div className="space-y-2">
                            {config.listen_addresses.map((entry, index) => (
                              <div key={`listen-${index}`} className="flex items-center gap-2">
                                <Input
                                  value={entry}
                                  placeholder="0.0.0.0 or 192.168.1.1"
                                  onChange={(event) => updateListenAddress(index, event.target.value)}
                                  disabled={!canEditSystem || saving || !config.enabled}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeListenAddress(index)}
                                  disabled={!canEditSystem || saving || !config.enabled}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button onClick={handleSaveNtp} disabled={!canEditSystem || saving || ntpLoading}>
                          <Save className="h-4 w-4 mr-2" />
                          {saving ? "Saving..." : "Save NTP Configuration"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Runtime NTP Status
                  </CardTitle>
                  <CardDescription>Live synchronization status from chrony.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {!status ? (
                    <p className="text-muted-foreground">No runtime data available.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={status.enabled ? "default" : "secondary"}>
                          {status.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        {status.enabled && (
                          <Badge
                            variant="outline"
                            className={
                              status.synchronized === true
                                ? "bg-green-500/10 text-green-600 border-green-500/20"
                                : status.synchronized === false
                                  ? "bg-red-500/10 text-red-600 border-red-500/20"
                                  : "bg-muted text-muted-foreground"
                            }
                          >
                            {status.synchronized === true
                              ? "Synchronized"
                              : status.synchronized === false
                                ? "Not synchronized"
                                : "Sync unknown"}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Reference</span>
                          <span className="font-medium text-right">
                            {displayOrDash(status.reference_name || status.reference_id)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Stratum</span>
                          <span className="font-medium">{displayOrDash(status.stratum)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Leap Status</span>
                          <span className="font-medium text-right">{displayOrDash(status.leap_status)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Online Sources</span>
                          <span className="font-medium">{displayOrDash(status.sources_online)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Offline Sources</span>
                          <span className="font-medium">{displayOrDash(status.sources_offline)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="lldp" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-primary" />
                    LLDP Configuration
                  </CardTitle>
                  <CardDescription>
                    Advertise and discover neighbors on your network.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {lldpLoading || !lldpConfig ? (
                    <div className="text-muted-foreground text-sm">Loading LLDP configuration...</div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={lldpConfig.enabled}
                          onCheckedChange={(checked) => {
                            setLldpConfig((previous) => {
                              if (!previous) return previous;
                              return { ...previous, enabled: checked === true };
                            });
                          }}
                          disabled={!canEditSystem || saving}
                        />
                        <Label className="text-sm font-medium">Enable LLDP service</Label>
                      </div>

                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={lldpConfig.all_interfaces}
                          onCheckedChange={(checked) => {
                            setLldpConfig((previous) => {
                              if (!previous) return previous;
                              const next = checked === true;
                              return { ...previous, all_interfaces: next, interfaces: next ? [] : previous.interfaces };
                            });
                          }}
                          disabled={!canEditSystem || saving || !lldpConfig.enabled}
                        />
                        <Label className="text-sm font-medium">All interfaces</Label>
                      </div>

                      {!lldpConfig.all_interfaces && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Interfaces</Label>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" disabled={interfacesLoading || !lldpConfig.enabled || saving || !canEditSystem}>
                                  Select Interfaces
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>LLDP Interfaces</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {interfacesLoading ? (
                                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading...</div>
                                ) : availableInterfaces.length === 0 ? (
                                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No interfaces found.</div>
                                ) : (
                                  availableInterfaces.map((iface) => (
                                  <DropdownMenuCheckboxItem
                                    key={iface}
                                    checked={lldpSelectedInterfaces.includes(iface)}
                                    onCheckedChange={(checked) => toggleLldpInterface(iface, checked)}
                                  >
                                      {interfaceDisplayLabels[iface] ?? iface}
                                    </DropdownMenuCheckboxItem>
                                  ))
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {lldpConfig.interfaces.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No interfaces selected.</p>
                          ) : (
                            <div className="space-y-2">
                              {lldpSelectedInterfaces.map((iface) => {
                                const current = lldpConfig.interfaces.find((entry) => entry.interface === iface);
                                const currentMode = current?.mode ?? null;
                                return (
                                  <div key={iface} className="flex items-center gap-2">
                                    <div className="min-w-[100px] font-mono text-sm">{iface}</div>
                                    <Select
                                      value={currentMode ?? "default"}
                                      onValueChange={(value) =>
                                        updateLldpMode(iface, value === "default" ? null : (value as LldpInterfaceMode))
                                      }
                                      disabled={!canEditSystem || saving || !lldpConfig.enabled}
                                    >
                                      <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Default" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="default">Default</SelectItem>
                                        {LLDP_MODE_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => toggleLldpInterface(iface, false)}
                                      disabled={!canEditSystem || saving || !lldpConfig.enabled}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Management Addresses (Optional)</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addLldpManagementAddress}
                            disabled={!canEditSystem || saving || !lldpConfig.enabled}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Address
                          </Button>
                        </div>
                        {lldpConfig.management_addresses.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No management addresses configured.</p>
                        ) : (
                          <div className="space-y-2">
                            {lldpConfig.management_addresses.map((entry, index) => (
                              <div key={`lldp-mgmt-${index}`} className="flex items-center gap-2">
                                <Input
                                  value={entry}
                                  placeholder="192.168.1.1"
                                  onChange={(event) => updateLldpManagementAddress(index, event.target.value)}
                                  disabled={!canEditSystem || saving || !lldpConfig.enabled}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeLldpManagementAddress(index)}
                                  disabled={!canEditSystem || saving || !lldpConfig.enabled}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={lldpConfig.snmp}
                            onCheckedChange={(checked) => {
                              setLldpConfig((previous) => {
                                if (!previous) return previous;
                                return { ...previous, snmp: checked === true };
                              });
                            }}
                            disabled={!canEditSystem || saving || !lldpConfig.enabled}
                          />
                          <Label className="text-sm font-medium">Enable SNMP extensions</Label>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Legacy Protocols</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {LLDP_LEGACY_PROTOCOLS.map((protocol) => (
                              <label key={protocol} className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={lldpConfig.legacy_protocols.includes(protocol)}
                                  onCheckedChange={(checked) => toggleLegacyProtocol(protocol, checked === true)}
                                  disabled={!canEditSystem || saving || !lldpConfig.enabled}
                                />
                                {protocol.toUpperCase()}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button onClick={handleSaveLldp} disabled={!canEditSystem || saving || lldpLoading}>
                          <Save className="h-4 w-4 mr-2" />
                          {saving ? "Saving..." : "Save LLDP Configuration"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    LLDP Neighbors
                  </CardTitle>
                  <CardDescription>Live neighbor discovery status.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {!lldpStatus ? (
                    <p className="text-muted-foreground">No runtime data available.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={lldpStatus.enabled ? "default" : "secondary"}>
                          {lldpStatus.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          {lldpStatus.neighbors.length} neighbor{lldpStatus.neighbors.length === 1 ? "" : "s"}
                        </Badge>
                      </div>

                      {lldpStatus.error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          {lldpStatus.error}
                        </div>
                      )}

                      {lldpStatus.neighbors.length > 0 && (
                        <div className="rounded-md border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Local</TableHead>
                                <TableHead>System</TableHead>
                                <TableHead>Port</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lldpStatus.neighbors.slice(0, 25).map((neighbor, index) => (
                                <TableRow key={`${neighbor.raw}-${index}`}>
                                  <TableCell className="font-mono text-xs">
                                    {displayOrDash(neighbor.local_interface)}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {displayOrDash(neighbor.system_name || neighbor.platform || neighbor.chassis_id)}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono">
                                    {displayOrDash(neighbor.port_id)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {lldpStatus.raw_neighbors && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Raw Output</Label>
                          <Textarea
                            readOnly
                            value={lldpStatus.raw_neighbors}
                            className="font-mono text-xs min-h-[180px]"
                          />
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="mdns" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="h-5 w-5 text-primary" />
                    mDNS Repeater (Avahi)
                  </CardTitle>
                  <CardDescription>
                    Repeat multicast DNS across interfaces (useful for service discovery across VLANs).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {mdnsLoading || !mdnsConfig ? (
                    <div className="text-muted-foreground text-sm">Loading mDNS configuration...</div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={mdnsConfig.enabled}
                          onCheckedChange={(checked) => {
                            setMdnsConfig((previous) => {
                              if (!previous) return previous;
                              return { ...previous, enabled: checked === true };
                            });
                          }}
                          disabled={!canEditSystem || saving}
                        />
                        <Label className="text-sm font-medium">Enable mDNS repeater</Label>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Interfaces</Label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" disabled={interfacesLoading || saving || !canEditSystem}>
                                Select Interfaces
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>mDNS Interfaces</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {interfacesLoading ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading...</div>
                              ) : availableInterfaces.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">No interfaces found.</div>
                              ) : (
                                availableInterfaces.map((iface) => (
                                  <DropdownMenuCheckboxItem
                                    key={iface}
                                    checked={mdnsSelectedInterfaces.includes(iface)}
                                    onCheckedChange={(checked) => toggleMdnsInterface(iface, checked)}
                                  >
                                    {interfaceDisplayLabels[iface] ?? iface}
                                  </DropdownMenuCheckboxItem>
                                ))
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Select at least two interfaces when enabled.
                        </p>
                        <div className="text-xs font-mono">
                          Selected: {mdnsSelectedInterfaces.length === 0 ? "-" : mdnsSelectedInterfaces.join(", ")}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">IP Version</Label>
                        <Select
                          value={mdnsConfig.ip_version}
                          onValueChange={(value) => {
                            setMdnsConfig((previous) => {
                              if (!previous) return previous;
                              return { ...previous, ip_version: value as MdnsRepeaterConfig["ip_version"] };
                            });
                          }}
                          disabled={!canEditSystem || saving}
                        >
                          <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="both" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="both">Both</SelectItem>
                            <SelectItem value="ipv4">IPv4</SelectItem>
                            <SelectItem value="ipv6">IPv6</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Allow Services (Optional)</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addMdnsAllowService}
                            disabled={!canEditSystem || saving}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add
                          </Button>
                        </div>
                        {mdnsConfig.allow_services.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No service filter configured.</p>
                        ) : (
                          <div className="space-y-2">
                            {mdnsConfig.allow_services.map((entry, index) => (
                              <div key={`mdns-allow-${index}`} className="flex items-center gap-2">
                                <Input
                                  value={entry}
                                  placeholder="_http._tcp"
                                  onChange={(event) => updateMdnsAllowService(index, event.target.value)}
                                  disabled={!canEditSystem || saving}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeMdnsAllowService(index)}
                                  disabled={!canEditSystem || saving}
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
                          <Label className="text-sm font-medium">Browse Domains (Optional)</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addMdnsBrowseDomain}
                            disabled={!canEditSystem || saving}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add
                          </Button>
                        </div>
                        {mdnsConfig.browse_domains.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No browse domains configured.</p>
                        ) : (
                          <div className="space-y-2">
                            {mdnsConfig.browse_domains.map((entry, index) => (
                              <div key={`mdns-domain-${index}`} className="flex items-center gap-2">
                                <Input
                                  value={entry}
                                  placeholder="local"
                                  onChange={(event) => updateMdnsBrowseDomain(index, event.target.value)}
                                  disabled={!canEditSystem || saving}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeMdnsBrowseDomain(index)}
                                  disabled={!canEditSystem || saving}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Cache Entries (Optional)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={mdnsConfig.cache_entries ?? ""}
                          placeholder="4096"
                          onChange={(event) => {
                            const raw = event.target.value;
                            setMdnsConfig((previous) => {
                              if (!previous) return previous;
                              if (!raw.trim()) return { ...previous, cache_entries: null };
                              const parsed = Number(raw);
                              if (!Number.isFinite(parsed) || parsed < 0) return previous;
                              return { ...previous, cache_entries: parsed };
                            });
                          }}
                          disabled={!canEditSystem || saving}
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button onClick={handleSaveMdns} disabled={!canEditSystem || saving || mdnsLoading}>
                          <Save className="h-4 w-4 mr-2" />
                          {saving ? "Saving..." : "Save mDNS Configuration"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    mDNS Status
                  </CardTitle>
                  <CardDescription>Best-effort service log output.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {!mdnsStatus ? (
                    <p className="text-muted-foreground">No runtime data available.</p>
                  ) : (
                    <>
                      <Badge variant={mdnsStatus.enabled ? "default" : "secondary"}>
                        {mdnsStatus.enabled ? "Enabled" : "Disabled"}
                      </Badge>

                      {mdnsStatus.error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          {mdnsStatus.error}
                        </div>
                      )}

                      {mdnsStatus.raw_log ? (
                        <Textarea
                          readOnly
                          value={mdnsStatus.raw_log}
                          className="font-mono text-xs min-h-[260px]"
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">No logs available.</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ssh" className="space-y-6">
            <SshServiceTab canEdit={canEditSystem} active={activeTab === "ssh"} refreshNonce={serviceRefreshNonce} />
          </TabsContent>

          <TabsContent value="dns-forwarder" className="space-y-6">
            <DnsServiceTab
              canEdit={canEditSystem}
              active={activeTab === "dns-forwarder"}
              refreshNonce={serviceRefreshNonce}
            />
          </TabsContent>

          <TabsContent value="dns-resolver" className="space-y-6">
            <DnsServiceTab
              canEdit={canEditSystem}
              active={activeTab === "dns-resolver"}
              refreshNonce={serviceRefreshNonce}
              mode="resolver"
            />
          </TabsContent>

          <TabsContent value="dynamic-dns" className="space-y-6">
            <DynamicDnsServiceTab
              canEdit={canEditSystem}
              active={activeTab === "dynamic-dns"}
              refreshNonce={serviceRefreshNonce}
              interfaces={availableInterfaces}
              interfaceLabels={interfaceDisplayLabels}
              interfacesLoading={interfacesLoading}
            />
          </TabsContent>

          <TabsContent value="https-api" className="space-y-6">
            <HttpsServiceTab
              canEdit={canEditSystem}
              active={activeTab === "https-api"}
              refreshNonce={serviceRefreshNonce}
            />
          </TabsContent>

          <TabsContent value="console-server" className="space-y-6">
            <ConsoleServerServiceTab
              canEdit={canEditSystem}
              active={activeTab === "console-server"}
              refreshNonce={serviceRefreshNonce}
            />
          </TabsContent>

          <TabsContent value="broadcast-relay" className="space-y-6">
            <BroadcastRelayServiceTab
              canEdit={canEditSystem}
              active={activeTab === "broadcast-relay"}
              refreshNonce={serviceRefreshNonce}
            />
          </TabsContent>

          <TabsContent value="conntrack-sync" className="space-y-6">
            <ConntrackSyncServiceTab
              canEdit={canEditSystem}
              active={activeTab === "conntrack-sync"}
              refreshNonce={serviceRefreshNonce}
            />
          </TabsContent>

          <TabsContent value="event-handler" className="space-y-6">
            <EventHandlerServiceTab
              canEdit={canEditSystem}
              active={activeTab === "event-handler"}
              refreshNonce={serviceRefreshNonce}
            />
          </TabsContent>

          <TabsContent value="snmp" className="space-y-6">
            <SnmpServiceTab
              canEdit={canEditSystem}
              active={activeTab === "snmp"}
              refreshNonce={serviceRefreshNonce}
            />
          </TabsContent>

          <TabsContent value="salt-minion" className="space-y-6">
            <SaltMinionServiceTab
              canEdit={canEditSystem}
              active={activeTab === "salt-minion"}
              refreshNonce={serviceRefreshNonce}
            />
          </TabsContent>

          <TabsContent value="dhcp-relay" className="space-y-6">
            <DhcpRelayServiceTab
              canEdit={canEditSystem}
              active={activeTab === "dhcp-relay"}
              refreshNonce={serviceRefreshNonce}
              interfaces={availableInterfaces}
              interfaceLabels={interfaceDisplayLabels}
              interfacesLoading={interfacesLoading}
            />
          </TabsContent>

          <TabsContent value="tftp-server" className="space-y-6">
            <TftpServiceTab
              canEdit={canEditSystem}
              active={activeTab === "tftp-server"}
              refreshNonce={serviceRefreshNonce}
            />
          </TabsContent>

          <TabsContent value="suricata" className="space-y-6">
            <SuricataServiceTab
              canEdit={canEditSystem}
              active={activeTab === "suricata"}
              refreshNonce={serviceRefreshNonce}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

export default function SystemServicesPage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <div className="p-8 text-sm text-muted-foreground">Loading system services...</div>
        </AppLayout>
      }
    >
      <SystemServicesPageContent />
    </Suspense>
  );
}
