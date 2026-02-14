import { apiClient } from "./client";
import { NetworkInterface } from "./interfaces";

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface SystemInfo {
  instance_id: string;
  instance_name: string;
  site_name: string;
  vyos_version: string;
  connection_host: string;
  connected: boolean;
  interfaces: NetworkInterface[];
}

export interface SystemConfig {
  hostname: string | null;
  timezone: string | null;
  name_servers: string[];
  domain_name: string | null;
  raw_config: Record<string, unknown>;
}

export interface SystemDashboardSummary {
  hostname: string | null;
  version: string | null;
  build_by: string | null;
  built_on: string | null;
  build_commit_id: string | null;
  architecture: string | null;
  system_type: string | null;
  hardware_model: string | null;
  hardware_serial: string | null;
  uptime: string | null;
  load_1m_percent: number | null;
  load_5m_percent: number | null;
  load_15m_percent: number | null;
  cpu_models: string[];
  cpu_socket_count: number | null;
  cpu_cores: number | null;
  cpu_temperature_celsius: number | null;
  memory_total_human: string | null;
  memory_free_human: string | null;
  memory_used_human: string | null;
  memory_total_bytes: number | null;
  memory_free_bytes: number | null;
  memory_used_bytes: number | null;
  memory_used_percent: number | null;
}

export interface DiskStatus {
  available: boolean;
  filesystem: string | null;
  size_human: string | null;
  used_human: string | null;
  available_human: string | null;
  used_percent: number | null;
  available_percent: number | null;
  raw_output: string | null;
}

export interface NtpSourceStatus {
  mode: string | null;
  state: string | null;
  source: string | null;
  stratum: number | null;
  poll: number | null;
  reach: number | null;
  last_rx: string | null;
  last_sample: string | null;
}

export interface NtpStatus {
  enabled: boolean;
  synchronized: boolean | null;
  leap_status: string | null;
  reference_id: string | null;
  reference_name: string | null;
  stratum: number | null;
  system_time: string | null;
  last_offset: string | null;
  rms_offset: string | null;
  frequency: string | null;
  root_delay: string | null;
  root_dispersion: string | null;
  update_interval: string | null;
  sources_online: number | null;
  sources_offline: number | null;
  sources_unknown: number | null;
  sources: NtpSourceStatus[];
  raw_tracking: string | null;
  raw_activity: string | null;
  raw_sources: string | null;
}

export interface NtpServerConfig {
  address: string;
  prefer: boolean;
  pool: boolean;
  noselect: boolean;
  nts: boolean;
  interleave: boolean;
  ptp: boolean;
}

export interface NtpConfig {
  enabled: boolean;
  servers: NtpServerConfig[];
  allow_clients: string[];
  listen_addresses: string[];
}

export interface SshConfig {
  enabled: boolean;
  port: number | null;
  listen_addresses: string[];
  disable_password_authentication: boolean;
}

export interface DnsForwardingDomainOverride {
  domain: string;
  name_servers: string[];
}

export interface DnsHostOverride {
  hostname: string;
  addresses: string[];
  aliases: string[];
}

export interface DnsConfig {
  enabled: boolean;
  local_domain_name: string | null;
  listen_addresses: string[];
  allow_from: string[];
  name_servers: string[];
  use_system_name_servers: boolean;
  cache_size: number | null;
  authoritative_domains: string[];
  domain_overrides: DnsForwardingDomainOverride[];
  host_overrides: DnsHostOverride[];
}

// ============================================================================
// LLDP
// ============================================================================

export type LldpInterfaceMode = "disable" | "rx-tx" | "rx" | "tx";

export interface LldpInterfaceConfig {
  interface: string;
  mode?: LldpInterfaceMode | null;
}

export interface LldpConfig {
  enabled: boolean;
  all_interfaces: boolean;
  interfaces: LldpInterfaceConfig[];
  management_addresses: string[];
  snmp: boolean;
  legacy_protocols: string[];
}

export interface LldpNeighbor {
  local_interface?: string | null;
  chassis_id?: string | null;
  port_id?: string | null;
  port_description?: string | null;
  system_name?: string | null;
  system_description?: string | null;
  platform?: string | null;
  capabilities?: string | null;
  raw: string;
}

export interface LldpStatus {
  enabled: boolean;
  neighbors: LldpNeighbor[];
  raw_neighbors?: string | null;
  raw_neighbors_detail?: string | null;
  error?: string | null;
}

// ============================================================================
// mDNS Repeater (Avahi)
// ============================================================================

export type MdnsIpVersion = "ipv4" | "ipv6" | "both";

export interface MdnsRepeaterConfig {
  configured: boolean;
  enabled: boolean;
  interfaces: string[];
  ip_version: MdnsIpVersion;
  allow_services: string[];
  browse_domains: string[];
  cache_entries: number | null;
}

