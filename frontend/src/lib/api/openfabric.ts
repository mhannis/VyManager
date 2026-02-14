import { apiClient } from "./client";

export interface OpenfabricConfigResponse {
  openfabric: Record<string, unknown>;
}

export interface OpenfabricCapabilities {
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

class OpenfabricService {
  async getCapabilities(): Promise<OpenfabricCapabilities> {
    return apiClient.get<OpenfabricCapabilities>("/vyos/openfabric/capabilities");
  }

  async getConfig(refresh = false): Promise<OpenfabricConfigResponse> {
    return apiClient.get<OpenfabricConfigResponse>("/vyos/openfabric/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/openfabric/batch", request);
  }
}

export const openfabricService = new OpenfabricService();
