"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ethernetService } from "@/lib/api/ethernet";
import type {
  BatchOperation,
  EthernetCapabilities,
  EthernetInterface,
  VlanKind,
  VLANWithParent,
} from "@/lib/api/types/ethernet";
import { formatInterfaceDisplayName } from "@/lib/utils";
import { Loader2, X } from "lucide-react";

interface ComprehensiveVLANModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vlan?: VLANWithParent | null;
  interfaces: EthernetInterface[];
  capabilities: EthernetCapabilities | null;
  onSuccess: () => void;
  mode: "create" | "edit";
}

interface VlanOperationSet {
  createOp: string;
  deleteOp: string;
  setAddressOp: string;
  deleteAddressOp: string;
  setDescriptionOp: string;
  deleteDescriptionOp: string;
  setMtuOp: string;
  deleteMtuOp: string;
  setMacOp: string;
  deleteMacOp: string;
  setVrfOp: string;
  deleteVrfOp: string;
  setDisableOp: string;
  deleteDisableOp: string;
  setDhcpClientOp: string;
  setDhcpHostOp: string;
  setIpv6AutoconfOp: string;
  setIpv6Eui64Op: string;
}

const OPERATION_MAP: Record<VlanKind, VlanOperationSet> = {
  "vif": {
    createOp: "set_vif",
    deleteOp: "delete_vif",
    setAddressOp: "set_vif_address",
    deleteAddressOp: "delete_vif_address",
    setDescriptionOp: "set_vif_description",
    deleteDescriptionOp: "delete_vif_description",
    setMtuOp: "set_vif_mtu",
    deleteMtuOp: "delete_vif_mtu",
    setMacOp: "set_vif_mac",
    deleteMacOp: "delete_vif_mac",
    setVrfOp: "set_vif_vrf",
    deleteVrfOp: "delete_vif_vrf",
    setDisableOp: "set_vif_disable",
    deleteDisableOp: "delete_vif_disable",
    setDhcpClientOp: "set_vif_dhcp_options_client_id",
    setDhcpHostOp: "set_vif_dhcp_options_host_name",
    setIpv6AutoconfOp: "set_vif_ipv6_address_autoconf",
    setIpv6Eui64Op: "set_vif_ipv6_address_eui64",
  },
  "vif-s": {
    createOp: "set_vif_s",
    deleteOp: "delete_vif_s",
    setAddressOp: "set_vif_s_address",
    deleteAddressOp: "delete_vif_s_address",
    setDescriptionOp: "set_vif_s_description",
    deleteDescriptionOp: "delete_vif_s_description",
    setMtuOp: "set_vif_s_mtu",
    deleteMtuOp: "delete_vif_s_mtu",
    setMacOp: "set_vif_s_mac",
    deleteMacOp: "delete_vif_s_mac",
    setVrfOp: "set_vif_s_vrf",
    deleteVrfOp: "delete_vif_s_vrf",
    setDisableOp: "set_vif_s_disable",
    deleteDisableOp: "delete_vif_s_disable",
    setDhcpClientOp: "set_vif_s_dhcp_options_client_id",
    setDhcpHostOp: "set_vif_s_dhcp_options_host_name",
    setIpv6AutoconfOp: "set_vif_s_ipv6_address_autoconf",
    setIpv6Eui64Op: "set_vif_s_ipv6_address_eui64",
  },
  "vif-c": {
    createOp: "set_vif_c",
    deleteOp: "delete_vif_c",
    setAddressOp: "set_vif_c_address",
    deleteAddressOp: "delete_vif_c_address",
    setDescriptionOp: "set_vif_c_description",
    deleteDescriptionOp: "delete_vif_c_description",
    setMtuOp: "set_vif_c_mtu",
    deleteMtuOp: "delete_vif_c_mtu",
    setMacOp: "set_vif_c_mac",
    deleteMacOp: "delete_vif_c_mac",
    setVrfOp: "set_vif_c_vrf",
    deleteVrfOp: "delete_vif_c_vrf",
    setDisableOp: "set_vif_c_disable",
    deleteDisableOp: "delete_vif_c_disable",
    setDhcpClientOp: "set_vif_c_dhcp_options_client_id",
    setDhcpHostOp: "set_vif_c_dhcp_options_host_name",
    setIpv6AutoconfOp: "set_vif_c_ipv6_address_autoconf",
    setIpv6Eui64Op: "set_vif_c_ipv6_address_eui64",
  },
};

const VLAN_KIND_LABELS: Record<VlanKind, string> = {
  "vif": "802.1Q VLAN",
  "vif-s": "QinQ Service VLAN (S-Tag)",
  "vif-c": "QinQ Customer VLAN (C-Tag)",
};

