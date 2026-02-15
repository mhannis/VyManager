import { apiClient } from "./client";

export interface ConfigTreeCapabilities {
  tree: string;
  version: string;
  config_path: string[];
  features: Record<string, boolean>;
  instance_name?: string;
  instance_id?: string;
}

export interface ConfigTreeBatchResponse {
  success: boolean;
  data?: unknown;
  error?: string | null;
}

export class ConfigTreeApi {
  constructor(
    private readonly endpoint: string,
    private readonly responseKey: string
  ) {}

  async getCapabilities(): Promise<ConfigTreeCapabilities> {
    return apiClient.get<ConfigTreeCapabilities>(`/vyos/${this.endpoint}/capabilities`);
  }

  async getConfig<T = Record<string, unknown>>(refresh: boolean = false): Promise<T> {
    const payload = await apiClient.get<Record<string, unknown>>(`/vyos/${this.endpoint}/config`, {
      refresh: refresh.toString(),
    });
    const value = payload?.[this.responseKey];
    return ((value && typeof value === "object" ? value : {}) as T);
  }

  async configure(operations: string[]): Promise<ConfigTreeBatchResponse> {
    return apiClient.post<ConfigTreeBatchResponse>(`/vyos/${this.endpoint}/batch`, {
      operations,
    });
  }
}
