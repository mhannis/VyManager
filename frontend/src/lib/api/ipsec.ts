import { apiClient } from "./client";

// IPsec encryption/hash proposal
export interface IPsecProposal {
  proposal_id: string;
  encryption?: string | null; // Encryption algorithm (e.g., aes256)
  hash?: string | null; // Hash algorithm (e.g., sha256)
  "dh-group"?: string | null; // Diffie-Hellman group
  prf?: string | null; // Pseudorandom function
}

// Proposal upsert model used by the write API
export interface IPsecProposalUpsertRequest {
  proposal_id: string;
  encryption?: string | null;
  hash?: string | null;
  dh_group?: string | null;
  prf?: string | null;
}

// Dead peer detection configuration
export interface DeadPeerDetection {
  action?: string | null; // Action on dead peer (restart, clear, hold)
  interval?: string | null; // DPD interval in seconds
  timeout?: string | null; // DPD timeout in seconds
}

export interface IKEGroupUpsertRequest {
  key_exchange?: string | null;
  close_action?: string | null;
  lifetime?: string | null;
  dead_peer_detection?: DeadPeerDetection | null;
  proposals: IPsecProposalUpsertRequest[];
}

// IKE (Internet Key Exchange) group configuration
export interface IKEGroup {
  name: string;
  "key-exchange"?: string | null; // IKE version (ikev1, ikev2)
  "close-action"?: string | null; // close-action (start|none)
  lifetime?: string | null; // SA lifetime in seconds
  "dead-peer-detection"?: DeadPeerDetection | null;
  "ikev2-reauth"?: Record<string, any> | null;
  proposals: Record<string, IPsecProposal>;
}

export interface ESPGroupUpsertRequest {
  lifetime?: string | null;
  mode?: string | null;
  pfs?: string | null;
  proposals: IPsecProposalUpsertRequest[];
}

// ESP (Encapsulating Security Payload) group configuration
export interface ESPGroup {
  name: string;
  lifetime?: string | null; // SA lifetime in seconds
  mode?: string | null; // ESP mode (tunnel, transport)
  pfs?: string | null; // Perfect Forward Secrecy DH group
  proposals: Record<string, IPsecProposal>;
}

// Virtual Tunnel Interface binding
export interface VTIBinding {
  bind?: string | null; // Interface to bind (e.g., 'dum31')
  "esp-group"?: string | null; // ESP group to use
  "traffic-selector"?: Record<string, any> | null;
}

export interface VTIBindingUpsertRequest {
  bind?: string | null;
  esp_group?: string | null;
  local_prefix?: string | null;
  remote_prefix?: string | null;
}

// Site-to-site peer authentication
export interface PeerAuthentication {
  mode?: string | null; // Authentication mode (e.g., 'pre-shared-secret')
  "local-id"?: string | null;
  "remote-id"?: string | null;
}

export interface PeerAuthenticationUpsertRequest {
  mode?: string | null;
  local_id?: string | null;
  remote_id?: string | null;
}

export interface TunnelUpsertRequest {
  tunnel_id: string;
  enabled?: boolean | null;
  local_prefix?: string | null;
  local_port?: string | null;
  remote_prefix?: string | null;
  remote_port?: string | null;
  esp_group?: string | null;
  priority?: string | null;
  protocol?: string | null;
}

export interface SiteToSitePeerUpsertRequest {
  enabled?: boolean | null;
  description?: string | null;
  connection_type?: string | null;
  ike_group?: string | null;
  default_esp_group?: string | null;
  local_address?: string | null;
  remote_address?: string | null;
  dhcp_interface?: string | null;
  force_udp_encapsulation?: boolean | null;
  replay_window?: string | null;
  virtual_address?: string | null;
  authentication?: PeerAuthenticationUpsertRequest | null;
  vti?: VTIBindingUpsertRequest | null;
  tunnels?: TunnelUpsertRequest[] | null;
}

// Site-to-site IPsec peer
export interface SiteToSitePeer {
  peer_id: string;
  description?: string | null;
  authentication?: PeerAuthentication | null;
  "connection-type"?: string | null; // Connection type (initiate, respond)
  "ike-group"?: string | null;
  "default-esp-group"?: string | null;
  "ikev2-reauth"?: string | null;
  "dhcp-interface"?: string | null;
  "force-udp-encapsulation"?: boolean | null;
  "replay-window"?: string | null;
  "virtual-address"?: string | null;
  disable?: boolean | null;
  "local-address"?: string | null;
  "remote-address"?: string | null;
  vti?: VTIBinding | null;
  tunnels?: Record<string, Record<string, any>> | null; // Legacy tunnel configurations
}

