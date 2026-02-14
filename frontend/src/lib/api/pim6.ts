import { apiClient } from "./client";

export interface Pim6ConfigResponse {
  pim6: Record<string, unknown>;
}

export interface Pim6Capabilities {
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

class Pim6Service {
  async getCapabilities(): Promise<Pim6Capabilities> {
    return apiClient.get<Pim6Capabilities>("/vyos/pim6/capabilities");
  }

  async getConfig(refresh = false): Promise<Pim6ConfigResponse> {
    return apiClient.get<Pim6ConfigResponse>("/vyos/pim6/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/pim6/batch", request);
  }
}

export const pim6Service = new Pim6Service();
