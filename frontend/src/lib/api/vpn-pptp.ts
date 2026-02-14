import { apiClient } from "./client";

export interface VpnPptpCapabilities {
  vpn: string;
  version: string;
  config_path: string[];
  features: Record<string, boolean>;
  instance_name?: string;
  instance_id?: string;
}

export interface VpnPptpConfigResponse {
  vpn: Record<string, unknown>;
}

export interface VpnPptpBatchResponse {
  success: boolean;
  data?: unknown;
  error?: string | null;
}

class VpnPptpApi {
  async getCapabilities(): Promise<VpnPptpCapabilities> {
    return apiClient.get<VpnPptpCapabilities>("/vyos/vpn-pptp/capabilities");
  }

  async getConfig(refresh: boolean = false): Promise<VpnPptpConfigResponse> {
    return apiClient.get<VpnPptpConfigResponse>("/vyos/vpn-pptp/config", {
      refresh: refresh.toString(),
    });
  }

  async configure(operations: string[]): Promise<VpnPptpBatchResponse> {
    return apiClient.post<VpnPptpBatchResponse>("/vyos/vpn-pptp/batch", {
      operations,
    });
  }
}

export const vpnPptpApi = new VpnPptpApi();