export interface MdnsRepeaterStatus {
  enabled: boolean;
  raw_log?: string | null;
  error?: string | null;
}

// ============================================================================
// Acceleration (QAT + VPP/DPDK)
// ============================================================================

export interface QatConfig {
  enabled: boolean;
}

export interface QatStatus {
  available: boolean;
  raw_devices?: string | null;
  raw_status?: string | null;
  error?: string | null;
}

export type VppInterfaceDriver = "dpdk" | "xdp";

export interface VppInterfaceDriverConfig {
  interface: string;
  driver: VppInterfaceDriver;
}

export interface VppHostResourcesConfig {
  max_map_count?: number | null;
  nr_hugepages?: number | null;
  shmmax?: string | null;
}

export interface VppMemoryConfig {
  main_heap_page_size?: string | null;
  main_heap_size?: string | null;
}

export interface VppStatsegConfig {
  page_size?: string | null;
  size?: string | null;
}

export interface VppLcpNetlinkConfig {
  rx_buffer_size?: string | null;
}

export interface VppLcpConfig {
  ignore_kernel_routes: boolean;
  netlink: VppLcpNetlinkConfig;
}

export interface VppConfig {
  enabled: boolean;
  interfaces: VppInterfaceDriverConfig[];
  lcp: VppLcpConfig;
  host_resources: VppHostResourcesConfig;
  memory: VppMemoryConfig;
  statseg: VppStatsegConfig;
}

export interface VppStatus {
  available: boolean;
  raw_output?: string | null;
  error?: string | null;
}

export interface SystemLogEntry {
  raw: string;
  timestamp?: string | null;
  host?: string | null;
  process?: string | null;
  severity?: string | null;
  message?: string | null;
}

export interface SystemLogsResponse {
  available: boolean;
  source_command?: string | null;
  total_lines: number;
  returned_lines: number;
  entries: SystemLogEntry[];
  raw_output?: string | null;
}

export type SystemLogSource = "auto" | "syslog" | "tail" | "system";

export interface LocalUserAuthState {
  has_plaintext_password: boolean;
  has_encrypted_password: boolean;
  has_public_keys: boolean;
}

export interface LocalUserSummary {
  username: string;
  full_name?: string | null;
  level?: string | null;
  disabled: boolean;
  auth: LocalUserAuthState;
  public_key_names: string[];
  public_keys: string[];
}

export interface LocalUsersResponse {
  users: LocalUserSummary[];
  total: number;
}

export type LocalUserPasswordType = "plaintext" | "encrypted";

export interface LocalUserCreateRequest {
  username: string;
  full_name?: string | null;
  level?: string | null;
  password?: string | null;
  password_type?: LocalUserPasswordType;
  ssh_public_keys: string[];
  disabled?: boolean;
}

export interface LocalUserUpdateRequest {
  full_name?: string | null;
  level?: string | null;
  password?: string | null;
  password_type?: LocalUserPasswordType;
  ssh_public_keys?: string[] | null;
  disabled?: boolean | null;
}

export interface LocalUserOperationResponse {
  success: boolean;
  username: string;
  message: string;
}

// ============================================================================
// API Service
// ============================================================================

class SystemService {
  /**
   * Get system information about the active VyOS instance
   */
  async getInfo(): Promise<SystemInfo> {
    return apiClient.get<SystemInfo>("/vyos/system/info");
  }

