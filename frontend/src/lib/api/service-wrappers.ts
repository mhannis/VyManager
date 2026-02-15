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

  async getConsoleServerCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-console-server/capabilities");
  }

  async getConsoleServerConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-console-server/config", {
      refresh: refresh.toString(),
    });
  }

  async configureConsoleServer(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-console-server/batch", { operations });
  }

  async getSaltMinionCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-salt-minion/capabilities");
  }

  async getSaltMinionConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-salt-minion/config", {
      refresh: refresh.toString(),
    });
  }

  async configureSaltMinion(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-salt-minion/batch", { operations });
  }

  async getSuricataCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-suricata/capabilities");
  }

  async getSuricataConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-suricata/config", {
      refresh: refresh.toString(),
    });
  }

  async configureSuricata(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-suricata/batch", { operations });
  }

  async getBroadcastRelayCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-broadcast-relay/capabilities");
  }

  async getBroadcastRelayConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-broadcast-relay/config", {
      refresh: refresh.toString(),
    });
  }

  async configureBroadcastRelay(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-broadcast-relay/batch", {
      operations,
    });
  }

  async getConfigSyncCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-config-sync/capabilities");
  }

  async getConfigSyncConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-config-sync/config", {
      refresh: refresh.toString(),
    });
  }

  async configureConfigSync(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-config-sync/batch", {
      operations,
    });
  }

  async getConntrackSyncCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-conntrack-sync/capabilities");
  }

  async getConntrackSyncConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-conntrack-sync/config", {
      refresh: refresh.toString(),
    });
  }

  async configureConntrackSync(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-conntrack-sync/batch", {
      operations,
    });
  }

  async getEventHandlerCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-event-handler/capabilities");
  }

  async getEventHandlerConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-event-handler/config", {
      refresh: refresh.toString(),
    });
  }

  async configureEventHandler(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-event-handler/batch", {
      operations,
    });
  }

  async getRouterAdvertCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-router-advert/capabilities");
  }

  async getRouterAdvertConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-router-advert/config", {
      refresh: refresh.toString(),
    });
  }

  async configureRouterAdvert(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-router-advert/batch", {
      operations,
    });
  }

  async getMonitoringCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-monitoring/capabilities");
  }

  async getMonitoringConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-monitoring/config", {
      refresh: refresh.toString(),
    });
  }

  async configureMonitoring(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-monitoring/batch", {
      operations,
    });
  }

  async getWebproxyCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-webproxy/capabilities");
  }

  async getWebproxyConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-webproxy/config", {
      refresh: refresh.toString(),
    });
  }

  async configureWebproxy(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-webproxy/batch", {
      operations,
    });
  }

  async getPppoeServerCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-pppoe-server/capabilities");
  }

  async getPppoeServerConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-pppoe-server/config", {
      refresh: refresh.toString(),
    });
  }

  async configurePppoeServer(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-pppoe-server/batch", {
      operations,
    });
  }

  async getIpoeServerCapabilities(): Promise<ServiceWrapperCapabilities> {
    return apiClient.get<ServiceWrapperCapabilities>("/vyos/service-ipoe-server/capabilities");
  }

  async getIpoeServerConfig(refresh: boolean = false): Promise<ServiceWrapperConfigResponse> {
    return apiClient.get<ServiceWrapperConfigResponse>("/vyos/service-ipoe-server/config", {
      refresh: refresh.toString(),
    });
  }

  async configureIpoeServer(operations: string[]): Promise<ServiceWrapperBatchResponse> {
    return apiClient.post<ServiceWrapperBatchResponse>("/vyos/service-ipoe-server/batch", {
      operations,
    });
  }
}

export const serviceWrappersApi = new ServiceWrappersApi();
