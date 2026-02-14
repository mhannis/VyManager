import { apiClient } from "./client";

export interface VpnSstpCapabilities {
  vpn: string;
  version: string;
  config_path: string[];
  features: Record<string, boolean>;
  instance_name?: string;
  instance_id?: string;
}

export interface VpnSstpConfigResponse {
  vpn: Record<string, unknown>;
}

export interface VpnSstpBatchResponse {
  success: boolean;
  data?: unknown;
  error?: string | null;
}

class VpnSstpApi {
  async getCapabilities(): Promise<VpnSstpCapabilities> {
    return apiClient.get<VpnSstpCapabilities>("/vyos/vpn-sstp/capabilities");
  }

  async getConfig(refresh: boolean = false): Promise<VpnSstpConfigResponse> {
    return apiClient.get<VpnSstpConfigResponse>("/vyos/vpn-sstp/config", {
      refresh: refresh.toString(),
    });
  }

  async configure(operations: string[]): Promise<VpnSstpBatchResponse> {
    return apiClient.post<VpnSstpBatchResponse>("/vyos/vpn-sstp/batch", {
      operations,
    });
  }
}

export const vpnSstpApi = new VpnSstpApi();

