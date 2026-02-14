import { apiClient } from "./client";

export interface ServiceWrapperCapabilities {
  service: string;
  version: string;
  config_path: string[];
  features: Record<string, boolean>;
  instance_name?: string;
  instance_id?: string;
}

export interface ServiceWrapperConfigResponse {
  service: Record<string, unknown>;
}

export interface ServiceWrapperBatchResponse {
  success: boolean;
  data?: unknown;
  error?: string | null;
}

class ServiceWrappersApi {
  async getHttpsCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-https/capabilities");
  }

  async getHttpsConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-https/config", {
      refresh: refresh.toString(),
    });
  }

  async configureHttps(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-https/batch", { operations });
  }

  async getSnmpCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-snmp/capabilities");
  }

  async getSnmpConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-snmp/config", {
      refresh: refresh.toString(),
    });
  }

  async configureSnmp(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-snmp/batch", { operations });
  }

  async getTftpCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-tftp-server/capabilities");
  }

  async getTftpConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-tftp-server/config", {
      refresh: refresh.toString(),
    });
  }

  async configureTftp(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-tftp-server/batch", { operations });
  }
}

export const serviceWrappersApi = new ServiceWrappersApi();
