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
}

export const systemService = new SystemService();