export interface TunnelPhase2UpsertRequest {
  enabled?: boolean | null;
  esp_group?: string | null;
  priority?: string | null;
  protocol?: string | null;
  local_prefix?: string | null;
  local_port?: string | null;
  remote_prefix?: string | null;
  remote_port?: string | null;
}

export interface VtiUpsertRequest {
  bind?: string | null;
  esp_group?: string | null;
  local_prefix?: string | null;
  remote_prefix?: string | null;
}

export interface PSKUpsertRequest {
  ids: string[];
  secret?: string | null;
  secret_type?: string | null;
}

// Pre-Shared Key authentication
export interface PSKAuthentication {
  psk_id: string;
  ids: string[];
  secret?: string | null; // PSK secret (not exposed in read operations)
  secret_type?: string | null;
}

export interface IPsecOperationResponse {
  success: boolean;
  resource: string;
  name: string;
  message: string;
}

export interface IPsecSettings {
  interfaces: string[];
  disable_route_autoinstall: boolean;
}

export interface IPsecSettingsUpdateRequest {
  interfaces?: string[] | null;
  disable_route_autoinstall?: boolean | null;
}

export interface IPsecRemoteAccessLocalUser {
  username: string;
  password?: string | null;
}

export interface IPsecRemoteAccessRadiusServer {
  address: string;
  key?: string | null;
  port?: string | null;
  source_address?: string | null;
}

export interface IPsecRemoteAccessConfig {
  enabled: boolean;
  connection_method?: string | null;
  ike_lifetime?: string | null;
  esp_lifetime?: string | null;
  pool_prefix?: string | null;
  server_address?: string | null;
  server_authentication?: string | null;
  client_dns_servers: string[];
  client_dhcp_interfaces: string[];
  split_include_subnets: string[];
  split_exclude_subnets: string[];
  authentication_mode?: string | null;
  local_users: IPsecRemoteAccessLocalUser[];
  radius_servers: IPsecRemoteAccessRadiusServer[];
}

export interface IPsecRemoteAccessUpdateRequest {
  enabled: boolean;
  connection_method?: string | null;
  ike_lifetime?: string | null;
  esp_lifetime?: string | null;
  pool_prefix?: string | null;
  server_address?: string | null;
  server_authentication?: string | null;
  client_dns_servers?: string[] | null;
  client_dhcp_interfaces?: string[] | null;
  split_include_subnets?: string[] | null;
  split_exclude_subnets?: string[] | null;
  authentication_mode?: string | null;
  local_users?: IPsecRemoteAccessLocalUser[] | null;
  radius_servers?: IPsecRemoteAccessRadiusServer[] | null;
}

// Complete IPsec VPN configuration
export interface IPsecConfig {
  "ike-group": Record<string, IKEGroup>;
  "esp-group": Record<string, ESPGroup>;
  "site-to-site": Record<string, SiteToSitePeer>;
  psk_secrets: Record<string, PSKAuthentication>;
}

// Summary of an IPsec peer
export interface PeerSummary {
  peer_id: string;
  description?: string | null;
  local_address?: string | null;
  remote_address?: string | null;
  ike_group?: string | null;
  connection_type?: string | null;
  vti_interface?: string | null;
}

export interface IPsecStatus {
  available: boolean;
  established_count: number;
  connecting_count: number;
  down_count: number;
  raw_output?: string | null;
}

class IPsecService {
  /**
   * Get complete IPsec VPN configuration
   */
  async getConfig(): Promise<IPsecConfig> {
    return apiClient.get<IPsecConfig>("/vyos/vpn/ipsec/config");
  }

  /**
   * Get all IPsec site-to-site peers as a flat list
   */
  async getPeers(): Promise<PeerSummary[]> {
    return apiClient.get<PeerSummary[]>("/vyos/vpn/ipsec/peers");
  }

