import { apiClient } from "./client";

export interface FailoverConfigResponse {
  failover: Record<string, unknown>;
}

export interface FailoverCapabilities {
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

class FailoverService {
  async getCapabilities(): Promise<FailoverCapabilities> {
    return apiClient.get<FailoverCapabilities>("/vyos/failover/capabilities");
  }

  async getConfig(refresh = false): Promise<FailoverConfigResponse> {
    return apiClient.get<FailoverConfigResponse>("/vyos/failover/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/failover/batch", request);
  }
}

export const failoverService = new FailoverService();
