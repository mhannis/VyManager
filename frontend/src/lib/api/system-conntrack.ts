import { ConfigTreeApi } from "./config-tree";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function readTagValues(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((entry) => String(entry || "").trim()).filter((entry) => entry.length > 0)),
    ).sort((left, right) => left.localeCompare(right));
  }

  return Object.keys(asObject(value)).sort((left, right) => left.localeCompare(right));
}

function parseNumericRules(rawRules: unknown): Record<string, Record<string, unknown>> {
  const root = asObject(rawRules);
  const entries: Array<[number, string, Record<string, unknown>]> = [];
  for (const [id, value] of Object.entries(root)) {
    if (!/^\d+$/.test(id)) continue;
    entries.push([Number(id), id, asObject(value)]);
  }
  entries.sort((left, right) => left[0] - right[0]);
  return Object.fromEntries(entries.map(([, id, value]) => [id, value]));
}

function readTcpFlags(value: unknown): { syn: boolean; notSyn: boolean } {
  const tcp = asObject(value);
  return {
    syn: Object.prototype.hasOwnProperty.call(tcp, "syn"),
    notSyn: Object.prototype.hasOwnProperty.call(tcp, "not-syn"),
  };
}

export type ConntrackAddressFamily = "ipv4" | "ipv6";

export interface ConntrackCustomRule {
  family: ConntrackAddressFamily;
  id: string;
  protocol: string;
  sourceAddress: string;
  sourcePort: string;
  destinationAddress: string;
  destinationPort: string;
  timeout: string;
  tcpSourcePort: string;
  tcpDestinationPort: string;
  tcpSyn: boolean;
  tcpNotSyn: boolean;
}

export interface ConntrackIgnoreRule {
  family: ConntrackAddressFamily;
  id: string;
  protocol: string;
  sourceAddress: string;
  destinationAddress: string;
  tcpSourcePort: string;
  tcpDestinationPort: string;
  tcpSyn: boolean;
  tcpNotSyn: boolean;
}

export interface ConntrackLoggingConfig {
  invalidState: boolean;
  new: boolean;
  destroy: boolean;
  timestamp: boolean;
  queueSize: string;
  level: string;
  tcp: string[];
  udp: string[];
}

export interface SystemConntrackConfig {
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
  logging: ConntrackLoggingConfig;
}

class SystemConntrackService {
  private readonly api = new ConfigTreeApi("system-conntrack", "conntrack");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemConntrackConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const tcp = asObject(root.tcp);
    const timeout = asObject(root.timeout);
    const timeoutTcp = asObject(timeout.tcp);
    const customRoot = asObject(timeout.custom);
    const ignoreRoot = asObject(root.ignore);
    const logRoot = asObject(root.log);

    const readCustomRules = (family: ConntrackAddressFamily): ConntrackCustomRule[] => {
      const familyRoot = asObject(customRoot[family]);
      const rules = parseNumericRules(asObject(familyRoot.rule));
      return Object.entries(rules).map(([id, value]) => {
        const source = asObject(value.source);
        const destination = asObject(value.destination);
        const tcpMatch = asObject(value.tcp);
        const tcpFlags = readTcpFlags(tcpMatch);
        return {
          family,
          id,
          protocol: asString(value.protocol),
          sourceAddress: asString(source.address),
          sourcePort: asString(source.port),
          destinationAddress: asString(destination.address),
          destinationPort: asString(destination.port),
          timeout: asString(value.timeout),
          tcpSourcePort: asString(tcpMatch["source-port"]),
          tcpDestinationPort: asString(tcpMatch["destination-port"]),
          tcpSyn: tcpFlags.syn,
          tcpNotSyn: tcpFlags.notSyn,
        };
      });
    };

    const readIgnoreRules = (family: ConntrackAddressFamily): ConntrackIgnoreRule[] => {
      const familyRoot = asObject(ignoreRoot[family]);
      const rules = parseNumericRules(asObject(familyRoot.rule));
      return Object.entries(rules).map(([id, value]) => {
        const source = asObject(value.source);
        const destination = asObject(value.destination);
        const tcpMatch = asObject(value.tcp);
        const tcpFlags = readTcpFlags(tcpMatch);
        return {
          family,
          id,
          protocol: asString(value.protocol),
          sourceAddress: asString(source.address),
          destinationAddress: asString(destination.address),
          tcpSourcePort: asString(tcpMatch["source-port"]),
          tcpDestinationPort: asString(tcpMatch["destination-port"]),
          tcpSyn: tcpFlags.syn,
          tcpNotSyn: tcpFlags.notSyn,
        };
      });
    };

    return {
      tableSize: asString(root["table-size"]),
      expectTableSize: asString(root["expect-table-size"]),
      hashSize: asString(root["hash-size"]),
      modules: readTagValues(root.modules),
      tcpHalfOpenConnections: asString(tcp["half-open-connections"]),
      tcpLoose: asString(tcp.loose),
      tcpMaxRetrans: asString(tcp["max-retrans"]),
      timeoutGeneric: asString(timeout.generic),
      timeoutIcmp: asString(timeout.icmp),
      timeoutOther: asString(timeout.other),
      timeoutTcpSynSent: asString(timeoutTcp["syn-sent"]),
      timeoutTcpSynRecv: asString(timeoutTcp["syn-recv"]),
      timeoutTcpEstablished: asString(timeoutTcp.established),
      timeoutTcpFinWait: asString(timeoutTcp["fin-wait"]),
      timeoutTcpClose: asString(timeoutTcp.close),
      timeoutTcpCloseWait: asString(timeoutTcp["close-wait"]),
      timeoutTcpLastAck: asString(timeoutTcp["last-ack"]),
      timeoutTcpTimeWait: asString(timeoutTcp["time-wait"]),
      timeoutUdp: asString(timeout.udp),
      timeoutUdpStream: asString(timeout["udp-stream"]),
      customRules: [...readCustomRules("ipv4"), ...readCustomRules("ipv6")],
      ignoreRules: [...readIgnoreRules("ipv4"), ...readIgnoreRules("ipv6")],
      logging: {
        invalidState: Object.prototype.hasOwnProperty.call(logRoot, "invalid-state"),
        new: Object.prototype.hasOwnProperty.call(logRoot, "new"),
        destroy: Object.prototype.hasOwnProperty.call(logRoot, "destroy"),
        timestamp: Object.prototype.hasOwnProperty.call(logRoot, "timestamp"),
        queueSize: asString(logRoot["queue-size"]),
        level: asString(logRoot.level),
        tcp: readTagValues(logRoot.tcp),
        udp: readTagValues(logRoot.udp),
      },
    };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemConntrackService = new SystemConntrackService();
