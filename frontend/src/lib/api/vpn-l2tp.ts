import { apiClient } from "./client";

export interface VpnL2tpCapabilities {
  vpn: string;
  version: string;
  config_path: string[];
  features: Record<string, boolean>;
  instance_name?: string;
  instance_id?: string;
}

export interface VpnL2tpConfigResponse {
  vpn: Record<string, unknown>;
}

export interface VpnL2tpBatchResponse {
  success: boolean;
  data?: unknown;
  error?: string | null;
}

class VpnL2tpApi {
  async getCapabilities(): Promise<VpnL2tpCapabilities> {
    return apiClient.get<VpnL2tpCapabilities>("/vyos/vpn-l2tp/capabilities");
  }

  async getConfig(refresh: boolean = false): Promise<VpnL2tpConfigResponse> {
    return apiClient.get<VpnL2tpConfigResponse>("/vyos/vpn-l2tp/config", {
      refresh: refresh.toString(),
    });
  }

  async configure(operations: string[]): Promise<VpnL2tpBatchResponse> {
    return apiClient.post<VpnL2tpBatchResponse>("/vyos/vpn-l2tp/batch", {
      operations,
    });
  }
}

export const vpnL2tpApi = new VpnL2tpApi();
