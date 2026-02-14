import { apiClient } from "./client";

export interface IgmpProxyInterface {
  interface: string;
  role: "upstream" | "downstream";
  threshold?: number | null;
  alt_subnets: string[];
}

export interface IgmpProxyConfigResponse {
  igmp_proxy: Record<string, unknown>;
}

export interface IgmpProxyCapabilities {
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

class IgmpProxyService {
  async getCapabilities(): Promise<IgmpProxyCapabilities> {
    return apiClient.get<IgmpProxyCapabilities>("/vyos/igmp-proxy/capabilities");
  }

  async getConfig(refresh = false): Promise<IgmpProxyConfigResponse> {
    return apiClient.get<IgmpProxyConfigResponse>("/vyos/igmp-proxy/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/igmp-proxy/batch", request);
  }
}

export const igmpProxyService = new IgmpProxyService();
