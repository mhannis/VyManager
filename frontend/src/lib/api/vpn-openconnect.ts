import { apiClient } from "./client";

export interface VpnOpenConnectCapabilities {
  vpn: string;
  version: string;
  config_path: string[];
  features: Record<string, boolean>;
  instance_name?: string;
  instance_id?: string;
}

export interface VpnOpenConnectConfigResponse {
  vpn: Record<string, unknown>;
}

export interface VpnOpenConnectBatchResponse {
  success: boolean;
  data?: unknown;
  error?: string | null;
}

class VpnOpenConnectApi {
  async getCapabilities(): Promise<VpnOpenConnectCapabilities> {
    return apiClient.get<VpnOpenConnectCapabilities>("/vyos/vpn-openconnect/capabilities");
  }

  async getConfig(refresh: boolean = false): Promise<VpnOpenConnectConfigResponse> {
    return apiClient.get<VpnOpenConnectConfigResponse>("/vyos/vpn-openconnect/config", {
      refresh: refresh.toString(),
    });
  }

  async configure(operations: string[]): Promise<VpnOpenConnectBatchResponse> {
    return apiClient.post<VpnOpenConnectBatchResponse>("/vyos/vpn-openconnect/batch", {
      operations,
    });
  }
}

export const vpnOpenConnectApi = new VpnOpenConnectApi();

