"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { ethernetService } from "@/lib/api/ethernet";
import { routeMapService } from "@/lib/api/route-map";
import { showService } from "@/lib/api/show";
import { vrfService } from "@/lib/api/vrf";
import { FeatureGroup } from "@/lib/api/user-management";
import { usePermissions } from "@/hooks/usePermissions";
import { formatInterfaceDisplayName } from "@/lib/utils";

type VrfEntry = {
  name: string;
  table: string;
  description: string;
};

type VrfRouteEntry = {
  vrf: string;
  destination: string;
  interface: string;
  targetVrf: string;
  nextHop: string;
};

type L3vpnAddressFamily = "ipv4-unicast" | "ipv6-unicast";

type VrfL3vpnEntry = {
  vrf: string;
  addressFamily: L3vpnAddressFamily;
  rdVpnExport: string;
  routeTargetImport: string;
  routeTargetExport: string;
  routeTargetBoth: string;
  labelVpnExport: string;
  labelVpnAllocationModePerNexthop: boolean;
  importVpn: boolean;
  exportVpn: boolean;
  importVrf: string;
  routeMapVpnImport: string;
  routeMapVpnExport: string;
  routeMapVrfImport: string;
};

type VrfMplsForwardingEntry = {
  vrf: string;
  interface: string;
};

const EMPTY_VRF_DRAFT: VrfEntry = {
  name: "",
  table: "",
  description: "",
};

const EMPTY_ROUTE_DRAFT: VrfRouteEntry = {
  vrf: "",
  destination: "",
  interface: "",
  targetVrf: "",
  nextHop: "",
};

const EMPTY_L3VPN_DRAFT: VrfL3vpnEntry = {
  vrf: "",
  addressFamily: "ipv4-unicast",
  rdVpnExport: "",
  routeTargetImport: "",
  routeTargetExport: "",
  routeTargetBoth: "",
  labelVpnExport: "",
  labelVpnAllocationModePerNexthop: false,
  importVpn: false,
  exportVpn: false,
  importVrf: "",
  routeMapVpnImport: "",
  routeMapVpnExport: "",
  routeMapVrfImport: "",
};

