"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Plus, RefreshCw, AlertCircle, Search, Cable, Pencil, Trash2, Network } from "lucide-react";
import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import type { InterfacePhysical } from "@/lib/api/show";
import type { EthernetInterface, EthernetCapabilities, VLANWithParent } from "@/lib/api/types/ethernet";
import { pageGuides } from "@/lib/help/pageGuides";
import { ComprehensiveEthernetModal } from "@/components/network/ComprehensiveEthernetModal";
import { ComprehensiveVLANModal } from "@/components/network/ComprehensiveVLANModal";
import { DeleteEthernetModal } from "@/components/network/DeleteEthernetModal";
import { DeleteVLANModal } from "@/components/network/DeleteVLANModal";
import { dummyService, type DummyBatchOperation } from "@/lib/api/dummy";
import { loopbackService } from "@/lib/api/loopback";
import { pppoeService } from "@/lib/api/pppoe";
import { tunnelInterfaceService } from "@/lib/api/tunnel-interface";
import { vtiService } from "@/lib/api/vti";
import { vxlanService } from "@/lib/api/vxlan";

type InterfaceType = "all" | "ethernet" | "vlan";
type InterfaceFamilyGroup = "core-l2" | "overlay-secure" | "access-wan";
type QuickFamily = "dummy" | "loopback" | "pppoe" | "vti" | "vxlan" | "tunnel";

interface InterfaceFamily {
  key: string;
  title: string;
  href: string;
  group: InterfaceFamilyGroup;
  summary: string;
  commonFields: string[];
}

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

const QUICK_TUNNEL_ENCAPSULATION_OPTIONS = ["gre", "gretap", "ip6gre", "ipip", "ipip6", "ip6ip6", "sit"] as const;

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

