import { apiClient } from "./client";

export interface RipNetwork {
  prefix: string;
}

export interface RipInterface {
  interface: string;
  passive: boolean;
}

export interface RipConfigResponse {
  rip: Record<string, unknown>;
}

export interface RipCapabilities {
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

class RipService {
  async getCapabilities(): Promise<RipCapabilities> {
    return apiClient.get<RipCapabilities>("/vyos/rip/capabilities");
  }

  async getConfig(refresh = false): Promise<RipConfigResponse> {
    return apiClient.get<RipConfigResponse>("/vyos/rip/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/rip/batch", request);
  }
}

export const ripService = new RipService();