  /**
   * Get runtime IPsec status summary
   */
  async getStatus(): Promise<IPsecStatus> {
    return apiClient.get<IPsecStatus>("/vyos/vpn/ipsec/status");
  }

  async getSettings(): Promise<IPsecSettings> {
    return apiClient.get<IPsecSettings>("/vyos/vpn/ipsec/settings");
  }

  async updateSettings(request: IPsecSettingsUpdateRequest): Promise<IPsecOperationResponse> {
    return apiClient.put<IPsecOperationResponse>("/vyos/vpn/ipsec/settings", request);
  }

  async getRemoteAccess(): Promise<IPsecRemoteAccessConfig> {
    return apiClient.get<IPsecRemoteAccessConfig>("/vyos/vpn/ipsec/remote-access");
  }

  async updateRemoteAccess(request: IPsecRemoteAccessUpdateRequest): Promise<IPsecOperationResponse> {
    return apiClient.put<IPsecOperationResponse>("/vyos/vpn/ipsec/remote-access", request);
  }

  async upsertIkeGroup(name: string, request: IKEGroupUpsertRequest): Promise<IPsecOperationResponse> {
    return apiClient.put<IPsecOperationResponse>(`/vyos/vpn/ipsec/ike-group/${encodeURIComponent(name)}`, request);
  }

  async deleteIkeGroup(name: string): Promise<IPsecOperationResponse> {
    return apiClient.delete<IPsecOperationResponse>(`/vyos/vpn/ipsec/ike-group/${encodeURIComponent(name)}`);
  }

  async upsertEspGroup(name: string, request: ESPGroupUpsertRequest): Promise<IPsecOperationResponse> {
    return apiClient.put<IPsecOperationResponse>(`/vyos/vpn/ipsec/esp-group/${encodeURIComponent(name)}`, request);
  }

  async deleteEspGroup(name: string): Promise<IPsecOperationResponse> {
    return apiClient.delete<IPsecOperationResponse>(`/vyos/vpn/ipsec/esp-group/${encodeURIComponent(name)}`);
  }

  async upsertPeer(peerId: string, request: SiteToSitePeerUpsertRequest): Promise<IPsecOperationResponse> {
    return apiClient.put<IPsecOperationResponse>(`/vyos/vpn/ipsec/peer/${encodeURIComponent(peerId)}`, request);
  }

  async deletePeer(peerId: string): Promise<IPsecOperationResponse> {
    return apiClient.delete<IPsecOperationResponse>(`/vyos/vpn/ipsec/peer/${encodeURIComponent(peerId)}`);
  }

  async upsertTunnel(peerId: string, tunnelId: string, request: TunnelPhase2UpsertRequest): Promise<IPsecOperationResponse> {
    return apiClient.put<IPsecOperationResponse>(
      `/vyos/vpn/ipsec/peer/${encodeURIComponent(peerId)}/tunnel/${encodeURIComponent(tunnelId)}`,
      request,
    );
  }

  async deleteTunnel(peerId: string, tunnelId: string): Promise<IPsecOperationResponse> {
    return apiClient.delete<IPsecOperationResponse>(
      `/vyos/vpn/ipsec/peer/${encodeURIComponent(peerId)}/tunnel/${encodeURIComponent(tunnelId)}`,
    );
  }

  async upsertVti(peerId: string, request: VtiUpsertRequest): Promise<IPsecOperationResponse> {
    return apiClient.put<IPsecOperationResponse>(
      `/vyos/vpn/ipsec/peer/${encodeURIComponent(peerId)}/vti`,
      request,
    );
  }

  async deleteVti(peerId: string): Promise<IPsecOperationResponse> {
    return apiClient.delete<IPsecOperationResponse>(
      `/vyos/vpn/ipsec/peer/${encodeURIComponent(peerId)}/vti`,
    );
  }

  async upsertPsk(pskId: string, request: PSKUpsertRequest): Promise<IPsecOperationResponse> {
    return apiClient.put<IPsecOperationResponse>(`/vyos/vpn/ipsec/psk/${encodeURIComponent(pskId)}`, request);
  }

  async deletePsk(pskId: string): Promise<IPsecOperationResponse> {
    return apiClient.delete<IPsecOperationResponse>(`/vyos/vpn/ipsec/psk/${encodeURIComponent(pskId)}`);
  }
}

export const ipsecService = new IPsecService();
