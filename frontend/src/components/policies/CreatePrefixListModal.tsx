"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { prefixListService, type PrefixListCapabilitiesResponse } from "@/lib/api/prefix-list";
import {
  cidrExample,
  getPrefixLength,
  validatePrefixCidr,
  validatePrefixRange,
} from "@/components/policies/utils/prefixListValidators";

interface CreatePrefixListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  listType: "ipv4" | "ipv6";
  capabilities: PrefixListCapabilitiesResponse | null;
}

export function CreatePrefixListModal({ open, onOpenChange, onSuccess, listType, capabilities }: CreatePrefixListModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("basic");

  // Basic tab
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");

  // First rule tab
  const [ruleNumber, setRuleNumber] = useState(100);
  const [action, setAction] = useState<"permit" | "deny">("permit");
  const [ruleDescription, setRuleDescription] = useState("");
  const [prefix, setPrefix] = useState("");
  const [ge, setGe] = useState("");
  const [le, setLe] = useState("");

  const resetForm = () => {
    setListName("");
    setListDescription("");
    setRuleNumber(100);
    setAction("permit");
    setRuleDescription("");
    setPrefix("");
    setGe("");
    setLe("");
    setActiveTab("basic");
  };

  const handleClose = () => {
    setError(null);
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    // Validation
    if (!listName.trim()) {
      setError("Please enter a prefix list name");
      setActiveTab("basic");
      return;
    }

    if (!prefix.trim()) {
      setError("Please enter a prefix in CIDR notation");
      setActiveTab("rule");
      return;
    }

    if (!validatePrefixCidr(prefix, listType)) {
      setError(
        `Invalid ${listType.toUpperCase()} CIDR notation. Format: ${cidrExample(listType)}`,
      );
      setActiveTab("rule");
      return;
    }

    const prefixLength = getPrefixLength(prefix);
    if (prefixLength === null) {
      setError("Invalid prefix length in CIDR notation");
      setActiveTab("rule");
      return;
    }

    const rangeError = validatePrefixRange(ge, le, prefixLength, listType);
    if (rangeError) {
      setError(rangeError);
      setActiveTab("rule");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build first rule
      const firstRule: any = {
        rule_number: ruleNumber,
        action,
        description: ruleDescription || null,
        prefix: prefix.trim(),
        ge: ge ? parseInt(ge, 10) : null,
        le: le ? parseInt(le, 10) : null,
      };

      await prefixListService.createPrefixList(
        listName.trim(),
        listType,
        listDescription || null,
        firstRule
      );
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create prefix list");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create {listType.toUpperCase()} Prefix List</DialogTitle>
          <DialogDescription>
            Create a new prefix list with the first rule
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="rule">First Rule</TabsTrigger>
          </TabsList>

          {/* Basic Tab */}
          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="list-name">Prefix List Name *</Label>
              <Input
                id="list-name"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="e.g., MY-PREFIXES"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Enter a unique name for the prefix list
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="list-description">Description</Label>
              <Input
                id="list-description"
                value={listDescription}
                onChange={(e) => setListDescription(e.target.value)}
                placeholder="Enter prefix list description (optional)"
                disabled={loading}
              />
            </div>
          </TabsContent>

          {/* First Rule Tab */}
          <TabsContent value="rule" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rule-number">Rule Number</Label>
                <Input
                  id="rule-number"
                  type="number"
                  value={ruleNumber}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Starting at 100</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="action">Action *</Label>
                <Select value={action} onValueChange={(v) => setAction(v as "permit" | "deny")} disabled={loading}>
                  <SelectTrigger id="action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permit">Permit</SelectItem>
                    <SelectItem value="deny">Deny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-description">Rule Description</Label>
              <Input
                id="rule-description"
                value={ruleDescription}
                onChange={(e) => setRuleDescription(e.target.value)}
                placeholder="Enter rule description (optional)"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prefix">Prefix (CIDR) *</Label>
              <Input
                id="prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder={listType === "ipv4" ? "e.g., 192.168.1.0/24" : "e.g., 2001:db8::/32"}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Enter prefix in CIDR notation
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ge">GE (Greater-than-or-equal)</Label>
                <Input
                  id="ge"
                  type="number"
                  value={ge}
                  onChange={(e) => setGe(e.target.value)}
                  placeholder="Optional"
                  disabled={loading}
                  min={prefix ? parseInt(prefix.split('/')[1] || "0", 10) : 0}
                  max={listType === "ipv4" ? 32 : 128}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum prefix length to match
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="le">LE (Less-than-or-equal)</Label>
                <Input
                  id="le"
                  type="number"
                  value={le}
                  onChange={(e) => setLe(e.target.value)}
                  placeholder="Optional"
                  disabled={loading}
                  min={prefix ? parseInt(prefix.split('/')[1] || "0", 10) : 0}
                  max={listType === "ipv4" ? 32 : 128}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum prefix length to match
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">About GE/LE</p>
                  <ul className="space-y-1 text-xs">
                    <li>• GE specifies the minimum prefix length to match</li>
                    <li>• LE specifies the maximum prefix length to match</li>
                    <li>• Both are optional and refine the prefix match</li>
                    <li>• Example: 10.0.0.0/8 ge 16 le 24 matches 10.x.y.0/16 through 10.x.y.z/24</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating..." : "Create Prefix List"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
