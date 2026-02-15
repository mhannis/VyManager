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

export interface ContainerTmpfsMapping {
  name: string;
  destination: string;
  size_mb?: number | null;
}

export interface ContainerDeviceMapping {
  name: string;
  source: string;
  destination: string;
}

export interface ContainerKeyValue {
  key: string;
  value: string;
}

export interface ContainerNetworkAttachment {
  name: string;
  address?: string | null;
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
  allow_host_pid: boolean;
  network: string | null;
  network_address: string | null;
  networks: ContainerNetworkAttachment[];
  name_servers: string[];
  uid: number | null;
  gid: number | null;
  cpu_quota: number | null;
  memory: number | null;
  capabilities: string[];
  tmpfs: ContainerTmpfsMapping[];
  devices: ContainerDeviceMapping[];
  sysctls: ContainerKeyValue[];
  labels: ContainerKeyValue[];
  health_check_enabled: boolean;
  health_check_command: string | null;
  health_check_interval: string | null;
  health_check_timeout: string | null;
  health_check_retries: number | null;
  log_driver: "k8s-file" | "journald" | "none" | null;
  health_status: "healthy" | "unhealthy" | "starting" | null;
  uptime: string | null;
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
  allow_host_pid: boolean;
  network?: string | null;
  network_address?: string | null;
  networks: ContainerNetworkAttachment[];
  name_servers: string[];
  uid?: number | null;
  gid?: number | null;
  cpu_quota?: number | null;
  memory?: number | null;
  capabilities: string[];
  tmpfs: ContainerTmpfsMapping[];
  devices: ContainerDeviceMapping[];
  sysctls: ContainerKeyValue[];
  labels: ContainerKeyValue[];
  health_check_enabled: boolean;
  health_check_command?: string | null;
  health_check_interval?: string | null;
  health_check_timeout?: string | null;
  health_check_retries?: number | null;
  log_driver?: "k8s-file" | "journald" | "none" | null;
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

export interface ContainerBootstrapStatusResponse {
  ssh_enabled: boolean;
  ssh_key_installed: boolean;
  ssh_key_identifier: string;
  ssh_key_type: string | null;
  automation_ready?: boolean;
  network_count?: number;
  networks?: ContainerNetworkSummary[];
}

export interface ContainerInstallResponse {
  success: boolean;
  container: ContainerSummary;
  image_pulled: boolean;
  created_volume_paths: string[];
  pull_output: string | null;
}

export interface ContainerImageSummary {
  reference: string;
  source: "runtime" | "configured";
}

export interface ContainerImagesResponse {
  automation_ready: boolean;
  ssh_enabled: boolean;
  ssh_key_installed: boolean;
  configured_images: string[];
  runtime_images: ContainerImageSummary[];
  raw_output: string | null;
}

export interface ContainerImageLifecycleRequest {
  image: string;
}

export interface ContainerImageDeleteRequest {
  target: string;
  force: boolean;
}

export interface ContainerImageLifecycleResponse {
  success: boolean;
  action: "pull" | "update" | "delete";
  target: string;
  output: string | null;
  automation_ready: boolean;
}

export interface ContainerRegistryMirror {
  address: string | null;
  host_name: string | null;
  port: number | null;
  path: string | null;
}

export interface ContainerRegistrySummary {
  name: string;
  enabled: boolean;
  insecure: boolean;
  username: string | null;
  password_set: boolean;
  mirror: ContainerRegistryMirror | null;
}

export interface ContainerRegistryUpsertRequest {
  enabled: boolean;
  insecure: boolean;
  username?: string | null;
  password?: string | null;
  mirror?: ContainerRegistryMirror | null;
}

export interface ContainerRegistryOperationResponse {
  success: boolean;
  registry: string;
  message: string;
}

export interface ContainerInspectResponse {
  name: string;
  method: string | null;
  output: string;
}

export interface ContainerNetworkSummary {
  name: string;
  description: string | null;
  prefixes: string[];
  mtu: number | null;
  vrf: string | null;
  dns_disabled: boolean;
}

export interface ContainerNetworkUpsertRequest {
  description?: string | null;
  prefixes: string[];
  mtu?: number | null;
  vrf?: string | null;
  dns_disabled: boolean;
}

export interface ContainerNetworkOperationResponse {
  success: boolean;
  network: string;
  message: string;
}

export interface ContainerInitialSetupRequest {
  enable_automation: boolean;
  create_default_network: boolean;
  network_name: string;
  network_prefix: string;
  network_description?: string | null;
  network_mtu?: number | null;
  network_vrf?: string | null;
  disable_network_dns: boolean;
}

class ContainersService {
  async getOverview(refresh: boolean = false): Promise<ContainersOverviewResponse> {
    return apiClient.get<ContainersOverviewResponse>("/vyos/containers/overview", {
      refresh: refresh ? "true" : "false",
    });
  }

