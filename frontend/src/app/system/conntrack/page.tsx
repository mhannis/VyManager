"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { pageGuides } from "@/lib/help/pageGuides";
import {
  systemConntrackService,
  type ConntrackAddressFamily,
  type ConntrackCustomRule,
  type ConntrackIgnoreRule,
  type SystemConntrackConfig,
} from "@/lib/api/system-conntrack";

interface ConntrackFormState {
  tableSize: string;
  expectTableSize: string;
  hashSize: string;
  modules: string[];
  tcpHalfOpenConnections: string;
  tcpLoose: string;
  tcpMaxRetrans: string;
  timeoutGeneric: string;
  timeoutIcmp: string;
  timeoutOther: string;
  timeoutTcpSynSent: string;
  timeoutTcpSynRecv: string;
  timeoutTcpEstablished: string;
  timeoutTcpFinWait: string;
  timeoutTcpClose: string;
  timeoutTcpCloseWait: string;
  timeoutTcpLastAck: string;
  timeoutTcpTimeWait: string;
  timeoutUdp: string;
  timeoutUdpStream: string;
  customRules: ConntrackCustomRule[];
  ignoreRules: ConntrackIgnoreRule[];
  loggingInvalidState: boolean;
  loggingNew: boolean;
  loggingDestroy: boolean;
  loggingTimestamp: boolean;
  loggingQueueSize: string;
  loggingLevel: string;
  loggingTcp: string[];
  loggingUdp: string[];
}

type CustomRuleDraft = ConntrackCustomRule;
type IgnoreRuleDraft = ConntrackIgnoreRule;

const MODULE_OPTIONS = ["ftp", "h323", "nfs", "pptp", "sip", "sqlnet", "tftp"] as const;
const L4_PROTOCOL_OPTIONS = ["tcp", "udp", "icmp", "icmpv6", "sctp", "dccp"] as const;
const LOG_LEVEL_OPTIONS = ["emerg", "alert", "crit", "err", "warning", "notice", "info", "debug"] as const;
const LOG_PROTO_EVENT_OPTIONS = ["new", "established", "closed", "invalid", "all"] as const;

const EMPTY_CUSTOM_RULE_DRAFT: CustomRuleDraft = {
  family: "ipv4",
  id: "",
  protocol: "",
  sourceAddress: "",
  sourcePort: "",
  destinationAddress: "",
  destinationPort: "",
  timeout: "",
  tcpSourcePort: "",
  tcpDestinationPort: "",
  tcpSyn: false,
  tcpNotSyn: false,
};

const EMPTY_IGNORE_RULE_DRAFT: IgnoreRuleDraft = {
  family: "ipv4",
  id: "",
  protocol: "",
  sourceAddress: "",
  destinationAddress: "",
  tcpSourcePort: "",
  tcpDestinationPort: "",
  tcpSyn: false,
  tcpNotSyn: false,
};

