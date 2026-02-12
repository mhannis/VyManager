import { apiClient } from "./client";

export interface ContainerEnvironmentVar {
  key: string;
  value: string;
}

export interface ContainerPortMapping {
  name: string;
  source: number;
  destination: number;
  protocol: "tcp" | "udp";
}

export interface ContainerVolumeMapping {
  name: string;
  source: string;
  destination: string;
  mode: "rw" | "ro";
}

export interface ContainerWebLink {
  label: string;
  url: string;
  source_port: number;
  destination_port: number;
  protocol: string;
}

export interface ContainerSummary {
  name: string;
  image: string | null;
  description: string | null;
  entrypoint: string | null;
  command: string | null;
  arguments: string | null;
  host_name: string | null;
  restart: "no" | "on-failure" | "always" | null;
  enabled: boolean;
  allow_host_networks: boolean;
  network: string | null;
  network_address: string | null;
  status: string | null;
  environment: ContainerEnvironmentVar[];
  ports: ContainerPortMapping[];
  volumes: ContainerVolumeMapping[];
  links: ContainerWebLink[];
}

export interface ContainersOverviewResponse {
  connection_host: string | null;
  configured_total: number;
  active_total: number | null;
  containers: ContainerSummary[];
  runtime_raw: string | null;
  images_raw: string | null;
}

export interface ContainerUpsertRequest {
  image: string;
  description?: string | null;
  entrypoint?: string | null;
  command?: string | null;
  arguments?: string | null;
  host_name?: string | null;
  restart?: "no" | "on-failure" | "always" | null;
  enabled: boolean;
  allow_host_networks: boolean;
  network?: string | null;
  network_address?: string | null;
  environment: ContainerEnvironmentVar[];
  ports: ContainerPortMapping[];
  volumes: ContainerVolumeMapping[];
}

export interface ContainerActionRequest {
  action: "start" | "stop" | "restart";
}

export interface ContainerActionResponse {
  success: boolean;
  name: string;
  action: string;
  method: string | null;
  message: string | null;
  output: string | null;
  warning: string | null;
}

export interface ContainerDeleteResponse {
  success: boolean;
  name: string;
  message: string;
}

export interface ContainerLogsResponse {
  name: string;
  logs: string;
  total_lines: number;
  returned_lines: number;
}

class ContainersService {
  async getOverview(refresh: boolean = false): Promise<ContainersOverviewResponse> {
    return apiClient.get<ContainersOverviewResponse>("/vyos/containers/overview", {
      refresh: refresh ? "true" : "false",
    });
  }

  async upsertContainer(
    name: string,
    body: ContainerUpsertRequest
  ): Promise<ContainerSummary> {
    return apiClient.put<ContainerSummary>(`/vyos/containers/${encodeURIComponent(name)}`, body);
  }

  async deleteContainer(name: string): Promise<ContainerDeleteResponse> {
    return apiClient.delete<ContainerDeleteResponse>(`/vyos/containers/${encodeURIComponent(name)}`);
  }

  async action(
    name: string,
    action: ContainerActionRequest["action"]
  ): Promise<ContainerActionResponse> {
    return apiClient.post<ContainerActionResponse>(`/vyos/containers/${encodeURIComponent(name)}/action`, {
      action,
    });
  }

  async getLogs(name: string, lines: number = 300): Promise<ContainerLogsResponse> {
    return apiClient.get<ContainerLogsResponse>(`/vyos/containers/${encodeURIComponent(name)}/logs`, {
      lines: String(lines),
    });
  }
}

export const containersService = new ContainersService();