  async getBootstrapStatus(): Promise<ContainerBootstrapStatusResponse> {
    return apiClient.get<ContainerBootstrapStatusResponse>("/vyos/containers/bootstrap-status");
  }

  async getNetworks(refresh: boolean = false): Promise<ContainerNetworkSummary[]> {
    return apiClient.get<ContainerNetworkSummary[]>("/vyos/containers/networks", {
      refresh: refresh ? "true" : "false",
    });
  }

  async upsertNetwork(name: string, body: ContainerNetworkUpsertRequest): Promise<ContainerNetworkSummary> {
    return apiClient.put<ContainerNetworkSummary>(`/vyos/containers/networks/${encodeURIComponent(name)}`, body);
  }

  async deleteNetwork(name: string): Promise<ContainerNetworkOperationResponse> {
    return apiClient.delete<ContainerNetworkOperationResponse>(`/vyos/containers/networks/${encodeURIComponent(name)}`);
  }

  async bootstrapAutomation(
    body?: Partial<ContainerInitialSetupRequest>,
  ): Promise<ContainerBootstrapStatusResponse> {
    return apiClient.post<ContainerBootstrapStatusResponse>("/vyos/containers/bootstrap", body || {});
  }

  async upsertContainer(
    name: string,
    body: ContainerUpsertRequest
  ): Promise<ContainerSummary> {
    return apiClient.put<ContainerSummary>(`/vyos/containers/${encodeURIComponent(name)}`, body);
  }

  async installContainer(name: string, body: ContainerUpsertRequest): Promise<ContainerInstallResponse> {
    return apiClient.post<ContainerInstallResponse>(
      `/vyos/containers/${encodeURIComponent(name)}/install`,
      body
    );
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

  async getImages(refresh: boolean = false): Promise<ContainerImagesResponse> {
    return apiClient.get<ContainerImagesResponse>("/vyos/containers/images", {
      refresh: refresh ? "true" : "false",
    });
  }

  async pullImage(body: ContainerImageLifecycleRequest): Promise<ContainerImageLifecycleResponse> {
    return apiClient.post<ContainerImageLifecycleResponse>("/vyos/containers/images/pull", body);
  }

  async updateImage(body: ContainerImageLifecycleRequest): Promise<ContainerImageLifecycleResponse> {
    return apiClient.post<ContainerImageLifecycleResponse>("/vyos/containers/images/update", body);
  }

  async deleteImage(
    body: ContainerImageDeleteRequest,
  ): Promise<ContainerImageLifecycleResponse> {
    return apiClient.post<ContainerImageLifecycleResponse>("/vyos/containers/images/delete", body);
  }

  async getRegistries(refresh: boolean = false): Promise<ContainerRegistrySummary[]> {
    return apiClient.get<ContainerRegistrySummary[]>("/vyos/containers/registries", {
      refresh: refresh ? "true" : "false",
    });
  }

  async upsertRegistry(
    name: string,
    body: ContainerRegistryUpsertRequest,
  ): Promise<ContainerRegistrySummary> {
    return apiClient.put<ContainerRegistrySummary>(
      `/vyos/containers/registries/${encodeURIComponent(name)}`,
      body,
    );
  }

  async deleteRegistry(name: string): Promise<ContainerRegistryOperationResponse> {
    return apiClient.delete<ContainerRegistryOperationResponse>(
      `/vyos/containers/registries/${encodeURIComponent(name)}`,
    );
  }

  async inspectContainer(name: string): Promise<ContainerInspectResponse> {
    return apiClient.get<ContainerInspectResponse>(
      `/vyos/containers/${encodeURIComponent(name)}/inspect`,
    );
  }
}

export const containersService = new ContainersService();
