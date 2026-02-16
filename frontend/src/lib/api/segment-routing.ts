import { apiClient } from "./client";

export interface SegmentRoutingConfigResponse {
  segment_routing: Record<string, unknown>;
}

export interface SegmentRoutingCapabilities {
  version: string;
  features: Record<string, boolean | { supported: boolean; description: string }>;
  instance_name?: string;
  instance_id?: string;
}

export interface SegmentRoutingBatchRequest {
  operations: string[];
}

export interface VyOSResponse {
  success: boolean;
  data?: Record<string, unknown> | null;
  error?: string | null;
}

class SegmentRoutingService {
  async getCapabilities(): Promise<SegmentRoutingCapabilities> {
    return apiClient.get<SegmentRoutingCapabilities>("/vyos/segment-routing/capabilities");
  }

  async getConfig(refresh = false): Promise<SegmentRoutingConfigResponse> {
    return apiClient.get<SegmentRoutingConfigResponse>("/vyos/segment-routing/config", {
      refresh: refresh.toString(),
    });
  }

  async batchConfigure(request: SegmentRoutingBatchRequest): Promise<VyOSResponse> {
    return apiClient.post<VyOSResponse>("/vyos/segment-routing/batch", request);
  }
}

export const segmentRoutingService = new SegmentRoutingService();

