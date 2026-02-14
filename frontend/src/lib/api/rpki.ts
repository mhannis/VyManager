import { apiClient } from "./client";

export interface RpkiConfigResponse {
  rpki: Record<string, unknown>;
}

export interface RpkiCapabilities {
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

class RpkiService {
  async getCapabilities(): Promise<RpkiCapabilities> {
    return apiClient.get<RpkiCapabilities>("/vyos/rpki/capabilities");
  }

  async getConfig(refresh = false): Promise<RpkiConfigResponse> {
    return apiClient.get<RpkiConfigResponse>("/vyos/rpki/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/rpki/batch", request);
  }
}

export const rpkiService = new RpkiService();
