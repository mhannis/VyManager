import { apiClient } from "./client";

export interface StaticProtocolConfigResponse {
  static: Record<string, unknown>;
}

export interface StaticProtocolCapabilities {
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

class StaticProtocolService {
  async getCapabilities(): Promise<StaticProtocolCapabilities> {
    return apiClient.get<StaticProtocolCapabilities>("/vyos/static-protocol/capabilities");
  }

  async getConfig(refresh = false): Promise<StaticProtocolConfigResponse> {
    return apiClient.get<StaticProtocolConfigResponse>("/vyos/static-protocol/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/static-protocol/batch", request);
  }
}

export const staticProtocolService = new StaticProtocolService();
