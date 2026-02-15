import { apiClient } from "./client";

export interface DummyInterface {
  name: string;
  type: "dummy";
  addresses: string[];
  description: string | null;
  vrf: string | null;
  mtu: string | null;
  disable?: boolean | null;
}

export interface DummyInterfacesConfigResponse {
  interfaces: DummyInterface[];
  total: number;
  by_type: Record<string, number>;
  by_vrf: Record<string, number>;
}

export interface DummyBatchOperation {
  op:
    | "set_description"
    | "delete_description"
    | "set_address"
    | "delete_address"
    | "set_mtu"
    | "delete_mtu"
    | "set_vrf"
    | "delete_vrf"
    | "disable"
    | "enable"
    | "delete_interface";
  value?: string;
}

export interface DummyBatchRequest {
  interface: string;
  operations: DummyBatchOperation[];
}

export interface DummyBatchResponse {
  success: boolean;
  data?: Record<string, unknown> | null;
  error?: string | null;
}

class DummyService {
  async getConfig(): Promise<DummyInterfacesConfigResponse> {
    return apiClient.get<DummyInterfacesConfigResponse>("/vyos/dummy/config");
  }

  async batchConfigure(request: DummyBatchRequest): Promise<DummyBatchResponse> {
    return apiClient.post<DummyBatchResponse>("/vyos/dummy/batch", request);
  }
}

export const dummyService = new DummyService();
