import { apiClient } from "./client";

export interface OspfNetwork {
  prefix: string;
  area: string;
}

export interface OspfInterface {
  interface: string;
  network_type?: string | null;
  cost?: number | null;
  passive: boolean;
}

export interface OspfConfig {
  router_id?: string | null;
  areas: string[];
  networks: OspfNetwork[];
  interfaces: OspfInterface[];
  parameters: {
    abr_type?: string | null;
    log_adjacency_changes: boolean;
  };
}

export interface OspfConfigResponse {
  ospf: Record<string, unknown>;
}

export interface OspfCapabilities {
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

class OspfService {
  async getCapabilities(): Promise<OspfCapabilities> {
    return apiClient.get<OspfCapabilities>("/vyos/ospf/capabilities");
  }

  async getConfig(refresh = false): Promise<OspfConfigResponse> {
    return apiClient.get<OspfConfigResponse>("/vyos/ospf/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: ProtocolBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/ospf/batch", request);
  }
}

export const ospfService = new OspfService();
