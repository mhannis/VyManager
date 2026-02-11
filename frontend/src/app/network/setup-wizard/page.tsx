"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ethernetService } from "@/lib/api/ethernet";
import type {
  BatchOperation,
  EthernetInterface,
} from "@/lib/api/types/ethernet";
import {
  dhcpService,
  type DHCPCapabilitiesResponse,
  type DHCPConfigResponse,
} from "@/lib/api/dhcp";
import {
  firewallIPv4Service,
  type FirewallConfigResponse,
  type FirewallRule,
} from "@/lib/api/firewall-ipv4";
import { natService } from "@/lib/api/nat";
import { showService, type InterfacePhysical } from "@/lib/api/show";
import { staticRoutesService } from "@/lib/api/static-routes";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LocateFixed,
  Loader2,
  Shield,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AddressMode = "dhcp" | "static";
type WizardStep = 1 | 2 | 3 | 4 | 5;

interface ParsedIPv4Cidr {
  ip: string;
  prefix: number;
  ipInt: number;
  networkInt: number;
  broadcastInt: number;
}

const ROUTE_DESCRIPTION_PREFIX = "VyManager Setup Wizard: WAN default route";
const NAT_DESCRIPTION_PREFIX = "VyManager Setup Wizard: LAN masquerade";

const FW_INPUT_STATE_PREFIX = "VyManager Setup Wizard: allow established/related to router";
const FW_INPUT_LAN_PREFIX = "VyManager Setup Wizard: allow LAN to router";
const FW_FORWARD_STATE_PREFIX = "VyManager Setup Wizard: allow established/related forwarding";
const FW_FORWARD_LAN_PREFIX = "VyManager Setup Wizard: allow LAN forwarding";

const WIZARD_STEPS: Array<{ step: WizardStep; title: string }> = [
  { step: 1, title: "Interfaces" },
  { step: 2, title: "WAN" },
  { step: 3, title: "LAN" },
  { step: 4, title: "DHCP" },
  { step: 5, title: "Apply" },
];

function parseIPv4(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
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

  return {
    ip,
    prefix,
    ipInt,
    networkInt,
    broadcastInt,
  };
}

function isUsableHostAddress(parsed: ParsedIPv4Cidr): boolean {
  if (parsed.prefix >= 31) return true;
  return parsed.ipInt > parsed.networkInt && parsed.ipInt < parsed.broadcastInt;
}

function isIPv4AddressOrDhcp(address: string): boolean {
  if (address === "dhcp") return true;
  const [ip] = address.split("/");
  return parseIPv4(ip) !== null;
}

function getFirstIPv4Address(addresses: string[]): string | null {
  for (const address of addresses) {
    if (address === "dhcp") continue;
    const parsed = parseIPv4Cidr(address);
    if (parsed) return address;
  }
  return null;
}

function getSubnetFromAddress(cidr: string): string | null {
  const parsed = parseIPv4Cidr(cidr);
  if (!parsed) return null;
  return `${formatIPv4(parsed.networkInt)}/${parsed.prefix}`;
}

function isIpInSubnet(ip: string, subnet: ParsedIPv4Cidr): boolean {
  const ipInt = parseIPv4(ip);
  if (ipInt === null) return false;

  const mask =
    subnet.prefix === 0 ? 0 : ((0xffffffff << (32 - subnet.prefix)) >>> 0);
  return ((ipInt & mask) >>> 0) === subnet.networkInt;
}

function suggestDhcpRange(cidr: string): { start: string; stop: string } | null {
  const parsed = parseIPv4Cidr(cidr);
  if (!parsed || parsed.prefix >= 31) return null;

  const firstHost = parsed.networkInt + 1;
  const lastHost = parsed.broadcastInt - 1;
  if (firstHost >= lastHost) return null;

  const span = lastHost - firstHost + 1;
  let start = firstHost + Math.floor(span * 0.2);
  let stop = firstHost + Math.floor(span * 0.8);

  if (start <= firstHost) start = firstHost;
  if (stop >= lastHost) stop = lastHost;

  if (parsed.ipInt >= start && parsed.ipInt <= stop) {
    if (parsed.ipInt + 1 <= stop) {
      start = parsed.ipInt + 1;
    } else if (parsed.ipInt - 1 >= start) {
      stop = parsed.ipInt - 1;
    }
  }

  if (start >= stop) return null;
  return { start: formatIPv4(start), stop: formatIPv4(stop) };
}

function getNextFirewallRuleNumber(rules: FirewallRule[]): number {
  if (rules.length === 0) return 100;
  return Math.max(...rules.map((rule) => rule.rule_number)) + 10;
}

