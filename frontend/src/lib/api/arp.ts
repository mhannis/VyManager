import { apiClient } from "./client";

export interface ArpEntry {
  interface: string;
  ip_address: string;
  mac_address: string;
  description?: string | null;
}

export interface ArpConfigResponse {
  arp: Record<string, unknown>;
}

export interface ArpCapabilities {
  version: string;
  features: Record<string, boolean | { supported: boolean; description: string }>;
  instance_name?: string;
  instance_id?: string;
}

export interface ProtocolBatchRequest {
  operations: string[];
}

export interface VyOSResponse {
  success: boolean;
  data?: Record<string, unknown> | null;
  error?: string | null;
}

class ArpService {
  async getCapabilities(): Promise<ArpCapabilities> {
    return apiClient.get<ArpCapabilities>("/vyos/arp/capabilities");
  }

  async getConfig(refresh = false): Promise<ArpConfigResponse> {
    return apiClient.get<ArpConfigResponse>("/vyos/arp/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/arp/batch", request);
  }
}

export const arpService = new ArpService();
