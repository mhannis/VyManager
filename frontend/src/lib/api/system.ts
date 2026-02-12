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
   * Get system logs from VyOS.
   */
  async getLogs(lines: number = 200, contains?: string): Promise<SystemLogsResponse> {
    const query: Record<string, string> = { lines: String(lines) };
    if (contains && contains.trim()) {
      query.contains = contains.trim();
    }
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
