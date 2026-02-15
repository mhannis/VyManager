import { apiClient } from "./client";

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface DashboardCard {
  id: string;
  type: string; // "interface-statistics", etc.
  column: number; // 0, 1, or 2
  position: number; // position within column
  span?: number; // how many columns this card spans (1, 2, or 3) - defaults to 1
  config?: Record<string, any>; // card-specific configuration
}

export interface DashboardLayoutSettings {
  columns?: number; // 2-4 columns
  gap_px?: number; // 8-24 px
}

export interface DashboardLayout {
  cards: DashboardCard[];
  settings?: DashboardLayoutSettings;
}

export interface DashboardLayoutResponse {
  layout: DashboardLayout | null;
  exists: boolean;
}

// ============================================================================
// API Service
// ============================================================================

class DashboardService {
  /**
   * Get the user's dashboard layout for the current instance
   */
  async getLayout(): Promise<DashboardLayoutResponse> {
    return apiClient.get<DashboardLayoutResponse>("/dashboard/layout");
  }

  /**
   * Save the user's dashboard layout
   */
  async saveLayout(layout: DashboardLayout): Promise<unknown> {
    return apiClient.post("/dashboard/layout", { layout });
  }
}

export const dashboardService = new DashboardService();
