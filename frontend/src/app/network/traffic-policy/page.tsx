"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { trafficPolicyApi } from "@/lib/api/traffic-policy";
import { qosApi } from "@/lib/api/qos";
import { ethernetService } from "@/lib/api/ethernet";
import { showService } from "@/lib/api/show";
import { formatInterfaceDisplayName } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";

type TrafficPolicyType = "drop-tail" | "network-emulator" | "random-detect" | "shaper";

type TrafficPolicyEntry = {
  type: TrafficPolicyType;
  name: string;
  bandwidth: string;
  delay: string;
  description: string;
  queueLimit: string;
  reordering: string;
};

type QosPolicyType =
  | "cake"
  | "drop-tail"
  | "fair-queue"
  | "fq-codel"
  | "limiter"
  | "network-emulator"
  | "priority-queue"
  | "random-detect"
  | "rate-control"
  | "round-robin"
  | "shaper";

type QosPolicyClassEntry = {
  classId: string;
  description: string;
  bandwidth: string;
  burst: string;
  ceiling: string;
  priority: string;
  queueLimit: string;
  queueType: string;
  target: string;
  interval: string;
  flows: string;
  codelQuantum: string;
  quantum: string;
  mtu: string;
  setDscp: string;
  match: string[];
  matchGroup: string[];
};

type QosPolicyEntry = {
  type: QosPolicyType;
  name: string;
  description: string;
  bandwidth: string;
  burst: string;
  delay: string;
  latency: string;
  queueLimit: string;
  hashInterval: string;
  target: string;
  interval: string;
  flows: string;
  codelQuantum: string;
  rtt: string;
  defaultBandwidth: string;
  defaultBurst: string;
  defaultCeiling: string;
  defaultPriority: string;
  defaultQueueType: string;
  classes: QosPolicyClassEntry[];
};

type QosInterfaceBinding = {
  interface: string;
  ingress: string;
  egress: string;
};

type QosTrafficMatchGroupEntry = {
  name: string;
  match: string[];
  matchGroup: string[];
};

const TRAFFIC_POLICY_TYPES: TrafficPolicyType[] = [
  "drop-tail",
  "network-emulator",
  "random-detect",
  "shaper",
];

const QOS_POLICY_TYPES: QosPolicyType[] = [
  "cake",
  "drop-tail",
  "fair-queue",
  "fq-codel",
  "limiter",
  "network-emulator",
  "priority-queue",
  "random-detect",
  "rate-control",
  "round-robin",
  "shaper",
];

const QOS_CLASS_CAPABLE_TYPES: QosPolicyType[] = [
  "limiter",
  "priority-queue",
  "round-robin",
  "shaper",
];

const EMPTY_TRAFFIC_POLICY_DRAFT: TrafficPolicyEntry = {
  type: "shaper",
  name: "",
  bandwidth: "",
  delay: "",
  description: "",
  queueLimit: "",
  reordering: "",
};

const EMPTY_QOS_POLICY_DRAFT: QosPolicyEntry = {
  type: "shaper",
  name: "",
  description: "",
  bandwidth: "",
  burst: "",
  delay: "",
  latency: "",
  queueLimit: "",
  hashInterval: "",
  target: "",
  interval: "",
  flows: "",
  codelQuantum: "",
  rtt: "",
  defaultBandwidth: "",
  defaultBurst: "",
  defaultCeiling: "",
  defaultPriority: "",
  defaultQueueType: "",
  classes: [],
};

const EMPTY_QOS_CLASS_DRAFT: QosPolicyClassEntry = {
  classId: "",
  description: "",
  bandwidth: "",
  burst: "",
  ceiling: "",
  priority: "",
  queueLimit: "",
  queueType: "",
  target: "",
  interval: "",
  flows: "",
  codelQuantum: "",
  quantum: "",
  mtu: "",
  setDscp: "",
  match: [],
  matchGroup: [],
};

const EMPTY_QOS_INTERFACE_DRAFT: QosInterfaceBinding = {
  interface: "",
  ingress: "",
  egress: "",
};

const EMPTY_QOS_TRAFFIC_MATCH_GROUP_DRAFT: QosTrafficMatchGroupEntry = {
  name: "",
  match: [],
  matchGroup: [],
};

