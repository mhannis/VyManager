import { apiClient } from "./client";

// Zone-based firewall policy (traffic FROM another zone)
export interface ZoneFromPolicy {
  firewall: {
    name: string; // Firewall ruleset name
  };
}

// Firewall zone configuration
export interface FirewallZone {
  name: string; // Zone name (e.g., 'LAN', 'WAN', 'DMZ')
  description?: string | null;
  "default-action"?: string | null; // Default action for zone
  interfaces: string[]; // Interfaces in this zone
  from: Record<string, ZoneFromPolicy>; // Policies for traffic FROM other zones
}

// Complete firewall zones configuration
export interface ZonesConfig {
  zones: Record<string, FirewallZone>; // All firewall zones
}

// Zone policy entry for display
export interface ZonePolicyEntry {
  from_zone: string; // Source zone
  to_zone: string; // Destination zone
  firewall_ruleset: string; // Firewall ruleset applied
  default_action?: string | null; // Default action
}

export interface ZonePolicyUpdate {
  from_zone: string;
  firewall_ruleset: string;
}

export interface ZoneUpsertRequest {
  description?: string | null;
  default_action?: string | null;
  interfaces: string[];
  from_policies: ZonePolicyUpdate[];
}

export interface ZoneOperationResponse {
  success: boolean;
  zone: string;
  message: string;
}

class ZonesService {
  /**
   * Get complete zone-based firewall configuration
   */
  async getConfig(): Promise<ZonesConfig> {
    return apiClient.get<ZonesConfig>("/vyos/firewall/zones/config");
  }

  /**
   * Get all zone-to-zone policies as a flat list
   */
  async getPolicies(): Promise<ZonePolicyEntry[]> {
    return apiClient.get<ZonePolicyEntry[]>("/vyos/firewall/zones/policies");
  }

  /**
   * Create or update a zone
   */
  async upsertZone(zoneName: string, request: ZoneUpsertRequest): Promise<ZoneOperationResponse> {
    return apiClient.put<ZoneOperationResponse>(`/vyos/firewall/zones/zone/${encodeURIComponent(zoneName)}`, request);
  }

  /**
   * Delete a zone
   */
  async deleteZone(zoneName: string): Promise<ZoneOperationResponse> {
    return apiClient.delete<ZoneOperationResponse>(`/vyos/firewall/zones/zone/${encodeURIComponent(zoneName)}`);
  }

  /**
   * Remove one from-zone policy mapping from a zone
   */
  async deleteFromPolicy(zoneName: string, fromZone: string): Promise<ZoneOperationResponse> {
    return apiClient.delete<ZoneOperationResponse>(
      `/vyos/firewall/zones/zone/${encodeURIComponent(zoneName)}/from/${encodeURIComponent(fromZone)}`
    );
  }
}

export const zonesService = new ZonesService();