const parseVlanTag = (value: string, label: string): string => {
  const trimmed = value.trim();
  const parsed = Number.parseInt(trimmed, 10);
  if (!trimmed || Number.isNaN(parsed) || parsed < 1 || parsed > 4094) {
    throw new Error(`${label} must be between 1 and 4094`);
  }
  return String(parsed);
};

export function ComprehensiveVLANModal({
  open,
  onOpenChange,
  vlan,
  interfaces,
  capabilities,
  onSuccess,
  mode,
}: ComprehensiveVLANModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parentInterface, setParentInterface] = useState("");
  const [vlanType, setVlanType] = useState<VlanKind>("vif");
  const [vlanId, setVlanId] = useState("");
  const [serviceVlanId, setServiceVlanId] = useState("");
  const [createServiceVlanIfMissing, setCreateServiceVlanIfMissing] = useState(true);

  const [description, setDescription] = useState("");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [mtu, setMtu] = useState("");
  const [mac, setMac] = useState("");
  const [vrf, setVrf] = useState("");
  const [disabled, setDisabled] = useState(false);

  const [dhcpClientId, setDhcpClientId] = useState("");
  const [dhcpHostName, setDhcpHostName] = useState("");

  const [ipv6Autoconf, setIpv6Autoconf] = useState(false);
  const [ipv6Eui64, setIpv6Eui64] = useState("");

  const vlanFeatures = capabilities?.features?.vlan ?? {};

  const parentConfig = useMemo(
    () => interfaces.find((iface) => iface.name === parentInterface),
    [interfaces, parentInterface]
  );

  const existingServiceVlans = useMemo(() => {
    const serviceVifs = parentConfig?.vif_s ?? [];
    return new Set(serviceVifs.map((item) => item.vlan_id));
  }, [parentConfig]);

  const serviceExists = serviceVlanId.trim() !== "" && existingServiceVlans.has(serviceVlanId.trim());

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && vlan) {
      setParentInterface(vlan.parentInterface);
      setVlanType(vlan.kind);
      setVlanId(vlan.vlan_id);
      setServiceVlanId(vlan.service_vlan_id ?? "");
      setDescription(vlan.description ?? "");
      setAddresses(vlan.addresses.length > 0 ? [...vlan.addresses] : []);
      setMtu(vlan.mtu ?? "");
      setMac(vlan.mac ?? "");
      setVrf(vlan.vrf ?? "");
      setDisabled(Boolean(vlan.disable));
      setDhcpClientId("");
      setDhcpHostName("");
      setIpv6Autoconf(false);
      setIpv6Eui64("");
      setCreateServiceVlanIfMissing(true);
    } else {
      const defaultKind: VlanKind =
        vlanFeatures.vif !== false
          ? "vif"
          : vlanFeatures.vif_s !== false
            ? "vif-s"
            : "vif-c";

      setParentInterface("");
      setVlanType(defaultKind);
      setVlanId("");
      setServiceVlanId("");
      setDescription("");
      setAddresses([]);
      setMtu("");
      setMac("");
      setVrf("");
      setDisabled(false);
      setDhcpClientId("");
      setDhcpHostName("");
      setIpv6Autoconf(false);
      setIpv6Eui64("");
      setCreateServiceVlanIfMissing(true);
    }

    setError(null);
  }, [mode, open, vlan, vlanFeatures.vif, vlanFeatures.vif_c, vlanFeatures.vif_s]);

  const handleAddAddress = () => {
    setAddresses((current) => [...current, ""]);
  };

  const handleRemoveAddress = (index: number) => {
    setAddresses((current) => current.filter((_, position) => position !== index));
  };

  const handleAddressChange = (index: number, value: string) => {
    setAddresses((current) => {
      const updated = [...current];
      updated[index] = value;
      return updated;
    });
  };

  const interfaceHasVif = (iface: EthernetInterface, tag: string) => {
    return (iface.vif ?? []).some((item) => item.vlan_id === tag);
  };

  const interfaceHasVifS = (iface: EthernetInterface, tag: string) => {
    return (iface.vif_s ?? []).some((item) => item.vlan_id === tag);
  };

  const interfaceHasVifC = (iface: EthernetInterface, sTag: string, cTag: string) => {
    const service = (iface.vif_s ?? []).find((item) => item.vlan_id === sTag);
    if (!service) return false;
    return (service.vif_c ?? []).some((item) => item.vlan_id === cTag);
  };

  const getBaseIdentifier = (primaryTag: string, sTag: string) => {
    if (vlanType === "vif-c") {
      return `${sTag},${primaryTag}`;
    }
    return primaryTag;
  };

  const getValueWithPayload = (primaryTag: string, sTag: string, payload: string) => {
    if (vlanType === "vif-c") {
      return `${sTag},${primaryTag},${payload}`;
    }
    return `${primaryTag},${payload}`;
  };

  const getVlanDisplayName = (primaryTag: string, sTag: string) => {
    if (vlanType === "vif-c") {
      return `${parentInterface}.${sTag}.${primaryTag}`;
    }
    return `${parentInterface}.${primaryTag}`;
  };

  const buildOperations = (primaryTag: string, sTag: string): BatchOperation[] => {
    const operationSet = OPERATION_MAP[vlanType];
    const operations: BatchOperation[] = [];

    if (mode === "create") {
      if (vlanType === "vif-c") {
        if (createServiceVlanIfMissing && !serviceExists) {
          operations.push({ op: "set_vif_s", value: sTag });
        }
        operations.push({ op: operationSet.createOp, value: `${sTag},${primaryTag}` });
      } else {
        operations.push({ op: operationSet.createOp, value: primaryTag });
      }
    }

    const currentAddresses = new Set(vlan?.addresses ?? []);
    const nextAddresses = new Set(addresses.map((addr) => addr.trim()).filter(Boolean));

    if (mode === "create" && description.trim()) {
      operations.push({
        op: operationSet.setDescriptionOp,
        value: getValueWithPayload(primaryTag, sTag, description.trim()),
      });
    } else if (mode === "edit" && description.trim() !== (vlan?.description ?? "")) {
      if (description.trim()) {
        operations.push({
          op: operationSet.setDescriptionOp,
          value: getValueWithPayload(primaryTag, sTag, description.trim()),
        });
      } else if (vlan?.description) {
        operations.push({ op: operationSet.deleteDescriptionOp, value: getBaseIdentifier(primaryTag, sTag) });
      }
    }

    for (const address of nextAddresses) {
      if (!currentAddresses.has(address)) {
        operations.push({
          op: operationSet.setAddressOp,
          value: getValueWithPayload(primaryTag, sTag, address),
        });
      }
    }

    if (mode === "edit") {
      for (const address of currentAddresses) {
        if (!nextAddresses.has(address)) {
          operations.push({
            op: operationSet.deleteAddressOp,
            value: getValueWithPayload(primaryTag, sTag, address),
          });
        }
      }
    }

    if (mode === "create" && mtu.trim()) {
      operations.push({ op: operationSet.setMtuOp, value: getValueWithPayload(primaryTag, sTag, mtu.trim()) });
    } else if (mode === "edit" && mtu.trim() !== (vlan?.mtu ?? "")) {
      if (mtu.trim()) {
        operations.push({ op: operationSet.setMtuOp, value: getValueWithPayload(primaryTag, sTag, mtu.trim()) });
      } else if (vlan?.mtu) {
        operations.push({ op: operationSet.deleteMtuOp, value: getBaseIdentifier(primaryTag, sTag) });
      }
    }

    if (mode === "create" && mac.trim()) {
      operations.push({ op: operationSet.setMacOp, value: getValueWithPayload(primaryTag, sTag, mac.trim()) });
    } else if (mode === "edit" && mac.trim() !== (vlan?.mac ?? "")) {
      if (mac.trim()) {
        operations.push({ op: operationSet.setMacOp, value: getValueWithPayload(primaryTag, sTag, mac.trim()) });
      } else if (vlan?.mac) {
        operations.push({ op: operationSet.deleteMacOp, value: getBaseIdentifier(primaryTag, sTag) });
      }
    }

    if (mode === "create" && vrf.trim()) {
      operations.push({ op: operationSet.setVrfOp, value: getValueWithPayload(primaryTag, sTag, vrf.trim()) });
    } else if (mode === "edit" && vrf.trim() !== (vlan?.vrf ?? "")) {
      if (vrf.trim()) {
        operations.push({ op: operationSet.setVrfOp, value: getValueWithPayload(primaryTag, sTag, vrf.trim()) });
      } else if (vlan?.vrf) {
        operations.push({ op: operationSet.deleteVrfOp, value: getValueWithPayload(primaryTag, sTag, vlan.vrf) });
      }
    }

    if (mode === "edit" && disabled !== Boolean(vlan?.disable)) {
      operations.push({
        op: disabled ? operationSet.setDisableOp : operationSet.deleteDisableOp,
        value: getBaseIdentifier(primaryTag, sTag),
      });
    } else if (mode === "create" && disabled) {
      operations.push({ op: operationSet.setDisableOp, value: getBaseIdentifier(primaryTag, sTag) });
    }

    if (dhcpClientId.trim()) {
      operations.push({
        op: operationSet.setDhcpClientOp,
        value: getValueWithPayload(primaryTag, sTag, dhcpClientId.trim()),
      });
    }

    if (dhcpHostName.trim()) {
      operations.push({
        op: operationSet.setDhcpHostOp,
        value: getValueWithPayload(primaryTag, sTag, dhcpHostName.trim()),
      });
    }

    if (ipv6Autoconf) {
      operations.push({ op: operationSet.setIpv6AutoconfOp, value: getBaseIdentifier(primaryTag, sTag) });
    }

    if (ipv6Eui64.trim()) {
      operations.push({
        op: operationSet.setIpv6Eui64Op,
        value: getValueWithPayload(primaryTag, sTag, ipv6Eui64.trim()),
      });
    }

    return operations;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!parentInterface.trim()) {
        throw new Error("Parent interface is required");
      }

      const primaryTag = parseVlanTag(
        vlanId,
        vlanType === "vif-c" ? "Customer VLAN ID" : "VLAN ID"
      );
      const sTag = vlanType === "vif-c" ? parseVlanTag(serviceVlanId, "Service VLAN ID") : "";

      const parent = interfaces.find((iface) => iface.name === parentInterface);
      if (!parent) {
        throw new Error("Selected parent interface was not found");
      }

      if (mode === "create") {
        if (vlanType === "vif" && interfaceHasVif(parent, primaryTag)) {
          throw new Error(`VLAN ${getVlanDisplayName(primaryTag, sTag)} already exists`);
        }
        if (vlanType === "vif-s" && interfaceHasVifS(parent, primaryTag)) {
          throw new Error(`Service VLAN ${getVlanDisplayName(primaryTag, sTag)} already exists`);
        }
        if (vlanType === "vif-c") {
          if (!serviceExists && !createServiceVlanIfMissing) {
            throw new Error(`Service VLAN ${parentInterface}.${sTag} does not exist`);
          }
          if (interfaceHasVifC(parent, sTag, primaryTag)) {
            throw new Error(`Customer VLAN ${getVlanDisplayName(primaryTag, sTag)} already exists`);
          }
        }
      }

      const operations = buildOperations(primaryTag, sTag);
      if (operations.length === 0) {
        throw new Error("No changes detected");
      }

      await ethernetService.batchConfigure({
        interface: parentInterface,
        operations,
      });

      await ethernetService.refreshConfig();
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${mode} VLAN`);
    } finally {
      setLoading(false);
    }
  };

  const canEditDescription = vlanFeatures.vif_description !== false;
  const canEditAddresses = vlanFeatures.vif_address !== false;
  const canEditMtu = vlanFeatures.vif_mtu !== false;
  const canEditMac = vlanFeatures.vif_mac !== false;
  const canEditVrf = vlanFeatures.vif_vrf !== false;
  const canEditDisable = vlanFeatures.vif_disable !== false;
  const canEditDhcp = vlanFeatures.vif_dhcp_options !== false;
  const canEditIpv6 = vlanFeatures.vif_ipv6 !== false;

  const allowVif = vlanFeatures.vif !== false;
  const allowVifS = vlanFeatures.vif_s !== false;
  const allowVifC = vlanFeatures.vif_c !== false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create VLAN / QinQ Subinterface" : `Edit ${vlan?.fullName}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Configure standard VLANs and QinQ service/customer tags with full interface options."
              : "Modify VLAN or QinQ subinterface settings."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
              <TabsTrigger value="dhcp">DHCP/IPv6</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              {mode === "create" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="parent-interface">
                      Parent Interface <span className="text-destructive">*</span>
                    </Label>
                    <Select value={parentInterface || undefined} onValueChange={setParentInterface}>
                      <SelectTrigger id="parent-interface">
                        <SelectValue placeholder="Select parent interface" />
                      </SelectTrigger>
                      <SelectContent>
                        {interfaces.map((iface) => (
                          <SelectItem key={iface.name} value={iface.name}>
                            {formatInterfaceDisplayName(iface.name, iface.description)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="vlan-type">
                      VLAN Type <span className="text-destructive">*</span>
                    </Label>
                    <Select value={vlanType} onValueChange={(value) => setVlanType(value as VlanKind)}>
                      <SelectTrigger id="vlan-type">
                        <SelectValue placeholder="Select VLAN type" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowVif && <SelectItem value="vif">{VLAN_KIND_LABELS["vif"]}</SelectItem>}
                        {allowVifS && <SelectItem value="vif-s">{VLAN_KIND_LABELS["vif-s"]}</SelectItem>}
                        {allowVifC && <SelectItem value="vif-c">{VLAN_KIND_LABELS["vif-c"]}</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>

                  {vlanType === "vif-c" && (
                    <div className="space-y-2">
                      <Label htmlFor="service-vlan-id">
                        Service VLAN ID <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="service-vlan-id"
                        type="number"
                        min="1"
                        max="4094"
                        placeholder="100"
                        value={serviceVlanId}
                        onChange={(e) => setServiceVlanId(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        QinQ outer tag (S-Tag). Existing on parent: {Array.from(existingServiceVlans).join(", ") || "none"}
                      </p>
                      <div className="flex items-center space-x-2 pt-1">
                        <Checkbox
                          id="create-service-vlan-if-missing"
                          checked={createServiceVlanIfMissing}
                          onCheckedChange={(checked) => setCreateServiceVlanIfMissing(checked === true)}
                        />
                        <Label htmlFor="create-service-vlan-if-missing" className="cursor-pointer text-sm">
                          Create service VLAN automatically if missing
                        </Label>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="vlan-id">
                      {vlanType === "vif-c" ? "Customer VLAN ID" : "VLAN ID"} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="vlan-id"
                      type="number"
                      min="1"
                      max="4094"
                      placeholder="200"
                      value={vlanId}
                      onChange={(e) => setVlanId(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">Valid range: 1-4094</p>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>VLAN Interface</Label>
                  <Input value={vlan?.fullName ?? ""} disabled className="font-mono" />
                  <p className="text-xs text-muted-foreground">
                    Parent: {vlan?.parentInterface} | Type: {vlan ? VLAN_KIND_LABELS[vlan.kind] : "-"}
                  </p>
                </div>
              )}

              {canEditDescription && (
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="Guest Network VLAN"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              )}

              {canEditAddresses && (
                <div className="space-y-2">
                  <Label>IP Addresses</Label>
                  {addresses.map((address, index) => (
                    <div key={`${index}-${address}`} className="flex gap-2">
                      <Input
                        placeholder="10.0.0.1/24 or 2001:db8::1/64"
                        value={address}
                        onChange={(e) => handleAddressChange(index, e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveAddress(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={handleAddAddress}>
                    Add Address
                  </Button>
                </div>
              )}

              {canEditDisable && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="disable"
                    checked={disabled}
                    onCheckedChange={(checked) => setDisabled(checked === true)}
                  />
                  <Label htmlFor="disable" className="cursor-pointer">
                    Administratively disable subinterface
                  </Label>
                </div>
              )}
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {canEditMtu && (
                  <div className="space-y-2">
                    <Label htmlFor="mtu">MTU</Label>
                    <Input
                      id="mtu"
                      type="number"
                      placeholder="1500"
                      value={mtu}
                      onChange={(e) => setMtu(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Must be less than or equal to parent interface MTU</p>
                  </div>
                )}

                {canEditMac && (
                  <div className="space-y-2">
                    <Label htmlFor="mac">MAC Address</Label>
                    <Input
                      id="mac"
                      placeholder="00:11:22:33:44:55"
                      value={mac}
                      onChange={(e) => setMac(e.target.value)}
                    />
                  </div>
                )}

                {canEditVrf && (
                  <div className="space-y-2">
                    <Label htmlFor="vrf">VRF</Label>
                    <Input
                      id="vrf"
                      placeholder="MGMT"
                      value={vrf}
                      onChange={(e) => setVrf(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="dhcp" className="space-y-4">
              {canEditDhcp && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">DHCP Options</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dhcp-client-id">Client ID</Label>
                      <Input
                        id="dhcp-client-id"
                        placeholder="client-identifier"
                        value={dhcpClientId}
                        onChange={(e) => setDhcpClientId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dhcp-hostname">Host Name</Label>
                      <Input
                        id="dhcp-hostname"
                        placeholder="my-host"
                        value={dhcpHostName}
                        onChange={(e) => setDhcpHostName(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {canEditIpv6 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">IPv6 Settings</h3>
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <Label htmlFor="ipv6-eui64">EUI-64 Prefix</Label>
                      <Input
                        id="ipv6-eui64"
                        placeholder="2001:db8::/64"
                        value={ipv6Eui64}
                        onChange={(e) => setIpv6Eui64(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="ipv6-autoconf"
                        checked={ipv6Autoconf}
                        onCheckedChange={(checked) => setIpv6Autoconf(checked === true)}
                      />
                      <Label htmlFor="ipv6-autoconf" className="cursor-pointer text-sm">
                        Enable IPv6 Autoconfig
                      </Label>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "create" ? "Create Subinterface" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
