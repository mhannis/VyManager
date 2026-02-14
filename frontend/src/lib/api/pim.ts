import { apiClient } from "./client";

export interface PimConfigResponse {
  pim: Record<string, unknown>;
}

export interface PimCapabilities {
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

class PimService {
  async getCapabilities(): Promise<PimCapabilities> {
    return apiClient.get<PimCapabilities>("/vyos/pim/capabilities");
  }

  async getConfig(refresh = false): Promise<PimConfigResponse> {
    return apiClient.get<PimConfigResponse>("/vyos/pim/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/pim/batch", request);
  }
}

export const pimService = new PimService();