  /**
   * Get system configuration (hostname, timezone, name servers, etc.)
   */
  async getConfig(refresh: boolean = false): Promise<SystemConfig> {
    return apiClient.get<SystemConfig>("/vyos/system/config", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Get dashboard-friendly system summary metrics.
   */
  async getDashboardSummary(refresh: boolean = false): Promise<SystemDashboardSummary> {
    return apiClient.get<SystemDashboardSummary>("/vyos/system/dashboard-summary", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Get persistent storage status.
   */
  async getDiskStatus(): Promise<DiskStatus> {
    return apiClient.get<DiskStatus>("/vyos/system/disk-status");
  }

  /**
   * Get runtime NTP status.
   */
  async getNtpStatus(refresh: boolean = false): Promise<NtpStatus> {
    return apiClient.get<NtpStatus>("/vyos/system/ntp-status", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Get NTP service configuration.
   */
  async getNtpConfig(refresh: boolean = false): Promise<NtpConfig> {
    return apiClient.get<NtpConfig>("/vyos/system/ntp-config", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Update NTP service configuration.
   */
  async updateNtpConfig(config: NtpConfig): Promise<NtpConfig> {
    return apiClient.put<NtpConfig>("/vyos/system/ntp-config", config);
  }

  /**
   * Get SSH service configuration.
   */
  async getSshConfig(refresh: boolean = false): Promise<SshConfig> {
    return apiClient.get<SshConfig>("/vyos/system/ssh-config", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Update SSH service configuration.
   */
  async updateSshConfig(config: SshConfig): Promise<SshConfig> {
    return apiClient.put<SshConfig>("/vyos/system/ssh-config", config);
  }

  /**
   * Get DNS forwarding/authoritative configuration.
   */
  async getDnsConfig(refresh: boolean = false): Promise<DnsConfig> {
    return apiClient.get<DnsConfig>("/vyos/system/dns-config", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Update DNS forwarding/authoritative configuration.
   */
  async updateDnsConfig(config: DnsConfig): Promise<DnsConfig> {
    return apiClient.put<DnsConfig>("/vyos/system/dns-config", config);
  }

  /**
   * Get LLDP service configuration.
   */
  async getLldpConfig(refresh: boolean = false): Promise<LldpConfig> {
    return apiClient.get<LldpConfig>("/vyos/system/lldp-config", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Update LLDP service configuration.
   */
  async updateLldpConfig(config: LldpConfig): Promise<LldpConfig> {
    return apiClient.put<LldpConfig>("/vyos/system/lldp-config", config);
  }

  /**
   * Get LLDP runtime status (neighbors).
   */
  async getLldpStatus(refresh: boolean = false): Promise<LldpStatus> {
    return apiClient.get<LldpStatus>("/vyos/system/lldp-status", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Get mDNS repeater configuration.
   */
  async getMdnsConfig(refresh: boolean = false): Promise<MdnsRepeaterConfig> {
    return apiClient.get<MdnsRepeaterConfig>("/vyos/system/mdns-config", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Update mDNS repeater configuration.
   */
  async updateMdnsConfig(config: Omit<MdnsRepeaterConfig, "configured">): Promise<MdnsRepeaterConfig> {
    return apiClient.put<MdnsRepeaterConfig>("/vyos/system/mdns-config", config);
  }

  /**
   * Get mDNS repeater status/logs.
   */
  async getMdnsStatus(refresh: boolean = false): Promise<MdnsRepeaterStatus> {
    return apiClient.get<MdnsRepeaterStatus>("/vyos/system/mdns-status", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Get QAT acceleration configuration.
   */
  async getQatConfig(refresh: boolean = false): Promise<QatConfig> {
    return apiClient.get<QatConfig>("/vyos/system/qat-config", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Enable/disable QAT acceleration.
   */
  async updateQatConfig(config: QatConfig): Promise<QatConfig> {
    return apiClient.put<QatConfig>("/vyos/system/qat-config", config);
  }

  /**
   * Get QAT device status.
   */
  async getQatStatus(): Promise<QatStatus> {
    return apiClient.get<QatStatus>("/vyos/system/qat-status");
  }

  /**
   * Get VPP settings configuration (includes DPDK/XDP driver selection).
   */
  async getVppConfig(refresh: boolean = false): Promise<VppConfig> {
    return apiClient.get<VppConfig>("/vyos/system/vpp-config", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Update VPP settings configuration.
   */
  async updateVppConfig(config: VppConfig): Promise<VppConfig> {
    return apiClient.put<VppConfig>("/vyos/system/vpp-config", config);
  }

  /**
   * Get VPP runtime status (best effort).
   */
  async getVppStatus(): Promise<VppStatus> {
    return apiClient.get<VppStatus>("/vyos/system/vpp-status");
  }

  /**
   * Get system logs from VyOS.
   */
  async getLogs(
    lines: number = 200,
    contains?: string,
    source: SystemLogSource = "auto",
  ): Promise<SystemLogsResponse> {
    const query: Record<string, string> = { lines: String(lines) };
    if (contains && contains.trim()) {
      query.contains = contains.trim();
    }
    query.source = source;
    return apiClient.get<SystemLogsResponse>("/vyos/system/logs", query);
  }

  /**
   * Get local VyOS users.
   */
  async getLocalUsers(refresh: boolean = false): Promise<LocalUsersResponse> {
    return apiClient.get<LocalUsersResponse>("/vyos/system/local-users", {
      refresh: refresh.toString(),
    });
  }

  /**
   * Create a local VyOS user.
   */
  async createLocalUser(payload: LocalUserCreateRequest): Promise<LocalUserSummary> {
    return apiClient.post<LocalUserSummary>("/vyos/system/local-users", payload);
  }

  /**
   * Update a local VyOS user.
   */
  async updateLocalUser(username: string, payload: LocalUserUpdateRequest): Promise<LocalUserSummary> {
    return apiClient.put<LocalUserSummary>(`/vyos/system/local-users/${encodeURIComponent(username)}`, payload);
  }

  /**
   * Delete a local VyOS user.
   */
  async deleteLocalUser(username: string): Promise<LocalUserOperationResponse> {
    return apiClient.delete<LocalUserOperationResponse>(`/vyos/system/local-users/${encodeURIComponent(username)}`);
  }
}

export const systemService = new SystemService();
