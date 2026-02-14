import { apiClient } from "./client";

export interface MplsConfigResponse {
  mpls: Record<string, unknown>;
}

export interface MplsCapabilities {
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

class MplsService {
  async getCapabilities(): Promise<MplsCapabilities> {
    return apiClient.get<MplsCapabilities>("/vyos/mpls/capabilities");
  }

  async getConfig(refresh = false): Promise<MplsConfigResponse> {
    return apiClient.get<MplsConfigResponse>("/vyos/mpls/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/mpls/batch", request);
  }
}

export const mplsService = new MplsService();
