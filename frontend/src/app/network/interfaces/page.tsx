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
import {
  Plus,
  RefreshCw,
  AlertCircle,
  Search,
  Cable,
  Pencil,
  Trash2,
  Network,
} from "lucide-react";
import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import type { InterfacePhysical } from "@/lib/api/show";
import type {
  EthernetInterface,
  EthernetCapabilities,
  VLANWithParent,
} from "@/lib/api/types/ethernet";
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
import { bondingService } from "@/lib/api/bonding";
import { bridgeInterfaceService } from "@/lib/api/bridge-interface";
import { geneveService } from "@/lib/api/geneve";
import { l2tpv3Service } from "@/lib/api/l2tpv3";
import { macsecService } from "@/lib/api/macsec";
import { openvpnInterfaceService } from "@/lib/api/openvpn-interface";
import { pseudoEthernetService } from "@/lib/api/pseudo-ethernet";
import { sstpcService } from "@/lib/api/sstpc";
import { virtualEthernetService } from "@/lib/api/virtual-ethernet";
import { wirelessService } from "@/lib/api/wireless";
import { wwanService } from "@/lib/api/wwan";

type InterfaceType = "all" | "ethernet" | "vlan";
type QuickFamily =
  | "ethernet"
  | "vlan"
  | "dummy"
  | "bonding"
  | "bridge"
  | "geneve"
  | "l2tpv3"
  | "loopback"
  | "macsec"
  | "openvpn"
  | "pppoe"
  | "pseudo-ethernet"
  | "sstp-client"
  | "tunnel"
  | "virtual-ethernet"
  | "vti"
  | "vxlan"
  | "wireless"
  | "wwan";
type GenericQuickFamily = Exclude<
  QuickFamily,
  | "ethernet"
  | "vlan"
  | "dummy"
  | "loopback"
  | "pppoe"
  | "vti"
  | "vxlan"
  | "tunnel"
>;

interface AdditionalInterfaceEntry {
  family: string;
  name: string;
  description?: string;
  addresses: string[];
  disabled?: boolean;
}

const QUICK_TUNNEL_ENCAPSULATION_OPTIONS = [
  "gre",
  "gretap",
  "ip6gre",
  "ipip",
  "ipip6",
  "ip6ip6",
  "sit",
] as const;
const QUICK_BONDING_MODE_OPTIONS = [
  "802.3ad",
  "active-backup",
  "balance-alb",
  "balance-rr",
  "balance-tlb",
  "balance-xor",
  "broadcast",
] as const;

const QUICK_FAMILY_OPTIONS: Array<{ key: QuickFamily; label: string }> = [
  { key: "ethernet", label: "Ethernet (Physical)" },
  { key: "vlan", label: "VLAN / QinQ" },
  { key: "dummy", label: "Dummy" },
  { key: "bonding", label: "Bonding" },
  { key: "bridge", label: "Bridge" },
  { key: "geneve", label: "Geneve" },
  { key: "l2tpv3", label: "L2TPv3" },
  { key: "loopback", label: "Loopback" },
  { key: "macsec", label: "MACsec" },
  { key: "openvpn", label: "OpenVPN" },
  { key: "pppoe", label: "PPPoE Client" },
  { key: "pseudo-ethernet", label: "Pseudo-Ethernet" },
  { key: "sstp-client", label: "SSTP Client" },
  { key: "tunnel", label: "Tunnel" },
  { key: "virtual-ethernet", label: "Virtual-Ethernet" },
  { key: "vti", label: "VTI" },
  { key: "vxlan", label: "VXLAN" },
  { key: "wireless", label: "Wireless" },
  { key: "wwan", label: "WWAN" },
];

const GENERIC_FAMILY_TREE: Record<GenericQuickFamily, string> = {
  bonding: "bonding",
  bridge: "bridge",
  geneve: "geneve",
  l2tpv3: "l2tpv3",
  macsec: "macsec",
  openvpn: "openvpn",
  "pseudo-ethernet": "pseudo-ethernet",
  "sstp-client": "sstpc",
  "virtual-ethernet": "virtual-ethernet",
  wireless: "wireless",
  wwan: "wwan",
};

const isGenericQuickFamily = (
  value: QuickFamily | null,
): value is GenericQuickFamily => {
  if (!value) return false;
  return Object.prototype.hasOwnProperty.call(GENERIC_FAMILY_TREE, value);
};