function getNextSubnetId(config: DHCPConfigResponse): number {
  const usedIds = new Set<number>();
  for (const network of config.shared_networks) {
    for (const subnet of network.subnets) {
      if (subnet.subnet_id) {
        usedIds.add(subnet.subnet_id);
      }
    }
  }

  let candidate = 1;
  while (usedIds.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

function splitDnsList(input: string): string[] {
  return input
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getValidationIssue(
  step: WizardStep,
  state: {
    wanInterface: string;
    lanInterface: string;
    wanMode: AddressMode;
    lanMode: AddressMode;
    wanStaticCidr: string;
    wanGateway: string;
    lanStaticCidr: string;
    enableLanDhcp: boolean;
    dhcpNetworkName: string;
    dhcpRangeStart: string;
    dhcpRangeStop: string;
    dhcpDomainName: string;
    dhcpLeaseSeconds: string;
    dhcpDnsServers: string;
  }
): string | null {
  if (step === 1) {
    if (!state.wanInterface || !state.lanInterface) {
      return "Select both WAN and LAN interfaces.";
    }
    if (state.wanInterface === state.lanInterface) {
      return "WAN and LAN must be different interfaces.";
    }
  }

  if (step === 2 && state.wanMode === "static") {
    const parsedWan = parseIPv4Cidr(state.wanStaticCidr);
    if (!parsedWan) {
      return "WAN static IP must be valid IPv4 CIDR (example: 203.0.113.2/24).";
    }
    if (!isUsableHostAddress(parsedWan)) {
      return "WAN static IP must be a usable host address in the subnet.";
    }
    if (state.wanGateway.trim() && parseIPv4(state.wanGateway.trim()) === null) {
      return "WAN gateway must be a valid IPv4 address.";
    }
  }

  if (step === 3 && state.lanMode === "static") {
    const parsedLan = parseIPv4Cidr(state.lanStaticCidr);
    if (!parsedLan) {
      return "LAN static IP must be valid IPv4 CIDR (example: 192.168.50.1/24).";
    }
    if (!isUsableHostAddress(parsedLan)) {
      return "LAN static IP must be a usable host address in the subnet.";
    }
  }

  if (step === 4 && state.enableLanDhcp) {
    if (state.lanMode !== "static") {
      return "LAN DHCP server requires LAN to be configured with a static address.";
    }

    const parsedLan = parseIPv4Cidr(state.lanStaticCidr);
    if (!parsedLan || parsedLan.prefix >= 31) {
      return "LAN DHCP server requires a valid LAN subnet with usable hosts.";
    }

    if (!state.dhcpNetworkName.trim()) {
      return "DHCP shared network name is required.";
    }
    if (!state.dhcpDomainName.trim()) {
      return "DHCP domain name is required.";
    }

    const lease = Number(state.dhcpLeaseSeconds);
    if (!Number.isInteger(lease) || lease <= 0) {
      return "DHCP lease time must be a positive integer in seconds.";
    }

    const dnsServers = splitDnsList(state.dhcpDnsServers);
    if (dnsServers.length === 0) {
      return "Add at least one DNS server for LAN DHCP.";
    }
    if (dnsServers.some((dns) => parseIPv4(dns) === null)) {
      return "All DHCP DNS server entries must be valid IPv4 addresses.";
    }

    const rangeStart = parseIPv4(state.dhcpRangeStart.trim());
    const rangeStop = parseIPv4(state.dhcpRangeStop.trim());

    if (rangeStart === null || rangeStop === null) {
      return "DHCP range start/stop must be valid IPv4 addresses.";
    }
    if (rangeStart > rangeStop) {
      return "DHCP range start must be less than or equal to range stop.";
    }
    if (
      !isIpInSubnet(formatIPv4(rangeStart), parsedLan) ||
      !isIpInSubnet(formatIPv4(rangeStop), parsedLan)
    ) {
      return "DHCP range must stay within the LAN subnet.";
    }

    if (parsedLan.prefix < 31) {
      if (
        rangeStart <= parsedLan.networkInt ||
        rangeStop >= parsedLan.broadcastInt
      ) {
        return "DHCP range must not include network or broadcast addresses.";
      }
    }
  }

  return null;
}

export default function NetworkSetupWizardPage() {
  const [interfaces, setInterfaces] = useState<EthernetInterface[]>([]);
  const [physicalByInterface, setPhysicalByInterface] = useState<
    Record<string, InterfacePhysical>
  >({});
  const [dhcpCapabilities, setDhcpCapabilities] =
    useState<DHCPCapabilitiesResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [step, setStep] = useState<WizardStep>(1);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [wanInterface, setWanInterface] = useState("");
  const [lanInterface, setLanInterface] = useState("");

  const [wanMode, setWanMode] = useState<AddressMode>("dhcp");
  const [wanStaticCidr, setWanStaticCidr] = useState("");
  const [wanGateway, setWanGateway] = useState("");

  const [lanMode, setLanMode] = useState<AddressMode>("static");
  const [lanStaticCidr, setLanStaticCidr] = useState("192.168.50.1/24");

  const [enableLanDhcp, setEnableLanDhcp] = useState(true);
  const [dhcpNetworkName, setDhcpNetworkName] = useState("LAN");
  const [dhcpDomainName, setDhcpDomainName] = useState("lan");
  const [dhcpLeaseSeconds, setDhcpLeaseSeconds] = useState("86400");
  const [dhcpDnsServers, setDhcpDnsServers] = useState("1.1.1.1,8.8.8.8");
  const [dhcpRangeStart, setDhcpRangeStart] = useState("");
  const [dhcpRangeStop, setDhcpRangeStop] = useState("");
  const [customDhcpRange, setCustomDhcpRange] = useState(false);

  const [enableFirewallDefaults, setEnableFirewallDefaults] = useState(true);
  const [enableOutboundNat, setEnableOutboundNat] = useState(true);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [applyLog, setApplyLog] = useState<string[]>([]);
  const [blinkingInterface, setBlinkingInterface] = useState<string | null>(null);
  const [blinkStatus, setBlinkStatus] = useState<string | null>(null);
  const [blinkError, setBlinkError] = useState<string | null>(null);

  const initializedDefaultsRef = useRef(false);

  const lanParsed = useMemo(
    () => parseIPv4Cidr(lanStaticCidr),
    [lanStaticCidr]
  );
  const lanSubnetCidr = useMemo(
    () => (lanParsed ? `${formatIPv4(lanParsed.networkInt)}/${lanParsed.prefix}` : ""),
    [lanParsed]
  );

  const interfaceNameSet = useMemo(
    () => new Set(interfaces.map((iface) => iface.name)),
    [interfaces]
  );

  const appendApplyLog = (message: string) => {
    setApplyLog((previous) => [...previous, message]);
  };

  const refreshPageData = async () => {
    setLoading(true);
    setLoadingError(null);

    try {
      const [ethernetConfig, physicalData] = await Promise.all([
        ethernetService.getConfig(),
        showService
          .getInterfacePhysical()
          .catch(() => ({ interfaces: [], total: 0 })),
      ]);

      let dhcpCaps: DHCPCapabilitiesResponse | null = null;
      try {
        dhcpCaps = await dhcpService.getCapabilities();
      } catch {
        dhcpCaps = null;
      }

      const sortedInterfaces = [...ethernetConfig.interfaces].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setInterfaces(sortedInterfaces);
      setDhcpCapabilities(dhcpCaps);

      const map = physicalData.interfaces.reduce<
        Record<string, InterfacePhysical>
      >((acc, item) => {
        acc[item.interface] = item;
        return acc;
      }, {});
      setPhysicalByInterface(map);
    } catch (error) {
      setLoadingError(
        error instanceof Error
          ? error.message
          : "Failed to load interface and capability data."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshPageData();
  }, []);

  useEffect(() => {
    if (initializedDefaultsRef.current || interfaces.length === 0) {
      return;
    }

    const sorted = [...interfaces].sort((a, b) => a.name.localeCompare(b.name));
    const detectedWan =
      sorted.find((iface) => iface.addresses.includes("dhcp")) ?? sorted[0];
    const detectedLan =
      sorted.find((iface) => iface.name !== detectedWan.name) ?? null;

    setWanInterface(detectedWan?.name ?? "");
    setLanInterface(detectedLan?.name ?? "");

    if (detectedWan) {
      const wanStatic = getFirstIPv4Address(detectedWan.addresses);
      if (detectedWan.addresses.includes("dhcp")) {
        setWanMode("dhcp");
      } else if (wanStatic) {
        setWanMode("static");
        setWanStaticCidr(wanStatic);
      }
    }

    if (detectedLan) {
      const lanStatic = getFirstIPv4Address(detectedLan.addresses);
      if (detectedLan.addresses.includes("dhcp")) {
        setLanMode("dhcp");
      } else if (lanStatic) {
        setLanMode("static");
        setLanStaticCidr(lanStatic);
      }
    }

    initializedDefaultsRef.current = true;
  }, [interfaces]);

  useEffect(() => {
    if (lanMode !== "static") {
      setEnableLanDhcp(false);
      setEnableOutboundNat(false);
    }
  }, [lanMode]);

  useEffect(() => {
    if (lanMode !== "static" || customDhcpRange) return;
    const suggestion = suggestDhcpRange(lanStaticCidr);
    if (!suggestion) return;
    setDhcpRangeStart(suggestion.start);
    setDhcpRangeStop(suggestion.stop);
  }, [lanMode, lanStaticCidr, customDhcpRange]);

  useEffect(() => {
    if (wanInterface && !interfaceNameSet.has(wanInterface)) {
      setWanInterface("");
    }
    if (lanInterface && !interfaceNameSet.has(lanInterface)) {
      setLanInterface("");
    }
  }, [interfaceNameSet, wanInterface, lanInterface]);

  const stateForValidation = {
    wanInterface,
    lanInterface,
    wanMode,
    lanMode,
    wanStaticCidr,
    wanGateway,
    lanStaticCidr,
    enableLanDhcp,
    dhcpNetworkName,
    dhcpRangeStart,
    dhcpRangeStop,
    dhcpDomainName,
    dhcpLeaseSeconds,
    dhcpDnsServers,
  };

  const validateUpToStep = (targetStep: WizardStep): string | null => {
    for (let current: WizardStep = 1; current <= targetStep; current = (current + 1) as WizardStep) {
      const issue = getValidationIssue(current, stateForValidation);
      if (issue) {
        return issue;
      }
      if (current === 5) break;
    }
    return null;
  };

  const goToNextStep = () => {
    const issue = getValidationIssue(step, stateForValidation);
    if (issue) {
      setValidationError(issue);
      return;
    }

    setValidationError(null);
    setStep((previous) => Math.min(previous + 1, 5) as WizardStep);
  };

  const goToPreviousStep = () => {
    setValidationError(null);
    setStep((previous) => Math.max(previous - 1, 1) as WizardStep);
  };

  const triggerBlink = async (interfaceName: string) => {
    if (!interfaceName) return;

    setBlinkError(null);
    setBlinkStatus(null);
    setBlinkingInterface(interfaceName);
    try {
      const result = await showService.blinkInterface(interfaceName, 5);
      const methodInfo = result.method ? ` (${result.method})` : "";
      setBlinkStatus(`Blink triggered on ${interfaceName} for ${result.duration_seconds}s${methodInfo}`);
    } catch (error) {
      setBlinkError(
        error instanceof Error
          ? error.message
          : `Failed to trigger blink on ${interfaceName}`
      );
    } finally {
      setBlinkingInterface(null);
    }
  };

  const applyInterfaceConfiguration = async () => {
    const latestConfig = await ethernetService.getConfig();
    const currentMap = latestConfig.interfaces.reduce<Record<string, EthernetInterface>>(
      (acc, iface) => {
        acc[iface.name] = iface;
        return acc;
      },
      {}
    );

    const buildOps = (
      iface: EthernetInterface,
      mode: AddressMode,
      staticAddress: string,
      description: string
    ): BatchOperation[] => {
      const operations: BatchOperation[] = [];

      for (const address of iface.addresses) {
        if (isIPv4AddressOrDhcp(address)) {
          operations.push({ op: "delete_address", value: address });
        }
      }

      if (mode === "dhcp") {
        operations.push({ op: "set_address", value: "dhcp" });
      } else {
        operations.push({ op: "set_address", value: staticAddress.trim() });
      }

      if (iface.description !== description) {
        operations.push({ op: "set_description", value: description });
      }

      if (iface.disable) {
        operations.push({ op: "enable" });
      }

      return operations;
    };

    const wanCurrent = currentMap[wanInterface];
    const lanCurrent = currentMap[lanInterface];

    if (!wanCurrent || !lanCurrent) {
      throw new Error("Selected interface no longer exists. Refresh and try again.");
    }

    const wanOps = buildOps(
      wanCurrent,
      wanMode,
      wanStaticCidr,
      "WAN (Setup Wizard)"
    );
    const lanOps = buildOps(
      lanCurrent,
      lanMode,
      lanStaticCidr,
      "LAN (Setup Wizard)"
    );

    if (wanOps.length > 0) {
      await ethernetService.batchConfigure({
        interface: wanInterface,
        operations: wanOps,
      });
    }

    if (lanOps.length > 0) {
      await ethernetService.batchConfigure({
        interface: lanInterface,
        operations: lanOps,
      });
    }
  };

  const applyDefaultRouteConfiguration = async () => {
    const gateway = wanGateway.trim();
    const routes = await staticRoutesService.getConfig(true);
    const existingDefault = routes.ipv4_routes.find(
      (route) => route.destination === "0.0.0.0/0"
    );

    if (wanMode === "static" && gateway) {
      const nextHop = {
        address: gateway,
        disable: false,
        bfd_enable: false,
        bfd_multi_hop: false,
      };

      if (existingDefault) {
        await staticRoutesService.updateRoute(
          "0.0.0.0/0",
          "ipv4",
          existingDefault,
          {
            description: ROUTE_DESCRIPTION_PREFIX,
            next_hops: [nextHop],
            interfaces: [],
            dhcp_interfaces: [],
            blackhole: false,
            reject: false,
          }
        );
      } else {
        await staticRoutesService.createIPv4Route("0.0.0.0/0", {
          description: ROUTE_DESCRIPTION_PREFIX,
          next_hops: [nextHop],
          interfaces: [],
          dhcp_interfaces: [],
          blackhole: false,
          reject: false,
        });
      }
      return;
    }

    if (
      wanMode === "dhcp" &&
      existingDefault &&
      existingDefault.description?.startsWith(ROUTE_DESCRIPTION_PREFIX)
    ) {
      await staticRoutesService.deleteRoute("ipv4", "0.0.0.0/0");
    }
  };

  const applyDhcpServerConfiguration = async () => {
    if (!enableLanDhcp) return;
    if (lanMode !== "static") {
      throw new Error("LAN DHCP server requires LAN static addressing.");
    }

    const subnet = getSubnetFromAddress(lanStaticCidr);
    if (!subnet || !lanParsed) {
      throw new Error("Unable to derive LAN subnet for DHCP server.");
    }

    const dnsServers = splitDnsList(dhcpDnsServers);
    const range = {
      range_id: "0",
      start: dhcpRangeStart.trim(),
      stop: dhcpRangeStop.trim(),
    };

    const networkName = dhcpNetworkName.trim();
    const domainName = dhcpDomainName.trim();
    const lease = dhcpLeaseSeconds.trim();

    const config = await dhcpService.getConfig(true);
    const existingNetwork = config.shared_networks.find(
      (network) => network.name === networkName
    );
    const existingSubnet = existingNetwork?.subnets.find(
      (existing) => existing.subnet === subnet
    );

    if (existingSubnet) {
      await dhcpService.updateSubnet({
        network_name: networkName,
        subnet,
        subnet_id:
          existingSubnet.subnet_id ??
          (dhcpCapabilities?.has_subnet_id ? getNextSubnetId(config) : undefined),
        default_router: lanParsed.ip,
        name_servers: dnsServers,
        domain_name: domainName,
        lease,
        ranges: [range],
        excludes: [],
        domain_search: [],
        ping_check: false,
        enable_failover: false,
      });
      return;
    }

    await dhcpService.createSubnet({
      network_name: networkName,
      subnet,
      subnet_id: dhcpCapabilities?.has_subnet_id ? getNextSubnetId(config) : undefined,
      default_router: lanParsed.ip,
      name_servers: dnsServers,
      domain_name: domainName,
      lease,
      ranges: [range],
      excludes: [],
      domain_search: [],
      ping_check: false,
      enable_failover: false,
    });
  };

  const ensureFirewallRule = async (
    config: FirewallConfigResponse,
    chain: "input" | "forward",
    descriptionPrefix: string,
    desiredRule: Partial<FirewallRule>
  ): Promise<FirewallConfigResponse> => {
    const chainRules = chain === "input" ? config.input_rules : config.forward_rules;
    const existingRule = chainRules.find((rule) =>
      (rule.description ?? "").startsWith(descriptionPrefix)
    );

    if (existingRule) {
      await firewallIPv4Service.updateRule(
        chain,
        existingRule.rule_number,
        false,
        desiredRule,
        existingRule
      );
      return firewallIPv4Service.getConfig(true);
    }

    await firewallIPv4Service.createRule(
      chain,
      getNextFirewallRuleNumber(chainRules),
      false,
      desiredRule
    );
    return firewallIPv4Service.getConfig(true);
  };

  const applyFirewallDefaultsConfiguration = async () => {
    if (!enableFirewallDefaults) return;

    await firewallIPv4Service.setBaseChainDefaultAction("input", "drop");
    await firewallIPv4Service.setBaseChainDefaultAction("forward", "drop");
    await firewallIPv4Service.setBaseChainDefaultAction("output", "accept");

    let config = await firewallIPv4Service.getConfig(true);

    config = await ensureFirewallRule(config, "input", FW_INPUT_STATE_PREFIX, {
      description: FW_INPUT_STATE_PREFIX,
      action: "accept",
      source: {},
      destination: {},
      state: {
        established: true,
        related: true,
        new: false,
        invalid: false,
      },
      interface: {},
      disable: false,
      log: false,
    });

    config = await ensureFirewallRule(config, "input", FW_INPUT_LAN_PREFIX, {
      description: `${FW_INPUT_LAN_PREFIX} (${lanInterface})`,
      action: "accept",
      source: {},
      destination: {},
      state: {},
      interface: { inbound: lanInterface },
      disable: false,
      log: false,
    });

    config = await ensureFirewallRule(config, "forward", FW_FORWARD_STATE_PREFIX, {
      description: FW_FORWARD_STATE_PREFIX,
      action: "accept",
      source: {},
      destination: {},
      state: {
        established: true,
        related: true,
        new: false,
        invalid: false,
      },
      interface: {},
      disable: false,
      log: false,
    });

    await ensureFirewallRule(config, "forward", FW_FORWARD_LAN_PREFIX, {
      description: `${FW_FORWARD_LAN_PREFIX} (${lanInterface})`,
      action: "accept",
      source: {},
      destination: {},
      state: {},
      interface: { inbound: lanInterface },
      disable: false,
      log: false,
    });
  };

  const applyOutboundNatConfiguration = async () => {
    const natConfig = await natService.getConfig(true);
    const wizardRules = natConfig.source_rules.filter((rule) =>
      (rule.description ?? "").startsWith(NAT_DESCRIPTION_PREFIX)
    );

    for (const rule of wizardRules) {
      await natService.deleteSourceRule(rule.rule_number);
    }

    if (!enableOutboundNat) return;
    if (lanMode !== "static") return;
    if (!lanSubnetCidr) {
      throw new Error("Unable to derive LAN subnet for outbound NAT rule.");
    }

    const remaining = natConfig.source_rules
      .filter(
        (rule) =>
          !(rule.description ?? "").startsWith(NAT_DESCRIPTION_PREFIX)
      )
      .map((rule) => rule.rule_number);
    const nextRuleNumber =
      remaining.length === 0 ? 100 : Math.max(...remaining) + 10;

    await natService.createSourceRule(nextRuleNumber, {
      description: `${NAT_DESCRIPTION_PREFIX} ${lanSubnetCidr} -> ${wanInterface}`,
      source_address: lanSubnetCidr,
      outbound_interface_type: "name",
      outbound_interface_value: wanInterface,
      translation_address: "masquerade",
    });
  };

  const applyWizard = async () => {
    const validationIssue = validateUpToStep(4);
    if (validationIssue) {
      setValidationError(validationIssue);
      return;
    }

    setApplying(true);
    setApplyError(null);
    setApplySuccess(null);
    setApplyLog([]);

    try {
      appendApplyLog("Applying WAN/LAN interface configuration...");
      await applyInterfaceConfiguration();

      appendApplyLog("Updating WAN default route...");
      await applyDefaultRouteConfiguration();

      if (enableLanDhcp) {
        appendApplyLog("Configuring LAN DHCP server...");
        await applyDhcpServerConfiguration();
      } else {
        appendApplyLog("LAN DHCP server step skipped.");
      }

      if (enableOutboundNat) {
        appendApplyLog("Applying outbound masquerade NAT (LAN -> WAN)...");
      } else {
        appendApplyLog("Outbound NAT step skipped.");
      }
      await applyOutboundNatConfiguration();

      if (enableFirewallDefaults) {
        appendApplyLog("Applying baseline IPv4 firewall policy...");
      } else {
        appendApplyLog("Firewall default policy step skipped.");
      }
      await applyFirewallDefaultsConfiguration();

      appendApplyLog("Refreshing cached configs...");
      await Promise.allSettled([
        ethernetService.refreshConfig(),
        dhcpService.refreshConfig(),
        staticRoutesService.refreshConfig(),
        natService.refreshConfig(),
        firewallIPv4Service.refreshConfig(),
      ]);

      setApplySuccess(
        "Setup complete. WAN/LAN, DHCP, NAT, and firewall defaults are applied. Save config from the banner if needed."
      );
      await refreshPageData();
    } catch (error) {
      setApplyError(
        error instanceof Error ? error.message : "Failed to apply setup wizard."
      );
    } finally {
      setApplying(false);
    }
  };

  const selectedWan = interfaces.find((iface) => iface.name === wanInterface);
  const selectedLan = interfaces.find((iface) => iface.name === lanInterface);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Network Setup Wizard</h1>
            <p className="mt-1 text-muted-foreground">
              Guided first-pass configuration for WAN, LAN, DHCP, NAT, and firewall defaults.
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            pfSense-style quick start
          </Badge>
        </div>

        {loadingError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="space-y-2">
                <p className="font-semibold text-destructive">
                  Failed to load setup prerequisites
                </p>
                <p className="text-sm text-destructive/90">{loadingError}</p>
                <Button variant="outline" size="sm" onClick={refreshPageData}>
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}

        {!loadingError && (
          <>
            <div className="grid gap-2 sm:grid-cols-5">
              {WIZARD_STEPS.map(({ step: stepNumber, title }) => {
                const isActive = stepNumber === step;
                const isComplete = stepNumber < step;
                return (
                  <button
                    key={stepNumber}
                    type="button"
                    onClick={() => {
                      if (stepNumber <= step) {
                        setValidationError(null);
                        setStep(stepNumber);
                      }
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      isActive && "border-primary bg-primary/10",
                      isComplete && "border-green-500/40 bg-green-500/10",
                      !isActive && !isComplete && "border-border bg-background",
                      stepNumber > step && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <div className="text-xs text-muted-foreground">Step {stepNumber}</div>
                    <div className="text-sm font-medium">{title}</div>
                  </button>
                );
              })}
            </div>

            {validationError && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                {validationError}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <WandSparkles className="h-5 w-5 text-primary" />
                  {WIZARD_STEPS.find((item) => item.step === step)?.title}
                </CardTitle>
                <CardDescription>
                  {step === 1 &&
                    "Choose the physical interfaces that should act as WAN and LAN."}
                  {step === 2 &&
                    "Configure WAN as DHCP or static IPv4 with optional default gateway."}
                  {step === 3 &&
                    "Configure LAN interface IP mode and addressing."}
                  {step === 4 &&
                    "Optional LAN DHCP server settings and address pool."}
                  {step === 5 &&
                    "Review and apply optional security defaults (NAT + firewall)."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {step === 1 && (
                  <div className="space-y-6">
                    {interfaces.length < 2 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                        Less than two interfaces were detected. This wizard expects separate WAN
                        and LAN interfaces.
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="wizard-wan-interface">WAN Interface</Label>
                        <Select value={wanInterface} onValueChange={setWanInterface}>
                          <SelectTrigger id="wizard-wan-interface">
                            <SelectValue placeholder="Select WAN interface" />
                          </SelectTrigger>
                          <SelectContent>
                            {interfaces.map((iface) => {
                              const physical = physicalByInterface[iface.name];
                              const link = physical?.link_up === true ? "link up" : "link down";
                              const model = physical?.nic_model ? ` - ${physical.nic_model}` : "";
                              return (
                                <SelectItem key={iface.name} value={iface.name}>
                                  {iface.name}
                                  {model} ({link})
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!wanInterface || !!blinkingInterface}
                          onClick={() => triggerBlink(wanInterface)}
                        >
                          {blinkingInterface === wanInterface ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <LocateFixed className="h-4 w-4" />
                          )}
                          Blink Selected WAN
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="wizard-lan-interface">LAN Interface</Label>
                        <Select value={lanInterface} onValueChange={setLanInterface}>
                          <SelectTrigger id="wizard-lan-interface">
                            <SelectValue placeholder="Select LAN interface" />
                          </SelectTrigger>
                          <SelectContent>
                            {interfaces.map((iface) => {
                              const physical = physicalByInterface[iface.name];
                              const link = physical?.link_up === true ? "link up" : "link down";
                              const model = physical?.nic_model ? ` - ${physical.nic_model}` : "";
                              return (
                                <SelectItem key={iface.name} value={iface.name}>
                                  {iface.name}
                                  {model} ({link})
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!lanInterface || !!blinkingInterface}
                          onClick={() => triggerBlink(lanInterface)}
                        >
                          {blinkingInterface === lanInterface ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <LocateFixed className="h-4 w-4" />
                          )}
                          Blink Selected LAN
                        </Button>
                      </div>
                    </div>

                    {blinkStatus && (
                      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">
                        {blinkStatus}
                      </div>
                    )}
                    {blinkError && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                        {blinkError}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Selected WAN
                        </p>
                        <p className="mt-1 font-mono text-sm">{selectedWan?.name ?? "Not selected"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedWan?.addresses.length
                            ? selectedWan.addresses.join(", ")
                            : "No address configured"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Selected LAN
                        </p>
                        <p className="mt-1 font-mono text-sm">{selectedLan?.name ?? "Not selected"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedLan?.addresses.length
                            ? selectedLan.addresses.join(", ")
                            : "No address configured"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>WAN Address Mode</Label>
                      <Select
                        value={wanMode}
                        onValueChange={(value) => setWanMode(value as AddressMode)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select WAN mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dhcp">DHCP (recommended)</SelectItem>
                          <SelectItem value="static">Static IPv4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {wanMode === "static" && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="wizard-wan-static">WAN IPv4 CIDR</Label>
                          <Input
                            id="wizard-wan-static"
                            value={wanStaticCidr}
                            onChange={(event) => setWanStaticCidr(event.target.value)}
                            placeholder="203.0.113.2/24"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wizard-wan-gateway">
                            WAN Gateway (optional)
                          </Label>
                          <Input
                            id="wizard-wan-gateway"
                            value={wanGateway}
                            onChange={(event) => setWanGateway(event.target.value)}
                            placeholder="203.0.113.1"
                          />
                          <p className="text-xs text-muted-foreground">
                            If set, this wizard will configure `0.0.0.0/0` via this gateway.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>LAN Address Mode</Label>
                      <Select
                        value={lanMode}
                        onValueChange={(value) => setLanMode(value as AddressMode)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select LAN mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="static">Static IPv4 (recommended)</SelectItem>
                          <SelectItem value="dhcp">DHCP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {lanMode === "static" && (
                      <div className="space-y-2">
                        <Label htmlFor="wizard-lan-static">LAN IPv4 CIDR</Label>
                        <Input
                          id="wizard-lan-static"
                          value={lanStaticCidr}
                          onChange={(event) => setLanStaticCidr(event.target.value)}
                          placeholder="192.168.50.1/24"
                        />
                        <p className="text-xs text-muted-foreground">
                          LAN subnet will be derived automatically (for example `192.168.50.0/24`).
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-6">
                    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                      <Checkbox
                        id="wizard-enable-dhcp"
                        checked={enableLanDhcp}
                        disabled={lanMode !== "static"}
                        onCheckedChange={(checked) =>
                          setEnableLanDhcp(checked === true)
                        }
                      />
                      <div className="space-y-1">
                        <Label htmlFor="wizard-enable-dhcp">
                          Enable DHCP server on LAN
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Requires LAN static address mode.
                        </p>
                      </div>
                    </div>

                    {enableLanDhcp && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="wizard-dhcp-network-name">
                            Shared Network Name
                          </Label>
                          <Input
                            id="wizard-dhcp-network-name"
                            value={dhcpNetworkName}
                            onChange={(event) => setDhcpNetworkName(event.target.value)}
                            placeholder="LAN"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wizard-dhcp-domain-name">Domain Name</Label>
                          <Input
                            id="wizard-dhcp-domain-name"
                            value={dhcpDomainName}
                            onChange={(event) => setDhcpDomainName(event.target.value)}
                            placeholder="lan"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wizard-dhcp-lease">Lease Time (seconds)</Label>
                          <Input
                            id="wizard-dhcp-lease"
                            value={dhcpLeaseSeconds}
                            onChange={(event) => setDhcpLeaseSeconds(event.target.value)}
                            placeholder="86400"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wizard-dhcp-dns">
                            DNS Servers (comma separated)
                          </Label>
                          <Input
                            id="wizard-dhcp-dns"
                            value={dhcpDnsServers}
                            onChange={(event) => setDhcpDnsServers(event.target.value)}
                            placeholder="1.1.1.1,8.8.8.8"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wizard-dhcp-start">Range Start</Label>
                          <Input
                            id="wizard-dhcp-start"
                            value={dhcpRangeStart}
                            onChange={(event) => {
                              setCustomDhcpRange(true);
                              setDhcpRangeStart(event.target.value);
                            }}
                            placeholder="192.168.50.100"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wizard-dhcp-stop">Range Stop</Label>
                          <Input
                            id="wizard-dhcp-stop"
                            value={dhcpRangeStop}
                            onChange={(event) => {
                              setCustomDhcpRange(true);
                              setDhcpRangeStop(event.target.value);
                            }}
                            placeholder="192.168.50.199"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-6">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" />
                          <p className="font-medium">Default IPv4 Firewall</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Sets input/forward defaults to `drop`, output to `accept`,
                          then allows LAN + established/related traffic.
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <Checkbox
                            id="wizard-firewall-defaults"
                            checked={enableFirewallDefaults}
                            onCheckedChange={(checked) =>
                              setEnableFirewallDefaults(checked === true)
                            }
                          />
                          <Label htmlFor="wizard-firewall-defaults">Enable</Label>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2">
                          <WandSparkles className="h-4 w-4 text-primary" />
                          <p className="font-medium">Outbound NAT (Masquerade)</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Adds LAN subnet masquerade rule out of WAN.
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <Checkbox
                            id="wizard-nat-defaults"
                            checked={enableOutboundNat}
                            disabled={lanMode !== "static"}
                            onCheckedChange={(checked) =>
                              setEnableOutboundNat(checked === true)
                            }
                          />
                          <Label htmlFor="wizard-nat-defaults">Enable</Label>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <h3 className="font-semibold">Configuration Preview</h3>
                      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                        <div>
                          <span className="text-muted-foreground">WAN:</span>{" "}
                          <span className="font-mono">
                            {wanInterface || "unset"} /{" "}
                            {wanMode === "dhcp" ? "DHCP" : wanStaticCidr || "static-unset"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">LAN:</span>{" "}
                          <span className="font-mono">
                            {lanInterface || "unset"} /{" "}
                            {lanMode === "dhcp" ? "DHCP" : lanStaticCidr || "static-unset"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">LAN Subnet:</span>{" "}
                          <span className="font-mono">{lanSubnetCidr || "n/a"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">LAN DHCP:</span>{" "}
                          <span className="font-mono">
                            {enableLanDhcp ? `${dhcpRangeStart} - ${dhcpRangeStop}` : "disabled"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {applyError && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                        {applyError}
                      </div>
                    )}

                    {applySuccess && (
                      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4" />
                          <span>{applySuccess}</span>
                        </div>
                      </div>
                    )}

                    {applyLog.length > 0 && (
                      <div className="rounded-lg border border-border bg-background p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Apply Progress
                        </p>
                        <div className="mt-2 space-y-1 text-sm">
                          {applyLog.map((line, index) => (
                            <div key={`${line}-${index}`} className="text-muted-foreground">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <NetworkNotice />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={goToPreviousStep}
                  disabled={step === 1 || applying}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>

                {step < 5 && (
                  <Button onClick={goToNextStep} disabled={applying}>
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}

                {step === 5 && (
                  <Button onClick={applyWizard} disabled={applying}>
                    {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                    Apply Setup
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function NetworkNotice() {
  return (
    <span>
      This wizard applies running config immediately. Save persistent config after validation.
    </span>
  );
}
