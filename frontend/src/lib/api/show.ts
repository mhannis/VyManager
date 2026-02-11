import { apiClient } from "./client";

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface InterfaceCounter {
  interface: string;
  rx_packets: number;
  rx_bytes: number;
  tx_packets: number;
  tx_bytes: number;
  rx_dropped: number;
  tx_dropped: number;
  rx_errors: number;
  tx_errors: number;
}

export interface InterfaceCountersResponse {
  interfaces: InterfaceCounter[];
  total: number;
}

export interface InterfacePhysical {
  interface: string;
  nic_model?: string | null;
  driver?: string | null;
  firmware_version?: string | null;
  bus_info?: string | null;
  speed?: string | null;
  duplex?: string | null;
  auto_negotiation?: string | null;
  link_up?: boolean | null;
}

export interface InterfacePhysicalResponse {
  interfaces: InterfacePhysical[];
  total: number;
}

export interface InterfaceName {
  name: string;
  type: string;
}

export interface AllInterfacesResponse {
  interfaces: InterfaceName[];
  total: number;
}

export interface InterfaceBlinkResponse {
  success: boolean;
  interface: string;
  duration_seconds: number;
  method: string;
  output?: string | null;
}

// ============================================================================
// API Service
// ============================================================================

class ShowService {
  /**
   * Get interface counter statistics
   */
  async getInterfaceCounters(): Promise<InterfaceCountersResponse> {
    return apiClient.get<InterfaceCountersResponse>("/vyos/show/interface-counters");
  }

  /**
   * Get interface physical details (NIC model/driver/link/speed)
   */
  async getInterfacePhysical(): Promise<InterfacePhysicalResponse> {
    return apiClient.get<InterfacePhysicalResponse>("/vyos/show/interface-physical");
  }

  /**
   * Get all interfaces from VyOS config (regardless of active/up status)
   * This includes VLANs and sub-interfaces
   */
  async getAllInterfaces(): Promise<AllInterfacesResponse> {
    return apiClient.get<AllInterfacesResponse>("/vyos/show/all-interfaces");
  }

  /**
   * Trigger interface identify/blink LED for a short duration.
   */
  async blinkInterface(
    interfaceName: string,
    durationSeconds: number = 5
  ): Promise<InterfaceBlinkResponse> {
    return apiClient.post<InterfaceBlinkResponse>("/vyos/show/interface-blink", {
      interface: interfaceName,
      duration_seconds: durationSeconds,
    });
  }
}

export const showService = new ShowService();
