"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Plus, RefreshCw, AlertCircle, Search, Cable, Pencil, Trash2, Network, ArrowUpRight } from "lucide-react";
import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import type { InterfacePhysical } from "@/lib/api/show";
import type { EthernetInterface, EthernetCapabilities, VLANWithParent } from "@/lib/api/types/ethernet";
import { pageGuides } from "@/lib/help/pageGuides";
import { ComprehensiveEthernetModal } from "@/components/network/ComprehensiveEthernetModal";
import { ComprehensiveVLANModal } from "@/components/network/ComprehensiveVLANModal";
import { DeleteEthernetModal } from "@/components/network/DeleteEthernetModal";
import { DeleteVLANModal } from "@/components/network/DeleteVLANModal";

type InterfaceType = "all" | "ethernet" | "vlan";
type InterfaceFamilyGroup = "core-l2" | "overlay-secure" | "access-wan";
type InterfaceFamilyFilter = "all" | InterfaceFamilyGroup;

interface InterfaceFamily {
  key: string;
  title: string;
  href: string;
  group: InterfaceFamilyGroup;
  summary: string;
  commonFields: string[];
}

const INTERFACE_GROUPS: Array<{ id: InterfaceFamilyFilter; label: string }> = [
  { id: "all", label: "All Families" },
  { id: "core-l2", label: "Core & L2" },
  { id: "overlay-secure", label: "Overlay & Secure" },
  { id: "access-wan", label: "Access & WAN" },
];

const INTERFACE_FAMILIES: InterfaceFamily[] = [
  {
    key: "ethernet-vlan",
    title: "Ethernet & VLAN",
    href: "/network/interfaces",
    group: "core-l2",
    summary: "Physical interfaces plus VLAN/QinQ tagging and addressing.",
    commonFields: ["Description", "Addresses", "VRF"],
  },
  {
    key: "dummy",
    title: "Dummy",
    href: "/network/interfaces/dummy",
    group: "core-l2",
    summary: "Software-only interfaces for route/policy testing and anchors.",
    commonFields: ["Description", "MTU", "VRF"],
  },
  {
    key: "bonding",
    title: "Bonding",
    href: "/network/interfaces/bonding",
    group: "core-l2",
    summary: "LACP and static link aggregation with member management.",
    commonFields: ["Description", "MTU", "VRF"],
  },
  {
    key: "bridge",
    title: "Bridge",
    href: "/network/interfaces/bridge",
    group: "core-l2",
    summary: "Layer-2 switching with STP controls and bridge member tuning.",
    commonFields: ["Description", "MTU", "VRF"],
  },
  {
    key: "loopback",
    title: "Loopback",
    href: "/network/interfaces/loopback",
    group: "core-l2",
    summary: "Stable local endpoints for router IDs and control plane use.",
    commonFields: ["Description", "Addresses"],
  },
  {
    key: "pseudo-ethernet",
    title: "Pseudo-Ethernet",
    href: "/network/interfaces/pseudo-ethernet",
    group: "core-l2",
    summary: "Interface abstraction with source-interface binding.",
    commonFields: ["Description", "MTU", "VRF"],
  },
  {
    key: "virtual-ethernet",
    title: "Virtual-Ethernet",
    href: "/network/interfaces/virtual-ethernet",
    group: "core-l2",
    summary: "Veth pair style interfaces for local interconnect use cases.",
    commonFields: ["Description", "MTU", "VRF"],
  },
  {
    key: "tunnel",
    title: "Tunnel",
    href: "/network/interfaces/tunnel",
    group: "overlay-secure",
    summary: "GRE/IPIP-style tunnels with source/remote and MSS controls.",
    commonFields: ["Source Address", "Remote Endpoint", "MTU"],
  },
  {
    key: "vti",
    title: "VTI",
    href: "/network/interfaces/vti",
    group: "overlay-secure",
    summary: "Route-based IPsec tunnel interfaces with addressing and VRF.",
    commonFields: ["Description", "MTU", "VRF"],
  },
  {
    key: "vxlan",
    title: "VXLAN",
    href: "/network/interfaces/vxlan",
    group: "overlay-secure",
    summary: "Overlay transport with VNI mapping and underlay source controls.",
    commonFields: ["VNI", "Source Interface", "MTU"],
  },
  {
    key: "geneve",
    title: "Geneve",
    href: "/network/interfaces/geneve",
    group: "overlay-secure",
    summary: "Geneve overlays with endpoint, VNI, and MSS behavior.",
    commonFields: ["Remote Endpoint", "Source Interface", "MTU"],
  },
  {
    key: "l2tpv3",
    title: "L2TPv3",
    href: "/network/interfaces/l2tpv3",
    group: "overlay-secure",
    summary: "Pseudowire transport with tunnel/session identifiers and cookies.",
    commonFields: ["Remote Endpoint", "Session IDs", "MTU"],
  },
  {
    key: "macsec",
    title: "MACsec",
    href: "/network/interfaces/macsec",
    group: "overlay-secure",
    summary: "Layer-2 encryption with cipher, MKA/static peers, and replay settings.",
    commonFields: ["Source Interface", "Cipher", "MTU"],
  },
  {
    key: "openvpn",
    title: "OpenVPN",
    href: "/network/interfaces/openvpn",
    group: "overlay-secure",
    summary: "OpenVPN interface mode/server/client settings and crypto controls.",
    commonFields: ["Protocol", "Remote Host", "MTU"],
  },
  {
    key: "pppoe",
    title: "PPPoE Client",
    href: "/network/interfaces/pppoe",
    group: "access-wan",
    summary: "WAN client dialer with authentication and route behavior controls.",
    commonFields: ["Source Interface", "Auth", "Default Route Distance"],
  },
  {
    key: "sstp-client",
    title: "SSTP Client",
    href: "/network/interfaces/sstp-client",
    group: "access-wan",
    summary: "SSTP client tunnels with server/authentication options.",
    commonFields: ["Server", "Auth", "MTU"],
  },
  {
    key: "wireless",
    title: "Wireless",
    href: "/network/interfaces/wireless",
    group: "access-wan",
    summary: "WLAN AP/station mode with SSID, WPA, and HT controls.",
    commonFields: ["SSID", "Mode", "MTU"],
  },
  {
    key: "wwan",
    title: "WWAN",
    href: "/network/interfaces/wwan",
    group: "access-wan",
    summary: "Cellular modem interfaces with APN, DHCP, and MSS controls.",
    commonFields: ["APN", "MTU", "Default Route Distance"],
  },
];

