import { apiClient } from "./client";

export interface VpnRsaKeysCapabilities {
  vpn: string;
  version: string;
  config_path: string[];
  features: Record<string, boolean>;
  instance_name?: string;
  instance_id?: string;
}

export interface VpnRsaKeysConfigResponse {
  vpn: Record<string, unknown>;
}

export interface VpnRsaKeysBatchResponse {
  success: boolean;
  data?: unknown;
  error?: string | null;
}

class VpnRsaKeysApi {
  async getCapabilities(): Promise<VpnRsaKeysCapabilities> {
    return apiClient.get<VpnRsaKeysCapabilities>("/vyos/vpn-rsa-keys/capabilities");
  }

  async getConfig(refresh: boolean = false): Promise<VpnRsaKeysConfigResponse> {
    return apiClient.get<VpnRsaKeysConfigResponse>("/vyos/vpn-rsa-keys/config", {
      refresh: refresh.toString(),
    });
  }

  async configure(operations: string[]): Promise<VpnRsaKeysBatchResponse> {
    return apiClient.post<VpnRsaKeysBatchResponse>("/vyos/vpn-rsa-keys/batch", {
      operations,
    });
  }
}

export const vpnRsaKeysApi = new VpnRsaKeysApi();
