/**
 * API Client Configuration
 * Base configuration for communicating with the VyOS backend API
 */

// Use /api proxy in browser to avoid CORS, direct URL in server-side
// BACKEND_URL is read at runtime (not baked into build)
const API_BASE_URL = typeof window !== 'undefined'
  ? '/api'
  : (process.env.BACKEND_URL || "http://backend:8000");

import { ApiError } from "../types/api";

class ApiClientError extends Error implements ApiError {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

export class ApiClient {
  private baseUrl: string;
  private inFlightGetRequests: Map<string, Promise<unknown>>;
  private recentGetCache: Map<string, { expiresAt: number; data: unknown }>;
  private readonly getCacheTtlMs: number;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.inFlightGetRequests = new Map();
    this.recentGetCache = new Map();
    this.getCacheTtlMs = 1500;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        credentials: "include", // Send cookies (including session token) with every request
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        let errorDetails: unknown = undefined;

        // Try to read response body as text first
        const textBody = await response.text();

        try {
          // Try to parse as JSON
          const errorData = JSON.parse(textBody);
          errorDetails = errorData;

          // Extract user-friendly error message from FastAPI response
          if (errorData.detail) {
            errorMessage = errorData.detail;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Response body is not JSON (could be HTML error page)
          if (textBody.includes("<!DOCTYPE")) {
            errorMessage = `Server returned an error page (${response.status})`;
          } else if (textBody) {
            errorMessage = textBody.substring(0, 200);
          }
        }

        // Special handling for connection failures (503)
        if (response.status === 503 && errorMessage.includes("Failed to connect")) {
          errorMessage = "Failed to connect";
        }

        throw new ApiClientError(errorMessage, response.status, errorDetails);
      }

      // Parse JSON response
      const responseText = await response.text();

      try {
        return JSON.parse(responseText);
      } catch {
        // If response is not valid JSON, throw error
        if (responseText.includes("<!DOCTYPE")) {
          throw new ApiClientError("Server returned an HTML page instead of JSON", response.status);
        }

        throw new ApiClientError("Server returned non-JSON response", response.status);
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }

      throw new ApiClientError(
        error instanceof Error ? error.message : "Network error occurred",
        undefined,
        error
      );
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    let url = endpoint;
    if (params) {
      const queryString = new URLSearchParams(params).toString();
      url = `${endpoint}?${queryString}`;
    }

    const cacheKey = url;
    const now = Date.now();
    const cached = this.recentGetCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data as T;
    }
    if (cached) {
      this.recentGetCache.delete(cacheKey);
    }

    const inFlight = this.inFlightGetRequests.get(cacheKey);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    const requestPromise = this.request<T>(url, { method: "GET" })
      .then((result) => {
        this.recentGetCache.set(cacheKey, {
          expiresAt: Date.now() + this.getCacheTtlMs,
          data: result,
        });
        return result;
      })
      .finally(() => {
        this.inFlightGetRequests.delete(cacheKey);
      });

    this.inFlightGetRequests.set(cacheKey, requestPromise as Promise<unknown>);
    return requestPromise;
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const result = await this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
    this.recentGetCache.clear();
    return result;
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const result = await this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
    this.recentGetCache.clear();
    return result;
  }

  async delete<T>(endpoint: string): Promise<T> {
    const result = await this.request<T>(endpoint, { method: "DELETE" });
    this.recentGetCache.clear();
    return result;
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    const result = await this.request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
    this.recentGetCache.clear();
    return result;
  }
}

export const apiClient = new ApiClient();
