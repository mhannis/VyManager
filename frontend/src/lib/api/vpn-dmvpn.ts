import { apiClient } from "./client";

export interface VpnDmvpnCapabilities {
  protocol: string;
  version: string;
  config_path: string[];
  features: Record<string, boolean>;
  instance_name?: string;
  instance_id?: string;
}

export interface VpnDmvpnConfigResponse {
  interfaces_tunnel: Record<string, unknown>;
  nhrp_tunnel: Record<string, unknown>;
  ipsec: Record<string, unknown>;
}

export interface VpnDmvpnBatchResponse {
  success: boolean;
  data?: unknown;
  error?: string | null;
}

class VpnDmvpnApi {
  async getCapabilities(): Promise<VpnDmvpnCapabilities> {
    return apiClient.get<VpnDmvpnCapabilities>("/vyos/vpn-dmvpn/capabilities");
  }

  async getConfig(refresh: boolean = false): Promise<VpnDmvpnConfigResponse> {
    return apiClient.get<VpnDmvpnConfigResponse>("/vyos/vpn-dmvpn/config", {
      refresh: refresh.toString(),
    });
  }

  async configure(operations: string[]): Promise<VpnDmvpnBatchResponse> {
    return apiClient.post<VpnDmvpnBatchResponse>("/vyos/vpn-dmvpn/batch", {
      operations,
    });
  }
}

export const vpnDmvpnApi = new VpnDmvpnApi();