function parseMultilineUnique(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function InterfacesPageContent() {
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
  const [quickFamily, setQuickFamily] = useState<QuickFamily | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSuccess, setQuickSuccess] = useState<string | null>(null);
  const [quickDummyForm, setQuickDummyForm] = useState({
    name: "",
    description: "",
    addressesText: "",
    mtu: "",
    vrf: "",
    disabled: false,
  });
  const [quickLoopbackForm, setQuickLoopbackForm] = useState({
    name: "",
    description: "",
    addressesText: "",
  });
  const [quickPppoeForm, setQuickPppoeForm] = useState({
    name: "",
    sourceInterface: "",
    description: "",
    username: "",
    password: "",
    mtu: "",
    defaultRouteDistance: "",
    disabled: false,
  });
  const [quickVtiForm, setQuickVtiForm] = useState({
    name: "",
    description: "",
    addressesText: "",
    mtu: "",
    vrf: "",
    disabled: false,
  });
  const [quickVxlanForm, setQuickVxlanForm] = useState({
    name: "",
    description: "",
    vni: "",
    sourceInterface: "",
    remote: "",
    group: "",
    mtu: "",
    vrf: "",
    disabled: false,
  });
  const [quickTunnelForm, setQuickTunnelForm] = useState({
    name: "",
    description: "",
    encapsulation: "gre",
    sourceAddress: "",
    remote: "",
    mtu: "",
    vrf: "",
    disabled: false,
  });
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

  const sourceInterfaceOptions = useMemo(
    () =>
      interfaces
        .map((iface) => {
          const description = iface.description?.trim();
          return {
            name: iface.name,
            label: description ? `${description} (${iface.name})` : iface.name,
          };
        })
        .sort((left, right) => left.label.localeCompare(right.label)),
    [interfaces],
  );

  const quickFamilies = useMemo(
    () =>
      INTERFACE_FAMILIES.filter(
        (family) =>
          family.key === "dummy" ||
          family.key === "loopback" ||
          family.key === "pppoe" ||
          family.key === "tunnel" ||
          family.key === "vti" ||
          family.key === "vxlan",
      ),
    [],
  );

  const openQuickEditor = (family: QuickFamily) => {
    setQuickFamily(family);
    setQuickError(null);
    setQuickSuccess(null);
    if (family === "dummy") {
      setQuickDummyForm({
        name: "",
        description: "",
        addressesText: "",
        mtu: "",
        vrf: "",
        disabled: false,
      });
      return;
    }
    if (family === "pppoe") {
      setQuickPppoeForm({
        name: "",
        sourceInterface: "",
        description: "",
        username: "",
        password: "",
        mtu: "",
        defaultRouteDistance: "",
        disabled: false,
      });
      return;
    }
    if (family === "vti") {
      setQuickVtiForm({
        name: "",
        description: "",
        addressesText: "",
        mtu: "",
        vrf: "",
        disabled: false,
      });
      return;
    }
    if (family === "vxlan") {
      setQuickVxlanForm({
        name: "",
        description: "",
        vni: "",
        sourceInterface: "",
        remote: "",
        group: "",
        mtu: "",
        vrf: "",
        disabled: false,
      });
      return;
    }
    if (family === "tunnel") {
      setQuickTunnelForm({
        name: "",
        description: "",
        encapsulation: "gre",
        sourceAddress: "",
        remote: "",
        mtu: "",
        vrf: "",
        disabled: false,
      });
      return;
    }
    setQuickLoopbackForm({
      name: "",
      description: "",
      addressesText: "",
    });
  };

  const saveQuickEditor = async () => {
    if (!quickFamily) return;

    setQuickSaving(true);
    setQuickError(null);
    setQuickSuccess(null);

    try {
      if (quickFamily === "dummy") {
        const name = quickDummyForm.name.trim();
        if (!name) {
          throw new Error("Dummy interface name is required.");
        }

        const operations: DummyBatchOperation[] = [];
        const description = quickDummyForm.description.trim();
        const mtu = quickDummyForm.mtu.trim();
        const vrf = quickDummyForm.vrf.trim();

        if (description) operations.push({ op: "set_description", value: description });
        for (const address of parseMultilineUnique(quickDummyForm.addressesText)) {
          operations.push({ op: "set_address", value: address });
        }
        if (mtu) operations.push({ op: "set_mtu", value: mtu });
        if (vrf) operations.push({ op: "set_vrf", value: vrf });
        operations.push({ op: quickDummyForm.disabled ? "disable" : "enable" });

        if (operations.length === 1 && operations[0].op === "enable") {
          throw new Error("Provide at least one value (address, description, MTU, or VRF).");
        }

        const response = await dummyService.batchConfigure({
          interface: name,
          operations,
        });
        if (!response.success) {
          throw new Error(response.error || "VyOS rejected dummy interface configuration.");
        }
        setQuickSuccess(`Dummy interface '${name}' created from Interface Manager.`);
      } else if (quickFamily === "vti") {
        const name = quickVtiForm.name.trim();
        if (!name) {
          throw new Error("VTI interface name is required.");
        }

        const operations: string[] = [];
        const base = `interfaces vti ${quoteCliValue(name)}`;

        const description = quickVtiForm.description.trim();
        if (description) {
          operations.push(`set ${base} description ${quoteCliValue(description)}`);
        }

        for (const address of parseMultilineUnique(quickVtiForm.addressesText)) {
          operations.push(`set ${base} address ${quoteCliValue(address)}`);
        }

        const mtu = quickVtiForm.mtu.trim();
        if (mtu) {
          if (!/^\d+$/.test(mtu)) {
            throw new Error("VTI MTU must be a whole number.");
          }
          operations.push(`set ${base} mtu ${quoteCliValue(mtu)}`);
        }

        const vrf = quickVtiForm.vrf.trim();
        if (vrf) {
          operations.push(`set ${base} vrf ${quoteCliValue(vrf)}`);
        }

        if (quickVtiForm.disabled) {
          operations.push(`set ${base} disable`);
        }

        if (operations.length === 0) {
          throw new Error("Provide at least one VTI value (address, description, MTU, VRF, or disable).");
        }

        const response = await vtiService.batchConfigure(operations);
        if (!response.success) {
          throw new Error(response.error || "VyOS rejected VTI interface configuration.");
        }
        setQuickSuccess(`VTI interface '${name}' created from Interface Manager.`);
      } else if (quickFamily === "vxlan") {
        const name = quickVxlanForm.name.trim();
        if (!name) {
          throw new Error("VXLAN interface name is required.");
        }

        const vni = quickVxlanForm.vni.trim();
        if (!vni) {
          throw new Error("VXLAN VNI is required.");
        }
        if (!/^\d+$/.test(vni)) {
          throw new Error("VXLAN VNI must be a whole number.");
        }

        const remote = quickVxlanForm.remote.trim();
        const group = quickVxlanForm.group.trim();
        if (!remote && !group) {
          throw new Error("Set either remote (unicast) or group (multicast).");
        }
        if (remote && group) {
          throw new Error("Use either remote or group, not both.");
        }

        const operations: string[] = [];
        const base = `interfaces vxlan ${quoteCliValue(name)}`;
        operations.push(`set ${base} vni ${quoteCliValue(vni)}`);
        if (remote) {
          operations.push(`set ${base} remote ${quoteCliValue(remote)}`);
        } else {
          operations.push(`set ${base} group ${quoteCliValue(group)}`);
        }

        const description = quickVxlanForm.description.trim();
        if (description) {
          operations.push(`set ${base} description ${quoteCliValue(description)}`);
        }

        const sourceInterface = quickVxlanForm.sourceInterface.trim();
        if (sourceInterface) {
          operations.push(`set ${base} source-interface ${quoteCliValue(sourceInterface)}`);
        }

        const mtu = quickVxlanForm.mtu.trim();
        if (mtu) {
          if (!/^\d+$/.test(mtu)) {
            throw new Error("VXLAN MTU must be a whole number.");
          }
          operations.push(`set ${base} mtu ${quoteCliValue(mtu)}`);
        }

        const vrf = quickVxlanForm.vrf.trim();
        if (vrf) {
          operations.push(`set ${base} vrf ${quoteCliValue(vrf)}`);
        }

        if (quickVxlanForm.disabled) {
          operations.push(`set ${base} disable`);
        }

        const response = await vxlanService.batchConfigure(operations);
        if (!response.success) {
          throw new Error(response.error || "VyOS rejected VXLAN interface configuration.");
        }
        setQuickSuccess(`VXLAN interface '${name}' created from Interface Manager.`);
      } else if (quickFamily === "tunnel") {
        const name = quickTunnelForm.name.trim();
        if (!name) {
          throw new Error("Tunnel interface name is required.");
        }

        const sourceAddress = quickTunnelForm.sourceAddress.trim();
        if (!sourceAddress) {
          throw new Error("Tunnel source address is required.");
        }

        const remote = quickTunnelForm.remote.trim();
        if (!remote) {
          throw new Error("Tunnel remote endpoint is required.");
        }

        const operations: string[] = [];
        const base = `interfaces tunnel ${quoteCliValue(name)}`;
        operations.push(`set ${base} source-address ${quoteCliValue(sourceAddress)}`);
        operations.push(`set ${base} remote ${quoteCliValue(remote)}`);

        const encapsulation = quickTunnelForm.encapsulation.trim();
        if (encapsulation) {
          operations.push(`set ${base} encapsulation ${quoteCliValue(encapsulation)}`);
        }

        const description = quickTunnelForm.description.trim();
        if (description) {
          operations.push(`set ${base} description ${quoteCliValue(description)}`);
        }

        const mtu = quickTunnelForm.mtu.trim();
        if (mtu) {
          if (!/^\d+$/.test(mtu)) {
            throw new Error("Tunnel MTU must be a whole number.");
          }
          operations.push(`set ${base} mtu ${quoteCliValue(mtu)}`);
        }

        const vrf = quickTunnelForm.vrf.trim();
        if (vrf) {
          operations.push(`set ${base} vrf ${quoteCliValue(vrf)}`);
        }

        if (quickTunnelForm.disabled) {
          operations.push(`set ${base} disable`);
        }

        const response = await tunnelInterfaceService.batchConfigure(operations);
        if (!response.success) {
          throw new Error(response.error || "VyOS rejected tunnel interface configuration.");
        }
        setQuickSuccess(`Tunnel interface '${name}' created from Interface Manager.`);
      } else if (quickFamily === "pppoe") {
        const name = quickPppoeForm.name.trim();
        if (!name) {
          throw new Error("PPPoE interface name is required.");
        }

        const sourceInterface = quickPppoeForm.sourceInterface.trim();
        if (!sourceInterface) {
          throw new Error("PPPoE source interface is required.");
        }

        const operations: string[] = [];
        const base = `interfaces pppoe ${quoteCliValue(name)}`;
        operations.push(`set ${base} source-interface ${quoteCliValue(sourceInterface)}`);

        const description = quickPppoeForm.description.trim();
        if (description) {
          operations.push(`set ${base} description ${quoteCliValue(description)}`);
        }

        const username = quickPppoeForm.username.trim();
        if (username) {
          operations.push(`set ${base} authentication username ${quoteCliValue(username)}`);
        }

        const password = quickPppoeForm.password.trim();
        if (password) {
          operations.push(`set ${base} authentication password ${quoteCliValue(password)}`);
        }

        const mtu = quickPppoeForm.mtu.trim();
        if (mtu) {
          if (!/^\d+$/.test(mtu)) {
            throw new Error("PPPoE MTU must be a whole number.");
          }
          operations.push(`set ${base} mtu ${quoteCliValue(mtu)}`);
        }

        const distance = quickPppoeForm.defaultRouteDistance.trim();
        if (distance) {
          if (!/^\d+$/.test(distance)) {
            throw new Error("Default route distance must be a whole number.");
          }
          operations.push(`set ${base} default-route-distance ${quoteCliValue(distance)}`);
        }

        if (quickPppoeForm.disabled) {
          operations.push(`set ${base} disable`);
        }

        const response = await pppoeService.batchConfigure(operations);
        if (!response.success) {
          throw new Error(response.error || "VyOS rejected PPPoE interface configuration.");
        }
        setQuickSuccess(`PPPoE interface '${name}' created from Interface Manager.`);
      } else {
        const name = quickLoopbackForm.name.trim();
        if (!name) {
          throw new Error("Loopback interface name is required.");
        }

        const operations: string[] = [];
        const base = `interfaces loopback ${quoteCliValue(name)}`;
        const description = quickLoopbackForm.description.trim();
        if (description) {
          operations.push(`set ${base} description ${quoteCliValue(description)}`);
        }
        for (const address of parseMultilineUnique(quickLoopbackForm.addressesText)) {
          operations.push(`set ${base} address ${quoteCliValue(address)}`);
        }
        if (operations.length === 0) {
          throw new Error("Provide at least one value (description or address).");
        }

        const response = await loopbackService.batchConfigure(operations);
        if (!response.success) {
          throw new Error(response.error || "VyOS rejected loopback interface configuration.");
        }
        setQuickSuccess(`Loopback interface '${name}' created from Interface Manager.`);
      }

      setQuickFamily(null);
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : "Failed to apply quick interface change.");
    } finally {
      setQuickSaving(false);
    }
  };

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

        {quickError && !error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-destructive">Quick Configure Failed</h3>
              <p className="text-sm text-destructive/90 mt-1">{quickError}</p>
            </div>
          </div>
        )}

        {quickSuccess && !error && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {quickSuccess}
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
                  <Link href="/network/setup-wizard">Open Setup Wizard</Link>
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
                  <h2 className="text-base font-semibold text-foreground">Common Interface Actions</h2>
                  <p className="text-sm text-muted-foreground">
                    Quick-create common interface families from this page. Advanced family configuration is available from the left sidebar.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {quickFamilies.map((family) => {
                    return (
                    <div
                      key={family.key}
                      className="rounded-lg border border-border bg-card/40 p-3 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h3 className="font-semibold text-foreground">{family.title}</h3>
                          <p className="text-xs text-muted-foreground">{family.summary}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => openQuickEditor(family.key as QuickFamily)}
                        >
                          Quick Add
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
                  );
                  })}
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

      {/* Quick Configure Modal */}
      <Dialog
        open={Boolean(quickFamily)}
        onOpenChange={(open) => {
          if (!open) {
            setQuickFamily(null);
            setQuickError(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {quickFamily === "dummy"
                ? "Quick Add Dummy Interface"
                : quickFamily === "vti"
                  ? "Quick Add VTI Interface"
                : quickFamily === "vxlan"
                  ? "Quick Add VXLAN Interface"
                : quickFamily === "tunnel"
                  ? "Quick Add Tunnel Interface"
                : quickFamily === "pppoe"
                  ? "Quick Add PPPoE Interface"
                : quickFamily === "loopback"
                  ? "Quick Add Loopback Interface"
                  : "Quick Configure Interface"}
            </DialogTitle>
            <DialogDescription>
              Quick configure from the unified manager. Use the full page for advanced options.
            </DialogDescription>
          </DialogHeader>

          {quickFamily === "dummy" && (
            <div className="grid gap-4 py-1">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-dummy-name">Interface Name</Label>
                  <Input
                    id="quick-dummy-name"
                    value={quickDummyForm.name}
                    onChange={(event) =>
                      setQuickDummyForm((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="dum0"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-dummy-description">Description</Label>
                  <Input
                    id="quick-dummy-description"
                    value={quickDummyForm.description}
                    onChange={(event) =>
                      setQuickDummyForm((previous) => ({ ...previous, description: event.target.value }))
                    }
                    placeholder="Service loopback"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-dummy-mtu">MTU (optional)</Label>
                  <Input
                    id="quick-dummy-mtu"
                    value={quickDummyForm.mtu}
                    onChange={(event) =>
                      setQuickDummyForm((previous) => ({ ...previous, mtu: event.target.value }))
                    }
                    placeholder="1500"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-dummy-vrf">VRF (optional)</Label>
                  <Input
                    id="quick-dummy-vrf"
                    value={quickDummyForm.vrf}
                    onChange={(event) =>
                      setQuickDummyForm((previous) => ({ ...previous, vrf: event.target.value }))
                    }
                    placeholder="blue"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-dummy-addresses">Addresses (one CIDR per line)</Label>
                <Textarea
                  id="quick-dummy-addresses"
                  rows={4}
                  value={quickDummyForm.addressesText}
                  onChange={(event) =>
                    setQuickDummyForm((previous) => ({ ...previous, addressesText: event.target.value }))
                  }
                  placeholder={"10.10.10.1/32\nfd00:10:10::1/128"}
                  disabled={quickSaving}
                />
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border p-2">
                <Checkbox
                  id="quick-dummy-disable"
                  checked={quickDummyForm.disabled}
                  onCheckedChange={(checked) =>
                    setQuickDummyForm((previous) => ({ ...previous, disabled: checked === true }))
                  }
                  disabled={quickSaving}
                />
                <Label htmlFor="quick-dummy-disable" className="text-sm font-normal">
                  Create interface in disabled state
                </Label>
              </div>
            </div>
          )}

          {quickFamily === "vti" && (
            <div className="grid gap-4 py-1">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-vti-name">Interface Name</Label>
                  <Input
                    id="quick-vti-name"
                    value={quickVtiForm.name}
                    onChange={(event) =>
                      setQuickVtiForm((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="vti0"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-vti-description">Description</Label>
                  <Input
                    id="quick-vti-description"
                    value={quickVtiForm.description}
                    onChange={(event) =>
                      setQuickVtiForm((previous) => ({ ...previous, description: event.target.value }))
                    }
                    placeholder="IPsec-VTI"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-vti-mtu">MTU (optional)</Label>
                  <Input
                    id="quick-vti-mtu"
                    value={quickVtiForm.mtu}
                    onChange={(event) =>
                      setQuickVtiForm((previous) => ({ ...previous, mtu: event.target.value }))
                    }
                    placeholder="1436"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-vti-vrf">VRF (optional)</Label>
                  <Input
                    id="quick-vti-vrf"
                    value={quickVtiForm.vrf}
                    onChange={(event) =>
                      setQuickVtiForm((previous) => ({ ...previous, vrf: event.target.value }))
                    }
                    placeholder="blue"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-vti-addresses">Addresses (one CIDR per line)</Label>
                <Textarea
                  id="quick-vti-addresses"
                  rows={3}
                  value={quickVtiForm.addressesText}
                  onChange={(event) =>
                    setQuickVtiForm((previous) => ({ ...previous, addressesText: event.target.value }))
                  }
                  placeholder={"10.255.10.1/30\nfd00:10:255::1/64"}
                  disabled={quickSaving}
                />
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border p-2">
                <Checkbox
                  id="quick-vti-disable"
                  checked={quickVtiForm.disabled}
                  onCheckedChange={(checked) =>
                    setQuickVtiForm((previous) => ({ ...previous, disabled: checked === true }))
                  }
                  disabled={quickSaving}
                />
                <Label htmlFor="quick-vti-disable" className="text-sm font-normal">
                  Create interface in disabled state
                </Label>
              </div>
            </div>
          )}

          {quickFamily === "vxlan" && (
            <div className="grid gap-4 py-1">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-vxlan-name">Interface Name</Label>
                  <Input
                    id="quick-vxlan-name"
                    value={quickVxlanForm.name}
                    onChange={(event) =>
                      setQuickVxlanForm((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="vxlan10"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-vxlan-vni">VNI</Label>
                  <Input
                    id="quick-vxlan-vni"
                    value={quickVxlanForm.vni}
                    onChange={(event) =>
                      setQuickVxlanForm((previous) => ({ ...previous, vni: event.target.value }))
                    }
                    placeholder="10"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-vxlan-description">Description</Label>
                <Input
                  id="quick-vxlan-description"
                  value={quickVxlanForm.description}
                  onChange={(event) =>
                    setQuickVxlanForm((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="Overlay Segment 10"
                  disabled={quickSaving}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-vxlan-remote">Remote (Unicast)</Label>
                  <Input
                    id="quick-vxlan-remote"
                    value={quickVxlanForm.remote}
                    onChange={(event) =>
                      setQuickVxlanForm((previous) => ({ ...previous, remote: event.target.value }))
                    }
                    placeholder="203.0.113.10"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-vxlan-group">Group (Multicast)</Label>
                  <Input
                    id="quick-vxlan-group"
                    value={quickVxlanForm.group}
                    onChange={(event) =>
                      setQuickVxlanForm((previous) => ({ ...previous, group: event.target.value }))
                    }
                    placeholder="239.0.0.10"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-vxlan-source">Source Interface (optional)</Label>
                  <select
                    id="quick-vxlan-source"
                    value={quickVxlanForm.sourceInterface}
                    onChange={(event) =>
                      setQuickVxlanForm((previous) => ({
                        ...previous,
                        sourceInterface: event.target.value,
                      }))
                    }
                    disabled={quickSaving}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select source interface</option>
                    {sourceInterfaceOptions.map((iface) => (
                      <option key={`quick-vxlan-source-${iface.name}`} value={iface.name}>
                        {iface.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-vxlan-vrf">VRF (optional)</Label>
                  <Input
                    id="quick-vxlan-vrf"
                    value={quickVxlanForm.vrf}
                    onChange={(event) =>
                      setQuickVxlanForm((previous) => ({ ...previous, vrf: event.target.value }))
                    }
                    placeholder="blue"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-vxlan-mtu">MTU (optional)</Label>
                  <Input
                    id="quick-vxlan-mtu"
                    value={quickVxlanForm.mtu}
                    onChange={(event) =>
                      setQuickVxlanForm((previous) => ({ ...previous, mtu: event.target.value }))
                    }
                    placeholder="1500"
                    disabled={quickSaving}
                  />
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border p-2 md:mt-7">
                  <Checkbox
                    id="quick-vxlan-disable"
                    checked={quickVxlanForm.disabled}
                    onCheckedChange={(checked) =>
                      setQuickVxlanForm((previous) => ({ ...previous, disabled: checked === true }))
                    }
                    disabled={quickSaving}
                  />
                  <Label htmlFor="quick-vxlan-disable" className="text-sm font-normal">
                    Create interface in disabled state
                  </Label>
                </div>
              </div>
            </div>
          )}

          {quickFamily === "tunnel" && (
            <div className="grid gap-4 py-1">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-tunnel-name">Interface Name</Label>
                  <Input
                    id="quick-tunnel-name"
                    value={quickTunnelForm.name}
                    onChange={(event) =>
                      setQuickTunnelForm((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="tun0"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-tunnel-encapsulation">Encapsulation</Label>
                  <select
                    id="quick-tunnel-encapsulation"
                    value={quickTunnelForm.encapsulation}
                    onChange={(event) =>
                      setQuickTunnelForm((previous) => ({
                        ...previous,
                        encapsulation: event.target.value,
                      }))
                    }
                    disabled={quickSaving}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {QUICK_TUNNEL_ENCAPSULATION_OPTIONS.map((option) => (
                      <option key={`quick-tunnel-encap-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-tunnel-description">Description</Label>
                <Input
                  id="quick-tunnel-description"
                  value={quickTunnelForm.description}
                  onChange={(event) =>
                    setQuickTunnelForm((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="GRE to branch"
                  disabled={quickSaving}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-tunnel-source">Source Address</Label>
                  <Input
                    id="quick-tunnel-source"
                    value={quickTunnelForm.sourceAddress}
                    onChange={(event) =>
                      setQuickTunnelForm((previous) => ({
                        ...previous,
                        sourceAddress: event.target.value,
                      }))
                    }
                    placeholder="192.0.2.10"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-tunnel-remote">Remote Endpoint</Label>
                  <Input
                    id="quick-tunnel-remote"
                    value={quickTunnelForm.remote}
                    onChange={(event) =>
                      setQuickTunnelForm((previous) => ({ ...previous, remote: event.target.value }))
                    }
                    placeholder="198.51.100.20"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-tunnel-mtu">MTU (optional)</Label>
                  <Input
                    id="quick-tunnel-mtu"
                    value={quickTunnelForm.mtu}
                    onChange={(event) =>
                      setQuickTunnelForm((previous) => ({ ...previous, mtu: event.target.value }))
                    }
                    placeholder="1476"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-tunnel-vrf">VRF (optional)</Label>
                  <Input
                    id="quick-tunnel-vrf"
                    value={quickTunnelForm.vrf}
                    onChange={(event) =>
                      setQuickTunnelForm((previous) => ({ ...previous, vrf: event.target.value }))
                    }
                    placeholder="blue"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border p-2">
                <Checkbox
                  id="quick-tunnel-disable"
                  checked={quickTunnelForm.disabled}
                  onCheckedChange={(checked) =>
                    setQuickTunnelForm((previous) => ({ ...previous, disabled: checked === true }))
                  }
                  disabled={quickSaving}
                />
                <Label htmlFor="quick-tunnel-disable" className="text-sm font-normal">
                  Create interface in disabled state
                </Label>
              </div>
            </div>
          )}

          {quickFamily === "pppoe" && (
            <div className="grid gap-4 py-1">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-pppoe-name">Interface Name</Label>
                  <Input
                    id="quick-pppoe-name"
                    value={quickPppoeForm.name}
                    onChange={(event) =>
                      setQuickPppoeForm((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="pppoe0"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-pppoe-source">Source Interface</Label>
                  <select
                    id="quick-pppoe-source"
                    value={quickPppoeForm.sourceInterface}
                    onChange={(event) =>
                      setQuickPppoeForm((previous) => ({
                        ...previous,
                        sourceInterface: event.target.value,
                      }))
                    }
                    disabled={quickSaving}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select source interface</option>
                    {sourceInterfaceOptions.map((iface) => (
                      <option key={iface.name} value={iface.name}>
                        {iface.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-pppoe-description">Description</Label>
                <Input
                  id="quick-pppoe-description"
                  value={quickPppoeForm.description}
                  onChange={(event) =>
                    setQuickPppoeForm((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="WAN-PPPoE"
                  disabled={quickSaving}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-pppoe-user">Authentication Username</Label>
                  <Input
                    id="quick-pppoe-user"
                    value={quickPppoeForm.username}
                    onChange={(event) =>
                      setQuickPppoeForm((previous) => ({ ...previous, username: event.target.value }))
                    }
                    placeholder="isp-user"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-pppoe-password">Authentication Password</Label>
                  <Input
                    id="quick-pppoe-password"
                    type="password"
                    value={quickPppoeForm.password}
                    onChange={(event) =>
                      setQuickPppoeForm((previous) => ({ ...previous, password: event.target.value }))
                    }
                    placeholder="isp-password"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-pppoe-mtu">MTU (optional)</Label>
                  <Input
                    id="quick-pppoe-mtu"
                    value={quickPppoeForm.mtu}
                    onChange={(event) =>
                      setQuickPppoeForm((previous) => ({ ...previous, mtu: event.target.value }))
                    }
                    placeholder="1492"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-pppoe-distance">Default Route Distance (optional)</Label>
                  <Input
                    id="quick-pppoe-distance"
                    value={quickPppoeForm.defaultRouteDistance}
                    onChange={(event) =>
                      setQuickPppoeForm((previous) => ({
                        ...previous,
                        defaultRouteDistance: event.target.value,
                      }))
                    }
                    placeholder="1"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border p-2">
                <Checkbox
                  id="quick-pppoe-disable"
                  checked={quickPppoeForm.disabled}
                  onCheckedChange={(checked) =>
                    setQuickPppoeForm((previous) => ({ ...previous, disabled: checked === true }))
                  }
                  disabled={quickSaving}
                />
                <Label htmlFor="quick-pppoe-disable" className="text-sm font-normal">
                  Create interface in disabled state
                </Label>
              </div>
            </div>
          )}

          {quickFamily === "loopback" && (
            <div className="grid gap-4 py-1">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-loopback-name">Interface Name</Label>
                  <Input
                    id="quick-loopback-name"
                    value={quickLoopbackForm.name}
                    onChange={(event) =>
                      setQuickLoopbackForm((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="lo10"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-loopback-description">Description</Label>
                  <Input
                    id="quick-loopback-description"
                    value={quickLoopbackForm.description}
                    onChange={(event) =>
                      setQuickLoopbackForm((previous) => ({ ...previous, description: event.target.value }))
                    }
                    placeholder="Router ID"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-loopback-addresses">Addresses (one CIDR per line)</Label>
                <Textarea
                  id="quick-loopback-addresses"
                  rows={4}
                  value={quickLoopbackForm.addressesText}
                  onChange={(event) =>
                    setQuickLoopbackForm((previous) => ({ ...previous, addressesText: event.target.value }))
                  }
                  placeholder={"10.255.255.1/32\nfd00:255:255::1/128"}
                  disabled={quickSaving}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuickFamily(null)}
              disabled={quickSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveQuickEditor} disabled={quickSaving || !quickFamily}>
              {quickSaving ? "Saving..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
