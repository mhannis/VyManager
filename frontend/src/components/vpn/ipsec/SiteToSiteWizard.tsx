"use client";

import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, Sparkles, Wand2 } from "lucide-react";
import { ipsecService } from "@/lib/api/ipsec";
import { firewallIPv4Service } from "@/lib/api/firewall-ipv4";
import { formatInterfaceDisplayName } from "@/lib/utils";

export interface SiteToSiteWizardInterfaceOption {
  name: string;
  description?: string | null;
}

interface SiteToSiteWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
  interfaceOptions: SiteToSiteWizardInterfaceOption[];
  existingPeerIds: string[];
  existingIkeGroups: string[];
  existingEspGroups: string[];
  existingPskIds: string[];
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function ensureUnique(base: string, existing: string[]): string {
  const taken = new Set(existing.map((item) => item.toLowerCase()));
  let candidate = base;
  let counter = 1;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function isIpv4(value: string): boolean {
  const parts = value.trim().split(".");
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return false;
    const num = Number.parseInt(part, 10);
    if (num < 0 || num > 255) return false;
  }
  return true;
}

export function SiteToSiteWizard({
  open,
  onOpenChange,
  onSuccess,
  interfaceOptions,
  existingPeerIds,
  existingIkeGroups,
  existingEspGroups,
  existingPskIds,
}: SiteToSiteWizardProps) {
  const [peerId, setPeerId] = useState("");
  const [description, setDescription] = useState("");
  const [remoteAddress, setRemoteAddress] = useState("");
  const [localAddress, setLocalAddress] = useState("");
  const [localId, setLocalId] = useState("");
  const [remoteId, setRemoteId] = useState("");
  const [psk, setPsk] = useState("");

  const [wanInterface, setWanInterface] = useState("");
  const [useDhcpInterface, setUseDhcpInterface] = useState(true);

  const [localPrefix, setLocalPrefix] = useState("");
  const [remotePrefix, setRemotePrefix] = useState("");
  const [tunnelId, setTunnelId] = useState("1");

  const [ikeEncryption, setIkeEncryption] = useState("aes256");
  const [ikeHash, setIkeHash] = useState("sha256");
  const [ikeDhGroup, setIkeDhGroup] = useState("14");
  const [ikeLifetime, setIkeLifetime] = useState("28800");

  const [espEncryption, setEspEncryption] = useState("aes256gcm128");
  const [espHash, setEspHash] = useState("sha256");
  const [espPfsGroup, setEspPfsGroup] = useState("14");
  const [espLifetime, setEspLifetime] = useState("3600");

  const [enableFirewallAssist, setEnableFirewallAssist] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedInterface = useMemo(() => {
    if (!wanInterface && interfaceOptions.length > 0) return interfaceOptions[0]?.name ?? "";
    return wanInterface;
  }, [wanInterface, interfaceOptions]);

  const resetState = () => {
    setPeerId("");
    setDescription("");
    setRemoteAddress("");
    setLocalAddress("");
    setLocalId("");
    setRemoteId("");
    setPsk("");
    setWanInterface("");
    setUseDhcpInterface(true);
    setLocalPrefix("");
    setRemotePrefix("");
    setTunnelId("1");
    setIkeEncryption("aes256");
    setIkeHash("sha256");
    setIkeDhGroup("14");
    setIkeLifetime("28800");
    setEspEncryption("aes256gcm128");
    setEspHash("sha256");
    setEspPfsGroup("14");
    setEspLifetime("3600");
    setEnableFirewallAssist(true);
    setLoading(false);
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const validate = (): string | null => {
    if (!peerId.trim()) return "Peer ID / remote gateway is required.";
    if (existingPeerIds.includes(peerId.trim())) return `Peer '${peerId.trim()}' already exists.`;
    if (!remoteAddress.trim()) return "Remote gateway address is required.";
    if (!psk.trim()) return "Pre-shared key is required.";
    if (!localPrefix.trim() || !remotePrefix.trim()) return "Local and remote Phase 2 prefixes are required.";
    if (!useDhcpInterface && !localAddress.trim()) {
      return "Local address is required when DHCP interface mode is disabled.";
    }
    if (useDhcpInterface && !selectedInterface) {
      return "Select the WAN/interface used for IPsec.";
    }
    if (useDhcpInterface && interfaceOptions.length === 0) {
      return "No interfaces were discovered. Configure at least one interface before running the wizard.";
    }
    return null;
  };

  const applyFirewallAssist = async (peer: string, inboundInterface: string, remote: string) => {
    const config = await firewallIPv4Service.getConfig(true);
    const currentRules = config.input?.rules || config.input_rules || [];

    const hasRule = (descriptionText: string) =>
      currentRules.some((rule) => (rule.description || "").trim().toLowerCase() === descriptionText.toLowerCase());

    const nextRuleBase = currentRules.reduce((max, rule) => Math.max(max, Number(rule.rule_number || 0)), 0) + 10;
    let nextRule = nextRuleBase;

    const sourceAddress = isIpv4(remote) ? `${remote}/32` : null;

    const ruleSpecs: Array<{ description: string; protocol: string; destinationPort?: string }> = [
      {
        description: `IPsec ${peer} IKE (UDP/500)`,
        protocol: "udp",
        destinationPort: "500",
      },
      {
        description: `IPsec ${peer} NAT-T (UDP/4500)`,
        protocol: "udp",
        destinationPort: "4500",
      },
      {
        description: `IPsec ${peer} ESP`,
        protocol: "esp",
      },
    ];

    for (const spec of ruleSpecs) {
      if (hasRule(spec.description)) continue;

      await firewallIPv4Service.createRule("input", nextRule, false, {
        action: "accept",
        description: spec.description,
        protocol: spec.protocol,
        destination: spec.destinationPort ? { port: spec.destinationPort } : undefined,
        interface: { inbound: inboundInterface },
        source: sourceAddress ? { address: sourceAddress } : undefined,
      });

      nextRule += 10;
    }
  };

  const handleApply = async () => {
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const peer = peerId.trim();
      const remote = remoteAddress.trim();
      const baseName = slug(peer) || "ipsec";

      const ikeGroup = ensureUnique(`ike-${baseName}`, existingIkeGroups);
      const espGroup = ensureUnique(`esp-${baseName}`, existingEspGroups);
      const pskId = ensureUnique(`psk-${baseName}`, existingPskIds);

      await ipsecService.upsertIkeGroup(ikeGroup, {
        key_exchange: "ikev2",
        close_action: "none",
        lifetime: ikeLifetime.trim() || undefined,
        dead_peer_detection: {
          action: "restart",
          interval: "30",
          timeout: "120",
        },
        proposals: [
          {
            proposal_id: "1",
            encryption: ikeEncryption,
            hash: ikeHash,
            dh_group: ikeDhGroup,
          },
        ],
      });

      await ipsecService.upsertEspGroup(espGroup, {
        lifetime: espLifetime.trim() || undefined,
        mode: "tunnel",
        pfs: espPfsGroup,
        proposals: [
          {
            proposal_id: "1",
            encryption: espEncryption,
            hash: espHash,
          },
        ],
      });

      await ipsecService.upsertPsk(pskId, {
        ids: [localId.trim() || "%any", remoteId.trim() || peer],
        secret: psk,
        secret_type: "text",
      });

      if (selectedInterface) {
        const settings = await ipsecService.getSettings();
        if (!settings.interfaces.includes(selectedInterface)) {
          await ipsecService.updateSettings({ interfaces: [...settings.interfaces, selectedInterface] });
        }
      }

      await ipsecService.upsertPeer(peer, {
        enabled: true,
        description: description.trim() || null,
        connection_type: "initiate",
        ike_group: ikeGroup,
        default_esp_group: espGroup,
        local_address: useDhcpInterface ? null : localAddress.trim(),
        dhcp_interface: useDhcpInterface ? selectedInterface : null,
        remote_address: remote,
        authentication: {
          mode: "pre-shared-secret",
          local_id: localId.trim() || null,
          remote_id: remoteId.trim() || peer,
        },
      });

      await ipsecService.upsertTunnel(peer, tunnelId.trim() || "1", {
        enabled: true,
        esp_group: espGroup,
        local_prefix: localPrefix.trim(),
        remote_prefix: remotePrefix.trim(),
        protocol: "all",
      });

      if (enableFirewallAssist && selectedInterface) {
        await applyFirewallAssist(peer, selectedInterface, remote);
      }

      onSuccess(
        `IPsec site-to-site '${peer}' created with IKE group '${ikeGroup}', ESP group '${espGroup}', and tunnel ${
          tunnelId.trim() || "1"
        }.`
      );
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply IPsec wizard configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Site-to-Site IPsec Wizard
          </DialogTitle>
          <DialogDescription>
            Creates Phase 1 + Phase 2, associates PSK selectors, and optionally adds basic WAN firewall permit rules.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 xl:grid-cols-2">
          <div className="space-y-2">
            <Label>Peer ID / Remote Gateway</Label>
            <Input value={peerId} onChange={(event) => setPeerId(event.target.value)} placeholder="198.51.100.10" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Site B" />
          </div>

          <div className="space-y-2">
            <Label>Remote Address</Label>
            <Input
              value={remoteAddress}
              onChange={(event) => setRemoteAddress(event.target.value)}
              placeholder="198.51.100.10"
            />
          </div>
          <div className="space-y-2">
            <Label>WAN / IPsec Interface</Label>
            <Select value={selectedInterface || undefined} onValueChange={setWanInterface}>
              <SelectTrigger>
                <SelectValue placeholder="Select interface" />
              </SelectTrigger>
              <SelectContent>
                {interfaceOptions.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No interfaces discovered
                  </SelectItem>
                ) : (
                  interfaceOptions.map((iface) => (
                    <SelectItem key={iface.name} value={iface.name}>
                      {formatInterfaceDisplayName(iface.name, iface.description)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-full flex items-center gap-3 rounded-md border p-3">
            <Checkbox checked={useDhcpInterface} onCheckedChange={(checked) => setUseDhcpInterface(checked === true)} />
            <Label className="text-sm">Use selected interface as DHCP interface for Phase 1 local endpoint</Label>
          </div>

          {!useDhcpInterface && (
            <div className="space-y-2">
              <Label>Local Address</Label>
              <Input
                value={localAddress}
                onChange={(event) => setLocalAddress(event.target.value)}
                placeholder="203.0.113.2"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Local ID (optional)</Label>
            <Input value={localId} onChange={(event) => setLocalId(event.target.value)} placeholder="@site-a" />
          </div>
          <div className="space-y-2">
            <Label>Remote ID (optional)</Label>
            <Input value={remoteId} onChange={(event) => setRemoteId(event.target.value)} placeholder="@site-b" />
          </div>

          <div className="space-y-2">
            <Label>Pre-Shared Key</Label>
            <Input
              type="password"
              value={psk}
              onChange={(event) => setPsk(event.target.value)}
              placeholder="StrongSharedSecret"
            />
          </div>

          <div className="space-y-2">
            <Label>Tunnel ID</Label>
            <Input value={tunnelId} onChange={(event) => setTunnelId(event.target.value)} placeholder="1" />
          </div>

          <div className="space-y-2">
            <Label>Local Prefix (Phase 2)</Label>
            <Input
              value={localPrefix}
              onChange={(event) => setLocalPrefix(event.target.value)}
              placeholder="10.10.10.0/24"
            />
          </div>
          <div className="space-y-2">
            <Label>Remote Prefix (Phase 2)</Label>
            <Input
              value={remotePrefix}
              onChange={(event) => setRemotePrefix(event.target.value)}
              placeholder="10.20.20.0/24"
            />
          </div>

          <div className="space-y-2">
            <Label>IKE Proposal</Label>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Encryption</Label>
                <Input
                  value={ikeEncryption}
                  onChange={(event) => setIkeEncryption(event.target.value)}
                  placeholder="aes256"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hash</Label>
                <Input value={ikeHash} onChange={(event) => setIkeHash(event.target.value)} placeholder="sha256" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">DH Group</Label>
                <Input
                  value={ikeDhGroup}
                  onChange={(event) => setIkeDhGroup(event.target.value)}
                  placeholder="14"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Lifetime (s)</Label>
                <Input
                  value={ikeLifetime}
                  onChange={(event) => setIkeLifetime(event.target.value)}
                  placeholder="28800"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>ESP Proposal</Label>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Encryption</Label>
                <Input
                  value={espEncryption}
                  onChange={(event) => setEspEncryption(event.target.value)}
                  placeholder="aes256gcm128"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hash</Label>
                <Input value={espHash} onChange={(event) => setEspHash(event.target.value)} placeholder="sha256" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">PFS Group</Label>
                <Input
                  value={espPfsGroup}
                  onChange={(event) => setEspPfsGroup(event.target.value)}
                  placeholder="14"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Lifetime (s)</Label>
                <Input
                  value={espLifetime}
                  onChange={(event) => setEspLifetime(event.target.value)}
                  placeholder="3600"
                />
              </div>
            </div>
          </div>

          <div className="col-span-full flex items-center gap-3 rounded-md border p-3">
            <Checkbox
              checked={enableFirewallAssist}
              onCheckedChange={(checked) => setEnableFirewallAssist(checked === true)}
            />
            <Label className="text-sm">
              Add WAN input firewall permits for UDP/500, UDP/4500, and ESP (basic helper)
            </Label>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Create IPsec Site-to-Site
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
