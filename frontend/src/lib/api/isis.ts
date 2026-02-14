import { apiClient } from "./client";

export interface IsisInterface {
  interface: string;
  network_type?: string | null;
  passive: boolean;
}

export interface IsisConfigResponse {
  isis: Record<string, unknown>;
}

export interface IsisCapabilities {
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

class IsisService {
  async getCapabilities(): Promise<IsisCapabilities> {
    return apiClient.get<IsisCapabilities>("/vyos/isis/capabilities");
  }

  async getConfig(refresh = false): Promise<IsisConfigResponse> {
    return apiClient.get<IsisConfigResponse>("/vyos/isis/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/isis/batch", request);
  }
}

export const isisService = new IsisService();
