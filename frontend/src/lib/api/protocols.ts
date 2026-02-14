import { apiClient } from "./client";

export interface ProtocolsConfigResponse {
  protocols: Record<string, unknown>;
}

export interface ProtocolsCapabilities {
  protocol: string;
  version: string;
  config_path: string[];
  features: Record<string, boolean | { supported: boolean; description: string }>;
  instance_name?: string;
  instance_id?: string;
}

class ProtocolsService {
  async getCapabilities(): Promise<ProtocolsCapabilities> {
    return apiClient.get<ProtocolsCapabilities>("/vyos/protocols/capabilities");
  }

  async getConfig(refresh = false): Promise<ProtocolsConfigResponse> {
    return apiClient.get<ProtocolsConfigResponse>("/vyos/protocols/config", {
      refresh: refresh.toString(),
    });
  }
}

export const protocolsService = new ProtocolsService();