const VLAN_KIND_LABELS: Record<VLANWithParent["kind"], string> = {
  "vif": "802.1Q",
  "vif-s": "QinQ Service",
  "vif-c": "QinQ Customer",
};

const normalizeLinkDetail = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes("unknown")) return undefined;
  if (lower.includes("(255)")) return undefined;
  return trimmed;
};

const isFamilyFilter = (value: string | null): value is InterfaceFamilyFilter => {
  if (!value) return false;
  return INTERFACE_GROUPS.some((group) => group.id === value);
};

function InterfacesPageContent() {
  const searchParams = useSearchParams();
  const [interfaces, setInterfaces] = useState<EthernetInterface[]>([]);
  const [physicalByInterface, setPhysicalByInterface] = useState<Record<string, InterfacePhysical>>({});
  const [capabilities, setCapabilities] = useState<EthernetCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<InterfaceType>("all");

  // Ethernet Modal states
  const [isCreateInterfaceModalOpen, setIsCreateInterfaceModalOpen] = useState(false);
  const [editingInterface, setEditingInterface] = useState<EthernetInterface | null>(null);
  const [deletingInterface, setDeletingInterface] = useState<EthernetInterface | null>(null);

  // VLAN Modal states
  const [isCreateVLANModalOpen, setIsCreateVLANModalOpen] = useState(false);
  const [editingVLAN, setEditingVLAN] = useState<VLANWithParent | null>(null);
  const [deletingVLAN, setDeletingVLAN] = useState<VLANWithParent | null>(null);
  const groupParam = searchParams.get("group");
  const familyFilter: InterfaceFamilyFilter = isFamilyFilter(groupParam) ? groupParam : "all";

  const loadData = async () => {
    try {
      setError(null);
      const [configData, capabilitiesData, physicalData] = await Promise.all([
        ethernetService.getConfig(),
        ethernetService.getCapabilities(),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
      ]);
      setInterfaces(configData.interfaces);
      setCapabilities(capabilitiesData);
      const physicalMap = physicalData.interfaces.reduce<Record<string, InterfacePhysical>>((acc, item) => {
        acc[item.interface] = item;
        return acc;
      }, {});
      setPhysicalByInterface(physicalMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interface data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Extract all VLAN and QinQ subinterfaces from interfaces
  const allVlans: VLANWithParent[] = interfaces
    .flatMap((iface) => {
      const vlans: VLANWithParent[] = [];

      if (iface.vif) {
        iface.vif.forEach((vif) => {
          vlans.push({
            ...vif,
            parentInterface: iface.name,
            fullName: `${iface.name}.${vif.vlan_id}`,
            kind: "vif",
          });
        });
      }

      if (iface.vif_s) {
        iface.vif_s.forEach((vifs) => {
          vlans.push({
            ...vifs,
            parentInterface: iface.name,
            fullName: `${iface.name}.${vifs.vlan_id}`,
            kind: "vif-s",
            service_vlan_id: vifs.vlan_id,
          });

          if (vifs.vif_c) {
            vifs.vif_c.forEach((vifc) => {
              vlans.push({
                ...vifc,
                parentInterface: iface.name,
                fullName: `${iface.name}.${vifs.vlan_id}.${vifc.vlan_id}`,
                kind: "vif-c",
                service_vlan_id: vifs.vlan_id,
              });
            });
          }
        });
      }

      return vlans;
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName, undefined, { numeric: true }));

  // Calculate statistics
  const totalInterfaces = interfaces.length;
  const totalVlans = allVlans.length;

  // Filter interfaces based on type
  const filteredInterfaces = interfaces.filter((iface) => {
    if (typeFilter === "vlan") return false; // Don't show interfaces when VLANs are selected

    const matchesType = typeFilter === "all" || iface.type === typeFilter;
    const matchesSearch =
      searchQuery === "" ||
      iface.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      iface.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      iface.addresses?.some((addr) => addr.toLowerCase().includes(searchQuery.toLowerCase())) ||
      iface.vrf?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesType && matchesSearch;
  });

  // Filter VLANs
  const filteredVlans = allVlans.filter((vlan) => {
    if (typeFilter !== "vlan" && typeFilter !== "all") return false; // Only show VLANs when selected or in "all" mode

    return (
      searchQuery === "" ||
      vlan.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vlan.parentInterface.toLowerCase().includes(searchQuery.toLowerCase()) ||
      VLAN_KIND_LABELS[vlan.kind].toLowerCase().includes(searchQuery.toLowerCase()) ||
      vlan.service_vlan_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vlan.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vlan.addresses?.some((addr) => addr.toLowerCase().includes(searchQuery.toLowerCase())) ||
      vlan.vrf?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const visibleFamilies = useMemo(
    () =>
      INTERFACE_FAMILIES.filter((family) =>
        familyFilter === "all" ? true : family.group === familyFilter,
      ),
    [familyFilter],
  );

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Network Interfaces</h1>
            <p className="text-muted-foreground mt-1">
              Manage and monitor network interface configurations
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.networkInterfaces} />
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Network className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{totalInterfaces}</p>
                  <p className="text-xs text-muted-foreground">Total Interfaces</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Cable className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{totalInterfaces}</p>
                  <p className="text-xs text-muted-foreground">Ethernet</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Network className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{totalVlans}</p>
                  <p className="text-xs text-muted-foreground">VLANs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-destructive">Failed to load interfaces</h3>
              <p className="text-sm text-destructive/90 mt-1">{error}</p>
              <Button variant="outline" size="sm" onClick={loadData} className="mt-3">
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* Consolidated Controls */}
        {!error && (
          <div className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, description, IP address, or VRF..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant={typeFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("all")}
                >
                  All ({totalInterfaces + totalVlans})
                </Button>
                <Button
                  variant={typeFilter === "ethernet" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("ethernet")}
                >
                  Ethernet ({totalInterfaces})
                </Button>
                <Button
                  variant={typeFilter === "vlan" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("vlan")}
                >
                  VLAN ({totalVlans})
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline">
                  <Link href="/network/setup-wizard">Setup Wizard</Link>
                </Button>
                <Button onClick={() => setIsCreateInterfaceModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Interface
                </Button>
                <Button variant="outline" onClick={() => setIsCreateVLANModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create VLAN / QinQ
                </Button>
              </div>
            </div>

            <Card className="border-border">
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Interface Families</h2>
                  <p className="text-sm text-muted-foreground">
                    Manage all interface types from one place, grouped by operational role.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {INTERFACE_GROUPS.map((group) => {
                    const href =
                      group.id === "all" ? "/network/interfaces" : `/network/interfaces?group=${group.id}`;
                    const isActive = familyFilter === group.id;
                    return (
                      <Button key={group.id} asChild variant={isActive ? "default" : "outline"} size="sm">
                        <Link href={href}>{group.label}</Link>
                      </Button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleFamilies.map((family) => (
                    <div
                      key={family.key}
                      className="rounded-lg border border-border bg-card/40 p-3 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h3 className="font-semibold text-foreground">{family.title}</h3>
                          <p className="text-xs text-muted-foreground">{family.summary}</p>
                        </div>
                        <Button asChild variant="ghost" size="sm" className="shrink-0">
                          <Link href={family.href}>
                            Open
                            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {family.commonFields.map((field) => (
                          <Badge key={`${family.key}-${field}`} variant="secondary" className="text-[10px]">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Interface Cards */}
        {!error && (
          <div className="space-y-4 mt-6">
            {/* Ethernet Interfaces */}
            {(typeFilter === "all" || typeFilter === "ethernet") && filteredInterfaces.length > 0 && (
              <div className="space-y-3">
                {typeFilter === "all" && (
                  <h2 className="text-lg font-semibold text-foreground">Ethernet Interfaces</h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredInterfaces.map((iface) => {
                    const qinqCustomerCount = (iface.vif_s || []).reduce((count, serviceVlan) => {
                      return count + (serviceVlan.vif_c?.length || 0);
                    }, 0);
                    const vlanCount = (iface.vif?.length || 0) + (iface.vif_s?.length || 0) + qinqCustomerCount;
                    const physical = physicalByInterface[iface.name];
                    const linkUp = physical?.link_up;
                    const linkSpeed = linkUp === true ? normalizeLinkDetail(physical?.speed) : undefined;
                    const linkDuplex = linkUp === true ? normalizeLinkDetail(physical?.duplex) : undefined;
                    return (
                      <Card key={iface.name} className="border-border hover:border-primary/50 transition-colors group">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                              <Cable className="h-4 w-4 text-blue-500" />
                            </div>
                            <div>
                              {iface.description ? (
                                <div className="font-semibold text-foreground text-base truncate" title={iface.description}>
                                  {iface.description}
                                </div>
                              ) : (
                                <code className="font-semibold font-mono text-foreground text-base">
                                  {iface.name}
                                </code>
                              )}
                              {iface.description && (
                                <code className="text-xs font-mono text-muted-foreground">
                                  {iface.name}
                                </code>
                              )}
                              {vlanCount > 0 && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {vlanCount} VLAN(s)
                                </div>
                              )}
                              </div>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingInterface(iface)}
                                className="h-7 w-7 p-0"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingInterface(iface)}
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2 text-sm">
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className={
                                  linkUp === true
                                    ? "bg-green-500/10 text-green-500 border-green-500/20 text-xs"
                                    : linkUp === false
                                      ? "bg-red-500/10 text-red-500 border-red-500/20 text-xs"
                                      : "bg-muted text-muted-foreground border-border text-xs"
                                }
                              >
                                {linkUp === true ? "Link Up" : linkUp === false ? "Link Down" : "Link Unknown"}
                              </Badge>

                              {linkSpeed && (
                                <Badge variant="outline" className="text-xs">
                                  {linkSpeed}
                                </Badge>
                              )}

                              {linkDuplex && (
                                <Badge variant="outline" className="text-xs">
                                  {linkDuplex}
                                </Badge>
                              )}
                            </div>

                            {(physical?.nic_model || physical?.driver) && (
                              <div className="text-xs text-muted-foreground truncate" title={physical?.nic_model || physical?.driver || ""}>
                                NIC: {physical?.nic_model || physical?.driver}
                              </div>
                            )}

                            {iface.addresses && iface.addresses.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {iface.addresses.slice(0, 2).map((addr, idx) => (
                                  <code
                                    key={idx}
                                    className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent text-foreground"
                                  >
                                    {addr}
                                  </code>
                                ))}
                                {iface.addresses.length > 2 && (
                                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                    +{iface.addresses.length - 2}
                                  </Badge>
                                )}
                              </div>
                            )}

                            <div className="flex flex-wrap gap-2 pt-1">
                              {iface.vrf && (
                                <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20 text-xs">
                                  VRF: {iface.vrf}
                                </Badge>
                              )}
                              {iface.hw_id && (
                                <code className="text-xs font-mono text-muted-foreground">
                                  {iface.hw_id}
                                </code>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VLANs */}
            {(typeFilter === "all" || typeFilter === "vlan") && filteredVlans.length > 0 && (
              <div className="space-y-3">
                {typeFilter === "all" && (
                  <h2 className="text-lg font-semibold text-foreground">VLANs</h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredVlans.map((vlan) => (
                    <Card key={`${vlan.kind}:${vlan.fullName}`} className="border-border hover:border-primary/50 transition-colors group">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                              <Network className="h-4 w-4 text-purple-500" />
                            </div>
                            <div>
                              {vlan.description ? (
                                <div className="font-semibold text-foreground text-base truncate" title={vlan.description}>
                                  {vlan.description}
                                </div>
                              ) : (
                                <code className="font-semibold font-mono text-foreground text-base">
                                  {vlan.fullName}
                                </code>
                              )}
                              {vlan.description && (
                                <code className="text-xs font-mono text-muted-foreground">
                                  {vlan.fullName}
                                </code>
                              )}
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Parent: {vlan.parentInterface} | {VLAN_KIND_LABELS[vlan.kind]}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingVLAN(vlan)}
                              className="h-7 w-7 p-0"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingVLAN(vlan)}
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2 text-sm">
                          {vlan.addresses && vlan.addresses.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {vlan.addresses.slice(0, 2).map((addr, idx) => (
                                <code
                                  key={idx}
                                  className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent text-foreground"
                                >
                                  {addr}
                                </code>
                              ))}
                              {vlan.addresses.length > 2 && (
                                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                  +{vlan.addresses.length - 2}
                                </Badge>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 pt-1">
                            <Badge
                              variant="outline"
                              className="bg-purple-500/10 text-purple-500 border-purple-500/20 text-xs"
                            >
                              {VLAN_KIND_LABELS[vlan.kind]} {vlan.vlan_id}
                            </Badge>
                            {vlan.kind === "vif-c" && vlan.service_vlan_id && (
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">
                                S-Tag: {vlan.service_vlan_id}
                              </Badge>
                            )}
                            {vlan.vrf && (
                              <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20 text-xs">
                                VRF: {vlan.vrf}
                              </Badge>
                            )}
                            {vlan.disable ? (
                              <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">
                                Disabled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
                                Enabled
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {filteredInterfaces.length === 0 && filteredVlans.length === 0 && (
              <Card className="border-border">
                <CardContent className="py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Network className="h-12 w-12 text-muted-foreground/30" />
                    <p className="text-muted-foreground">
                      {searchQuery
                        ? "No interfaces or VLANs found matching your search"
                        : typeFilter === "vlan"
                        ? "No VLANs configured"
                        : "No interfaces configured"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Count */}
            {(filteredInterfaces.length > 0 || filteredVlans.length > 0) && (
              <p className="text-sm text-muted-foreground text-center">
                Showing {filteredInterfaces.length + filteredVlans.length} of {totalInterfaces + totalVlans} item{totalInterfaces + totalVlans !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Ethernet Modals */}
      <ComprehensiveEthernetModal
        open={isCreateInterfaceModalOpen}
        onOpenChange={setIsCreateInterfaceModalOpen}
        mode="create"
        capabilities={capabilities}
        onSuccess={loadData}
      />

      {editingInterface && (
        <ComprehensiveEthernetModal
          open={!!editingInterface}
          onOpenChange={(open) => !open && setEditingInterface(null)}
          mode="edit"
          interface={editingInterface}
          capabilities={capabilities}
          onSuccess={() => {
            setEditingInterface(null);
            loadData();
          }}
        />
      )}

      {deletingInterface && (
        <DeleteEthernetModal
          open={!!deletingInterface}
          onOpenChange={(open) => !open && setDeletingInterface(null)}
          interface={deletingInterface}
          onSuccess={() => {
            setDeletingInterface(null);
            loadData();
          }}
        />
      )}

      {/* VLAN Modals */}
      <ComprehensiveVLANModal
        open={isCreateVLANModalOpen}
        onOpenChange={setIsCreateVLANModalOpen}
        mode="create"
        interfaces={interfaces}
        capabilities={capabilities}
        onSuccess={loadData}
      />

      {editingVLAN && (
        <ComprehensiveVLANModal
          open={!!editingVLAN}
          onOpenChange={(open) => !open && setEditingVLAN(null)}
          mode="edit"
          vlan={editingVLAN}
          interfaces={interfaces}
          capabilities={capabilities}
          onSuccess={() => {
            setEditingVLAN(null);
            loadData();
          }}
        />
      )}

      <DeleteVLANModal
        open={!!deletingVLAN}
        onOpenChange={(open) => !open && setDeletingVLAN(null)}
        vlan={deletingVLAN}
        onSuccess={() => {
          setDeletingVLAN(null);
          loadData();
        }}
      />
    </AppLayout>
  );
}

export default function InterfacesPage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <div className="flex h-96 items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </AppLayout>
      }
    >
      <InterfacesPageContent />
    </Suspense>
  );
}