const EMPTY_FORM: ConntrackFormState = {
  tableSize: "",
  expectTableSize: "",
  hashSize: "",
  modules: [],
  tcpHalfOpenConnections: "",
  tcpLoose: "",
  tcpMaxRetrans: "",
  timeoutGeneric: "",
  timeoutIcmp: "",
  timeoutOther: "",
  timeoutTcpSynSent: "",
  timeoutTcpSynRecv: "",
  timeoutTcpEstablished: "",
  timeoutTcpFinWait: "",
  timeoutTcpClose: "",
  timeoutTcpCloseWait: "",
  timeoutTcpLastAck: "",
  timeoutTcpTimeWait: "",
  timeoutUdp: "",
  timeoutUdpStream: "",
  customRules: [],
  ignoreRules: [],
  loggingInvalidState: false,
  loggingNew: false,
  loggingDestroy: false,
  loggingTimestamp: false,
  loggingQueueSize: "",
  loggingLevel: "",
  loggingTcp: [],
  loggingUdp: [],
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=,\[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'"'"'`)}'`;
}

function normalizeText(value: string): string {
  return value.trim();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function normalizeFamily(value: string): ConntrackAddressFamily {
  return value === "ipv6" ? "ipv6" : "ipv4";
}

function numericRuleSort(leftId: string, rightId: string): number {
  const leftNum = Number(leftId);
  const rightNum = Number(rightId);
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && leftNum !== rightNum) {
    return leftNum - rightNum;
  }
  return leftId.localeCompare(rightId, undefined, { numeric: true });
}

function normalizeCustomRule(rule: ConntrackCustomRule): ConntrackCustomRule {
  return {
    family: normalizeFamily(rule.family),
    id: normalizeText(rule.id),
    protocol: normalizeText(rule.protocol).toLowerCase(),
    sourceAddress: normalizeText(rule.sourceAddress),
    sourcePort: normalizeText(rule.sourcePort),
    destinationAddress: normalizeText(rule.destinationAddress),
    destinationPort: normalizeText(rule.destinationPort),
    timeout: normalizeText(rule.timeout),
    tcpSourcePort: normalizeText(rule.tcpSourcePort),
    tcpDestinationPort: normalizeText(rule.tcpDestinationPort),
    tcpSyn: Boolean(rule.tcpSyn),
    tcpNotSyn: Boolean(rule.tcpNotSyn),
  };
}

function normalizeIgnoreRule(rule: ConntrackIgnoreRule): ConntrackIgnoreRule {
  return {
    family: normalizeFamily(rule.family),
    id: normalizeText(rule.id),
    protocol: normalizeText(rule.protocol).toLowerCase(),
    sourceAddress: normalizeText(rule.sourceAddress),
    destinationAddress: normalizeText(rule.destinationAddress),
    tcpSourcePort: normalizeText(rule.tcpSourcePort),
    tcpDestinationPort: normalizeText(rule.tcpDestinationPort),
    tcpSyn: Boolean(rule.tcpSyn),
    tcpNotSyn: Boolean(rule.tcpNotSyn),
  };
}

function normalizeCustomRules(rules: ConntrackCustomRule[]): ConntrackCustomRule[] {
  return rules
    .map(normalizeCustomRule)
    .filter((rule) => rule.id)
    .sort((left, right) => {
      if (left.family !== right.family) return left.family.localeCompare(right.family);
      return numericRuleSort(left.id, right.id);
    });
}

function normalizeIgnoreRules(rules: ConntrackIgnoreRule[]): ConntrackIgnoreRule[] {
  return rules
    .map(normalizeIgnoreRule)
    .filter((rule) => rule.id)
    .sort((left, right) => {
      if (left.family !== right.family) return left.family.localeCompare(right.family);
      return numericRuleSort(left.id, right.id);
    });
}

function customRuleKey(rule: ConntrackCustomRule): string {
  return `${rule.family}\u001f${rule.id}`;
}

function ignoreRuleKey(rule: ConntrackIgnoreRule): string {
  return `${rule.family}\u001f${rule.id}`;
}

function toFormState(config: SystemConntrackConfig): ConntrackFormState {
  return {
    tableSize: config.tableSize,
    expectTableSize: config.expectTableSize,
    hashSize: config.hashSize,
    modules: uniqueSorted(config.modules),
    tcpHalfOpenConnections: config.tcpHalfOpenConnections,
    tcpLoose: config.tcpLoose,
    tcpMaxRetrans: config.tcpMaxRetrans,
    timeoutGeneric: config.timeoutGeneric,
    timeoutIcmp: config.timeoutIcmp,
    timeoutOther: config.timeoutOther,
    timeoutTcpSynSent: config.timeoutTcpSynSent,
    timeoutTcpSynRecv: config.timeoutTcpSynRecv,
    timeoutTcpEstablished: config.timeoutTcpEstablished,
    timeoutTcpFinWait: config.timeoutTcpFinWait,
    timeoutTcpClose: config.timeoutTcpClose,
    timeoutTcpCloseWait: config.timeoutTcpCloseWait,
    timeoutTcpLastAck: config.timeoutTcpLastAck,
    timeoutTcpTimeWait: config.timeoutTcpTimeWait,
    timeoutUdp: config.timeoutUdp,
    timeoutUdpStream: config.timeoutUdpStream,
    customRules: normalizeCustomRules(config.customRules),
    ignoreRules: normalizeIgnoreRules(config.ignoreRules),
    loggingInvalidState: Boolean(config.logging.invalidState),
    loggingNew: Boolean(config.logging.new),
    loggingDestroy: Boolean(config.logging.destroy),
    loggingTimestamp: Boolean(config.logging.timestamp),
    loggingQueueSize: config.logging.queueSize,
    loggingLevel: config.logging.level,
    loggingTcp: uniqueSorted(config.logging.tcp),
    loggingUdp: uniqueSorted(config.logging.udp),
  };
}

function normalizeForm(form: ConntrackFormState): ConntrackFormState {
  return {
    ...form,
    tableSize: normalizeText(form.tableSize),
    expectTableSize: normalizeText(form.expectTableSize),
    hashSize: normalizeText(form.hashSize),
    modules: uniqueSorted(form.modules),
    tcpHalfOpenConnections: normalizeText(form.tcpHalfOpenConnections),
    tcpLoose: normalizeText(form.tcpLoose),
    tcpMaxRetrans: normalizeText(form.tcpMaxRetrans),
    timeoutGeneric: normalizeText(form.timeoutGeneric),
    timeoutIcmp: normalizeText(form.timeoutIcmp),
    timeoutOther: normalizeText(form.timeoutOther),
    timeoutTcpSynSent: normalizeText(form.timeoutTcpSynSent),
    timeoutTcpSynRecv: normalizeText(form.timeoutTcpSynRecv),
    timeoutTcpEstablished: normalizeText(form.timeoutTcpEstablished),
    timeoutTcpFinWait: normalizeText(form.timeoutTcpFinWait),
    timeoutTcpClose: normalizeText(form.timeoutTcpClose),
    timeoutTcpCloseWait: normalizeText(form.timeoutTcpCloseWait),
    timeoutTcpLastAck: normalizeText(form.timeoutTcpLastAck),
    timeoutTcpTimeWait: normalizeText(form.timeoutTcpTimeWait),
    timeoutUdp: normalizeText(form.timeoutUdp),
    timeoutUdpStream: normalizeText(form.timeoutUdpStream),
    customRules: normalizeCustomRules(form.customRules),
    ignoreRules: normalizeIgnoreRules(form.ignoreRules),
    loggingQueueSize: normalizeText(form.loggingQueueSize),
    loggingLevel: normalizeText(form.loggingLevel),
    loggingTcp: uniqueSorted(form.loggingTcp),
    loggingUdp: uniqueSorted(form.loggingUdp),
  };
}

function buildOperations(current: SystemConntrackConfig | null, formRaw: ConntrackFormState): string[] {
  const operations: string[] = [];
  const base = "system conntrack";
  const currentSafe = current ? toFormState(current) : EMPTY_FORM;
  const desired = normalizeForm(formRaw);
  const existing = normalizeForm(currentSafe);

  const syncScalar = (token: string, desiredValue: string, currentValue: string) => {
    if (desiredValue === currentValue) return;
    if (desiredValue) operations.push(`set ${base} ${token} ${quoteCliValue(desiredValue)}`);
    else operations.push(`delete ${base} ${token}`);
  };

  syncScalar("table-size", desired.tableSize, existing.tableSize);
  syncScalar("expect-table-size", desired.expectTableSize, existing.expectTableSize);
  syncScalar("hash-size", desired.hashSize, existing.hashSize);
  syncScalar("tcp half-open-connections", desired.tcpHalfOpenConnections, existing.tcpHalfOpenConnections);
  syncScalar("tcp loose", desired.tcpLoose, existing.tcpLoose);
  syncScalar("tcp max-retrans", desired.tcpMaxRetrans, existing.tcpMaxRetrans);

  syncScalar("timeout generic", desired.timeoutGeneric, existing.timeoutGeneric);
  syncScalar("timeout icmp", desired.timeoutIcmp, existing.timeoutIcmp);
  syncScalar("timeout other", desired.timeoutOther, existing.timeoutOther);
  syncScalar("timeout tcp syn-sent", desired.timeoutTcpSynSent, existing.timeoutTcpSynSent);
  syncScalar("timeout tcp syn-recv", desired.timeoutTcpSynRecv, existing.timeoutTcpSynRecv);
  syncScalar("timeout tcp established", desired.timeoutTcpEstablished, existing.timeoutTcpEstablished);
  syncScalar("timeout tcp fin-wait", desired.timeoutTcpFinWait, existing.timeoutTcpFinWait);
  syncScalar("timeout tcp close", desired.timeoutTcpClose, existing.timeoutTcpClose);
  syncScalar("timeout tcp close-wait", desired.timeoutTcpCloseWait, existing.timeoutTcpCloseWait);
  syncScalar("timeout tcp last-ack", desired.timeoutTcpLastAck, existing.timeoutTcpLastAck);
  syncScalar("timeout tcp time-wait", desired.timeoutTcpTimeWait, existing.timeoutTcpTimeWait);
  syncScalar("timeout udp", desired.timeoutUdp, existing.timeoutUdp);
  syncScalar("timeout udp-stream", desired.timeoutUdpStream, existing.timeoutUdpStream);

  const desiredModules = uniqueSorted(desired.modules);
  const currentModules = uniqueSorted(existing.modules);
  const desiredModuleSet = new Set(desiredModules);
  const currentModuleSet = new Set(currentModules);

  for (const moduleName of currentModules) {
    if (!desiredModuleSet.has(moduleName)) {
      operations.push(`delete ${base} modules ${quoteCliValue(moduleName)}`);
    }
  }
  for (const moduleName of desiredModules) {
    if (!currentModuleSet.has(moduleName)) {
      operations.push(`set ${base} modules ${quoteCliValue(moduleName)}`);
    }
  }

  const currentCustom = new Map(existing.customRules.map((rule) => [customRuleKey(rule), rule]));
  const desiredCustom = new Map(desired.customRules.map((rule) => [customRuleKey(rule), rule]));

  for (const [key, currentRule] of currentCustom.entries()) {
    const nextRule = desiredCustom.get(key);
    if (!nextRule || JSON.stringify(currentRule) !== JSON.stringify(nextRule)) {
      operations.push(`delete ${base} timeout custom ${currentRule.family} rule ${currentRule.id}`);
    }
  }

  for (const [key, desiredRule] of desiredCustom.entries()) {
    const currentRule = currentCustom.get(key);
    if (currentRule && JSON.stringify(currentRule) === JSON.stringify(desiredRule)) continue;

    const ruleBase = `${base} timeout custom ${desiredRule.family} rule ${desiredRule.id}`;
    if (desiredRule.protocol) operations.push(`set ${ruleBase} protocol ${quoteCliValue(desiredRule.protocol)}`);
    if (desiredRule.sourceAddress) {
      operations.push(`set ${ruleBase} source address ${quoteCliValue(desiredRule.sourceAddress)}`);
    }
    if (desiredRule.sourcePort) {
      operations.push(`set ${ruleBase} source port ${quoteCliValue(desiredRule.sourcePort)}`);
    }
    if (desiredRule.destinationAddress) {
      operations.push(`set ${ruleBase} destination address ${quoteCliValue(desiredRule.destinationAddress)}`);
    }
    if (desiredRule.destinationPort) {
      operations.push(`set ${ruleBase} destination port ${quoteCliValue(desiredRule.destinationPort)}`);
    }
    if (desiredRule.timeout) operations.push(`set ${ruleBase} timeout ${quoteCliValue(desiredRule.timeout)}`);
    if (desiredRule.tcpSourcePort) {
      operations.push(`set ${ruleBase} tcp source-port ${quoteCliValue(desiredRule.tcpSourcePort)}`);
    }
    if (desiredRule.tcpDestinationPort) {
      operations.push(`set ${ruleBase} tcp destination-port ${quoteCliValue(desiredRule.tcpDestinationPort)}`);
    }
    if (desiredRule.tcpSyn) operations.push(`set ${ruleBase} tcp syn`);
    if (desiredRule.tcpNotSyn) operations.push(`set ${ruleBase} tcp not-syn`);
  }

  const currentIgnore = new Map(existing.ignoreRules.map((rule) => [ignoreRuleKey(rule), rule]));
  const desiredIgnore = new Map(desired.ignoreRules.map((rule) => [ignoreRuleKey(rule), rule]));

  for (const [key, currentRule] of currentIgnore.entries()) {
    const nextRule = desiredIgnore.get(key);
    if (!nextRule || JSON.stringify(currentRule) !== JSON.stringify(nextRule)) {
      operations.push(`delete ${base} ignore ${currentRule.family} rule ${currentRule.id}`);
    }
  }

  for (const [key, desiredRule] of desiredIgnore.entries()) {
    const currentRule = currentIgnore.get(key);
    if (currentRule && JSON.stringify(currentRule) === JSON.stringify(desiredRule)) continue;

    const ruleBase = `${base} ignore ${desiredRule.family} rule ${desiredRule.id}`;
    if (desiredRule.protocol) operations.push(`set ${ruleBase} protocol ${quoteCliValue(desiredRule.protocol)}`);
    if (desiredRule.sourceAddress) {
      operations.push(`set ${ruleBase} source address ${quoteCliValue(desiredRule.sourceAddress)}`);
    }
    if (desiredRule.destinationAddress) {
      operations.push(`set ${ruleBase} destination address ${quoteCliValue(desiredRule.destinationAddress)}`);
    }
    if (desiredRule.tcpSourcePort) {
      operations.push(`set ${ruleBase} tcp source-port ${quoteCliValue(desiredRule.tcpSourcePort)}`);
    }
    if (desiredRule.tcpDestinationPort) {
      operations.push(`set ${ruleBase} tcp destination-port ${quoteCliValue(desiredRule.tcpDestinationPort)}`);
    }
    if (desiredRule.tcpSyn) operations.push(`set ${ruleBase} tcp syn`);
    if (desiredRule.tcpNotSyn) operations.push(`set ${ruleBase} tcp not-syn`);
  }

  const syncLogFlag = (token: string, desiredValue: boolean, currentValue: boolean) => {
    if (desiredValue === currentValue) return;
    operations.push(`${desiredValue ? "set" : "delete"} ${base} log ${token}`);
  };

  syncLogFlag("invalid-state", desired.loggingInvalidState, existing.loggingInvalidState);
  syncLogFlag("new", desired.loggingNew, existing.loggingNew);
  syncLogFlag("destroy", desired.loggingDestroy, existing.loggingDestroy);
  syncLogFlag("timestamp", desired.loggingTimestamp, existing.loggingTimestamp);

  syncScalar("log queue-size", desired.loggingQueueSize, existing.loggingQueueSize);
  syncScalar("log level", desired.loggingLevel, existing.loggingLevel);

  const syncLogEvents = (family: "tcp" | "udp") => {
    const desiredEvents = uniqueSorted(family === "tcp" ? desired.loggingTcp : desired.loggingUdp);
    const currentEvents = uniqueSorted(family === "tcp" ? existing.loggingTcp : existing.loggingUdp);
    const desiredSet = new Set(desiredEvents);
    const currentSet = new Set(currentEvents);

    for (const eventName of currentEvents) {
      if (!desiredSet.has(eventName)) {
        operations.push(`delete ${base} log ${family} ${quoteCliValue(eventName)}`);
      }
    }
    for (const eventName of desiredEvents) {
      if (!currentSet.has(eventName)) {
        operations.push(`set ${base} log ${family} ${quoteCliValue(eventName)}`);
      }
    }
  };

  syncLogEvents("tcp");
  syncLogEvents("udp");

  return operations;
}

function validateInteger(label: string, rawValue: string, min?: number, max?: number): string | null {
  const value = rawValue.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return `${label} must be a whole number.`;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${label} must be a valid number.`;
  if (min !== undefined && numeric < min) return `${label} must be at least ${min}.`;
  if (max !== undefined && numeric > max) return `${label} must be ${max} or less.`;
  return null;
}

function validateCustomRule(rule: ConntrackCustomRule): string | null {
  const normalized = normalizeCustomRule(rule);
  if (!/^\d+$/.test(normalized.id)) return "Custom timeout rule ID must be numeric.";
  if (normalized.tcpSyn && normalized.tcpNotSyn) {
    return "Custom timeout rule cannot set both TCP syn and not-syn flags.";
  }

  const timeoutError = validateInteger("Custom timeout value", normalized.timeout, 0, 2147483);
  if (timeoutError) return timeoutError;

  for (const [label, value] of [
    ["Custom source port", normalized.sourcePort],
    ["Custom destination port", normalized.destinationPort],
    ["Custom TCP source port", normalized.tcpSourcePort],
    ["Custom TCP destination port", normalized.tcpDestinationPort],
  ] as const) {
    const error = validateInteger(label, value, 1, 65535);
    if (error) return error;
  }

  if (
    !normalized.protocol &&
    !normalized.sourceAddress &&
    !normalized.destinationAddress &&
    !normalized.sourcePort &&
    !normalized.destinationPort &&
    !normalized.tcpSourcePort &&
    !normalized.tcpDestinationPort &&
    !normalized.tcpSyn &&
    !normalized.tcpNotSyn
  ) {
    return "Custom timeout rule requires at least one match condition.";
  }

  if (!normalized.timeout) {
    return "Custom timeout rule requires a timeout value.";
  }

  return null;
}

function validateIgnoreRule(rule: ConntrackIgnoreRule): string | null {
  const normalized = normalizeIgnoreRule(rule);
  if (!/^\d+$/.test(normalized.id)) return "Ignore rule ID must be numeric.";
  if (normalized.tcpSyn && normalized.tcpNotSyn) return "Ignore rule cannot set both TCP syn and not-syn flags.";

  for (const [label, value] of [
    ["Ignore TCP source port", normalized.tcpSourcePort],
    ["Ignore TCP destination port", normalized.tcpDestinationPort],
  ] as const) {
    const error = validateInteger(label, value, 1, 65535);
    if (error) return error;
  }

  if (
    !normalized.protocol &&
    !normalized.sourceAddress &&
    !normalized.destinationAddress &&
    !normalized.tcpSourcePort &&
    !normalized.tcpDestinationPort &&
    !normalized.tcpSyn &&
    !normalized.tcpNotSyn
  ) {
    return "Ignore rule requires at least one match condition.";
  }

  return null;
}

function formatCustomMatch(rule: ConntrackCustomRule): string {
  const parts: string[] = [];
  if (rule.protocol) parts.push(`proto=${rule.protocol}`);
  if (rule.sourceAddress) parts.push(`src=${rule.sourceAddress}`);
  if (rule.sourcePort) parts.push(`sport=${rule.sourcePort}`);
  if (rule.destinationAddress) parts.push(`dst=${rule.destinationAddress}`);
  if (rule.destinationPort) parts.push(`dport=${rule.destinationPort}`);
  return parts.join(", ") || "any";
}

function formatIgnoreMatch(rule: ConntrackIgnoreRule): string {
  const parts: string[] = [];
  if (rule.protocol) parts.push(`proto=${rule.protocol}`);
  if (rule.sourceAddress) parts.push(`src=${rule.sourceAddress}`);
  if (rule.destinationAddress) parts.push(`dst=${rule.destinationAddress}`);
  return parts.join(", ") || "any";
}

function formatTcpDetail(rule: {
  tcpSourcePort: string;
  tcpDestinationPort: string;
  tcpSyn: boolean;
  tcpNotSyn: boolean;
}): string {
  const parts: string[] = [];
  if (rule.tcpSourcePort) parts.push(`sport=${rule.tcpSourcePort}`);
  if (rule.tcpDestinationPort) parts.push(`dport=${rule.tcpDestinationPort}`);
  if (rule.tcpSyn) parts.push("syn");
  if (rule.tcpNotSyn) parts.push("not-syn");
  return parts.join(", ") || "-";
}

export default function SystemConntrackPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemConntrackConfig | null>(null);
  const [form, setForm] = useState<ConntrackFormState>(EMPTY_FORM);

  const [customRuleDraft, setCustomRuleDraft] = useState<CustomRuleDraft>(EMPTY_CUSTOM_RULE_DRAFT);
  const [customRuleEditKey, setCustomRuleEditKey] = useState<string | null>(null);
  const [ignoreRuleDraft, setIgnoreRuleDraft] = useState<IgnoreRuleDraft>(EMPTY_IGNORE_RULE_DRAFT);
  const [ignoreRuleEditKey, setIgnoreRuleEditKey] = useState<string | null>(null);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemConntrackService.getConfig(refresh);
      setConfig(response);
      setForm(toFormState(response));
      setCustomRuleDraft(EMPTY_CUSTOM_RULE_DRAFT);
      setCustomRuleEditKey(null);
      setIgnoreRuleDraft(EMPTY_IGNORE_RULE_DRAFT);
      setIgnoreRuleEditKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conntrack settings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const hasChanges = useMemo(() => {
    if (!config) return false;
    return JSON.stringify(normalizeForm(form)) !== JSON.stringify(normalizeForm(toFormState(config)));
  }, [config, form]);

  const toggleModule = (moduleName: string, checked: boolean) => {
    setForm((previous) => {
      const next = new Set(previous.modules);
      if (checked) next.add(moduleName);
      else next.delete(moduleName);
      return { ...previous, modules: Array.from(next).sort((left, right) => left.localeCompare(right)) };
    });
  };

  const toggleLogEvent = (family: "tcp" | "udp", eventName: string, checked: boolean) => {
    setForm((previous) => {
      const current = new Set(family === "tcp" ? previous.loggingTcp : previous.loggingUdp);
      if (checked) current.add(eventName);
      else current.delete(eventName);
      const values = Array.from(current).sort((left, right) => left.localeCompare(right));
      if (family === "tcp") return { ...previous, loggingTcp: values };
      return { ...previous, loggingUdp: values };
    });
  };

  const addOrUpdateCustomRule = () => {
    const normalized = normalizeCustomRule(customRuleDraft);
    const validationError = validateCustomRule(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }

    const key = customRuleKey(normalized);
    setForm((previous) => {
      const rows = previous.customRules.filter((row) => customRuleKey(row) !== key);
      if (!customRuleEditKey && previous.customRules.some((row) => customRuleKey(row) === key)) {
        setError(`Custom timeout rule ${normalized.family} #${normalized.id} already exists.`);
        return previous;
      }
      const next = normalizeCustomRules([...rows, normalized]);
      setError(null);
      return { ...previous, customRules: next };
    });

    setCustomRuleDraft(EMPTY_CUSTOM_RULE_DRAFT);
    setCustomRuleEditKey(null);
  };

  const editCustomRule = (rule: ConntrackCustomRule) => {
    const normalized = normalizeCustomRule(rule);
    setCustomRuleDraft(normalized);
    setCustomRuleEditKey(customRuleKey(normalized));
    setError(null);
  };

  const deleteCustomRule = (rule: ConntrackCustomRule) => {
    const key = customRuleKey(rule);
    setForm((previous) => ({
      ...previous,
      customRules: previous.customRules.filter((entry) => customRuleKey(entry) !== key),
    }));
    if (customRuleEditKey === key) {
      setCustomRuleDraft(EMPTY_CUSTOM_RULE_DRAFT);
      setCustomRuleEditKey(null);
    }
  };

  const addOrUpdateIgnoreRule = () => {
    const normalized = normalizeIgnoreRule(ignoreRuleDraft);
    const validationError = validateIgnoreRule(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }

    const key = ignoreRuleKey(normalized);
    setForm((previous) => {
      const rows = previous.ignoreRules.filter((row) => ignoreRuleKey(row) !== key);
      if (!ignoreRuleEditKey && previous.ignoreRules.some((row) => ignoreRuleKey(row) === key)) {
        setError(`Ignore rule ${normalized.family} #${normalized.id} already exists.`);
        return previous;
      }
      const next = normalizeIgnoreRules([...rows, normalized]);
      setError(null);
      return { ...previous, ignoreRules: next };
    });

    setIgnoreRuleDraft(EMPTY_IGNORE_RULE_DRAFT);
    setIgnoreRuleEditKey(null);
  };

  const editIgnoreRule = (rule: ConntrackIgnoreRule) => {
    const normalized = normalizeIgnoreRule(rule);
    setIgnoreRuleDraft(normalized);
    setIgnoreRuleEditKey(ignoreRuleKey(normalized));
    setError(null);
  };

  const deleteIgnoreRule = (rule: ConntrackIgnoreRule) => {
    const key = ignoreRuleKey(rule);
    setForm((previous) => ({
      ...previous,
      ignoreRules: previous.ignoreRules.filter((entry) => ignoreRuleKey(entry) !== key),
    }));
    if (ignoreRuleEditKey === key) {
      setIgnoreRuleDraft(EMPTY_IGNORE_RULE_DRAFT);
      setIgnoreRuleEditKey(null);
    }
  };

  const saveConfig = async () => {
    for (const [label, value, min, max] of [
      ["Table Size", form.tableSize, 1, undefined],
      ["Expect Table Size", form.expectTableSize, 1, undefined],
      ["Hash Size", form.hashSize, 1, undefined],
      ["TCP Half Open Connections", form.tcpHalfOpenConnections, 1, undefined],
      ["TCP Max Retrans", form.tcpMaxRetrans, 0, undefined],
      ["Timeout Generic", form.timeoutGeneric, 0, 2147483],
      ["Timeout ICMP", form.timeoutIcmp, 0, 2147483],
      ["Timeout Other", form.timeoutOther, 0, 2147483],
      ["Timeout TCP Syn Sent", form.timeoutTcpSynSent, 0, 2147483],
      ["Timeout TCP Syn Recv", form.timeoutTcpSynRecv, 0, 2147483],
      ["Timeout TCP Established", form.timeoutTcpEstablished, 0, 2147483],
      ["Timeout TCP Fin Wait", form.timeoutTcpFinWait, 0, 2147483],
      ["Timeout TCP Close", form.timeoutTcpClose, 0, 2147483],
      ["Timeout TCP Close Wait", form.timeoutTcpCloseWait, 0, 2147483],
      ["Timeout TCP Last Ack", form.timeoutTcpLastAck, 0, 2147483],
      ["Timeout TCP Time Wait", form.timeoutTcpTimeWait, 0, 2147483],
      ["Timeout UDP", form.timeoutUdp, 0, 2147483],
      ["Timeout UDP Stream", form.timeoutUdpStream, 0, 2147483],
      ["Log Queue Size", form.loggingQueueSize, 0, 536870912],
    ] as const) {
      const validationError = validateInteger(label, value, min, max);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    for (const row of form.customRules) {
      const validationError = validateCustomRule(row);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    for (const row of form.ignoreRules) {
      const validationError = validateIgnoreRule(row);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    if (form.loggingLevel && !LOG_LEVEL_OPTIONS.includes(form.loggingLevel as (typeof LOG_LEVEL_OPTIONS)[number])) {
      setError("Log level must be one of: emerg, alert, crit, err, warning, notice, info, debug.");
      return;
    }

    const operations = buildOperations(config, form);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemConntrackService.batchConfigure(operations);
      if (!response.success) {
        throw new Error(response.error || "VyOS rejected conntrack changes.");
      }
      await loadData(true);
      setSuccess("Conntrack settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save conntrack settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">System Conntrack</h1>
            <p className="mt-1 text-muted-foreground">
              Configure conntrack sizing, timeout behavior, ignore/custom rules, and logging under `system conntrack`.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.systemConntrack} />
        </div>

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {success && (
          <Card className="border-emerald-500/50">
            <CardContent className="pt-6">
              <p className="text-sm text-emerald-300">{success}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Global Conntrack Sizing</CardTitle>
            <CardDescription>Set conntrack table sizing for your traffic profile.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="conntrack-table-size">Table Size</Label>
              <Input
                id="conntrack-table-size"
                value={form.tableSize}
                onChange={(event) => setForm((previous) => ({ ...previous, tableSize: event.target.value }))}
                placeholder="262144"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-expect-table-size">Expect Table Size</Label>
              <Input
                id="conntrack-expect-table-size"
                value={form.expectTableSize}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, expectTableSize: event.target.value }))
                }
                placeholder="4096"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-hash-size">Hash Size</Label>
              <Input
                id="conntrack-hash-size"
                value={form.hashSize}
                onChange={(event) => setForm((previous) => ({ ...previous, hashSize: event.target.value }))}
                placeholder="32768"
                disabled={!canEdit || saving}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TCP Behavior</CardTitle>
            <CardDescription>Adjust TCP conntrack behavior and tolerance settings.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="conntrack-tcp-half-open">Half-Open Connections</Label>
              <Input
                id="conntrack-tcp-half-open"
                value={form.tcpHalfOpenConnections}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    tcpHalfOpenConnections: event.target.value,
                  }))
                }
                placeholder="512"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-tcp-loose">Loose Tracking</Label>
              <Select
                value={form.tcpLoose || "none"}
                onValueChange={(value) =>
                  setForm((previous) => ({ ...previous, tcpLoose: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="conntrack-tcp-loose" disabled={!canEdit || saving}>
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default</SelectItem>
                  <SelectItem value="enable">Enable</SelectItem>
                  <SelectItem value="disable">Disable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-tcp-max-retrans">Max Retrans</Label>
              <Input
                id="conntrack-tcp-max-retrans"
                value={form.tcpMaxRetrans}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    tcpMaxRetrans: event.target.value,
                  }))
                }
                placeholder="3"
                disabled={!canEdit || saving}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timeout Defaults</CardTitle>
            <CardDescription>Define timeout defaults for generic, TCP, UDP, and related states.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-generic">Generic</Label>
              <Input
                id="conntrack-timeout-generic"
                value={form.timeoutGeneric}
                onChange={(event) => setForm((previous) => ({ ...previous, timeoutGeneric: event.target.value }))}
                placeholder="600"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-icmp">ICMP</Label>
              <Input
                id="conntrack-timeout-icmp"
                value={form.timeoutIcmp}
                onChange={(event) => setForm((previous) => ({ ...previous, timeoutIcmp: event.target.value }))}
                placeholder="30"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-other">Other</Label>
              <Input
                id="conntrack-timeout-other"
                value={form.timeoutOther}
                onChange={(event) => setForm((previous) => ({ ...previous, timeoutOther: event.target.value }))}
                placeholder="600"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-tcp-syn-sent">TCP Syn-Sent</Label>
              <Input
                id="conntrack-timeout-tcp-syn-sent"
                value={form.timeoutTcpSynSent}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, timeoutTcpSynSent: event.target.value }))
                }
                placeholder="120"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-tcp-syn-recv">TCP Syn-Recv</Label>
              <Input
                id="conntrack-timeout-tcp-syn-recv"
                value={form.timeoutTcpSynRecv}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, timeoutTcpSynRecv: event.target.value }))
                }
                placeholder="60"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-tcp-established">TCP Established</Label>
              <Input
                id="conntrack-timeout-tcp-established"
                value={form.timeoutTcpEstablished}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, timeoutTcpEstablished: event.target.value }))
                }
                placeholder="432000"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-tcp-fin-wait">TCP Fin-Wait</Label>
              <Input
                id="conntrack-timeout-tcp-fin-wait"
                value={form.timeoutTcpFinWait}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, timeoutTcpFinWait: event.target.value }))
                }
                placeholder="120"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-tcp-close">TCP Close</Label>
              <Input
                id="conntrack-timeout-tcp-close"
                value={form.timeoutTcpClose}
                onChange={(event) => setForm((previous) => ({ ...previous, timeoutTcpClose: event.target.value }))}
                placeholder="10"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-tcp-close-wait">TCP Close-Wait</Label>
              <Input
                id="conntrack-timeout-tcp-close-wait"
                value={form.timeoutTcpCloseWait}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, timeoutTcpCloseWait: event.target.value }))
                }
                placeholder="60"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-tcp-last-ack">TCP Last-Ack</Label>
              <Input
                id="conntrack-timeout-tcp-last-ack"
                value={form.timeoutTcpLastAck}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, timeoutTcpLastAck: event.target.value }))
                }
                placeholder="30"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-tcp-time-wait">TCP Time-Wait</Label>
              <Input
                id="conntrack-timeout-tcp-time-wait"
                value={form.timeoutTcpTimeWait}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, timeoutTcpTimeWait: event.target.value }))
                }
                placeholder="120"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-udp">UDP</Label>
              <Input
                id="conntrack-timeout-udp"
                value={form.timeoutUdp}
                onChange={(event) => setForm((previous) => ({ ...previous, timeoutUdp: event.target.value }))}
                placeholder="30"
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conntrack-timeout-udp-stream">UDP Stream</Label>
              <Input
                id="conntrack-timeout-udp-stream"
                value={form.timeoutUdpStream}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, timeoutUdpStream: event.target.value }))
                }
                placeholder="120"
                disabled={!canEdit || saving}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conntrack Modules</CardTitle>
            <CardDescription>Enable protocol helpers only as needed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MODULE_OPTIONS.map((moduleName) => (
                <label
                  key={moduleName}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={form.modules.includes(moduleName)}
                    disabled={!canEdit || saving}
                    onCheckedChange={(value) => toggleModule(moduleName, value === true)}
                  />
                  <span>{moduleName}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custom Timeout Rules</CardTitle>
            <CardDescription>
              Configure `system conntrack timeout custom` rules for IPv4/IPv6 with match criteria and timeout values.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Address Family</Label>
                <Select
                  value={customRuleDraft.family}
                  onValueChange={(value) =>
                    setCustomRuleDraft((previous) => ({
                      ...previous,
                      family: normalizeFamily(value),
                    }))
                  }
                >
                  <SelectTrigger disabled={!canEdit || saving}>
                    <SelectValue placeholder="Select family" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ipv4">IPv4</SelectItem>
                    <SelectItem value="ipv6">IPv6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rule ID</Label>
                <Input
                  value={customRuleDraft.id}
                  onChange={(event) =>
                    setCustomRuleDraft((previous) => ({ ...previous, id: event.target.value }))
                  }
                  placeholder="10"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Protocol</Label>
                <Input
                  list="conntrack-protocol-options"
                  value={customRuleDraft.protocol}
                  onChange={(event) =>
                    setCustomRuleDraft((previous) => ({ ...previous, protocol: event.target.value }))
                  }
                  placeholder="tcp"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Timeout</Label>
                <Input
                  value={customRuleDraft.timeout}
                  onChange={(event) =>
                    setCustomRuleDraft((previous) => ({ ...previous, timeout: event.target.value }))
                  }
                  placeholder="600"
                  disabled={!canEdit || saving}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Source Address</Label>
                <Input
                  value={customRuleDraft.sourceAddress}
                  onChange={(event) =>
                    setCustomRuleDraft((previous) => ({ ...previous, sourceAddress: event.target.value }))
                  }
                  placeholder="192.0.2.0/24"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Source Port</Label>
                <Input
                  value={customRuleDraft.sourcePort}
                  onChange={(event) =>
                    setCustomRuleDraft((previous) => ({ ...previous, sourcePort: event.target.value }))
                  }
                  placeholder="1024"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Destination Address</Label>
                <Input
                  value={customRuleDraft.destinationAddress}
                  onChange={(event) =>
                    setCustomRuleDraft((previous) => ({ ...previous, destinationAddress: event.target.value }))
                  }
                  placeholder="198.51.100.10"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Destination Port</Label>
                <Input
                  value={customRuleDraft.destinationPort}
                  onChange={(event) =>
                    setCustomRuleDraft((previous) => ({ ...previous, destinationPort: event.target.value }))
                  }
                  placeholder="443"
                  disabled={!canEdit || saving}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>TCP Source Port</Label>
                <Input
                  value={customRuleDraft.tcpSourcePort}
                  onChange={(event) =>
                    setCustomRuleDraft((previous) => ({ ...previous, tcpSourcePort: event.target.value }))
                  }
                  placeholder="1024"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>TCP Destination Port</Label>
                <Input
                  value={customRuleDraft.tcpDestinationPort}
                  onChange={(event) =>
                    setCustomRuleDraft((previous) => ({ ...previous, tcpDestinationPort: event.target.value }))
                  }
                  placeholder="443"
                  disabled={!canEdit || saving}
                />
              </div>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={customRuleDraft.tcpSyn}
                  onCheckedChange={(checked) =>
                    setCustomRuleDraft((previous) => ({
                      ...previous,
                      tcpSyn: checked === true,
                    }))
                  }
                  disabled={!canEdit || saving}
                />
                TCP Syn
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={customRuleDraft.tcpNotSyn}
                  onCheckedChange={(checked) =>
                    setCustomRuleDraft((previous) => ({
                      ...previous,
                      tcpNotSyn: checked === true,
                    }))
                  }
                  disabled={!canEdit || saving}
                />
                TCP Not-Syn
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={addOrUpdateCustomRule} disabled={!canEdit || saving}>
                <Plus className="mr-2 h-4 w-4" />
                {customRuleEditKey ? "Update Custom Rule" : "Add Custom Rule"}
              </Button>
              {customRuleEditKey && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setCustomRuleDraft(EMPTY_CUSTOM_RULE_DRAFT);
                    setCustomRuleEditKey(null);
                  }}
                  disabled={!canEdit || saving}
                >
                  Cancel Edit
                </Button>
              )}
            </div>

            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Timeout</TableHead>
                    <TableHead>TCP Match</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.customRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No custom timeout rules configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    form.customRules.map((rule) => (
                      <TableRow key={customRuleKey(rule)}>
                        <TableCell className="font-medium">
                          {rule.family} #{rule.id}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatCustomMatch(rule)}</TableCell>
                        <TableCell>{rule.timeout || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatTcpDetail(rule)}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => editCustomRule(rule)}
                              disabled={!canEdit || saving}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteCustomRule(rule)}
                              disabled={!canEdit || saving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ignore Rules</CardTitle>
            <CardDescription>
              Configure `system conntrack ignore` rules for IPv4/IPv6 traffic to bypass state tracking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Address Family</Label>
                <Select
                  value={ignoreRuleDraft.family}
                  onValueChange={(value) =>
                    setIgnoreRuleDraft((previous) => ({
                      ...previous,
                      family: normalizeFamily(value),
                    }))
                  }
                >
                  <SelectTrigger disabled={!canEdit || saving}>
                    <SelectValue placeholder="Select family" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ipv4">IPv4</SelectItem>
                    <SelectItem value="ipv6">IPv6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rule ID</Label>
                <Input
                  value={ignoreRuleDraft.id}
                  onChange={(event) =>
                    setIgnoreRuleDraft((previous) => ({ ...previous, id: event.target.value }))
                  }
                  placeholder="10"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Protocol</Label>
                <Input
                  list="conntrack-protocol-options"
                  value={ignoreRuleDraft.protocol}
                  onChange={(event) =>
                    setIgnoreRuleDraft((previous) => ({ ...previous, protocol: event.target.value }))
                  }
                  placeholder="tcp"
                  disabled={!canEdit || saving}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Source Address</Label>
                <Input
                  value={ignoreRuleDraft.sourceAddress}
                  onChange={(event) =>
                    setIgnoreRuleDraft((previous) => ({ ...previous, sourceAddress: event.target.value }))
                  }
                  placeholder="192.0.2.0/24"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Destination Address</Label>
                <Input
                  value={ignoreRuleDraft.destinationAddress}
                  onChange={(event) =>
                    setIgnoreRuleDraft((previous) => ({ ...previous, destinationAddress: event.target.value }))
                  }
                  placeholder="198.51.100.0/24"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>TCP Source Port</Label>
                <Input
                  value={ignoreRuleDraft.tcpSourcePort}
                  onChange={(event) =>
                    setIgnoreRuleDraft((previous) => ({ ...previous, tcpSourcePort: event.target.value }))
                  }
                  placeholder="1024"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>TCP Destination Port</Label>
                <Input
                  value={ignoreRuleDraft.tcpDestinationPort}
                  onChange={(event) =>
                    setIgnoreRuleDraft((previous) => ({ ...previous, tcpDestinationPort: event.target.value }))
                  }
                  placeholder="443"
                  disabled={!canEdit || saving}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={ignoreRuleDraft.tcpSyn}
                  onCheckedChange={(checked) =>
                    setIgnoreRuleDraft((previous) => ({
                      ...previous,
                      tcpSyn: checked === true,
                    }))
                  }
                  disabled={!canEdit || saving}
                />
                TCP Syn
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={ignoreRuleDraft.tcpNotSyn}
                  onCheckedChange={(checked) =>
                    setIgnoreRuleDraft((previous) => ({
                      ...previous,
                      tcpNotSyn: checked === true,
                    }))
                  }
                  disabled={!canEdit || saving}
                />
                TCP Not-Syn
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={addOrUpdateIgnoreRule} disabled={!canEdit || saving}>
                <Plus className="mr-2 h-4 w-4" />
                {ignoreRuleEditKey ? "Update Ignore Rule" : "Add Ignore Rule"}
              </Button>
              {ignoreRuleEditKey && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIgnoreRuleDraft(EMPTY_IGNORE_RULE_DRAFT);
                    setIgnoreRuleEditKey(null);
                  }}
                  disabled={!canEdit || saving}
                >
                  Cancel Edit
                </Button>
              )}
            </div>

            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>TCP Match</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.ignoreRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No ignore rules configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    form.ignoreRules.map((rule) => (
                      <TableRow key={ignoreRuleKey(rule)}>
                        <TableCell className="font-medium">
                          {rule.family} #{rule.id}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatIgnoreMatch(rule)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatTcpDetail(rule)}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => editIgnoreRule(rule)}
                              disabled={!canEdit || saving}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteIgnoreRule(rule)}
                              disabled={!canEdit || saving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conntrack Logging</CardTitle>
            <CardDescription>Configure `system conntrack log` event flags, protocol event classes, and queue behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-4">
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={form.loggingInvalidState}
                  onCheckedChange={(checked) =>
                    setForm((previous) => ({ ...previous, loggingInvalidState: checked === true }))
                  }
                  disabled={!canEdit || saving}
                />
                Invalid State
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={form.loggingNew}
                  onCheckedChange={(checked) => setForm((previous) => ({ ...previous, loggingNew: checked === true }))}
                  disabled={!canEdit || saving}
                />
                New
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={form.loggingDestroy}
                  onCheckedChange={(checked) =>
                    setForm((previous) => ({ ...previous, loggingDestroy: checked === true }))
                  }
                  disabled={!canEdit || saving}
                />
                Destroy
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={form.loggingTimestamp}
                  onCheckedChange={(checked) =>
                    setForm((previous) => ({ ...previous, loggingTimestamp: checked === true }))
                  }
                  disabled={!canEdit || saving}
                />
                Timestamp
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Queue Size</Label>
                <Input
                  value={form.loggingQueueSize}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, loggingQueueSize: event.target.value }))
                  }
                  placeholder="1048576"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label>Log Level</Label>
                <Select
                  value={form.loggingLevel || "none"}
                  onValueChange={(value) =>
                    setForm((previous) => ({
                      ...previous,
                      loggingLevel: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger disabled={!canEdit || saving}>
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default</SelectItem>
                    {LOG_LEVEL_OPTIONS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>TCP Log Events</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {LOG_PROTO_EVENT_OPTIONS.map((eventName) => (
                    <label key={`tcp-${eventName}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={form.loggingTcp.includes(eventName)}
                        onCheckedChange={(checked) => toggleLogEvent("tcp", eventName, checked === true)}
                        disabled={!canEdit || saving}
                      />
                      {eventName}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>UDP Log Events</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {LOG_PROTO_EVENT_OPTIONS.map((eventName) => (
                    <label key={`udp-${eventName}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={form.loggingUdp.includes(eventName)}
                        onCheckedChange={(checked) => toggleLogEvent("udp", eventName, checked === true)}
                        disabled={!canEdit || saving}
                      />
                      {eventName}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {!canEdit && (
          <Card className="border-amber-500/40">
            <CardContent className="pt-6 text-xs text-amber-300">
              You have read-only permissions for System settings.
            </CardContent>
          </Card>
        )}

        <datalist id="conntrack-protocol-options">
          {L4_PROTOCOL_OPTIONS.map((protocol) => (
            <option key={protocol} value={protocol} />
          ))}
        </datalist>

        <div className="flex items-center justify-between gap-3">
          <Badge variant={hasChanges ? "default" : "secondary"}>
            {hasChanges ? "Unsaved Changes" : "In Sync"}
          </Badge>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" onClick={saveConfig} disabled={!canEdit || saving || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              Save Conntrack
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