const VLAN_KIND_LABELS: Record<VLANWithParent["kind"], string> = {
  vif: "802.1Q",
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

async function loadAdditionalInterfaceEntries(): Promise<
  AdditionalInterfaceEntry[]
> {
  const [
    bondingConfig,
    bridgeConfig,
    dummyConfig,
    geneveConfig,
    l2tpv3Config,
    loopbackConfig,
    macsecConfig,
    openvpnConfig,
    pppoeConfig,
    pseudoConfig,
    sstpcConfig,
    tunnelConfig,
    virtualEthernetConfig,
    vtiConfig,
    vxlanConfig,
    wirelessConfig,
    wwanConfig,
  ] = await Promise.all([
    bondingService.getConfig().catch(() => ({ bonds: [] })),
    bridgeInterfaceService.getConfig().catch(() => ({ bridges: [] })),
    dummyService.getConfig().catch(() => ({ interfaces: [] })),
    geneveService.getConfig().catch(() => ({ interfaces: [] })),
    l2tpv3Service.getConfig().catch(() => ({ interfaces: [] })),
    loopbackService.getConfig().catch(() => ({ interfaces: [] })),
    macsecService.getConfig().catch(() => ({ interfaces: [] })),
    openvpnInterfaceService.getConfig().catch(() => ({ interfaces: [] })),
    pppoeService.getConfig().catch(() => ({ interfaces: [] })),
    pseudoEthernetService.getConfig().catch(() => ({ interfaces: [] })),
    sstpcService.getConfig().catch(() => ({ interfaces: [] })),
    tunnelInterfaceService.getConfig().catch(() => ({ interfaces: [] })),
    virtualEthernetService.getConfig().catch(() => ({ interfaces: [] })),
    vtiService.getConfig().catch(() => ({ interfaces: [] })),
    vxlanService.getConfig().catch(() => ({ interfaces: [] })),
    wirelessService.getConfig().catch(() => ({ interfaces: [] })),
    wwanService.getConfig().catch(() => ({ interfaces: [] })),
  ]);

  const combined: AdditionalInterfaceEntry[] = [];

  combined.push(
    ...bondingConfig.bonds.map((item) => ({
      family: "Bonding",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...bridgeConfig.bridges.map((item) => ({
      family: "Bridge",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...dummyConfig.interfaces.map((item) => ({
      family: "Dummy",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses || [],
      disabled: item.disable ?? false,
    })),
  );

  combined.push(
    ...geneveConfig.interfaces.map((item) => ({
      family: "Geneve",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...l2tpv3Config.interfaces.map((item) => ({
      family: "L2TPv3",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...loopbackConfig.interfaces.map((item) => ({
      family: "Loopback",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: false,
    })),
  );

  combined.push(
    ...macsecConfig.interfaces.map((item) => ({
      family: "MACsec",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...openvpnConfig.interfaces.map((item) => ({
      family: "OpenVPN",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...pppoeConfig.interfaces.map((item) => ({
      family: "PPPoE",
      name: item.name,
      description: item.description || undefined,
      addresses: [],
      disabled: item.disable,
    })),
  );

  combined.push(
    ...pseudoConfig.interfaces.map((item) => ({
      family: "Pseudo-Ethernet",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...sstpcConfig.interfaces.map((item) => ({
      family: "SSTP",
      name: item.name,
      description: item.description || undefined,
      addresses: [],
      disabled: item.disable,
    })),
  );

  combined.push(
    ...tunnelConfig.interfaces.map((item) => ({
      family: "Tunnel",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...virtualEthernetConfig.interfaces.map((item) => ({
      family: "Virtual-Ethernet",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...vtiConfig.interfaces.map((item) => ({
      family: "VTI",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...vxlanConfig.interfaces.map((item) => ({
      family: "VXLAN",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...wirelessConfig.interfaces.map((item) => ({
      family: "Wireless",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  combined.push(
    ...wwanConfig.interfaces.map((item) => ({
      family: "WWAN",
      name: item.name,
      description: item.description || undefined,
      addresses: item.addresses,
      disabled: item.disable,
    })),
  );

  return combined.sort(
    (left, right) =>
      left.family.localeCompare(right.family, undefined, {
        sensitivity: "base",
      }) ||
      left.name.localeCompare(right.name, undefined, {
        sensitivity: "base",
        numeric: true,
      }),
  );
}

function InterfacesPageContent() {
  const [interfaces, setInterfaces] = useState<EthernetInterface[]>([]);
  const [additionalInterfaces, setAdditionalInterfaces] = useState<
    AdditionalInterfaceEntry[]
  >([]);
  const [physicalByInterface, setPhysicalByInterface] = useState<
    Record<string, InterfacePhysical>
  >({});
  const [capabilities, setCapabilities] = useState<EthernetCapabilities | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<InterfaceType>("all");

  // Ethernet Modal states
  const [isCreateInterfaceModalOpen, setIsCreateInterfaceModalOpen] =
    useState(false);
  const [editingInterface, setEditingInterface] =
    useState<EthernetInterface | null>(null);
  const [deletingInterface, setDeletingInterface] =
    useState<EthernetInterface | null>(null);

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
  const [quickGenericForm, setQuickGenericForm] = useState({
    name: "",
    description: "",
    addressesText: "",
    mtu: "",
    vrf: "",
    disabled: false,
    sourceInterface: "",
    sourceAddress: "",
    remote: "",
    vni: "",
    group: "",
    membersText: "",
    mode: "802.3ad",
    peerName: "",
    server: "",
    username: "",
    password: "",
    apn: "",
    ssid: "",
    wirelessMode: "",
    wirelessType: "",
    physicalDevice: "",
    countryCode: "",
    l2tpSessionId: "",
    l2tpPeerSessionId: "",
    l2tpTunnelId: "",
    l2tpPeerTunnelId: "",
    macsecCipher: "",
    openvpnMode: "client",
    openvpnProtocol: "udp",
    openvpnRemoteHost: "",
    openvpnLocalPort: "",
  });
  const loadData = async () => {
    try {
      setError(null);
      const [configData, capabilitiesData, physicalData, additionalData] =
        await Promise.all([
          ethernetService.getConfig(),
          ethernetService.getCapabilities(),
          showService
            .getInterfacePhysical()
            .catch(() => ({ interfaces: [], total: 0 })),
          loadAdditionalInterfaceEntries().catch(() => []),
        ]);
      setInterfaces(configData.interfaces);
      setCapabilities(capabilitiesData);
      setAdditionalInterfaces(additionalData);
      const physicalMap = physicalData.interfaces.reduce<
        Record<string, InterfacePhysical>
      >((acc, item) => {
        acc[item.interface] = item;
        return acc;
      }, {});
      setPhysicalByInterface(physicalMap);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load interface data",
      );
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
    .sort((left, right) =>
      left.fullName.localeCompare(right.fullName, undefined, { numeric: true }),
    );

  // Calculate statistics
  const totalPhysicalInterfaces = interfaces.length;
  const totalAdditionalInterfaces = additionalInterfaces.length;
  const totalInterfaces = totalPhysicalInterfaces + totalAdditionalInterfaces;
  const totalVlans = allVlans.length;

  // Filter interfaces based on type
  const filteredInterfaces = interfaces.filter((iface) => {
    if (typeFilter === "vlan") return false; // Don't show interfaces when VLANs are selected

    const matchesType = typeFilter === "all" || iface.type === typeFilter;
    const matchesSearch =
      searchQuery === "" ||
      iface.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      iface.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      iface.addresses?.some((addr) =>
        addr.toLowerCase().includes(searchQuery.toLowerCase()),
      ) ||
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
      VLAN_KIND_LABELS[vlan.kind]
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      vlan.service_vlan_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vlan.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vlan.addresses?.some((addr) =>
        addr.toLowerCase().includes(searchQuery.toLowerCase()),
      ) ||
      vlan.vrf?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const filteredAdditionalInterfaces = additionalInterfaces.filter((entry) => {
    if (typeFilter !== "all") return false;
    return (
      searchQuery === "" ||
      entry.family.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.addresses.some((address) =>
        address.toLowerCase().includes(searchQuery.toLowerCase()),
      )
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

  const quickFamilyTitle = useMemo(() => {
    if (!quickFamily) return "Create Interface";
    return (
      QUICK_FAMILY_OPTIONS.find((option) => option.key === quickFamily)
        ?.label ?? "Interface"
    );
  }, [quickFamily]);

  const openQuickEditor = (family: QuickFamily) => {
    setQuickFamily(family);
    setQuickError(null);
    setQuickSuccess(null);
    if (family === "ethernet" || family === "vlan") {
      return;
    }
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
    if (isGenericQuickFamily(family)) {
      setQuickGenericForm({
        name: "",
        description: "",
        addressesText: "",
        mtu: "",
        vrf: "",
        disabled: false,
        sourceInterface: "",
        sourceAddress: "",
        remote: "",
        vni: "",
        group: "",
        membersText: "",
        mode: "802.3ad",
        peerName: "",
        server: "",
        username: "",
        password: "",
        apn: "",
        ssid: "",
        wirelessMode: "",
        wirelessType: "",
        physicalDevice: "",
        countryCode: "",
        l2tpSessionId: "",
        l2tpPeerSessionId: "",
        l2tpTunnelId: "",
        l2tpPeerTunnelId: "",
        macsecCipher: "",
        openvpnMode: "client",
        openvpnProtocol: "udp",
        openvpnRemoteHost: "",
        openvpnLocalPort: "",
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
      if (quickFamily === "ethernet") {
        setQuickFamily(null);
        setIsCreateInterfaceModalOpen(true);
        return;
      } else if (quickFamily === "vlan") {
        setQuickFamily(null);
        setIsCreateVLANModalOpen(true);
        return;
      } else if (quickFamily === "dummy") {
        const name = quickDummyForm.name.trim();
        if (!name) {
          throw new Error("Dummy interface name is required.");
        }

        const operations: DummyBatchOperation[] = [];
        const description = quickDummyForm.description.trim();
        const mtu = quickDummyForm.mtu.trim();
        const vrf = quickDummyForm.vrf.trim();

        if (description)
          operations.push({ op: "set_description", value: description });
        for (const address of parseMultilineUnique(
          quickDummyForm.addressesText,
        )) {
          operations.push({ op: "set_address", value: address });
        }
        if (mtu) operations.push({ op: "set_mtu", value: mtu });
        if (vrf) operations.push({ op: "set_vrf", value: vrf });
        operations.push({ op: quickDummyForm.disabled ? "disable" : "enable" });

        if (operations.length === 1 && operations[0].op === "enable") {
          throw new Error(
            "Provide at least one value (address, description, MTU, or VRF).",
          );
        }

        const response = await dummyService.batchConfigure({
          interface: name,
          operations,
        });
        if (!response.success) {
          throw new Error(
            response.error || "VyOS rejected dummy interface configuration.",
          );
        }
        setQuickSuccess(
          `Dummy interface '${name}' created from Interface Manager.`,
        );
      } else if (quickFamily === "vti") {
        const name = quickVtiForm.name.trim();
        if (!name) {
          throw new Error("VTI interface name is required.");
        }

        const operations: string[] = [];
        const base = `interfaces vti ${quoteCliValue(name)}`;

        const description = quickVtiForm.description.trim();
        if (description) {
          operations.push(
            `set ${base} description ${quoteCliValue(description)}`,
          );
        }

        for (const address of parseMultilineUnique(
          quickVtiForm.addressesText,
        )) {
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
          throw new Error(
            "Provide at least one VTI value (address, description, MTU, VRF, or disable).",
          );
        }

        const response = await vtiService.batchConfigure(operations);
        if (!response.success) {
          throw new Error(
            response.error || "VyOS rejected VTI interface configuration.",
          );
        }
        setQuickSuccess(
          `VTI interface '${name}' created from Interface Manager.`,
        );
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
          operations.push(
            `set ${base} description ${quoteCliValue(description)}`,
          );
        }

        const sourceInterface = quickVxlanForm.sourceInterface.trim();
        if (sourceInterface) {
          operations.push(
            `set ${base} source-interface ${quoteCliValue(sourceInterface)}`,
          );
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
          throw new Error(
            response.error || "VyOS rejected VXLAN interface configuration.",
          );
        }
        setQuickSuccess(
          `VXLAN interface '${name}' created from Interface Manager.`,
        );
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
        operations.push(
          `set ${base} source-address ${quoteCliValue(sourceAddress)}`,
        );
        operations.push(`set ${base} remote ${quoteCliValue(remote)}`);

        const encapsulation = quickTunnelForm.encapsulation.trim();
        if (encapsulation) {
          operations.push(
            `set ${base} encapsulation ${quoteCliValue(encapsulation)}`,
          );
        }

        const description = quickTunnelForm.description.trim();
        if (description) {
          operations.push(
            `set ${base} description ${quoteCliValue(description)}`,
          );
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

        const response =
          await tunnelInterfaceService.batchConfigure(operations);
        if (!response.success) {
          throw new Error(
            response.error || "VyOS rejected tunnel interface configuration.",
          );
        }
        setQuickSuccess(
          `Tunnel interface '${name}' created from Interface Manager.`,
        );
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
        operations.push(
          `set ${base} source-interface ${quoteCliValue(sourceInterface)}`,
        );

        const description = quickPppoeForm.description.trim();
        if (description) {
          operations.push(
            `set ${base} description ${quoteCliValue(description)}`,
          );
        }

        const username = quickPppoeForm.username.trim();
        if (username) {
          operations.push(
            `set ${base} authentication username ${quoteCliValue(username)}`,
          );
        }

        const password = quickPppoeForm.password.trim();
        if (password) {
          operations.push(
            `set ${base} authentication password ${quoteCliValue(password)}`,
          );
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
          operations.push(
            `set ${base} default-route-distance ${quoteCliValue(distance)}`,
          );
        }

        if (quickPppoeForm.disabled) {
          operations.push(`set ${base} disable`);
        }

        const response = await pppoeService.batchConfigure(operations);
        if (!response.success) {
          throw new Error(
            response.error || "VyOS rejected PPPoE interface configuration.",
          );
        }
        setQuickSuccess(
          `PPPoE interface '${name}' created from Interface Manager.`,
        );
      } else if (isGenericQuickFamily(quickFamily)) {
        const name = quickGenericForm.name.trim();
        if (!name) {
          throw new Error("Interface name is required.");
        }

        const operations: string[] = [];
        const base = `interfaces ${GENERIC_FAMILY_TREE[quickFamily]} ${quoteCliValue(name)}`;

        const description = quickGenericForm.description.trim();
        if (description) {
          operations.push(
            `set ${base} description ${quoteCliValue(description)}`,
          );
        }

        for (const address of parseMultilineUnique(
          quickGenericForm.addressesText,
        )) {
          operations.push(`set ${base} address ${quoteCliValue(address)}`);
        }

        const mtu = quickGenericForm.mtu.trim();
        if (mtu) {
          if (!/^\d+$/.test(mtu)) {
            throw new Error("MTU must be a whole number.");
          }
          operations.push(`set ${base} mtu ${quoteCliValue(mtu)}`);
        }

        const vrf = quickGenericForm.vrf.trim();
        if (vrf) {
          operations.push(`set ${base} vrf ${quoteCliValue(vrf)}`);
        }

        if (quickFamily === "bonding") {
          const mode = quickGenericForm.mode.trim();
          if (mode) {
            operations.push(`set ${base} mode ${quoteCliValue(mode)}`);
          }
          for (const member of parseMultilineUnique(
            quickGenericForm.membersText,
          )) {
            operations.push(
              `set ${base} member interface ${quoteCliValue(member)}`,
            );
          }
        } else if (quickFamily === "bridge") {
          for (const member of parseMultilineUnique(
            quickGenericForm.membersText,
          )) {
            operations.push(
              `set ${base} member interface ${quoteCliValue(member)}`,
            );
          }
        } else if (quickFamily === "geneve") {
          const vni = quickGenericForm.vni.trim();
          if (!vni || !/^\d+$/.test(vni)) {
            throw new Error("Geneve VNI is required and must be a number.");
          }
          const remote = quickGenericForm.remote.trim();
          if (!remote) {
            throw new Error("Geneve remote endpoint is required.");
          }
          const sourceAddress = quickGenericForm.sourceAddress.trim();
          const sourceInterface = quickGenericForm.sourceInterface.trim();
          if (!sourceAddress && !sourceInterface) {
            throw new Error("Set Geneve source address or source interface.");
          }
          operations.push(`set ${base} vni ${quoteCliValue(vni)}`);
          operations.push(`set ${base} remote ${quoteCliValue(remote)}`);
          if (sourceAddress) {
            operations.push(
              `set ${base} source-address ${quoteCliValue(sourceAddress)}`,
            );
          }
          if (sourceInterface) {
            operations.push(
              `set ${base} source-interface ${quoteCliValue(sourceInterface)}`,
            );
          }
        } else if (quickFamily === "l2tpv3") {
          const sourceAddress = quickGenericForm.sourceAddress.trim();
          const remote = quickGenericForm.remote.trim();
          if (sourceAddress) {
            operations.push(
              `set ${base} source-address ${quoteCliValue(sourceAddress)}`,
            );
          }
          if (remote) {
            operations.push(`set ${base} remote ${quoteCliValue(remote)}`);
          }
          if (quickGenericForm.l2tpSessionId.trim()) {
            operations.push(
              `set ${base} session-id ${quoteCliValue(quickGenericForm.l2tpSessionId.trim())}`,
            );
          }
          if (quickGenericForm.l2tpPeerSessionId.trim()) {
            operations.push(
              `set ${base} peer-session-id ${quoteCliValue(quickGenericForm.l2tpPeerSessionId.trim())}`,
            );
          }
          if (quickGenericForm.l2tpTunnelId.trim()) {
            operations.push(
              `set ${base} tunnel-id ${quoteCliValue(quickGenericForm.l2tpTunnelId.trim())}`,
            );
          }
          if (quickGenericForm.l2tpPeerTunnelId.trim()) {
            operations.push(
              `set ${base} peer-tunnel-id ${quoteCliValue(quickGenericForm.l2tpPeerTunnelId.trim())}`,
            );
          }
        } else if (quickFamily === "macsec") {
          const sourceInterface = quickGenericForm.sourceInterface.trim();
          if (!sourceInterface) {
            throw new Error("MACsec source interface is required.");
          }
          operations.push(
            `set ${base} source-interface ${quoteCliValue(sourceInterface)}`,
          );
          if (quickGenericForm.macsecCipher.trim()) {
            operations.push(
              `set ${base} security cipher ${quoteCliValue(quickGenericForm.macsecCipher.trim())}`,
            );
          }
        } else if (quickFamily === "openvpn") {
          if (quickGenericForm.openvpnMode.trim()) {
            operations.push(
              `set ${base} mode ${quoteCliValue(quickGenericForm.openvpnMode.trim())}`,
            );
          }
          if (quickGenericForm.openvpnProtocol.trim()) {
            operations.push(
              `set ${base} protocol ${quoteCliValue(quickGenericForm.openvpnProtocol.trim())}`,
            );
          }
          if (quickGenericForm.openvpnRemoteHost.trim()) {
            operations.push(
              `set ${base} remote-host ${quoteCliValue(quickGenericForm.openvpnRemoteHost.trim())}`,
            );
          }
          if (quickGenericForm.openvpnLocalPort.trim()) {
            operations.push(
              `set ${base} local-port ${quoteCliValue(quickGenericForm.openvpnLocalPort.trim())}`,
            );
          }
        } else if (quickFamily === "pseudo-ethernet") {
          const sourceInterface = quickGenericForm.sourceInterface.trim();
          if (!sourceInterface) {
            throw new Error("Pseudo-Ethernet source interface is required.");
          }
          operations.push(
            `set ${base} source-interface ${quoteCliValue(sourceInterface)}`,
          );
        } else if (quickFamily === "sstp-client") {
          const server = quickGenericForm.server.trim();
          if (!server) {
            throw new Error("SSTP server is required.");
          }
          operations.push(`set ${base} server ${quoteCliValue(server)}`);
          if (quickGenericForm.username.trim()) {
            operations.push(
              `set ${base} authentication username ${quoteCliValue(quickGenericForm.username.trim())}`,
            );
          }
          if (quickGenericForm.password.trim()) {
            operations.push(
              `set ${base} authentication password ${quoteCliValue(quickGenericForm.password.trim())}`,
            );
          }
        } else if (quickFamily === "virtual-ethernet") {
          const peerName = quickGenericForm.peerName.trim();
          if (!peerName) {
            throw new Error("Virtual-Ethernet peer name is required.");
          }
          operations.push(`set ${base} peer-name ${quoteCliValue(peerName)}`);
        } else if (quickFamily === "wireless") {
          const ssid = quickGenericForm.ssid.trim();
          if (!ssid) {
            throw new Error("Wireless SSID is required.");
          }
          operations.push(`set ${base} ssid ${quoteCliValue(ssid)}`);
          if (quickGenericForm.wirelessMode.trim()) {
            operations.push(
              `set ${base} mode ${quoteCliValue(quickGenericForm.wirelessMode.trim())}`,
            );
          }
          if (quickGenericForm.wirelessType.trim()) {
            operations.push(
              `set ${base} type ${quoteCliValue(quickGenericForm.wirelessType.trim())}`,
            );
          }
          if (quickGenericForm.physicalDevice.trim()) {
            operations.push(
              `set ${base} physical-device ${quoteCliValue(quickGenericForm.physicalDevice.trim())}`,
            );
          }
          if (quickGenericForm.countryCode.trim()) {
            operations.push(
              `set system wireless country-code ${quoteCliValue(quickGenericForm.countryCode.trim())}`,
            );
          }
        } else if (quickFamily === "wwan") {
          const apn = quickGenericForm.apn.trim();
          if (apn) {
            operations.push(`set ${base} apn ${quoteCliValue(apn)}`);
          }
        }

        if (quickGenericForm.disabled) {
          operations.push(`set ${base} disable`);
        }

        if (operations.length === 0) {
          throw new Error(
            "Provide at least one value to create this interface.",
          );
        }

        const response = (await (() => {
          if (quickFamily === "bonding")
            return bondingService.batchConfigure(operations);
          if (quickFamily === "bridge")
            return bridgeInterfaceService.batchConfigure(operations);
          if (quickFamily === "geneve")
            return geneveService.batchConfigure(operations);
          if (quickFamily === "l2tpv3")
            return l2tpv3Service.batchConfigure(operations);
          if (quickFamily === "macsec")
            return macsecService.batchConfigure(operations);
          if (quickFamily === "openvpn")
            return openvpnInterfaceService.batchConfigure(operations);
          if (quickFamily === "pseudo-ethernet")
            return pseudoEthernetService.batchConfigure(operations);
          if (quickFamily === "sstp-client")
            return sstpcService.batchConfigure(operations);
          if (quickFamily === "virtual-ethernet")
            return virtualEthernetService.batchConfigure(operations);
          if (quickFamily === "wireless")
            return wirelessService.batchConfigure(operations);
          return wwanService.batchConfigure(operations);
        })()) as { success?: boolean; error?: string | null };

        if (!response.success) {
          throw new Error(
            response.error ||
              `VyOS rejected ${quickFamilyTitle} interface configuration.`,
          );
        }
        setQuickSuccess(
          `${quickFamilyTitle} interface '${name}' created from Interface Manager.`,
        );
      } else {
        const name = quickLoopbackForm.name.trim();
        if (!name) {
          throw new Error("Loopback interface name is required.");
        }

        const operations: string[] = [];
        const base = `interfaces loopback ${quoteCliValue(name)}`;
        const description = quickLoopbackForm.description.trim();
        if (description) {
          operations.push(
            `set ${base} description ${quoteCliValue(description)}`,
          );
        }
        for (const address of parseMultilineUnique(
          quickLoopbackForm.addressesText,
        )) {
          operations.push(`set ${base} address ${quoteCliValue(address)}`);
        }
        if (operations.length === 0) {
          throw new Error(
            "Provide at least one value (description or address).",
          );
        }

        const response = await loopbackService.batchConfigure(operations);
        if (!response.success) {
          throw new Error(
            response.error || "VyOS rejected loopback interface configuration.",
          );
        }
        setQuickSuccess(
          `Loopback interface '${name}' created from Interface Manager.`,
        );
      }

      setQuickFamily(null);
    } catch (err) {
      setQuickError(
        err instanceof Error
          ? err.message
          : "Failed to apply quick interface change.",
      );
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
            <h1 className="text-3xl font-bold text-foreground">
              Network Interfaces
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage and monitor network interface configurations
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.networkInterfaces} />
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Network className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {totalInterfaces}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total Interfaces
                  </p>
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
                  <p className="text-2xl font-bold text-foreground">
                    {totalPhysicalInterfaces}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ethernet (Physical)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                  <Network className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {totalAdditionalInterfaces}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Other Families
                  </p>
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
                  <p className="text-2xl font-bold text-foreground">
                    {totalVlans}
                  </p>
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
              <h3 className="font-semibold text-destructive">
                Failed to load interfaces
              </h3>
              <p className="text-sm text-destructive/90 mt-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                className="mt-3"
              >
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
              <h3 className="font-semibold text-destructive">
                Quick Configure Failed
              </h3>
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
                  Ethernet ({totalPhysicalInterfaces})
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
                <Button onClick={() => openQuickEditor("ethernet")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Interface
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Interface Cards */}
        {!error && (
          <div className="space-y-4 mt-6">
            {/* Ethernet Interfaces */}
            {(typeFilter === "all" || typeFilter === "ethernet") &&
              filteredInterfaces.length > 0 && (
                <div className="space-y-3">
                  {typeFilter === "all" && (
                    <h2 className="text-lg font-semibold text-foreground">
                      Ethernet Interfaces
                    </h2>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredInterfaces.map((iface) => {
                      const qinqCustomerCount = (iface.vif_s || []).reduce(
                        (count, serviceVlan) => {
                          return count + (serviceVlan.vif_c?.length || 0);
                        },
                        0,
                      );
                      const vlanCount =
                        (iface.vif?.length || 0) +
                        (iface.vif_s?.length || 0) +
                        qinqCustomerCount;
                      const physical = physicalByInterface[iface.name];
                      const linkUp = physical?.link_up;
                      const linkSpeed =
                        linkUp === true
                          ? normalizeLinkDetail(physical?.speed)
                          : undefined;
                      const linkDuplex =
                        linkUp === true
                          ? normalizeLinkDetail(physical?.duplex)
                          : undefined;
                      return (
                        <Card
                          key={iface.name}
                          className="border-border hover:border-primary/50 transition-colors group"
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                                  <Cable className="h-4 w-4 text-blue-500" />
                                </div>
                                <div>
                                  {iface.description ? (
                                    <div
                                      className="font-semibold text-foreground text-base truncate"
                                      title={iface.description}
                                    >
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
                                  {linkUp === true
                                    ? "Link Up"
                                    : linkUp === false
                                      ? "Link Down"
                                      : "Link Unknown"}
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
                                <div
                                  className="text-xs text-muted-foreground truncate"
                                  title={
                                    physical?.nic_model ||
                                    physical?.driver ||
                                    ""
                                  }
                                >
                                  NIC: {physical?.nic_model || physical?.driver}
                                </div>
                              )}

                              {iface.addresses &&
                                iface.addresses.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {iface.addresses
                                      .slice(0, 2)
                                      .map((addr, idx) => (
                                        <code
                                          key={idx}
                                          className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent text-foreground"
                                        >
                                          {addr}
                                        </code>
                                      ))}
                                    {iface.addresses.length > 2 && (
                                      <Badge
                                        variant="secondary"
                                        className="text-xs px-1.5 py-0"
                                      >
                                        +{iface.addresses.length - 2}
                                      </Badge>
                                    )}
                                  </div>
                                )}

                              <div className="flex flex-wrap gap-2 pt-1">
                                {iface.vrf && (
                                  <Badge
                                    variant="outline"
                                    className="bg-purple-500/10 text-purple-500 border-purple-500/20 text-xs"
                                  >
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
            {(typeFilter === "all" || typeFilter === "vlan") &&
              filteredVlans.length > 0 && (
                <div className="space-y-3">
                  {typeFilter === "all" && (
                    <h2 className="text-lg font-semibold text-foreground">
                      VLANs
                    </h2>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredVlans.map((vlan) => (
                      <Card
                        key={`${vlan.kind}:${vlan.fullName}`}
                        className="border-border hover:border-primary/50 transition-colors group"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                                <Network className="h-4 w-4 text-purple-500" />
                              </div>
                              <div>
                                {vlan.description ? (
                                  <div
                                    className="font-semibold text-foreground text-base truncate"
                                    title={vlan.description}
                                  >
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
                                  Parent: {vlan.parentInterface} |{" "}
                                  {VLAN_KIND_LABELS[vlan.kind]}
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
                                  <Badge
                                    variant="secondary"
                                    className="text-xs px-1.5 py-0"
                                  >
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
                              {vlan.kind === "vif-c" &&
                                vlan.service_vlan_id && (
                                  <Badge
                                    variant="outline"
                                    className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs"
                                  >
                                    S-Tag: {vlan.service_vlan_id}
                                  </Badge>
                                )}
                              {vlan.vrf && (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-500/10 text-purple-500 border-purple-500/20 text-xs"
                                >
                                  VRF: {vlan.vrf}
                                </Badge>
                              )}
                              {vlan.disable ? (
                                <Badge
                                  variant="outline"
                                  className="bg-red-500/10 text-red-500 border-red-500/20 text-xs"
                                >
                                  Disabled
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-green-500/10 text-green-500 border-green-500/20 text-xs"
                                >
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

            {/* Additional Interface Families */}
            {typeFilter === "all" &&
              filteredAdditionalInterfaces.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-foreground">
                    Additional Interface Families
                  </h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredAdditionalInterfaces.map((entry) => (
                      <Card
                        key={`${entry.family}:${entry.name}`}
                        className="border-border"
                      >
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              {entry.description ? (
                                <div
                                  className="font-semibold text-foreground"
                                  title={entry.description}
                                >
                                  {entry.description}
                                </div>
                              ) : (
                                <code className="font-semibold text-foreground">
                                  {entry.name}
                                </code>
                              )}
                              <div className="text-xs text-muted-foreground">
                                {entry.family}{" "}
                                {entry.description ? `(${entry.name})` : ""}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                entry.disabled
                                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                                  : "bg-green-500/10 text-green-500 border-green-500/20"
                              }
                            >
                              {entry.disabled ? "Disabled" : "Enabled"}
                            </Badge>
                          </div>
                          {entry.addresses.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {entry.addresses.slice(0, 2).map((address) => (
                                <code
                                  key={`${entry.family}:${entry.name}:${address}`}
                                  className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent text-foreground"
                                >
                                  {address}
                                </code>
                              ))}
                              {entry.addresses.length > 2 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{entry.addresses.length - 2}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No IP address configured
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

            {/* Empty state */}
            {filteredInterfaces.length === 0 &&
              filteredVlans.length === 0 &&
              filteredAdditionalInterfaces.length === 0 && (
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
            {(filteredInterfaces.length > 0 ||
              filteredVlans.length > 0 ||
              filteredAdditionalInterfaces.length > 0) && (
              <p className="text-sm text-muted-foreground text-center">
                Showing{" "}
                {filteredInterfaces.length +
                  filteredVlans.length +
                  filteredAdditionalInterfaces.length}{" "}
                of {totalInterfaces + totalVlans} item
                {totalInterfaces + totalVlans !== 1 ? "s" : ""}
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
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create {quickFamilyTitle} Interface</DialogTitle>
            <DialogDescription>
              Select an interface type, then fill in the fields needed to create
              it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="quick-family-select">Interface Type</Label>
            <select
              id="quick-family-select"
              value={quickFamily ?? "ethernet"}
              onChange={(event) =>
                openQuickEditor(event.target.value as QuickFamily)
              }
              disabled={quickSaving}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {QUICK_FAMILY_OPTIONS.map((option) => (
                <option key={`quick-family-${option.key}`} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {quickFamily === "ethernet" && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Ethernet creation uses the full physical-interface editor so you
              can select NIC capabilities and hardware-specific options.
            </div>
          )}

          {quickFamily === "vlan" && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              VLAN and QinQ creation uses the dedicated VLAN editor so parent
              interface and tag options are validated.
            </div>
          )}

          {quickFamily === "dummy" && (
            <div className="grid gap-4 py-1">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-dummy-name">Interface Name</Label>
                  <Input
                    id="quick-dummy-name"
                    value={quickDummyForm.name}
                    onChange={(event) =>
                      setQuickDummyForm((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
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
                      setQuickDummyForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
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
                      setQuickDummyForm((previous) => ({
                        ...previous,
                        mtu: event.target.value,
                      }))
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
                      setQuickDummyForm((previous) => ({
                        ...previous,
                        vrf: event.target.value,
                      }))
                    }
                    placeholder="blue"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-dummy-addresses">
                  Addresses (one CIDR per line)
                </Label>
                <Textarea
                  id="quick-dummy-addresses"
                  rows={4}
                  value={quickDummyForm.addressesText}
                  onChange={(event) =>
                    setQuickDummyForm((previous) => ({
                      ...previous,
                      addressesText: event.target.value,
                    }))
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
                    setQuickDummyForm((previous) => ({
                      ...previous,
                      disabled: checked === true,
                    }))
                  }
                  disabled={quickSaving}
                />
                <Label
                  htmlFor="quick-dummy-disable"
                  className="text-sm font-normal"
                >
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
                      setQuickVtiForm((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
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
                      setQuickVtiForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
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
                      setQuickVtiForm((previous) => ({
                        ...previous,
                        mtu: event.target.value,
                      }))
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
                      setQuickVtiForm((previous) => ({
                        ...previous,
                        vrf: event.target.value,
                      }))
                    }
                    placeholder="blue"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-vti-addresses">
                  Addresses (one CIDR per line)
                </Label>
                <Textarea
                  id="quick-vti-addresses"
                  rows={3}
                  value={quickVtiForm.addressesText}
                  onChange={(event) =>
                    setQuickVtiForm((previous) => ({
                      ...previous,
                      addressesText: event.target.value,
                    }))
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
                    setQuickVtiForm((previous) => ({
                      ...previous,
                      disabled: checked === true,
                    }))
                  }
                  disabled={quickSaving}
                />
                <Label
                  htmlFor="quick-vti-disable"
                  className="text-sm font-normal"
                >
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
                      setQuickVxlanForm((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
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
                      setQuickVxlanForm((previous) => ({
                        ...previous,
                        vni: event.target.value,
                      }))
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
                    setQuickVxlanForm((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
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
                      setQuickVxlanForm((previous) => ({
                        ...previous,
                        remote: event.target.value,
                      }))
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
                      setQuickVxlanForm((previous) => ({
                        ...previous,
                        group: event.target.value,
                      }))
                    }
                    placeholder="239.0.0.10"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-vxlan-source">
                    Source Interface (optional)
                  </Label>
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
                      <option
                        key={`quick-vxlan-source-${iface.name}`}
                        value={iface.name}
                      >
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
                      setQuickVxlanForm((previous) => ({
                        ...previous,
                        vrf: event.target.value,
                      }))
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
                      setQuickVxlanForm((previous) => ({
                        ...previous,
                        mtu: event.target.value,
                      }))
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
                      setQuickVxlanForm((previous) => ({
                        ...previous,
                        disabled: checked === true,
                      }))
                    }
                    disabled={quickSaving}
                  />
                  <Label
                    htmlFor="quick-vxlan-disable"
                    className="text-sm font-normal"
                  >
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
                      setQuickTunnelForm((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    placeholder="tun0"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-tunnel-encapsulation">
                    Encapsulation
                  </Label>
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
                      <option
                        key={`quick-tunnel-encap-${option}`}
                        value={option}
                      >
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
                    setQuickTunnelForm((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
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
                      setQuickTunnelForm((previous) => ({
                        ...previous,
                        remote: event.target.value,
                      }))
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
                      setQuickTunnelForm((previous) => ({
                        ...previous,
                        mtu: event.target.value,
                      }))
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
                      setQuickTunnelForm((previous) => ({
                        ...previous,
                        vrf: event.target.value,
                      }))
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
                    setQuickTunnelForm((previous) => ({
                      ...previous,
                      disabled: checked === true,
                    }))
                  }
                  disabled={quickSaving}
                />
                <Label
                  htmlFor="quick-tunnel-disable"
                  className="text-sm font-normal"
                >
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
                      setQuickPppoeForm((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
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
                    setQuickPppoeForm((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                  placeholder="WAN-PPPoE"
                  disabled={quickSaving}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-pppoe-user">
                    Authentication Username
                  </Label>
                  <Input
                    id="quick-pppoe-user"
                    value={quickPppoeForm.username}
                    onChange={(event) =>
                      setQuickPppoeForm((previous) => ({
                        ...previous,
                        username: event.target.value,
                      }))
                    }
                    placeholder="isp-user"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-pppoe-password">
                    Authentication Password
                  </Label>
                  <Input
                    id="quick-pppoe-password"
                    type="password"
                    value={quickPppoeForm.password}
                    onChange={(event) =>
                      setQuickPppoeForm((previous) => ({
                        ...previous,
                        password: event.target.value,
                      }))
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
                      setQuickPppoeForm((previous) => ({
                        ...previous,
                        mtu: event.target.value,
                      }))
                    }
                    placeholder="1492"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-pppoe-distance">
                    Default Route Distance (optional)
                  </Label>
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
                    setQuickPppoeForm((previous) => ({
                      ...previous,
                      disabled: checked === true,
                    }))
                  }
                  disabled={quickSaving}
                />
                <Label
                  htmlFor="quick-pppoe-disable"
                  className="text-sm font-normal"
                >
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
                      setQuickLoopbackForm((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    placeholder="lo10"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-loopback-description">
                    Description
                  </Label>
                  <Input
                    id="quick-loopback-description"
                    value={quickLoopbackForm.description}
                    onChange={(event) =>
                      setQuickLoopbackForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Router ID"
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-loopback-addresses">
                  Addresses (one CIDR per line)
                </Label>
                <Textarea
                  id="quick-loopback-addresses"
                  rows={4}
                  value={quickLoopbackForm.addressesText}
                  onChange={(event) =>
                    setQuickLoopbackForm((previous) => ({
                      ...previous,
                      addressesText: event.target.value,
                    }))
                  }
                  placeholder={"10.255.255.1/32\nfd00:255:255::1/128"}
                  disabled={quickSaving}
                />
              </div>
            </div>
          )}

          {isGenericQuickFamily(quickFamily) && (
            <div className="grid gap-4 py-1">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-name">Interface Name</Label>
                  <Input
                    id="quick-generic-name"
                    value={quickGenericForm.name}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Interface name"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-description">Description</Label>
                  <Input
                    id="quick-generic-description"
                    value={quickGenericForm.description}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Interface description"
                    disabled={quickSaving}
                  />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-mtu">MTU (optional)</Label>
                  <Input
                    id="quick-generic-mtu"
                    value={quickGenericForm.mtu}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        mtu: event.target.value,
                      }))
                    }
                    placeholder="1500"
                    disabled={quickSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-vrf">VRF (optional)</Label>
                  <Input
                    id="quick-generic-vrf"
                    value={quickGenericForm.vrf}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        vrf: event.target.value,
                      }))
                    }
                    placeholder="blue"
                    disabled={quickSaving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-generic-addresses">
                  Addresses (one CIDR per line, optional)
                </Label>
                <Textarea
                  id="quick-generic-addresses"
                  rows={3}
                  value={quickGenericForm.addressesText}
                  onChange={(event) =>
                    setQuickGenericForm((previous) => ({
                      ...previous,
                      addressesText: event.target.value,
                    }))
                  }
                  placeholder={"10.10.10.1/24\nfd00:10::1/64"}
                  disabled={quickSaving}
                />
              </div>

              {(quickFamily === "bonding" || quickFamily === "bridge") && (
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-members">
                    Member Interfaces (one per line)
                  </Label>
                  <Textarea
                    id="quick-generic-members"
                    rows={3}
                    value={quickGenericForm.membersText}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        membersText: event.target.value,
                      }))
                    }
                    placeholder={"eth2\neth3"}
                    disabled={quickSaving}
                  />
                </div>
              )}

              {quickFamily === "bonding" && (
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-mode">Bonding Mode</Label>
                  <select
                    id="quick-generic-mode"
                    value={quickGenericForm.mode}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        mode: event.target.value,
                      }))
                    }
                    disabled={quickSaving}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {QUICK_BONDING_MODE_OPTIONS.map((mode) => (
                      <option key={`quick-bonding-mode-${mode}`} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(quickFamily === "geneve" ||
                quickFamily === "l2tpv3" ||
                quickFamily === "macsec" ||
                quickFamily === "pseudo-ethernet") && (
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-source-interface">
                    Source Interface (optional)
                  </Label>
                  <select
                    id="quick-generic-source-interface"
                    value={quickGenericForm.sourceInterface}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        sourceInterface: event.target.value,
                      }))
                    }
                    disabled={quickSaving}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select source interface</option>
                    {sourceInterfaceOptions.map((iface) => (
                      <option
                        key={`quick-generic-source-${iface.name}`}
                        value={iface.name}
                      >
                        {iface.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(quickFamily === "geneve" || quickFamily === "l2tpv3") && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-source-address">
                      Source Address
                    </Label>
                    <Input
                      id="quick-generic-source-address"
                      value={quickGenericForm.sourceAddress}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          sourceAddress: event.target.value,
                        }))
                      }
                      placeholder="192.0.2.10"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-remote">
                      Remote Endpoint
                    </Label>
                    <Input
                      id="quick-generic-remote"
                      value={quickGenericForm.remote}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          remote: event.target.value,
                        }))
                      }
                      placeholder="198.51.100.20"
                      disabled={quickSaving}
                    />
                  </div>
                </div>
              )}

              {quickFamily === "geneve" && (
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-vni">VNI</Label>
                  <Input
                    id="quick-generic-vni"
                    value={quickGenericForm.vni}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        vni: event.target.value,
                      }))
                    }
                    placeholder="100"
                    disabled={quickSaving}
                  />
                </div>
              )}

              {quickFamily === "l2tpv3" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-l2tp-session">
                      Session ID (optional)
                    </Label>
                    <Input
                      id="quick-generic-l2tp-session"
                      value={quickGenericForm.l2tpSessionId}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          l2tpSessionId: event.target.value,
                        }))
                      }
                      placeholder="100"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-l2tp-peer-session">
                      Peer Session ID (optional)
                    </Label>
                    <Input
                      id="quick-generic-l2tp-peer-session"
                      value={quickGenericForm.l2tpPeerSessionId}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          l2tpPeerSessionId: event.target.value,
                        }))
                      }
                      placeholder="100"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-l2tp-tunnel">
                      Tunnel ID (optional)
                    </Label>
                    <Input
                      id="quick-generic-l2tp-tunnel"
                      value={quickGenericForm.l2tpTunnelId}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          l2tpTunnelId: event.target.value,
                        }))
                      }
                      placeholder="10"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-l2tp-peer-tunnel">
                      Peer Tunnel ID (optional)
                    </Label>
                    <Input
                      id="quick-generic-l2tp-peer-tunnel"
                      value={quickGenericForm.l2tpPeerTunnelId}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          l2tpPeerTunnelId: event.target.value,
                        }))
                      }
                      placeholder="10"
                      disabled={quickSaving}
                    />
                  </div>
                </div>
              )}

              {quickFamily === "macsec" && (
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-macsec-cipher">
                    Cipher (optional)
                  </Label>
                  <Input
                    id="quick-generic-macsec-cipher"
                    value={quickGenericForm.macsecCipher}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        macsecCipher: event.target.value,
                      }))
                    }
                    placeholder="gcm-aes-128"
                    disabled={quickSaving}
                  />
                </div>
              )}

              {quickFamily === "openvpn" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-openvpn-mode">Mode</Label>
                    <Input
                      id="quick-generic-openvpn-mode"
                      value={quickGenericForm.openvpnMode}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          openvpnMode: event.target.value,
                        }))
                      }
                      placeholder="client"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-openvpn-protocol">
                      Protocol
                    </Label>
                    <Input
                      id="quick-generic-openvpn-protocol"
                      value={quickGenericForm.openvpnProtocol}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          openvpnProtocol: event.target.value,
                        }))
                      }
                      placeholder="udp"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-openvpn-remote">
                      Remote Host (optional)
                    </Label>
                    <Input
                      id="quick-generic-openvpn-remote"
                      value={quickGenericForm.openvpnRemoteHost}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          openvpnRemoteHost: event.target.value,
                        }))
                      }
                      placeholder="vpn.example.com"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-openvpn-port">
                      Local Port (optional)
                    </Label>
                    <Input
                      id="quick-generic-openvpn-port"
                      value={quickGenericForm.openvpnLocalPort}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          openvpnLocalPort: event.target.value,
                        }))
                      }
                      placeholder="1194"
                      disabled={quickSaving}
                    />
                  </div>
                </div>
              )}

              {quickFamily === "sstp-client" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="quick-generic-sstp-server">Server</Label>
                    <Input
                      id="quick-generic-sstp-server"
                      value={quickGenericForm.server}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          server: event.target.value,
                        }))
                      }
                      placeholder="vpn.example.com"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-sstp-username">
                      Username (optional)
                    </Label>
                    <Input
                      id="quick-generic-sstp-username"
                      value={quickGenericForm.username}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          username: event.target.value,
                        }))
                      }
                      placeholder="vpn-user"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-sstp-password">
                      Password (optional)
                    </Label>
                    <Input
                      id="quick-generic-sstp-password"
                      type="password"
                      value={quickGenericForm.password}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          password: event.target.value,
                        }))
                      }
                      placeholder="vpn-password"
                      disabled={quickSaving}
                    />
                  </div>
                </div>
              )}

              {quickFamily === "virtual-ethernet" && (
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-peer-name">Peer Name</Label>
                  <Input
                    id="quick-generic-peer-name"
                    value={quickGenericForm.peerName}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        peerName: event.target.value,
                      }))
                    }
                    placeholder="veth-peer0"
                    disabled={quickSaving}
                  />
                </div>
              )}

              {quickFamily === "wireless" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="quick-generic-ssid">SSID</Label>
                    <Input
                      id="quick-generic-ssid"
                      value={quickGenericForm.ssid}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          ssid: event.target.value,
                        }))
                      }
                      placeholder="VyManager-WiFi"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-wireless-mode">
                      Mode (optional)
                    </Label>
                    <Input
                      id="quick-generic-wireless-mode"
                      value={quickGenericForm.wirelessMode}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          wirelessMode: event.target.value,
                        }))
                      }
                      placeholder="g"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-wireless-type">
                      Type (optional)
                    </Label>
                    <Input
                      id="quick-generic-wireless-type"
                      value={quickGenericForm.wirelessType}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          wirelessType: event.target.value,
                        }))
                      }
                      placeholder="station"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-physical-device">
                      Physical Device (optional)
                    </Label>
                    <Input
                      id="quick-generic-physical-device"
                      value={quickGenericForm.physicalDevice}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          physicalDevice: event.target.value,
                        }))
                      }
                      placeholder="wlan0"
                      disabled={quickSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quick-generic-country">
                      Country Code (optional)
                    </Label>
                    <Input
                      id="quick-generic-country"
                      value={quickGenericForm.countryCode}
                      onChange={(event) =>
                        setQuickGenericForm((previous) => ({
                          ...previous,
                          countryCode: event.target.value,
                        }))
                      }
                      placeholder="US"
                      disabled={quickSaving}
                    />
                  </div>
                </div>
              )}

              {quickFamily === "wwan" && (
                <div className="space-y-2">
                  <Label htmlFor="quick-generic-apn">APN (optional)</Label>
                  <Input
                    id="quick-generic-apn"
                    value={quickGenericForm.apn}
                    onChange={(event) =>
                      setQuickGenericForm((previous) => ({
                        ...previous,
                        apn: event.target.value,
                      }))
                    }
                    placeholder="internet"
                    disabled={quickSaving}
                  />
                </div>
              )}

              <div className="flex items-center gap-2 rounded-md border border-border p-2">
                <Checkbox
                  id="quick-generic-disable"
                  checked={quickGenericForm.disabled}
                  onCheckedChange={(checked) =>
                    setQuickGenericForm((previous) => ({
                      ...previous,
                      disabled: checked === true,
                    }))
                  }
                  disabled={quickSaving}
                />
                <Label
                  htmlFor="quick-generic-disable"
                  className="text-sm font-normal"
                >
                  Create interface in disabled state
                </Label>
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
            <Button
              type="button"
              onClick={saveQuickEditor}
              disabled={quickSaving || !quickFamily}
            >
              {quickSaving
                ? "Saving..."
                : quickFamily === "ethernet" || quickFamily === "vlan"
                  ? "Continue"
                  : "Apply"}
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