const EMPTY_MPLS_FORWARDING_DRAFT: VrfMplsForwardingEntry = {
  vrf: "",
  interface: "",
};

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeCsvList(value: string): string[] {
  return [...new Set(
    value
      .split(/[,\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function normalizeNumericOrAuto(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (normalized.toLowerCase() === "auto") return "auto";
  return normalized;
}

function listToInputString(values: string[]): string {
  return values.join(", ");
}

function routeKey(route: VrfRouteEntry): string {
  return `${route.vrf}\u001f${route.destination}\u001f${route.interface}`;
}

function l3vpnKey(entry: VrfL3vpnEntry): string {
  return `${entry.vrf}\u001f${entry.addressFamily}`;
}

function mplsForwardingKey(entry: VrfMplsForwardingEntry): string {
  return `${entry.vrf}\u001f${entry.interface}`;
}

function vrfEqual(left: VrfEntry, right: VrfEntry): boolean {
  return (
    left.name === right.name &&
    left.table === right.table &&
    left.description === right.description
  );
}

function routeEqual(left: VrfRouteEntry, right: VrfRouteEntry): boolean {
  return (
    left.vrf === right.vrf &&
    left.destination === right.destination &&
    left.interface === right.interface &&
    left.targetVrf === right.targetVrf &&
    left.nextHop === right.nextHop
  );
}

function normalizedL3vpnEntry(entry: VrfL3vpnEntry): VrfL3vpnEntry {
  return {
    vrf: normalizeText(entry.vrf),
    addressFamily: entry.addressFamily,
    rdVpnExport: normalizeText(entry.rdVpnExport),
    routeTargetImport: listToInputString(normalizeCsvList(entry.routeTargetImport)),
    routeTargetExport: listToInputString(normalizeCsvList(entry.routeTargetExport)),
    routeTargetBoth: listToInputString(normalizeCsvList(entry.routeTargetBoth)),
    labelVpnExport: normalizeNumericOrAuto(entry.labelVpnExport),
    labelVpnAllocationModePerNexthop: Boolean(entry.labelVpnAllocationModePerNexthop),
    importVpn: Boolean(entry.importVpn),
    exportVpn: Boolean(entry.exportVpn),
    importVrf: listToInputString(normalizeCsvList(entry.importVrf)),
    routeMapVpnImport: normalizeText(entry.routeMapVpnImport),
    routeMapVpnExport: normalizeText(entry.routeMapVpnExport),
    routeMapVrfImport: normalizeText(entry.routeMapVrfImport),
  };
}

function l3vpnEqual(left: VrfL3vpnEntry, right: VrfL3vpnEntry): boolean {
  const normalizedLeft = normalizedL3vpnEntry(left);
  const normalizedRight = normalizedL3vpnEntry(right);

  return (
    normalizedLeft.vrf === normalizedRight.vrf &&
    normalizedLeft.addressFamily === normalizedRight.addressFamily &&
    normalizedLeft.rdVpnExport === normalizedRight.rdVpnExport &&
    normalizedLeft.routeTargetImport === normalizedRight.routeTargetImport &&
    normalizedLeft.routeTargetExport === normalizedRight.routeTargetExport &&
    normalizedLeft.routeTargetBoth === normalizedRight.routeTargetBoth &&
    normalizedLeft.labelVpnExport === normalizedRight.labelVpnExport &&
    normalizedLeft.labelVpnAllocationModePerNexthop === normalizedRight.labelVpnAllocationModePerNexthop &&
    normalizedLeft.importVpn === normalizedRight.importVpn &&
    normalizedLeft.exportVpn === normalizedRight.exportVpn &&
    normalizedLeft.importVrf === normalizedRight.importVrf &&
    normalizedLeft.routeMapVpnImport === normalizedRight.routeMapVpnImport &&
    normalizedLeft.routeMapVpnExport === normalizedRight.routeMapVpnExport &&
    normalizedLeft.routeMapVrfImport === normalizedRight.routeMapVrfImport
  );
}

function mplsForwardingEqual(left: VrfMplsForwardingEntry, right: VrfMplsForwardingEntry): boolean {
  return left.vrf === right.vrf && left.interface === right.interface;
}

function hasL3vpnData(entry: VrfL3vpnEntry): boolean {
  return Boolean(
    normalizeText(entry.rdVpnExport) ||
      normalizeText(entry.routeTargetImport) ||
      normalizeText(entry.routeTargetExport) ||
      normalizeText(entry.routeTargetBoth) ||
      normalizeText(entry.labelVpnExport) ||
      entry.labelVpnAllocationModePerNexthop ||
      entry.importVpn ||
      entry.exportVpn ||
      normalizeText(entry.importVrf) ||
      normalizeText(entry.routeMapVpnImport) ||
      normalizeText(entry.routeMapVpnExport) ||
      normalizeText(entry.routeMapVrfImport)
  );
}

function sortedByName(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function sortL3vpnEntries(entries: VrfL3vpnEntry[]): VrfL3vpnEntry[] {
  return [...entries].sort((left, right) => {
    const vrfCompare = left.vrf.localeCompare(right.vrf, undefined, { numeric: true });
    if (vrfCompare !== 0) return vrfCompare;
    return left.addressFamily.localeCompare(right.addressFamily, undefined, { numeric: true });
  });
}

function sortMplsForwardingEntries(entries: VrfMplsForwardingEntry[]): VrfMplsForwardingEntry[] {
  return [...entries].sort((left, right) => {
    const vrfCompare = left.vrf.localeCompare(right.vrf, undefined, { numeric: true });
    if (vrfCompare !== 0) return vrfCompare;
    return left.interface.localeCompare(right.interface, undefined, { numeric: true });
  });
}

function normalizeSection(value: string | null): "core" | "l3vpn" {
  if (value === "l3vpn") return "l3vpn";
  return "core";
}

function buildL3vpnOperations(
  currentEntry: VrfL3vpnEntry | undefined,
  desiredEntry: VrfL3vpnEntry
): string[] {
  const operations: string[] = [];
  const base = `vrf name ${desiredEntry.vrf} protocols bgp address-family ${desiredEntry.addressFamily}`;

  const currentNormalized = currentEntry ? normalizedL3vpnEntry(currentEntry) : undefined;
  const desiredNormalized = normalizedL3vpnEntry(desiredEntry);

  const setOrDeleteLeaf = (leaf: string, desiredValue: string, currentValue = "") => {
    if (desiredValue === currentValue) return;
    if (desiredValue) {
      operations.push(`set ${base} ${leaf} ${desiredValue}`);
    } else if (currentValue) {
      operations.push(`delete ${base} ${leaf}`);
    }
  };

  setOrDeleteLeaf(
    "rd vpn export",
    desiredNormalized.rdVpnExport,
    currentNormalized?.rdVpnExport ?? ""
  );
  setOrDeleteLeaf(
    "label vpn export",
    desiredNormalized.labelVpnExport,
    currentNormalized?.labelVpnExport ?? ""
  );

  const syncListLeaf = (
    leaf: string,
    desiredRaw: string,
    currentRaw = ""
  ) => {
    const desiredList = normalizeCsvList(desiredRaw);
    const currentList = normalizeCsvList(currentRaw);
    const unchanged =
      desiredList.length === currentList.length &&
      desiredList.every((value, index) => value === currentList[index]);
    if (unchanged) return;

    if (currentList.length > 0) {
      operations.push(`delete ${base} ${leaf}`);
    }
    for (const value of desiredList) {
      operations.push(`set ${base} ${leaf} ${value}`);
    }
  };

  syncListLeaf(
    "route-target vpn import",
    desiredNormalized.routeTargetImport,
    currentNormalized?.routeTargetImport ?? ""
  );
  syncListLeaf(
    "route-target vpn export",
    desiredNormalized.routeTargetExport,
    currentNormalized?.routeTargetExport ?? ""
  );
  syncListLeaf(
    "route-target vpn both",
    desiredNormalized.routeTargetBoth,
    currentNormalized?.routeTargetBoth ?? ""
  );
  syncListLeaf("import vrf", desiredNormalized.importVrf, currentNormalized?.importVrf ?? "");

  if (
    desiredNormalized.labelVpnAllocationModePerNexthop !==
    Boolean(currentNormalized?.labelVpnAllocationModePerNexthop)
  ) {
    if (desiredNormalized.labelVpnAllocationModePerNexthop) {
      operations.push(`set ${base} label vpn allocation-mode per-nexthop`);
    } else {
      operations.push(`delete ${base} label vpn allocation-mode`);
    }
  }

  if (desiredNormalized.importVpn !== Boolean(currentNormalized?.importVpn)) {
    if (desiredNormalized.importVpn) {
      operations.push(`set ${base} import vpn`);
    } else {
      operations.push(`delete ${base} import vpn`);
    }
  }

  if (desiredNormalized.exportVpn !== Boolean(currentNormalized?.exportVpn)) {
    if (desiredNormalized.exportVpn) {
      operations.push(`set ${base} export vpn`);
    } else {
      operations.push(`delete ${base} export vpn`);
    }
  }

  const setOrDeleteRouteMapLeaf = (
    routeMapLeaf: "route-map vpn import" | "route-map vpn export" | "route-map vrf import",
    desiredValue: string,
    currentValue = ""
  ) => {
    if (desiredValue === currentValue) return;
    if (desiredValue) {
      operations.push(`set ${base} ${routeMapLeaf} route-map ${desiredValue}`);
    } else if (currentValue) {
      operations.push(`delete ${base} ${routeMapLeaf}`);
    }
  };

  setOrDeleteRouteMapLeaf(
    "route-map vpn import",
    desiredNormalized.routeMapVpnImport,
    currentNormalized?.routeMapVpnImport ?? ""
  );
  setOrDeleteRouteMapLeaf(
    "route-map vpn export",
    desiredNormalized.routeMapVpnExport,
    currentNormalized?.routeMapVpnExport ?? ""
  );
  setOrDeleteRouteMapLeaf(
    "route-map vrf import",
    desiredNormalized.routeMapVrfImport,
    currentNormalized?.routeMapVrfImport ?? ""
  );

  return operations;
}

export default function VRFPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.VRF);

  const [activeSection, setActiveSection] = useState<"core" | "l3vpn">("core");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [bindToAll, setBindToAll] = useState(false);
  const [vrfs, setVrfs] = useState<VrfEntry[]>([]);
  const [routes, setRoutes] = useState<VrfRouteEntry[]>([]);
  const [l3vpnEntries, setL3vpnEntries] = useState<VrfL3vpnEntry[]>([]);
  const [mplsForwardingEntries, setMplsForwardingEntries] = useState<VrfMplsForwardingEntry[]>([]);

  const [currentBindToAll, setCurrentBindToAll] = useState(false);
  const [currentVrfs, setCurrentVrfs] = useState<VrfEntry[]>([]);
  const [currentRoutes, setCurrentRoutes] = useState<VrfRouteEntry[]>([]);
  const [currentL3vpnEntries, setCurrentL3vpnEntries] = useState<VrfL3vpnEntry[]>([]);
  const [currentMplsForwardingEntries, setCurrentMplsForwardingEntries] = useState<
    VrfMplsForwardingEntry[]
  >([]);

  const [vrfDraft, setVrfDraft] = useState<VrfEntry>(EMPTY_VRF_DRAFT);
  const [routeDraft, setRouteDraft] = useState<VrfRouteEntry>(EMPTY_ROUTE_DRAFT);
  const [l3vpnDraft, setL3vpnDraft] = useState<VrfL3vpnEntry>(EMPTY_L3VPN_DRAFT);
  const [mplsForwardingDraft, setMplsForwardingDraft] = useState<VrfMplsForwardingEntry>(
    EMPTY_MPLS_FORWARDING_DRAFT
  );

  const [routeMapNames, setRouteMapNames] = useState<string[]>([]);
  const [interfaceOptions, setInterfaceOptions] = useState<Array<{ value: string; label: string }>>(
    []
  );

  const vrfNames = useMemo(
    () => vrfs.map((entry) => entry.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [vrfs]
  );

  const interfaceLabelByName = useMemo(
    () =>
      interfaceOptions.reduce<Record<string, string>>((acc, item) => {
        acc[item.value] = item.label;
        return acc;
      }, {}),
    [interfaceOptions]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const section = new URLSearchParams(window.location.search).get("section");
    setActiveSection(normalizeSection(section));
  }, []);

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const [vrfConfig, ethernetConfig, physicalConfig, allInterfacesConfig, routeMapConfig] =
        await Promise.all([
          vrfService.getConfig(refresh),
          ethernetService.getConfig().catch(() => ({ interfaces: [] })),
          showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
          showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
          routeMapService.getConfig(refresh).catch(() => ({ route_maps: [] })),
        ]);

      const parsedVrfs: VrfEntry[] = Object.values(vrfConfig.vrfs)
        .map((entry) => ({
          name: normalizeText(entry.name),
          table: normalizeText(entry.table),
          description: normalizeText(entry.description || ""),
        }))
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const parsedRoutes: VrfRouteEntry[] = [];
      for (const [vrfName, vrf] of Object.entries(vrfConfig.vrfs)) {
        const routeEntries = vrf.protocols.static.routes;
        for (const [destination, route] of Object.entries(routeEntries)) {
          for (const [ifaceName, iface] of Object.entries(route.interface)) {
            parsedRoutes.push({
              vrf: normalizeText(vrfName),
              destination: normalizeText(destination),
              interface: normalizeText(ifaceName),
              targetVrf: normalizeText(iface.vrf || ""),
              nextHop: normalizeText(route["next-hop"] || ""),
            });
          }
        }
      }

      parsedRoutes.sort((left, right) => {
        const vrfCompare = left.vrf.localeCompare(right.vrf, undefined, { numeric: true });
        if (vrfCompare !== 0) return vrfCompare;
        const destCompare = left.destination.localeCompare(right.destination, undefined, { numeric: true });
        if (destCompare !== 0) return destCompare;
        return left.interface.localeCompare(right.interface, undefined, { numeric: true });
      });

      const parsedL3vpnEntries: VrfL3vpnEntry[] = [];
      const parsedMplsForwardingEntries: VrfMplsForwardingEntry[] = [];

      for (const [vrfName, vrf] of Object.entries(vrfConfig.vrfs)) {
        const ipv4 = vrf.l3vpn.ipv4_unicast;
        const ipv6 = vrf.l3vpn.ipv6_unicast;

        const ipv4Entry: VrfL3vpnEntry = {
          vrf: vrfName,
          addressFamily: "ipv4-unicast",
          rdVpnExport: ipv4.rd_vpn_export || "",
          routeTargetImport: listToInputString(ipv4.route_target_import),
          routeTargetExport: listToInputString(ipv4.route_target_export),
          routeTargetBoth: listToInputString(ipv4.route_target_both),
          labelVpnExport: ipv4.label_vpn_export || "",
          labelVpnAllocationModePerNexthop: ipv4.label_vpn_allocation_mode_per_nexthop,
          importVpn: ipv4.import_vpn,
          exportVpn: ipv4.export_vpn,
          importVrf: listToInputString(ipv4.import_vrf),
          routeMapVpnImport: ipv4.route_map_vpn_import || "",
          routeMapVpnExport: ipv4.route_map_vpn_export || "",
          routeMapVrfImport: ipv4.route_map_vrf_import || "",
        };
        if (hasL3vpnData(ipv4Entry)) {
          parsedL3vpnEntries.push(normalizedL3vpnEntry(ipv4Entry));
        }

        const ipv6Entry: VrfL3vpnEntry = {
          vrf: vrfName,
          addressFamily: "ipv6-unicast",
          rdVpnExport: ipv6.rd_vpn_export || "",
          routeTargetImport: listToInputString(ipv6.route_target_import),
          routeTargetExport: listToInputString(ipv6.route_target_export),
          routeTargetBoth: listToInputString(ipv6.route_target_both),
          labelVpnExport: ipv6.label_vpn_export || "",
          labelVpnAllocationModePerNexthop: ipv6.label_vpn_allocation_mode_per_nexthop,
          importVpn: ipv6.import_vpn,
          exportVpn: ipv6.export_vpn,
          importVrf: listToInputString(ipv6.import_vrf),
          routeMapVpnImport: ipv6.route_map_vpn_import || "",
          routeMapVpnExport: ipv6.route_map_vpn_export || "",
          routeMapVrfImport: ipv6.route_map_vrf_import || "",
        };
        if (hasL3vpnData(ipv6Entry)) {
          parsedL3vpnEntries.push(normalizedL3vpnEntry(ipv6Entry));
        }

        for (const interfaceName of vrf.l3vpn.mpls_forwarding_interfaces) {
          parsedMplsForwardingEntries.push({
            vrf: vrfName,
            interface: interfaceName,
          });
        }
      }

      const names = new Set<string>();
      const descriptionByName = ethernetConfig.interfaces.reduce<Record<string, string | null>>(
        (acc, iface) => {
          acc[iface.name] = iface.description ?? null;
          return acc;
        },
        {}
      );

      ethernetConfig.interfaces.forEach((iface) => names.add(iface.name));
      physicalConfig.interfaces.forEach((iface) => names.add(iface.interface));
      allInterfacesConfig.interfaces.forEach((iface) => names.add(iface.name));
      parsedRoutes.forEach((route) => {
        if (route.interface) names.add(route.interface);
      });
      parsedMplsForwardingEntries.forEach((entry) => {
        if (entry.interface) names.add(entry.interface);
      });

      const normalizedInterfaceOptions = [...names]
        .filter((name) => name !== "lo")
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      const routeMaps = sortedByName(
        ((routeMapConfig as { route_maps?: Array<{ name: string }> }).route_maps || []).map((routeMap) =>
          normalizeText(routeMap.name || "")
        )
      ).filter(Boolean);

      const sortedL3vpn = sortL3vpnEntries(parsedL3vpnEntries);
      const sortedMplsForwarding = sortMplsForwardingEntries(parsedMplsForwardingEntries);

      setInterfaceOptions(normalizedInterfaceOptions);
      setRouteMapNames(routeMaps);

      setBindToAll(vrfConfig["bind-to-all"]);
      setVrfs(parsedVrfs);
      setRoutes(parsedRoutes);
      setL3vpnEntries(sortedL3vpn);
      setMplsForwardingEntries(sortedMplsForwarding);

      setCurrentBindToAll(vrfConfig["bind-to-all"]);
      setCurrentVrfs(parsedVrfs);
      setCurrentRoutes(parsedRoutes);
      setCurrentL3vpnEntries(sortedL3vpn);
      setCurrentMplsForwardingEntries(sortedMplsForwarding);

      setVrfDraft(EMPTY_VRF_DRAFT);
      setRouteDraft({
        ...EMPTY_ROUTE_DRAFT,
        vrf: parsedVrfs[0]?.name || "",
        interface: normalizedInterfaceOptions[0]?.value || "",
      });
      setL3vpnDraft({
        ...EMPTY_L3VPN_DRAFT,
        vrf: parsedVrfs[0]?.name || "",
        addressFamily: "ipv4-unicast",
      });
      setMplsForwardingDraft({
        vrf: parsedVrfs[0]?.name || "",
        interface: normalizedInterfaceOptions[0]?.value || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load VRF configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const addVrf = () => {
    setError(null);

    const draft: VrfEntry = {
      name: normalizeText(vrfDraft.name),
      table: normalizeText(vrfDraft.table),
      description: normalizeText(vrfDraft.description),
    };

    if (!draft.name) {
      setError("VRF name is required.");
      return;
    }

    if (!draft.table) {
      setError("VRF table ID is required.");
      return;
    }

    if (vrfs.some((entry) => entry.name === draft.name)) {
      setError("VRF name already exists.");
      return;
    }

    const nextVrfs = [...vrfs, draft].sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true })
    );

    setVrfs(nextVrfs);
    if (!routeDraft.vrf) {
      setRouteDraft((previous) => ({ ...previous, vrf: draft.name }));
    }
    if (!l3vpnDraft.vrf) {
      setL3vpnDraft((previous) => ({ ...previous, vrf: draft.name }));
    }
    if (!mplsForwardingDraft.vrf) {
      setMplsForwardingDraft((previous) => ({ ...previous, vrf: draft.name }));
    }
    setVrfDraft(EMPTY_VRF_DRAFT);
  };

  const removeVrf = (name: string) => {
    setVrfs((previous) => previous.filter((entry) => entry.name !== name));
    setRoutes((previous) => previous.filter((route) => route.vrf !== name));
    setL3vpnEntries((previous) => previous.filter((entry) => entry.vrf !== name));
    setMplsForwardingEntries((previous) => previous.filter((entry) => entry.vrf !== name));

    setRouteDraft((previous) => ({
      ...previous,
      vrf: previous.vrf === name ? "" : previous.vrf,
      targetVrf: previous.targetVrf === name ? "" : previous.targetVrf,
    }));
    setL3vpnDraft((previous) => ({
      ...previous,
      vrf: previous.vrf === name ? "" : previous.vrf,
      importVrf:
        normalizeCsvList(previous.importVrf)
          .filter((entry) => entry !== name)
          .join(", ") || "",
    }));
    setMplsForwardingDraft((previous) => ({
      ...previous,
      vrf: previous.vrf === name ? "" : previous.vrf,
    }));
  };

  const addRoute = () => {
    setError(null);

    const draft: VrfRouteEntry = {
      vrf: normalizeText(routeDraft.vrf),
      destination: normalizeText(routeDraft.destination),
      interface: normalizeText(routeDraft.interface),
      targetVrf: normalizeText(routeDraft.targetVrf),
      nextHop: normalizeText(routeDraft.nextHop),
    };

    if (!draft.vrf || !draft.destination || !draft.interface) {
      setError("Route requires VRF, destination, and interface.");
      return;
    }

    const key = routeKey(draft);
    if (routes.some((entry) => routeKey(entry) === key)) {
      setError("Route for this VRF/destination/interface already exists.");
      return;
    }

    setRoutes((previous) =>
      [...previous, draft].sort((left, right) => {
        const vrfCompare = left.vrf.localeCompare(right.vrf, undefined, { numeric: true });
        if (vrfCompare !== 0) return vrfCompare;
        const destCompare = left.destination.localeCompare(right.destination, undefined, { numeric: true });
        if (destCompare !== 0) return destCompare;
        return left.interface.localeCompare(right.interface, undefined, { numeric: true });
      })
    );

    setRouteDraft((previous) => ({
      ...EMPTY_ROUTE_DRAFT,
      vrf: previous.vrf || vrfNames[0] || "",
      interface: previous.interface || interfaceOptions[0]?.value || "",
    }));
  };

  const removeRoute = (index: number) => {
    setRoutes((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const addL3vpnEntry = () => {
    setError(null);
    const draft = normalizedL3vpnEntry(l3vpnDraft);

    if (!draft.vrf) {
      setError("L3VPN entry requires a VRF.");
      return;
    }

    if (!hasL3vpnData(draft)) {
      setError("L3VPN entry requires at least one configuration value.");
      return;
    }

    const key = l3vpnKey(draft);
    if (l3vpnEntries.some((entry) => l3vpnKey(entry) === key)) {
      setError(`An L3VPN entry for ${draft.vrf} (${draft.addressFamily}) already exists.`);
      return;
    }

    setL3vpnEntries((previous) => sortL3vpnEntries([...previous, draft]));
    setL3vpnDraft((previous) => ({
      ...EMPTY_L3VPN_DRAFT,
      vrf: previous.vrf || vrfNames[0] || "",
      addressFamily: previous.addressFamily,
    }));
  };

  const updateL3vpnEntry = (index: number, updater: (current: VrfL3vpnEntry) => VrfL3vpnEntry) => {
    setL3vpnEntries((previous) => {
      const next = [...previous];
      next[index] = updater(next[index]);
      return sortL3vpnEntries(next.map((entry) => normalizedL3vpnEntry(entry)));
    });
  };

  const removeL3vpnEntry = (index: number) => {
    setL3vpnEntries((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const addMplsForwardingEntry = () => {
    setError(null);
    const draft = {
      vrf: normalizeText(mplsForwardingDraft.vrf),
      interface: normalizeText(mplsForwardingDraft.interface),
    };

    if (!draft.vrf || !draft.interface) {
      setError("MPLS forwarding entry requires VRF and interface.");
      return;
    }

    const key = mplsForwardingKey(draft);
    if (mplsForwardingEntries.some((entry) => mplsForwardingKey(entry) === key)) {
      setError("This VRF interface already has MPLS forwarding enabled.");
      return;
    }

    setMplsForwardingEntries((previous) => sortMplsForwardingEntries([...previous, draft]));
    setMplsForwardingDraft((previous) => ({
      vrf: previous.vrf || vrfNames[0] || "",
      interface: previous.interface || interfaceOptions[0]?.value || "",
    }));
  };

  const removeMplsForwardingEntry = (index: number) => {
    setMplsForwardingEntries((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      if (currentBindToAll !== bindToAll) {
        if (bindToAll) {
          operations.push("set vrf bind-to-all");
        } else {
          operations.push("delete vrf bind-to-all");
        }
      }

      const currentVrfMap = new Map(currentVrfs.map((entry) => [entry.name, entry]));
      const desiredVrfMap = new Map(vrfs.map((entry) => [entry.name, entry]));

      for (const [name] of currentVrfMap.entries()) {
        if (!desiredVrfMap.has(name)) {
          operations.push(`delete vrf name ${name}`);
        }
      }

      for (const [name, desiredEntry] of desiredVrfMap.entries()) {
        const currentEntry = currentVrfMap.get(name);
        if (currentEntry && vrfEqual(currentEntry, desiredEntry)) {
          continue;
        }

        operations.push(`set vrf name ${name} table ${desiredEntry.table}`);

        if (desiredEntry.description) {
          operations.push(`set vrf name ${name} description ${JSON.stringify(desiredEntry.description)}`);
        } else if (currentEntry?.description) {
          operations.push(`delete vrf name ${name} description`);
        }
      }

      const currentRouteMap = new Map(currentRoutes.map((entry) => [routeKey(entry), entry]));
      const desiredRouteMap = new Map(routes.map((entry) => [routeKey(entry), entry]));

      for (const [key, currentEntry] of currentRouteMap.entries()) {
        if (!desiredRouteMap.has(key)) {
          operations.push(
            `delete vrf name ${currentEntry.vrf} protocols static route ${currentEntry.destination} interface ${currentEntry.interface}`
          );
        }
      }

      for (const [key, desiredEntry] of desiredRouteMap.entries()) {
        const currentEntry = currentRouteMap.get(key);
        if (currentEntry && routeEqual(currentEntry, desiredEntry)) {
          continue;
        }

        operations.push(
          `set vrf name ${desiredEntry.vrf} protocols static route ${desiredEntry.destination} interface ${desiredEntry.interface}`
        );

        if (desiredEntry.targetVrf) {
          operations.push(
            `set vrf name ${desiredEntry.vrf} protocols static route ${desiredEntry.destination} interface ${desiredEntry.interface} vrf ${desiredEntry.targetVrf}`
          );
        } else if (currentEntry?.targetVrf) {
          operations.push(
            `delete vrf name ${desiredEntry.vrf} protocols static route ${desiredEntry.destination} interface ${desiredEntry.interface} vrf`
          );
        }

        if (desiredEntry.nextHop) {
          operations.push(
            `set vrf name ${desiredEntry.vrf} protocols static route ${desiredEntry.destination} next-hop ${desiredEntry.nextHop}`
          );
        } else if (currentEntry?.nextHop) {
          operations.push(
            `delete vrf name ${desiredEntry.vrf} protocols static route ${desiredEntry.destination} next-hop`
          );
        }
      }

      const currentL3vpnMap = new Map(
        currentL3vpnEntries.map((entry) => [l3vpnKey(normalizedL3vpnEntry(entry)), normalizedL3vpnEntry(entry)])
      );
      const desiredL3vpnMap = new Map(
        l3vpnEntries.map((entry) => [l3vpnKey(normalizedL3vpnEntry(entry)), normalizedL3vpnEntry(entry)])
      );

      for (const [key, currentEntry] of currentL3vpnMap.entries()) {
        if (!desiredL3vpnMap.has(key)) {
          operations.push(
            `delete vrf name ${currentEntry.vrf} protocols bgp address-family ${currentEntry.addressFamily}`
          );
        }
      }

      for (const [key, desiredEntry] of desiredL3vpnMap.entries()) {
        const currentEntry = currentL3vpnMap.get(key);
        if (currentEntry && l3vpnEqual(currentEntry, desiredEntry)) {
          continue;
        }
        operations.push(...buildL3vpnOperations(currentEntry, desiredEntry));
      }

      const currentMplsMap = new Map(
        currentMplsForwardingEntries.map((entry) => [mplsForwardingKey(entry), entry])
      );
      const desiredMplsMap = new Map(
        mplsForwardingEntries.map((entry) => [mplsForwardingKey(entry), entry])
      );

      for (const [key, currentEntry] of currentMplsMap.entries()) {
        if (!desiredMplsMap.has(key)) {
          operations.push(
            `delete vrf name ${currentEntry.vrf} protocols bgp interface ${currentEntry.interface} mpls forwarding`
          );
        }
      }

      for (const [key, desiredEntry] of desiredMplsMap.entries()) {
        const currentEntry = currentMplsMap.get(key);
        if (currentEntry && mplsForwardingEqual(currentEntry, desiredEntry)) {
          continue;
        }

        operations.push(
          `set vrf name ${desiredEntry.vrf} protocols bgp interface ${desiredEntry.interface} mpls forwarding`
        );
      }

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await vrfService.batchConfigure(operations);
      if (!result.success) {
        throw new Error(result.error || "Failed to save VRF configuration");
      }

      setMessage("VRF configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save VRF configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">VRF</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure virtual routing instances, per-VRF static routing, and L3VPN workflow settings.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {message && (
          <Card className="border-primary/40">
            <CardContent className="pt-6 text-sm text-primary">{message}</CardContent>
          </Card>
        )}

        <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as "core" | "l3vpn")}>
          <TabsList>
            <TabsTrigger value="core">VRF Core</TabsTrigger>
            <TabsTrigger value="l3vpn">L3VPN VRFs</TabsTrigger>
          </TabsList>

          <TabsContent value="core" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Global Options</CardTitle>
                <CardDescription>Apply VRF settings that affect all interfaces.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="vrf-bind-to-all"
                    checked={bindToAll}
                    onCheckedChange={(checked) => setBindToAll(Boolean(checked))}
                    disabled={!canEdit}
                  />
                  <Label htmlFor="vrf-bind-to-all">Bind all interfaces to default VRF behavior</Label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>VRF Instances</CardTitle>
                <CardDescription>Create and manage VRF instances.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="vrf-name">Name</Label>
                    <Input
                      id="vrf-name"
                      value={vrfDraft.name}
                      onChange={(event) => setVrfDraft((previous) => ({ ...previous, name: event.target.value }))}
                      placeholder="BLUE"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vrf-table">Table</Label>
                    <Input
                      id="vrf-table"
                      value={vrfDraft.table}
                      onChange={(event) => setVrfDraft((previous) => ({ ...previous, table: event.target.value }))}
                      placeholder="10"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="vrf-description">Description</Label>
                    <Input
                      id="vrf-description"
                      value={vrfDraft.description}
                      onChange={(event) =>
                        setVrfDraft((previous) => ({ ...previous, description: event.target.value }))
                      }
                      placeholder="Tenant VRF"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <div>
                  <Button type="button" variant="outline" onClick={addVrf} disabled={!canEdit}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add VRF
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vrfs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          No VRF instances configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      vrfs.map((entry) => (
                        <TableRow key={entry.name}>
                          <TableCell className="font-medium">{entry.name}</TableCell>
                          <TableCell>{entry.table}</TableCell>
                          <TableCell>{entry.description || "-"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeVrf(entry.name)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Per-VRF Static Routes</CardTitle>
                <CardDescription>
                  Configure static routes inside VRF instances, including interface VRF lookup and next-hop.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="space-y-2">
                    <Label>VRF</Label>
                    <Select
                      value={routeDraft.vrf || ""}
                      onValueChange={(value) => setRouteDraft((previous) => ({ ...previous, vrf: value }))}
                      disabled={!canEdit || vrfNames.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select VRF" />
                      </SelectTrigger>
                      <SelectContent>
                        {vrfNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Destination</Label>
                    <Input
                      value={routeDraft.destination}
                      onChange={(event) =>
                        setRouteDraft((previous) => ({ ...previous, destination: event.target.value }))
                      }
                      placeholder="10.10.0.0/24"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Interface</Label>
                    <Select
                      value={routeDraft.interface || ""}
                      onValueChange={(value) => setRouteDraft((previous) => ({ ...previous, interface: value }))}
                      disabled={!canEdit || interfaceOptions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select interface" />
                      </SelectTrigger>
                      <SelectContent>
                        {interfaceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Target VRF</Label>
                    <Input
                      value={routeDraft.targetVrf}
                      onChange={(event) =>
                        setRouteDraft((previous) => ({ ...previous, targetVrf: event.target.value }))
                      }
                      placeholder="BLUE"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Next Hop</Label>
                    <Input
                      value={routeDraft.nextHop}
                      onChange={(event) =>
                        setRouteDraft((previous) => ({ ...previous, nextHop: event.target.value }))
                      }
                      placeholder="192.0.2.1"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div>
                  <Button type="button" variant="outline" onClick={addRoute} disabled={!canEdit || vrfNames.length === 0}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Route
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>VRF</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Interface</TableHead>
                      <TableHead>Target VRF</TableHead>
                      <TableHead>Next Hop</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground">
                          No static routes configured inside VRFs.
                        </TableCell>
                      </TableRow>
                    ) : (
                      routes.map((route, index) => (
                        <TableRow key={`${routeKey(route)}:${index}`}>
                          <TableCell>
                            <Badge variant="secondary">{route.vrf}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{route.destination}</TableCell>
                          <TableCell>{interfaceLabelByName[route.interface] || route.interface}</TableCell>
                          <TableCell>{route.targetVrf || "-"}</TableCell>
                          <TableCell>{route.nextHop || "-"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRoute(index)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="l3vpn" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>L3VPN Address-Family Entries</CardTitle>
                <CardDescription>
                  Configure BGP address-family VPN settings per VRF (RD, route-targets, label export, route leaking, and route-maps).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-6">
                  <div className="space-y-2">
                    <Label>VRF</Label>
                    <Select
                      value={l3vpnDraft.vrf || ""}
                      onValueChange={(value) => setL3vpnDraft((previous) => ({ ...previous, vrf: value }))}
                      disabled={!canEdit || vrfNames.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select VRF" />
                      </SelectTrigger>
                      <SelectContent>
                        {vrfNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Address Family</Label>
                    <Select
                      value={l3vpnDraft.addressFamily}
                      onValueChange={(value) =>
                        setL3vpnDraft((previous) => ({
                          ...previous,
                          addressFamily: value as L3vpnAddressFamily,
                        }))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ipv4-unicast">IPv4 Unicast</SelectItem>
                        <SelectItem value="ipv6-unicast">IPv6 Unicast</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>RD VPN Export</Label>
                    <Input
                      value={l3vpnDraft.rdVpnExport}
                      onChange={(event) =>
                        setL3vpnDraft((previous) => ({ ...previous, rdVpnExport: event.target.value }))
                      }
                      placeholder="64512:100"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Label VPN Export</Label>
                    <Input
                      value={l3vpnDraft.labelVpnExport}
                      onChange={(event) =>
                        setL3vpnDraft((previous) => ({ ...previous, labelVpnExport: event.target.value }))
                      }
                      placeholder="auto"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Import VRFs</Label>
                    <Input
                      value={l3vpnDraft.importVrf}
                      onChange={(event) =>
                        setL3vpnDraft((previous) => ({ ...previous, importVrf: event.target.value }))
                      }
                      placeholder="red, blue"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="outline" onClick={addL3vpnEntry} disabled={!canEdit}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Entry
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Route-Target Import</Label>
                    <Input
                      value={l3vpnDraft.routeTargetImport}
                      onChange={(event) =>
                        setL3vpnDraft((previous) => ({ ...previous, routeTargetImport: event.target.value }))
                      }
                      placeholder="64512:100, 64512:101"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Route-Target Export</Label>
                    <Input
                      value={l3vpnDraft.routeTargetExport}
                      onChange={(event) =>
                        setL3vpnDraft((previous) => ({ ...previous, routeTargetExport: event.target.value }))
                      }
                      placeholder="64512:200"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Route-Target Both</Label>
                    <Input
                      value={l3vpnDraft.routeTargetBoth}
                      onChange={(event) =>
                        setL3vpnDraft((previous) => ({ ...previous, routeTargetBoth: event.target.value }))
                      }
                      placeholder="64512:300"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Route-Map VPN Import</Label>
                    <Input
                      list="vrf-l3vpn-route-map-options"
                      value={l3vpnDraft.routeMapVpnImport}
                      onChange={(event) =>
                        setL3vpnDraft((previous) => ({ ...previous, routeMapVpnImport: event.target.value }))
                      }
                      placeholder="RM-IN"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Route-Map VPN Export</Label>
                    <Input
                      list="vrf-l3vpn-route-map-options"
                      value={l3vpnDraft.routeMapVpnExport}
                      onChange={(event) =>
                        setL3vpnDraft((previous) => ({ ...previous, routeMapVpnExport: event.target.value }))
                      }
                      placeholder="RM-OUT"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Route-Map VRF Import</Label>
                    <Input
                      list="vrf-l3vpn-route-map-options"
                      value={l3vpnDraft.routeMapVrfImport}
                      onChange={(event) =>
                        setL3vpnDraft((previous) => ({ ...previous, routeMapVrfImport: event.target.value }))
                      }
                      placeholder="RM-VRF-IN"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 rounded-md border border-border px-4 py-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={l3vpnDraft.labelVpnAllocationModePerNexthop}
                      onCheckedChange={(checked) =>
                        setL3vpnDraft((previous) => ({
                          ...previous,
                          labelVpnAllocationModePerNexthop: Boolean(checked),
                        }))
                      }
                      disabled={!canEdit}
                    />
                    Label allocation mode: per-nexthop
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={l3vpnDraft.importVpn}
                      onCheckedChange={(checked) =>
                        setL3vpnDraft((previous) => ({ ...previous, importVpn: Boolean(checked) }))
                      }
                      disabled={!canEdit}
                    />
                    Import VPN
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={l3vpnDraft.exportVpn}
                      onCheckedChange={(checked) =>
                        setL3vpnDraft((previous) => ({ ...previous, exportVpn: Boolean(checked) }))
                      }
                      disabled={!canEdit}
                    />
                    Export VPN
                  </label>
                </div>

                <datalist id="vrf-l3vpn-route-map-options">
                  {routeMapNames.map((routeMap) => (
                    <option key={routeMap} value={routeMap} />
                  ))}
                </datalist>

                {routeMapNames.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Available route-maps: {routeMapNames.join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Configured L3VPN Entries</CardTitle>
                <CardDescription>
                  Edit configured entries directly. Remove an entry to clear its address-family subtree.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {l3vpnEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No L3VPN address-family entries configured.</p>
                ) : (
                  l3vpnEntries.map((entry, index) => (
                    <div key={`${l3vpnKey(entry)}:${index}`} className="space-y-3 rounded-md border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{entry.vrf}</Badge>
                          <Badge variant="outline">{entry.addressFamily}</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeL3vpnEntry(index)}
                          disabled={!canEdit}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-2">
                          <Label>RD VPN Export</Label>
                          <Input
                            value={entry.rdVpnExport}
                            onChange={(event) =>
                              updateL3vpnEntry(index, (current) => ({ ...current, rdVpnExport: event.target.value }))
                            }
                            disabled={!canEdit}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Label VPN Export</Label>
                          <Input
                            value={entry.labelVpnExport}
                            onChange={(event) =>
                              updateL3vpnEntry(index, (current) => ({
                                ...current,
                                labelVpnExport: event.target.value,
                              }))
                            }
                            disabled={!canEdit}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Import VRFs</Label>
                          <Input
                            value={entry.importVrf}
                            onChange={(event) =>
                              updateL3vpnEntry(index, (current) => ({ ...current, importVrf: event.target.value }))
                            }
                            disabled={!canEdit}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Route-Target Both</Label>
                          <Input
                            value={entry.routeTargetBoth}
                            onChange={(event) =>
                              updateL3vpnEntry(index, (current) => ({
                                ...current,
                                routeTargetBoth: event.target.value,
                              }))
                            }
                            disabled={!canEdit}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Route-Target Import</Label>
                          <Input
                            value={entry.routeTargetImport}
                            onChange={(event) =>
                              updateL3vpnEntry(index, (current) => ({
                                ...current,
                                routeTargetImport: event.target.value,
                              }))
                            }
                            disabled={!canEdit}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Route-Target Export</Label>
                          <Input
                            value={entry.routeTargetExport}
                            onChange={(event) =>
                              updateL3vpnEntry(index, (current) => ({
                                ...current,
                                routeTargetExport: event.target.value,
                              }))
                            }
                            disabled={!canEdit}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Route-Map VRF Import</Label>
                          <Input
                            list="vrf-l3vpn-route-map-options"
                            value={entry.routeMapVrfImport}
                            onChange={(event) =>
                              updateL3vpnEntry(index, (current) => ({
                                ...current,
                                routeMapVrfImport: event.target.value,
                              }))
                            }
                            disabled={!canEdit}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Route-Map VPN Import</Label>
                          <Input
                            list="vrf-l3vpn-route-map-options"
                            value={entry.routeMapVpnImport}
                            onChange={(event) =>
                              updateL3vpnEntry(index, (current) => ({
                                ...current,
                                routeMapVpnImport: event.target.value,
                              }))
                            }
                            disabled={!canEdit}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Route-Map VPN Export</Label>
                          <Input
                            list="vrf-l3vpn-route-map-options"
                            value={entry.routeMapVpnExport}
                            onChange={(event) =>
                              updateL3vpnEntry(index, (current) => ({
                                ...current,
                                routeMapVpnExport: event.target.value,
                              }))
                            }
                            disabled={!canEdit}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-6 rounded-md border border-border px-4 py-3">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={entry.labelVpnAllocationModePerNexthop}
                            onCheckedChange={(checked) =>
                              updateL3vpnEntry(index, (current) => ({
                                ...current,
                                labelVpnAllocationModePerNexthop: Boolean(checked),
                              }))
                            }
                            disabled={!canEdit}
                          />
                          Label allocation mode: per-nexthop
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={entry.importVpn}
                            onCheckedChange={(checked) =>
                              updateL3vpnEntry(index, (current) => ({ ...current, importVpn: Boolean(checked) }))
                            }
                            disabled={!canEdit}
                          />
                          Import VPN
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={entry.exportVpn}
                            onCheckedChange={(checked) =>
                              updateL3vpnEntry(index, (current) => ({ ...current, exportVpn: Boolean(checked) }))
                            }
                            disabled={!canEdit}
                          />
                          Export VPN
                        </label>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>BGP MPLS Forwarding Interfaces</CardTitle>
                <CardDescription>
                  Enable `vrf name &lt;vrf&gt; protocols bgp interface &lt;interface&gt; mpls forwarding`.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>VRF</Label>
                    <Select
                      value={mplsForwardingDraft.vrf || ""}
                      onValueChange={(value) =>
                        setMplsForwardingDraft((previous) => ({ ...previous, vrf: value }))
                      }
                      disabled={!canEdit || vrfNames.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select VRF" />
                      </SelectTrigger>
                      <SelectContent>
                        {vrfNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Interface</Label>
                    <Select
                      value={mplsForwardingDraft.interface || ""}
                      onValueChange={(value) =>
                        setMplsForwardingDraft((previous) => ({ ...previous, interface: value }))
                      }
                      disabled={!canEdit || interfaceOptions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select interface" />
                      </SelectTrigger>
                      <SelectContent>
                        {interfaceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="outline" onClick={addMplsForwardingEntry} disabled={!canEdit}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add MPLS Forwarding
                    </Button>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>VRF</TableHead>
                      <TableHead>Interface</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mplsForwardingEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">
                          No MPLS forwarding interfaces configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      mplsForwardingEntries.map((entry, index) => (
                        <TableRow key={`${mplsForwardingKey(entry)}:${index}`}>
                          <TableCell>
                            <Badge variant="secondary">{entry.vrf}</Badge>
                          </TableCell>
                          <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeMplsForwardingEntry(index)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