function normalizeText(value: string): string {
  return value.trim();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function trafficPolicyKey(entry: TrafficPolicyEntry): string {
  return `${entry.type}\u001f${entry.name}`;
}

function qosPolicyKey(entry: QosPolicyEntry): string {
  return `${entry.type}\u001f${entry.name}`;
}

function qosClassKey(entry: QosPolicyClassEntry): string {
  return normalizeText(entry.classId);
}

function qosInterfaceKey(entry: QosInterfaceBinding): string {
  return normalizeText(entry.interface);
}

function qosTrafficMatchGroupKey(entry: QosTrafficMatchGroupEntry): string {
  return normalizeText(entry.name);
}

function uniqueList(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = normalizeText(value);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function parseCsvList(value: string): string[] {
  return uniqueList(value.split(",").map((item) => item.trim()));
}

function serializeCsvList(values: string[]): string {
  return uniqueList(values).join(", ");
}

function normalizeQosTrafficMatchGroup(
  entry: QosTrafficMatchGroupEntry
): QosTrafficMatchGroupEntry {
  return {
    name: normalizeText(entry.name),
    match: uniqueList(entry.match),
    matchGroup: uniqueList(entry.matchGroup),
  };
}

function trafficPolicyEqual(left: TrafficPolicyEntry, right: TrafficPolicyEntry): boolean {
  return (
    left.type === right.type &&
    left.name === right.name &&
    left.bandwidth === right.bandwidth &&
    left.delay === right.delay &&
    left.description === right.description &&
    left.queueLimit === right.queueLimit &&
    left.reordering === right.reordering
  );
}

function qosPolicyEqual(left: QosPolicyEntry, right: QosPolicyEntry): boolean {
  const leftClasses = [...left.classes].sort((a, b) =>
    a.classId.localeCompare(b.classId, undefined, { numeric: true })
  );
  const rightClasses = [...right.classes].sort((a, b) =>
    a.classId.localeCompare(b.classId, undefined, { numeric: true })
  );

  return (
    left.type === right.type &&
    left.name === right.name &&
    left.description === right.description &&
    left.bandwidth === right.bandwidth &&
    left.burst === right.burst &&
    left.delay === right.delay &&
    left.latency === right.latency &&
    left.queueLimit === right.queueLimit &&
    left.hashInterval === right.hashInterval &&
    left.target === right.target &&
    left.interval === right.interval &&
    left.flows === right.flows &&
    left.codelQuantum === right.codelQuantum &&
    left.rtt === right.rtt &&
    left.defaultBandwidth === right.defaultBandwidth &&
    left.defaultBurst === right.defaultBurst &&
    left.defaultCeiling === right.defaultCeiling &&
    left.defaultPriority === right.defaultPriority &&
    left.defaultQueueType === right.defaultQueueType &&
    leftClasses.length === rightClasses.length &&
    leftClasses.every((entry, index) => qosClassEqual(entry, rightClasses[index]))
  );
}

function qosClassEqual(left: QosPolicyClassEntry, right: QosPolicyClassEntry): boolean {
  return (
    left.classId === right.classId &&
    left.description === right.description &&
    left.bandwidth === right.bandwidth &&
    left.burst === right.burst &&
    left.ceiling === right.ceiling &&
    left.priority === right.priority &&
    left.queueLimit === right.queueLimit &&
    left.queueType === right.queueType &&
    left.target === right.target &&
    left.interval === right.interval &&
    left.flows === right.flows &&
    left.codelQuantum === right.codelQuantum &&
    left.quantum === right.quantum &&
    left.mtu === right.mtu &&
    left.setDscp === right.setDscp &&
    serializeCsvList(left.match) === serializeCsvList(right.match) &&
    serializeCsvList(left.matchGroup) === serializeCsvList(right.matchGroup)
  );
}

function qosInterfaceEqual(left: QosInterfaceBinding, right: QosInterfaceBinding): boolean {
  return (
    left.interface === right.interface &&
    left.ingress === right.ingress &&
    left.egress === right.egress
  );
}

function qosTrafficMatchGroupEqual(
  left: QosTrafficMatchGroupEntry,
  right: QosTrafficMatchGroupEntry
): boolean {
  return (
    left.name === right.name &&
    serializeCsvList(left.match) === serializeCsvList(right.match) &&
    serializeCsvList(left.matchGroup) === serializeCsvList(right.matchGroup)
  );
}

function sortByTypeAndName<T extends { type: string; name: string }>(entries: T[]): T[] {
  return [...entries].sort((left, right) => {
    const typeCompare = left.type.localeCompare(right.type);
    if (typeCompare !== 0) return typeCompare;
    return left.name.localeCompare(right.name, undefined, { numeric: true });
  });
}

export default function TrafficPolicyPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.NETWORK);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [trafficPolicies, setTrafficPolicies] = useState<TrafficPolicyEntry[]>([]);
  const [currentTrafficPolicies, setCurrentTrafficPolicies] = useState<TrafficPolicyEntry[]>([]);
  const [trafficPolicyDraft, setTrafficPolicyDraft] =
    useState<TrafficPolicyEntry>(EMPTY_TRAFFIC_POLICY_DRAFT);

  const [qosPolicies, setQosPolicies] = useState<QosPolicyEntry[]>([]);
  const [currentQosPolicies, setCurrentQosPolicies] = useState<QosPolicyEntry[]>([]);
  const [qosPolicyDraft, setQosPolicyDraft] = useState<QosPolicyEntry>(EMPTY_QOS_POLICY_DRAFT);
  const [qosInterfaces, setQosInterfaces] = useState<QosInterfaceBinding[]>([]);
  const [currentQosInterfaces, setCurrentQosInterfaces] = useState<QosInterfaceBinding[]>([]);
  const [qosInterfaceDraft, setQosInterfaceDraft] = useState<QosInterfaceBinding>(EMPTY_QOS_INTERFACE_DRAFT);
  const [qosTrafficMatchGroups, setQosTrafficMatchGroups] = useState<QosTrafficMatchGroupEntry[]>([]);
  const [currentQosTrafficMatchGroups, setCurrentQosTrafficMatchGroups] = useState<
    QosTrafficMatchGroupEntry[]
  >([]);
  const [qosTrafficMatchGroupDraft, setQosTrafficMatchGroupDraft] =
    useState<QosTrafficMatchGroupEntry>(EMPTY_QOS_TRAFFIC_MATCH_GROUP_DRAFT);
  const [qosTrafficMatchInput, setQosTrafficMatchInput] = useState("");
  const [qosTrafficMatchGroupInput, setQosTrafficMatchGroupInput] = useState("");
  const [interfaceOptions, setInterfaceOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedQosPolicyKey, setSelectedQosPolicyKey] = useState("");
  const [qosClassDraft, setQosClassDraft] = useState<QosPolicyClassEntry>(EMPTY_QOS_CLASS_DRAFT);
  const [qosClassMatchInput, setQosClassMatchInput] = useState("");
  const [qosClassMatchGroupInput, setQosClassMatchGroupInput] = useState("");
  const [editingQosClassId, setEditingQosClassId] = useState<string | null>(null);

  const selectedQosPolicy = useMemo(
    () => qosPolicies.find((entry) => qosPolicyKey(entry) === selectedQosPolicyKey) || null,
    [qosPolicies, selectedQosPolicyKey]
  );

  const classCapablePolicies = useMemo(
    () => qosPolicies.filter((entry) => QOS_CLASS_CAPABLE_TYPES.includes(entry.type)),
    [qosPolicies]
  );

  const selectedQosPolicySupportsClasses = Boolean(
    selectedQosPolicy && QOS_CLASS_CAPABLE_TYPES.includes(selectedQosPolicy.type)
  );

  const interfaceLabelByName = useMemo(
    () =>
      interfaceOptions.reduce<Record<string, string>>((acc, option) => {
        acc[option.value] = option.label;
        return acc;
      }, {}),
    [interfaceOptions]
  );

  const ingressPolicyNames = useMemo(
    () =>
      uniqueList(
        qosPolicies
          .filter((entry) => entry.type === "limiter")
          .map((entry) => entry.name)
      ),
    [qosPolicies]
  );

  const egressPolicyNames = useMemo(
    () => uniqueList(qosPolicies.map((entry) => entry.name)),
    [qosPolicies]
  );

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const [trafficConfig, qosConfig, ethernetConfig, physicalConfig, allInterfacesConfig] = await Promise.all([
        trafficPolicyApi.getConfig<Record<string, unknown>>(refresh),
        qosApi.getConfig<Record<string, unknown>>(refresh).catch(() => ({})),
        ethernetService.getConfig().catch(() => ({ interfaces: [] })),
        showService.getInterfacePhysical().catch(() => ({ interfaces: [], total: 0 })),
        showService.getAllInterfaces().catch(() => ({ interfaces: [], total: 0 })),
      ]);

      const parsedTraffic: TrafficPolicyEntry[] = [];
      for (const policyType of TRAFFIC_POLICY_TYPES) {
        const typeRoot = asObject(trafficConfig[policyType]);
        for (const [name, value] of Object.entries(typeRoot)) {
          const root = asObject(value);
          parsedTraffic.push({
            type: policyType,
            name: normalizeText(name),
            bandwidth: normalizeText(asText(root.bandwidth)),
            delay: normalizeText(asText(root.delay)),
            description: normalizeText(asText(root.description)),
            queueLimit: normalizeText(asText(root["queue-limit"])),
            reordering: normalizeText(asText(root.reordering)),
          });
        }
      }

      const policyRoot = asObject(asObject(qosConfig).policy);
      const interfaceRoot = asObject(asObject(qosConfig).interface);
      const parsedQos: QosPolicyEntry[] = [];
      for (const policyType of QOS_POLICY_TYPES) {
        const typeRoot = asObject(policyRoot[policyType]);
        for (const [name, value] of Object.entries(typeRoot)) {
          const root = asObject(value);
          const defaultRoot = asObject(root.default);
          const classRoot = asObject(root.class);
          const parsedClasses: QosPolicyClassEntry[] = Object.entries(classRoot)
            .map(([classId, classValue]) => {
              const classNode = asObject(classValue);
              return {
                classId: normalizeText(classId),
                description: normalizeText(asText(classNode.description)),
                bandwidth: normalizeText(asText(classNode.bandwidth)),
                burst: normalizeText(asText(classNode.burst)),
                ceiling: normalizeText(asText(classNode.ceiling)),
                priority: normalizeText(asText(classNode.priority)),
                queueLimit: normalizeText(asText(classNode["queue-limit"])),
                queueType: normalizeText(asText(classNode["queue-type"])),
                target: normalizeText(asText(classNode.target)),
                interval: normalizeText(asText(classNode.interval)),
                flows: normalizeText(asText(classNode.flows)),
                codelQuantum: normalizeText(asText(classNode["codel-quantum"])),
                quantum: normalizeText(asText(classNode.quantum)),
                mtu: normalizeText(asText(classNode.mtu)),
                setDscp: normalizeText(asText(asObject(classNode.set).dscp)),
                match: uniqueList(Object.keys(asObject(classNode.match))),
                matchGroup: uniqueList(Object.keys(asObject(asObject(classNode.match).group))),
              };
            })
            .filter((entry) => entry.classId)
            .sort((left, right) => left.classId.localeCompare(right.classId, undefined, { numeric: true }));

          parsedQos.push({
            type: policyType,
            name: normalizeText(name),
            description: normalizeText(asText(root.description)),
            bandwidth: normalizeText(asText(root.bandwidth)),
            burst: normalizeText(asText(root.burst)),
            delay: normalizeText(asText(root.delay)),
            latency: normalizeText(asText(root.latency)),
            queueLimit: normalizeText(asText(root["queue-limit"])),
            hashInterval: normalizeText(asText(root["hash-interval"])),
            target: normalizeText(asText(root.target)),
            interval: normalizeText(asText(root.interval)),
            flows: normalizeText(asText(root.flows)),
            codelQuantum: normalizeText(asText(root["codel-quantum"])),
            rtt: normalizeText(asText(root.rtt)),
            defaultBandwidth: normalizeText(asText(defaultRoot.bandwidth)),
            defaultBurst: normalizeText(asText(defaultRoot.burst)),
            defaultCeiling: normalizeText(asText(defaultRoot.ceiling)),
            defaultPriority: normalizeText(asText(defaultRoot.priority)),
            defaultQueueType: normalizeText(asText(defaultRoot["queue-type"])),
            classes: parsedClasses,
          });
        }
      }

      const sortedTraffic = sortByTypeAndName(parsedTraffic);
      const sortedQos = sortByTypeAndName(parsedQos);
      const parsedQosInterfaces: QosInterfaceBinding[] = Object.entries(interfaceRoot)
        .map(([interfaceName, value]) => {
          const root = asObject(value);
          return {
            interface: normalizeText(interfaceName),
            ingress: normalizeText(asText(root.ingress)),
            egress: normalizeText(asText(root.egress)),
          };
        })
        .filter((entry) => entry.interface)
        .sort((left, right) =>
          left.interface.localeCompare(right.interface, undefined, { numeric: true })
        );
      const trafficMatchGroupRoot = asObject(
        asObject(qosConfig)["traffic-match-group"] ?? asObject(qosConfig).traffic_match_group
      );
      const parsedQosTrafficMatchGroups: QosTrafficMatchGroupEntry[] = Object.entries(
        trafficMatchGroupRoot
      )
        .map(([groupName, value]) => {
          const root = asObject(value);
          return normalizeQosTrafficMatchGroup({
            name: normalizeText(groupName),
            match: Object.keys(asObject(root.match)),
            matchGroup: Object.keys(asObject(root["match-group"] ?? root.match_group)),
          });
        })
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const interfaceNames = new Set<string>();
      const descriptionByName = ethernetConfig.interfaces.reduce<Record<string, string | null>>(
        (acc, iface) => {
          acc[iface.name] = iface.description ?? null;
          return acc;
        },
        {}
      );
      ethernetConfig.interfaces.forEach((iface) => interfaceNames.add(iface.name));
      physicalConfig.interfaces.forEach((iface) => interfaceNames.add(iface.interface));
      allInterfacesConfig.interfaces.forEach((iface) => interfaceNames.add(iface.name));
      parsedQosInterfaces.forEach((entry) => interfaceNames.add(entry.interface));

      const normalizedInterfaces = [...interfaceNames]
        .filter((name) => name && name !== "lo")
        .map((name) => ({
          value: name,
          label: formatInterfaceDisplayName(name, descriptionByName[name] ?? null),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

      setTrafficPolicies(sortedTraffic);
      setCurrentTrafficPolicies(sortedTraffic);
      setTrafficPolicyDraft(EMPTY_TRAFFIC_POLICY_DRAFT);

      setQosPolicies(sortedQos);
      setCurrentQosPolicies(sortedQos);
      setQosPolicyDraft(EMPTY_QOS_POLICY_DRAFT);
      setQosInterfaces(parsedQosInterfaces);
      setCurrentQosInterfaces(parsedQosInterfaces);
      setQosTrafficMatchGroups(parsedQosTrafficMatchGroups);
      setCurrentQosTrafficMatchGroups(parsedQosTrafficMatchGroups);
      setQosTrafficMatchGroupDraft(EMPTY_QOS_TRAFFIC_MATCH_GROUP_DRAFT);
      setQosTrafficMatchInput("");
      setQosTrafficMatchGroupInput("");
      setInterfaceOptions(normalizedInterfaces);
      setQosInterfaceDraft({
        ...EMPTY_QOS_INTERFACE_DRAFT,
        interface: normalizedInterfaces[0]?.value || "",
      });
      const initialClassPolicy = sortedQos.find((entry) => QOS_CLASS_CAPABLE_TYPES.includes(entry.type));
      setSelectedQosPolicyKey(initialClassPolicy ? qosPolicyKey(initialClassPolicy) : "");
      setQosClassDraft(EMPTY_QOS_CLASS_DRAFT);
      setQosClassMatchInput("");
      setQosClassMatchGroupInput("");
      setEditingQosClassId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load traffic-policy configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const addTrafficPolicy = () => {
    setError(null);

    const entry: TrafficPolicyEntry = {
      type: trafficPolicyDraft.type,
      name: normalizeText(trafficPolicyDraft.name),
      bandwidth: normalizeText(trafficPolicyDraft.bandwidth),
      delay: normalizeText(trafficPolicyDraft.delay),
      description: normalizeText(trafficPolicyDraft.description),
      queueLimit: normalizeText(trafficPolicyDraft.queueLimit),
      reordering: normalizeText(trafficPolicyDraft.reordering),
    };

    if (!entry.name) {
      setError("Traffic-policy name is required.");
      return;
    }

    if (trafficPolicies.some((item) => item.type === entry.type && item.name === entry.name)) {
      setError("Traffic-policy type/name combination already exists.");
      return;
    }

    setTrafficPolicies((previous) => sortByTypeAndName([...previous, entry]));
    setTrafficPolicyDraft({ ...EMPTY_TRAFFIC_POLICY_DRAFT, type: entry.type });
  };

  const removeTrafficPolicy = (entry: TrafficPolicyEntry) => {
    const key = trafficPolicyKey(entry);
    setTrafficPolicies((previous) => previous.filter((item) => trafficPolicyKey(item) !== key));
  };

  const addQosPolicy = () => {
    setError(null);

    const entry: QosPolicyEntry = {
      type: qosPolicyDraft.type,
      name: normalizeText(qosPolicyDraft.name),
      description: normalizeText(qosPolicyDraft.description),
      bandwidth: normalizeText(qosPolicyDraft.bandwidth),
      burst: normalizeText(qosPolicyDraft.burst),
      delay: normalizeText(qosPolicyDraft.delay),
      latency: normalizeText(qosPolicyDraft.latency),
      queueLimit: normalizeText(qosPolicyDraft.queueLimit),
      hashInterval: normalizeText(qosPolicyDraft.hashInterval),
      target: normalizeText(qosPolicyDraft.target),
      interval: normalizeText(qosPolicyDraft.interval),
      flows: normalizeText(qosPolicyDraft.flows),
      codelQuantum: normalizeText(qosPolicyDraft.codelQuantum),
      rtt: normalizeText(qosPolicyDraft.rtt),
      defaultBandwidth: normalizeText(qosPolicyDraft.defaultBandwidth),
      defaultBurst: normalizeText(qosPolicyDraft.defaultBurst),
      defaultCeiling: normalizeText(qosPolicyDraft.defaultCeiling),
      defaultPriority: normalizeText(qosPolicyDraft.defaultPriority),
      defaultQueueType: normalizeText(qosPolicyDraft.defaultQueueType),
      classes: [],
    };

    if (!entry.name) {
      setError("QoS policy name is required.");
      return;
    }

    if (qosPolicies.some((item) => item.type === entry.type && item.name === entry.name)) {
      setError("QoS policy type/name combination already exists.");
      return;
    }

    setQosPolicies((previous) => sortByTypeAndName([...previous, entry]));
    if (QOS_CLASS_CAPABLE_TYPES.includes(entry.type)) {
      setSelectedQosPolicyKey(qosPolicyKey(entry));
    }
    setQosPolicyDraft({ ...EMPTY_QOS_POLICY_DRAFT, type: entry.type });
  };

  const removeQosPolicy = (entry: QosPolicyEntry) => {
    const key = qosPolicyKey(entry);
    setQosPolicies((previous) => {
      const remaining = previous.filter((item) => qosPolicyKey(item) !== key);
      if (selectedQosPolicyKey === key) {
        const nextClassPolicy = remaining.find((item) => QOS_CLASS_CAPABLE_TYPES.includes(item.type));
        setSelectedQosPolicyKey(nextClassPolicy ? qosPolicyKey(nextClassPolicy) : "");
        setQosClassDraft(EMPTY_QOS_CLASS_DRAFT);
        setQosClassMatchInput("");
        setQosClassMatchGroupInput("");
        setEditingQosClassId(null);
      }
      return remaining;
    });
  };

  const addQosInterfaceBinding = () => {
    setError(null);

    const entry: QosInterfaceBinding = {
      interface: normalizeText(qosInterfaceDraft.interface),
      ingress: normalizeText(qosInterfaceDraft.ingress),
      egress: normalizeText(qosInterfaceDraft.egress),
    };

    if (!entry.interface) {
      setError("QoS interface binding requires an interface.");
      return;
    }

    if (!entry.ingress && !entry.egress) {
      setError("QoS interface binding requires at least ingress or egress policy.");
      return;
    }

    if (entry.ingress && !ingressPolicyNames.includes(entry.ingress)) {
      setError("Ingress must reference an existing limiter policy name.");
      return;
    }

    if (entry.egress && !egressPolicyNames.includes(entry.egress)) {
      setError("Egress must reference an existing QoS policy name.");
      return;
    }

    if (qosInterfaces.some((item) => qosInterfaceKey(item) === qosInterfaceKey(entry))) {
      setError("QoS interface binding already exists for this interface.");
      return;
    }

    setQosInterfaces((previous) =>
      [...previous, entry].sort((left, right) =>
        left.interface.localeCompare(right.interface, undefined, { numeric: true })
      )
    );

    setQosInterfaceDraft({
      ...EMPTY_QOS_INTERFACE_DRAFT,
      interface: interfaceOptions[0]?.value || "",
    });
  };

  const removeQosInterfaceBinding = (entry: QosInterfaceBinding) => {
    const key = qosInterfaceKey(entry);
    setQosInterfaces((previous) => previous.filter((item) => qosInterfaceKey(item) !== key));
  };

  const addOrUpdateQosTrafficMatchGroup = () => {
    setError(null);

    const entry = normalizeQosTrafficMatchGroup({
      name: qosTrafficMatchGroupDraft.name,
      match: parseCsvList(qosTrafficMatchInput),
      matchGroup: parseCsvList(qosTrafficMatchGroupInput),
    });

    if (!entry.name) {
      setError("Traffic-match-group name is required.");
      return;
    }

    if (entry.match.length === 0 && entry.matchGroup.length === 0) {
      setError("Traffic-match-group requires at least one match or nested match-group reference.");
      return;
    }

    setQosTrafficMatchGroups((previous) => {
      const next = [...previous.filter((item) => qosTrafficMatchGroupKey(item) !== qosTrafficMatchGroupKey(entry)), entry];
      return next.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
    });

    setQosTrafficMatchGroupDraft(EMPTY_QOS_TRAFFIC_MATCH_GROUP_DRAFT);
    setQosTrafficMatchInput("");
    setQosTrafficMatchGroupInput("");
  };

  const editQosTrafficMatchGroup = (entry: QosTrafficMatchGroupEntry) => {
    setQosTrafficMatchGroupDraft(entry);
    setQosTrafficMatchInput(serializeCsvList(entry.match));
    setQosTrafficMatchGroupInput(serializeCsvList(entry.matchGroup));
  };

  const removeQosTrafficMatchGroup = (entry: QosTrafficMatchGroupEntry) => {
    const key = qosTrafficMatchGroupKey(entry);
    setQosTrafficMatchGroups((previous) =>
      previous.filter((item) => qosTrafficMatchGroupKey(item) !== key)
    );

    if (qosTrafficMatchGroupKey(qosTrafficMatchGroupDraft) === key) {
      setQosTrafficMatchGroupDraft(EMPTY_QOS_TRAFFIC_MATCH_GROUP_DRAFT);
      setQosTrafficMatchInput("");
      setQosTrafficMatchGroupInput("");
    }
  };

  const resetQosClassDraft = () => {
    setQosClassDraft(EMPTY_QOS_CLASS_DRAFT);
    setQosClassMatchInput("");
    setQosClassMatchGroupInput("");
    setEditingQosClassId(null);
  };

  const saveQosClass = () => {
    setError(null);
    if (!selectedQosPolicy) {
      setError("Select a QoS policy before adding classes.");
      return;
    }
    if (!QOS_CLASS_CAPABLE_TYPES.includes(selectedQosPolicy.type)) {
      setError(`QoS policy type '${selectedQosPolicy.type}' does not support class entries.`);
      return;
    }

    const entry: QosPolicyClassEntry = {
      classId: normalizeText(qosClassDraft.classId),
      description: normalizeText(qosClassDraft.description),
      bandwidth: normalizeText(qosClassDraft.bandwidth),
      burst: normalizeText(qosClassDraft.burst),
      ceiling: normalizeText(qosClassDraft.ceiling),
      priority: normalizeText(qosClassDraft.priority),
      queueLimit: normalizeText(qosClassDraft.queueLimit),
      queueType: normalizeText(qosClassDraft.queueType),
      target: normalizeText(qosClassDraft.target),
      interval: normalizeText(qosClassDraft.interval),
      flows: normalizeText(qosClassDraft.flows),
      codelQuantum: normalizeText(qosClassDraft.codelQuantum),
      quantum: normalizeText(qosClassDraft.quantum),
      mtu: normalizeText(qosClassDraft.mtu),
      setDscp: normalizeText(qosClassDraft.setDscp),
      match: parseCsvList(qosClassMatchInput),
      matchGroup: parseCsvList(qosClassMatchGroupInput),
    };

    if (!entry.classId) {
      setError("QoS class ID is required.");
      return;
    }

    const classKey = qosClassKey(entry);
    const existingWithoutEdited = editingQosClassId
      ? selectedQosPolicy.classes.filter((item) => qosClassKey(item) !== editingQosClassId)
      : selectedQosPolicy.classes;

    if (existingWithoutEdited.some((item) => qosClassKey(item) === classKey)) {
      setError("QoS class ID already exists for this policy.");
      return;
    }

    setQosPolicies((previous) =>
      previous.map((policy) => {
        if (qosPolicyKey(policy) !== selectedQosPolicyKey) return policy;
        return {
          ...policy,
          classes: [...existingWithoutEdited, entry].sort((left, right) =>
            left.classId.localeCompare(right.classId, undefined, { numeric: true })
          ),
        };
      })
    );
    resetQosClassDraft();
  };

  const editQosClass = (classId: string) => {
    if (!selectedQosPolicy) return;
    const entry = selectedQosPolicy.classes.find((item) => item.classId === classId);
    if (!entry) return;
    setQosClassDraft({ ...entry, match: [...entry.match], matchGroup: [...entry.matchGroup] });
    setQosClassMatchInput(serializeCsvList(entry.match));
    setQosClassMatchGroupInput(serializeCsvList(entry.matchGroup));
    setEditingQosClassId(entry.classId);
  };

  const removeQosClass = (classId: string) => {
    if (!selectedQosPolicy) return;
    const targetKey = selectedQosPolicyKey;
    setQosPolicies((previous) =>
      previous.map((policy) => {
        if (qosPolicyKey(policy) !== targetKey) return policy;
        return {
          ...policy,
          classes: policy.classes.filter((entry) => entry.classId !== classId),
        };
      })
    );

    if (editingQosClassId === classId) {
      resetQosClassDraft();
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const trafficOperations: string[] = [];
      const currentTrafficMap = new Map(currentTrafficPolicies.map((entry) => [trafficPolicyKey(entry), entry]));
      const desiredTrafficMap = new Map(trafficPolicies.map((entry) => [trafficPolicyKey(entry), entry]));

      for (const [key, current] of currentTrafficMap.entries()) {
        if (!desiredTrafficMap.has(key)) {
          trafficOperations.push(`delete traffic-policy ${current.type} ${current.name}`);
        }
      }

      const trafficFields: Array<{ key: keyof TrafficPolicyEntry; cliKey: string; quoted?: boolean }> = [
        { key: "bandwidth", cliKey: "bandwidth" },
        { key: "delay", cliKey: "delay" },
        { key: "description", cliKey: "description", quoted: true },
        { key: "queueLimit", cliKey: "queue-limit" },
        { key: "reordering", cliKey: "reordering" },
      ];

      for (const [key, desired] of desiredTrafficMap.entries()) {
        const current = currentTrafficMap.get(key);
        if (current && trafficPolicyEqual(current, desired)) {
          continue;
        }

        const basePath = `traffic-policy ${desired.type} ${desired.name}`;
        trafficOperations.push(`set ${basePath}`);

        for (const field of trafficFields) {
          const desiredValue = normalizeText(String(desired[field.key] ?? ""));
          const currentValue = normalizeText(String(current?.[field.key] ?? ""));

          if (desiredValue) {
            const value = field.quoted ? JSON.stringify(desiredValue) : desiredValue;
            trafficOperations.push(`set ${basePath} ${field.cliKey} ${value}`);
          } else if (currentValue) {
            trafficOperations.push(`delete ${basePath} ${field.cliKey}`);
          }
        }
      }

      const qosOperations: string[] = [];
      const currentQosMap = new Map(currentQosPolicies.map((entry) => [qosPolicyKey(entry), entry]));
      const desiredQosMap = new Map(qosPolicies.map((entry) => [qosPolicyKey(entry), entry]));

      for (const [key, current] of currentQosMap.entries()) {
        if (!desiredQosMap.has(key)) {
          qosOperations.push(`delete qos policy ${current.type} ${current.name}`);
        }
      }

      const qosFields: Array<{ key: keyof QosPolicyEntry; cliKey: string; quoted?: boolean }> = [
        { key: "description", cliKey: "description", quoted: true },
        { key: "bandwidth", cliKey: "bandwidth" },
        { key: "burst", cliKey: "burst" },
        { key: "delay", cliKey: "delay" },
        { key: "latency", cliKey: "latency" },
        { key: "queueLimit", cliKey: "queue-limit" },
        { key: "hashInterval", cliKey: "hash-interval" },
        { key: "target", cliKey: "target" },
        { key: "interval", cliKey: "interval" },
        { key: "flows", cliKey: "flows" },
        { key: "codelQuantum", cliKey: "codel-quantum" },
        { key: "rtt", cliKey: "rtt" },
        { key: "defaultBandwidth", cliKey: "default bandwidth" },
        { key: "defaultBurst", cliKey: "default burst" },
        { key: "defaultCeiling", cliKey: "default ceiling" },
        { key: "defaultPriority", cliKey: "default priority" },
        { key: "defaultQueueType", cliKey: "default queue-type" },
      ];

      for (const [key, desired] of desiredQosMap.entries()) {
        const current = currentQosMap.get(key);
        if (current && qosPolicyEqual(current, desired)) {
          continue;
        }

        const basePath = `qos policy ${desired.type} ${desired.name}`;
        qosOperations.push(`set ${basePath}`);

        for (const field of qosFields) {
          const desiredValue = normalizeText(String(desired[field.key] ?? ""));
          const currentValue = normalizeText(String(current?.[field.key] ?? ""));

          if (desiredValue) {
            const value = field.quoted ? JSON.stringify(desiredValue) : desiredValue;
            qosOperations.push(`set ${basePath} ${field.cliKey} ${value}`);
          } else if (currentValue) {
            qosOperations.push(`delete ${basePath} ${field.cliKey}`);
          }
        }

        if (!QOS_CLASS_CAPABLE_TYPES.includes(desired.type)) {
          continue;
        }

        const currentClassMap = new Map((current?.classes || []).map((entry) => [qosClassKey(entry), entry]));
        const desiredClassMap = new Map(desired.classes.map((entry) => [qosClassKey(entry), entry]));

        for (const [classId] of currentClassMap.entries()) {
          if (!desiredClassMap.has(classId)) {
            qosOperations.push(`delete ${basePath} class ${classId}`);
          }
        }

        const classFields: Array<{ key: keyof QosPolicyClassEntry; cliKey: string; quoted?: boolean }> = [
          { key: "description", cliKey: "description", quoted: true },
          { key: "bandwidth", cliKey: "bandwidth" },
          { key: "burst", cliKey: "burst" },
          { key: "ceiling", cliKey: "ceiling" },
          { key: "priority", cliKey: "priority" },
          { key: "queueLimit", cliKey: "queue-limit" },
          { key: "queueType", cliKey: "queue-type" },
          { key: "target", cliKey: "target" },
          { key: "interval", cliKey: "interval" },
          { key: "flows", cliKey: "flows" },
          { key: "codelQuantum", cliKey: "codel-quantum" },
          { key: "quantum", cliKey: "quantum" },
          { key: "mtu", cliKey: "mtu" },
          { key: "setDscp", cliKey: "set dscp" },
        ];

        for (const [classId, desiredClass] of desiredClassMap.entries()) {
          const currentClass = currentClassMap.get(classId);
          if (currentClass && qosClassEqual(currentClass, desiredClass)) {
            continue;
          }

          const classBasePath = `${basePath} class ${classId}`;
          qosOperations.push(`set ${classBasePath}`);

          for (const classField of classFields) {
            const desiredValue = normalizeText(String(desiredClass[classField.key] ?? ""));
            const currentValue = normalizeText(String(currentClass?.[classField.key] ?? ""));

            if (desiredValue) {
              const value = classField.quoted ? JSON.stringify(desiredValue) : desiredValue;
              qosOperations.push(`set ${classBasePath} ${classField.cliKey} ${value}`);
            } else if (currentValue) {
              qosOperations.push(`delete ${classBasePath} ${classField.cliKey}`);
            }
          }

          const currentMatch = uniqueList(currentClass?.match || []);
          const desiredMatch = uniqueList(desiredClass.match);
          for (const matchValue of currentMatch) {
            if (!desiredMatch.includes(matchValue)) {
              qosOperations.push(`delete ${classBasePath} match ${matchValue}`);
            }
          }
          for (const matchValue of desiredMatch) {
            if (!currentMatch.includes(matchValue)) {
              qosOperations.push(`set ${classBasePath} match ${matchValue}`);
            }
          }

          const currentMatchGroup = uniqueList(currentClass?.matchGroup || []);
          const desiredMatchGroup = uniqueList(desiredClass.matchGroup);
          for (const matchGroupValue of currentMatchGroup) {
            if (!desiredMatchGroup.includes(matchGroupValue)) {
              qosOperations.push(`delete ${classBasePath} match group ${matchGroupValue}`);
            }
          }
          for (const matchGroupValue of desiredMatchGroup) {
            if (!currentMatchGroup.includes(matchGroupValue)) {
              qosOperations.push(`set ${classBasePath} match group ${matchGroupValue}`);
            }
          }
        }
      }

      const currentQosTrafficMatchGroupMap = new Map(
        currentQosTrafficMatchGroups.map((entry) => [
          qosTrafficMatchGroupKey(entry),
          normalizeQosTrafficMatchGroup(entry),
        ])
      );
      const desiredQosTrafficMatchGroupMap = new Map(
        qosTrafficMatchGroups
          .map(normalizeQosTrafficMatchGroup)
          .filter((entry) => entry.name)
          .map((entry) => [qosTrafficMatchGroupKey(entry), entry])
      );

      for (const [key, current] of currentQosTrafficMatchGroupMap.entries()) {
        if (!desiredQosTrafficMatchGroupMap.has(key)) {
          qosOperations.push(`delete qos traffic-match-group ${current.name}`);
        }
      }

      for (const [key, desired] of desiredQosTrafficMatchGroupMap.entries()) {
        const current = currentQosTrafficMatchGroupMap.get(key);
        if (current && qosTrafficMatchGroupEqual(current, desired)) {
          continue;
        }

        if (current) {
          qosOperations.push(`delete qos traffic-match-group ${current.name}`);
        }

        for (const matchName of desired.match) {
          qosOperations.push(`set qos traffic-match-group ${desired.name} match ${matchName}`);
        }
        for (const nestedGroupName of desired.matchGroup) {
          qosOperations.push(
            `set qos traffic-match-group ${desired.name} match-group ${nestedGroupName}`
          );
        }
      }

      const currentQosInterfaceMap = new Map(currentQosInterfaces.map((entry) => [qosInterfaceKey(entry), entry]));
      const desiredQosInterfaceMap = new Map(qosInterfaces.map((entry) => [qosInterfaceKey(entry), entry]));

      for (const [key, current] of currentQosInterfaceMap.entries()) {
        if (!desiredQosInterfaceMap.has(key)) {
          qosOperations.push(`delete qos interface ${current.interface}`);
        }
      }

      for (const [key, desired] of desiredQosInterfaceMap.entries()) {
        const current = currentQosInterfaceMap.get(key);
        if (current && qosInterfaceEqual(current, desired)) {
          continue;
        }

        const basePath = `qos interface ${desired.interface}`;
        qosOperations.push(`set ${basePath}`);

        if (desired.ingress) {
          qosOperations.push(`set ${basePath} ingress ${desired.ingress}`);
        } else if (current?.ingress) {
          qosOperations.push(`delete ${basePath} ingress`);
        }

        if (desired.egress) {
          qosOperations.push(`set ${basePath} egress ${desired.egress}`);
        } else if (current?.egress) {
          qosOperations.push(`delete ${basePath} egress`);
        }
      }

      if (trafficOperations.length === 0 && qosOperations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      if (trafficOperations.length > 0) {
        const trafficResult = await trafficPolicyApi.configure(trafficOperations);
        if (!trafficResult.success) {
          throw new Error(trafficResult.error || "Failed to save traffic-policy configuration");
        }
      }

      if (qosOperations.length > 0) {
        const qosResult = await qosApi.configure(qosOperations);
        if (!qosResult.success) {
          throw new Error(qosResult.error || "Failed to save QoS configuration");
        }
      }

      setMessage("Traffic policy and QoS configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save traffic-policy configuration");
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
            <h1 className="text-2xl font-bold text-foreground">Traffic Policy</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure both `traffic-policy` and guide-based `qos policy` trees with structured form editors.
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

        <Card>
          <CardHeader>
            <CardTitle>Traffic-Policy Tree</CardTitle>
            <CardDescription>
              Manage `traffic-policy` objects. Includes queue-limit and reordering options for network-emulator.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-7">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={trafficPolicyDraft.type}
                  onValueChange={(value) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, type: value as TrafficPolicyType }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAFFIC_POLICY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={trafficPolicyDraft.name}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, name: event.target.value }))
                  }
                  placeholder="WAN-SHAPER"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Bandwidth</Label>
                <Input
                  value={trafficPolicyDraft.bandwidth}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, bandwidth: event.target.value }))
                  }
                  placeholder="100mbit"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Delay</Label>
                <Input
                  value={trafficPolicyDraft.delay}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, delay: event.target.value }))
                  }
                  placeholder="40ms"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Queue Limit</Label>
                <Input
                  value={trafficPolicyDraft.queueLimit}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, queueLimit: event.target.value }))
                  }
                  placeholder="1000"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Reordering %</Label>
                <Input
                  value={trafficPolicyDraft.reordering}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, reordering: event.target.value }))
                  }
                  placeholder="5"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={trafficPolicyDraft.description}
                  onChange={(event) =>
                    setTrafficPolicyDraft((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="WAN policy"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <Button type="button" variant="outline" onClick={addTrafficPolicy} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Add Traffic-Policy Entry
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Bandwidth</TableHead>
                  <TableHead>Delay</TableHead>
                  <TableHead>Queue Limit</TableHead>
                  <TableHead>Reordering</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trafficPolicies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      No traffic-policy entries configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  trafficPolicies.map((entry) => (
                    <TableRow key={trafficPolicyKey(entry)}>
                      <TableCell>
                        <Badge variant="secondary">{entry.type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell>{entry.bandwidth || "-"}</TableCell>
                      <TableCell>{entry.delay || "-"}</TableCell>
                      <TableCell>{entry.queueLimit || "-"}</TableCell>
                      <TableCell>{entry.reordering || "-"}</TableCell>
                      <TableCell>{entry.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTrafficPolicy(entry)}
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
            <CardTitle>QoS Policy Tree</CardTitle>
            <CardDescription>
              Guide-aligned QoS policies (`set qos policy ...`). Interface assignment remains under interface configuration pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={qosPolicyDraft.type}
                  onValueChange={(value) =>
                    setQosPolicyDraft((previous) => ({ ...previous, type: value as QosPolicyType }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QOS_POLICY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={qosPolicyDraft.name}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, name: event.target.value }))
                  }
                  placeholder="WAN-QOS"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={qosPolicyDraft.description}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="Primary QoS policy"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Bandwidth</Label>
                <Input
                  value={qosPolicyDraft.bandwidth}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, bandwidth: event.target.value }))
                  }
                  placeholder="1gbit"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Burst</Label>
                <Input
                  value={qosPolicyDraft.burst}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, burst: event.target.value }))
                  }
                  placeholder="15k"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-6">
              <div className="space-y-2">
                <Label>Delay</Label>
                <Input
                  value={qosPolicyDraft.delay}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, delay: event.target.value }))
                  }
                  placeholder="40ms"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Latency</Label>
                <Input
                  value={qosPolicyDraft.latency}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, latency: event.target.value }))
                  }
                  placeholder="50ms"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Queue Limit</Label>
                <Input
                  value={qosPolicyDraft.queueLimit}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, queueLimit: event.target.value }))
                  }
                  placeholder="1000"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Hash Interval</Label>
                <Input
                  value={qosPolicyDraft.hashInterval}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, hashInterval: event.target.value }))
                  }
                  placeholder="10"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Target</Label>
                <Input
                  value={qosPolicyDraft.target}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, target: event.target.value }))
                  }
                  placeholder="5ms"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Interval</Label>
                <Input
                  value={qosPolicyDraft.interval}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, interval: event.target.value }))
                  }
                  placeholder="100ms"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Flows</Label>
                <Input
                  value={qosPolicyDraft.flows}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, flows: event.target.value }))
                  }
                  placeholder="1024"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Codel Quantum</Label>
                <Input
                  value={qosPolicyDraft.codelQuantum}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, codelQuantum: event.target.value }))
                  }
                  placeholder="300"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>RTT</Label>
                <Input
                  value={qosPolicyDraft.rtt}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({ ...previous, rtt: event.target.value }))
                  }
                  placeholder="100ms"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Default Bandwidth</Label>
                <Input
                  value={qosPolicyDraft.defaultBandwidth}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({
                      ...previous,
                      defaultBandwidth: event.target.value,
                    }))
                  }
                  placeholder="100%"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Burst</Label>
                <Input
                  value={qosPolicyDraft.defaultBurst}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({
                      ...previous,
                      defaultBurst: event.target.value,
                    }))
                  }
                  placeholder="15k"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Ceiling</Label>
                <Input
                  value={qosPolicyDraft.defaultCeiling}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({
                      ...previous,
                      defaultCeiling: event.target.value,
                    }))
                  }
                  placeholder="100%"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Priority</Label>
                <Input
                  value={qosPolicyDraft.defaultPriority}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({
                      ...previous,
                      defaultPriority: event.target.value,
                    }))
                  }
                  placeholder="7"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Queue Type</Label>
                <Input
                  value={qosPolicyDraft.defaultQueueType}
                  onChange={(event) =>
                    setQosPolicyDraft((previous) => ({
                      ...previous,
                      defaultQueueType: event.target.value,
                    }))
                  }
                  placeholder="fq-codel"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <Button type="button" variant="outline" onClick={addQosPolicy} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Add QoS Policy
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Bandwidth</TableHead>
                  <TableHead>Delay</TableHead>
                  <TableHead>Queue Limit</TableHead>
                  <TableHead>RTT</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qosPolicies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-muted-foreground">
                      No QoS policies configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  qosPolicies.map((entry) => (
                    <TableRow key={qosPolicyKey(entry)}>
                      <TableCell>
                        <Badge variant="secondary">{entry.type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell>{entry.bandwidth || "-"}</TableCell>
                      <TableCell>{entry.delay || "-"}</TableCell>
                      <TableCell>{entry.queueLimit || "-"}</TableCell>
                      <TableCell>{entry.rtt || "-"}</TableCell>
                      <TableCell>{entry.classes.length}</TableCell>
                      <TableCell>{entry.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedQosPolicyKey(qosPolicyKey(entry));
                              resetQosClassDraft();
                            }}
                            disabled={!canEdit || !QOS_CLASS_CAPABLE_TYPES.includes(entry.type)}
                          >
                            Classes
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeQosPolicy(entry)}
                            disabled={!canEdit}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QoS Class Editor</CardTitle>
            <CardDescription>
              Configure `qos policy &lt;type&gt; &lt;name&gt; class &lt;id&gt;` entries, including queue, match, and DSCP settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>QoS Policy</Label>
                <Select
                  value={selectedQosPolicyKey || "__unset__"}
                  onValueChange={(value) => {
                    setSelectedQosPolicyKey(value === "__unset__" ? "" : value);
                    resetQosClassDraft();
                  }}
                  disabled={!canEdit || classCapablePolicies.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select policy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">Select policy</SelectItem>
                    {classCapablePolicies.map((entry) => (
                      <SelectItem key={qosPolicyKey(entry)} value={qosPolicyKey(entry)}>
                        {entry.type} / {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Class ID</Label>
                <Input
                  value={qosClassDraft.classId}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, classId: event.target.value }))
                  }
                  placeholder="10"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={qosClassDraft.description}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="VoIP class"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Bandwidth</Label>
                <Input
                  value={qosClassDraft.bandwidth}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, bandwidth: event.target.value }))
                  }
                  placeholder="200mbit"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Burst</Label>
                <Input
                  value={qosClassDraft.burst}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, burst: event.target.value }))
                  }
                  placeholder="15k"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-6">
              <div className="space-y-2">
                <Label>Ceiling</Label>
                <Input
                  value={qosClassDraft.ceiling}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, ceiling: event.target.value }))
                  }
                  placeholder="500mbit"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  value={qosClassDraft.priority}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, priority: event.target.value }))
                  }
                  placeholder="7"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Queue Limit</Label>
                <Input
                  value={qosClassDraft.queueLimit}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, queueLimit: event.target.value }))
                  }
                  placeholder="1000"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Queue Type</Label>
                <Input
                  value={qosClassDraft.queueType}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, queueType: event.target.value }))
                  }
                  placeholder="fq-codel"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Target</Label>
                <Input
                  value={qosClassDraft.target}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, target: event.target.value }))
                  }
                  placeholder="5ms"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Interval</Label>
                <Input
                  value={qosClassDraft.interval}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, interval: event.target.value }))
                  }
                  placeholder="100ms"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-6">
              <div className="space-y-2">
                <Label>Flows</Label>
                <Input
                  value={qosClassDraft.flows}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, flows: event.target.value }))
                  }
                  placeholder="1024"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Codel Quantum</Label>
                <Input
                  value={qosClassDraft.codelQuantum}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, codelQuantum: event.target.value }))
                  }
                  placeholder="300"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Quantum</Label>
                <Input
                  value={qosClassDraft.quantum}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, quantum: event.target.value }))
                  }
                  placeholder="1514"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>MTU</Label>
                <Input
                  value={qosClassDraft.mtu}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, mtu: event.target.value }))
                  }
                  placeholder="1500"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Set DSCP</Label>
                <Input
                  value={qosClassDraft.setDscp}
                  onChange={(event) =>
                    setQosClassDraft((previous) => ({ ...previous, setDscp: event.target.value }))
                  }
                  placeholder="46"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Match (CSV)</Label>
                <Input
                  value={qosClassMatchInput}
                  onChange={(event) => setQosClassMatchInput(event.target.value)}
                  placeholder="voice, interactive"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Match Group (CSV)</Label>
                <Input
                  value={qosClassMatchGroupInput}
                  onChange={(event) => setQosClassMatchGroupInput(event.target.value)}
                  placeholder="VOICE-GROUP"
                  disabled={!canEdit}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveQosClass}
                  disabled={!canEdit || !selectedQosPolicySupportsClasses}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {editingQosClassId ? "Update Class" : "Add Class"}
                </Button>
                {editingQosClassId && (
                  <Button type="button" variant="ghost" onClick={resetQosClassDraft} disabled={!canEdit}>
                    Cancel Edit
                  </Button>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Bandwidth</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Queue</TableHead>
                  <TableHead>Matches</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedQosPolicy ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Select a QoS policy to configure class entries.
                    </TableCell>
                  </TableRow>
                ) : !selectedQosPolicySupportsClasses ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Policy type {selectedQosPolicy.type} does not expose class entries.
                    </TableCell>
                  </TableRow>
                ) : selectedQosPolicy.classes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No classes configured for {selectedQosPolicy.type} / {selectedQosPolicy.name}.
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedQosPolicy.classes.map((entry) => (
                    <TableRow key={entry.classId}>
                      <TableCell className="font-medium">{entry.classId}</TableCell>
                      <TableCell>{entry.bandwidth || "-"}</TableCell>
                      <TableCell>{entry.priority || "-"}</TableCell>
                      <TableCell>{entry.queueType || "-"}</TableCell>
                      <TableCell>
                        {entry.match.length > 0 ? `${entry.match.length} match` : "0 match"}
                        {entry.matchGroup.length > 0 ? ` / ${entry.matchGroup.length} group` : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editQosClass(entry.classId)}
                            disabled={!canEdit}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeQosClass(entry.classId)}
                            disabled={!canEdit}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QoS Traffic Match Groups</CardTitle>
            <CardDescription>
              Configure `qos traffic-match-group &lt;name&gt;` references for reusable class matches.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Group Name</Label>
                <Input
                  value={qosTrafficMatchGroupDraft.name}
                  onChange={(event) =>
                    setQosTrafficMatchGroupDraft((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  placeholder="VOICE-GROUP"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Match (CSV)</Label>
                <Input
                  value={qosTrafficMatchInput}
                  onChange={(event) => setQosTrafficMatchInput(event.target.value)}
                  placeholder="VOICE, INTERACTIVE"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Nested Match-Group (CSV)</Label>
                <Input
                  value={qosTrafficMatchGroupInput}
                  onChange={(event) => setQosTrafficMatchGroupInput(event.target.value)}
                  placeholder="BASE-GROUP"
                  disabled={!canEdit}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={addOrUpdateQosTrafficMatchGroup}
                  disabled={!canEdit}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add / Update Group
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Match References</TableHead>
                  <TableHead>Nested Groups</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qosTrafficMatchGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No traffic-match groups configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  qosTrafficMatchGroups.map((entry) => (
                    <TableRow key={qosTrafficMatchGroupKey(entry)}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell>
                        {entry.match.length > 0 ? entry.match.join(", ") : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {entry.matchGroup.length > 0 ? (
                          entry.matchGroup.join(", ")
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editQosTrafficMatchGroup(entry)}
                            disabled={!canEdit}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeQosTrafficMatchGroup(entry)}
                            disabled={!canEdit}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QoS Interface Assignment</CardTitle>
            <CardDescription>
              Bind QoS policies to interfaces via `qos interface &lt;if&gt; ingress|egress`.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Interface</Label>
                <Select
                  value={qosInterfaceDraft.interface || "__unset__"}
                  onValueChange={(value) =>
                    setQosInterfaceDraft((previous) => ({
                      ...previous,
                      interface: value === "__unset__" ? "" : value,
                    }))
                  }
                  disabled={!canEdit || interfaceOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select interface" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">Select interface</SelectItem>
                    {interfaceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ingress Policy (Limiter)</Label>
                <Select
                  value={qosInterfaceDraft.ingress || "__unset__"}
                  onValueChange={(value) =>
                    setQosInterfaceDraft((previous) => ({
                      ...previous,
                      ingress: value === "__unset__" ? "" : value,
                    }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">None</SelectItem>
                    {ingressPolicyNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Egress Policy</Label>
                <Select
                  value={qosInterfaceDraft.egress || "__unset__"}
                  onValueChange={(value) =>
                    setQosInterfaceDraft((previous) => ({
                      ...previous,
                      egress: value === "__unset__" ? "" : value,
                    }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">None</SelectItem>
                    {egressPolicyNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="button" variant="outline" onClick={addQosInterfaceBinding} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Add Interface Assignment
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interface</TableHead>
                  <TableHead>Ingress</TableHead>
                  <TableHead>Egress</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qosInterfaces.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No QoS interface bindings configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  qosInterfaces.map((entry) => (
                    <TableRow key={qosInterfaceKey(entry)}>
                      <TableCell>{interfaceLabelByName[entry.interface] || entry.interface}</TableCell>
                      <TableCell>{entry.ingress || "-"}</TableCell>
                      <TableCell>{entry.egress || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeQosInterfaceBinding(entry)}
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
      </div>
    </AppLayout>
  );
}
