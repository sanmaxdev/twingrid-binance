const isServer = typeof window === 'undefined';
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || (isServer ? "http://backend:8000/api/v1" : "/api/v1");

// Custom event dispatched when the session is truly expired and cannot be refreshed.
// AuthContext listens for this to perform a clean logout + redirect.
export const SESSION_EXPIRED_EVENT = "tw:session_expired";

class ApiClient {
  private isRefreshing = false;
  private pendingRequests: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  async fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    if (typeof window !== "undefined") {
      const workspaceId = localStorage.getItem("active_workspace");
      if (workspaceId && !headers.has("x-workspace-id")) {
        headers.set("x-workspace-id", workspaceId);
      }
    }

    // Timeout: 30s default, 120s for backtest endpoints
    const timeoutMs = endpoint.includes("/backtest/run") ? 120000 : 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const config: RequestInit = {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
      signal: options.signal || controller.signal,
    };

    try {
      let response = await fetch(url, config);

      // Intercept 401 — skip auth endpoints to prevent infinite loops
      if (response.status === 401 && !endpoint.startsWith("/auth/")) {
        response = await this.handleUnauthorized(url, config);
      }

      // For non-ok responses, extract a meaningful error message but DON'T throw here
      // for auth endpoints — let callers decide how to handle non-401 errors.
      if (!response.ok) {
        let errorMessage = `Request failed (${response.status})`;
        try {
          const errorData = await response.clone().json();
          errorMessage = errorData?.detail || errorData?.message || errorMessage;
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Called when a 401 is received on a non-auth endpoint.
   * Attempts a token refresh. If the refresh itself also fails (401/network),
   * dispatches SESSION_EXPIRED_EVENT so AuthContext can do a clean logout.
   */
  private async handleUnauthorized(url: string, config: RequestInit): Promise<Response> {
    if (typeof window === "undefined") {
      // SSR — can't refresh, just return the original request
      return fetch(url, config);
    }

    // If already refreshing, queue this request and wait for it to complete
    if (this.isRefreshing) {
      return new Promise<Response>((resolve, reject) => {
        this.pendingRequests.push({
          resolve: () => resolve(fetch(url, config)),
          reject,
        });
      });
    }

    this.isRefreshing = true;

    try {
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
      });

      if (!refreshResponse.ok) {
        // Refresh token also invalid/expired — session is truly dead
        this.onSessionExpired();
        throw new Error("Session expired");
      }

      // Refresh succeeded — retry all pending requests
      this.isRefreshing = false;
      this.pendingRequests.forEach(({ resolve }) => resolve());
      this.pendingRequests = [];

      // Retry the original request with fresh cookie
      return fetch(url, config);
    } catch (error) {
      this.isRefreshing = false;
      this.pendingRequests.forEach(({ reject }) => reject(new Error("Session expired")));
      this.pendingRequests = [];

      // Only dispatch the expired event if it was a real auth failure (not a network error)
      if (error instanceof Error && error.message !== "Session expired") {
        // Network error during refresh — don't force logout, might be temporary
        throw error;
      }

      throw new Error("Session expired");
    }
  }

  /**
   * Notify the app that the session is expired. AuthContext listens for this
   * and performs a clean logout + redirect to login page.
   */
  private onSessionExpired() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
  }

  /**
   * Hard clear: call logout API, wipe localStorage session data, dispatch expired event.
   * Used by AuthContext.logout().
   */
  public async logout() {
    if (typeof window === "undefined") return;

    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // Best-effort — cookies may still be cleared by the browser on next load
    }

    // Clear local session data
    this.clearLocalSession();
  }

  public clearLocalSession() {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem("active_workspace");
    } catch { /* ignore */ }
  }

  get(endpoint: string, options?: RequestInit) {
    return this.fetch(endpoint, { ...options, method: "GET" });
  }

  post(endpoint: string, body: unknown, options?: RequestInit) {
    return this.fetch(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  put(endpoint: string, body: unknown, options?: RequestInit) {
    return this.fetch(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  patch(endpoint: string, body: unknown, options?: RequestInit) {
    return this.fetch(endpoint, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  delete(endpoint: string, options?: RequestInit) {
    return this.fetch(endpoint, { ...options, method: "DELETE" });
  }
}

const api = new ApiClient();
export default api;
