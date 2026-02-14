import { apiClient } from "./client";

export interface VpnOverviewCapabilities {
  protocol: string;
  version: string;
  config_path: string[];
  features: Record<string, boolean>;
  instance_name?: string;
  instance_id?: string;
}

export interface VpnOverviewResponse {
  vpn: Record<string, unknown>;
  protocols: string[];
}

class VpnOverviewApi {
  async getCapabilities(): Promise<VpnOverviewCapabilities> {
    return apiClient.get<VpnOverviewCapabilities>("/vyos/vpn/capabilities");
  }

  async getOverview(refresh: boolean = false): Promise<VpnOverviewResponse> {
    return apiClient.get<VpnOverviewResponse>("/vyos/vpn/overview", {
      refresh: refresh.toString(),
    });
  }
}

export const vpnOverviewApi = new VpnOverviewApi();

