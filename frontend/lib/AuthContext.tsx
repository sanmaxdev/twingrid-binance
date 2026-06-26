"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import api, { API_BASE_URL, SESSION_EXPIRED_EVENT } from "@/lib/api";

interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  is_email_verified: boolean;
  totp_enabled: boolean;
  invite_code?: string;
  last_login_at?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string, totpCode?: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Ref to track whether we've already handled a session-expired event
  // to prevent duplicate redirects
  const isHandlingExpiry = useRef(false);
  // Ref so the logout function in the event listener always has the latest router
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  const isAuthenticated = !!user;
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  /**
   * Perform a clean logout:
   * 1. Call backend logout (clears HttpOnly cookies server-side)
   * 2. Clear local state + localStorage
   * 3. Redirect to login
   */
  const performLogout = useCallback(async (redirectUrl = "/auth/login") => {
    // Prevent re-entry
    if (isHandlingExpiry.current) return;
    isHandlingExpiry.current = true;

    try {
      await api.logout();
    } catch {
      // Best-effort — even if this fails, we clear local state
    }

    api.clearLocalSession();
    setUser(null);
    setIsLoading(false);
    isHandlingExpiry.current = false;

    // Use replace so the loading page isn't in the history stack
    routerRef.current.replace(redirectUrl);
  }, []);

  /**
   * Fetch the current user's profile.
   * Returns the user data or null if unauthenticated.
   * Does NOT throw — callers can safely check the return value.
   */
  const fetchProfile = useCallback(async (): Promise<User | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/me/profile`, {
        credentials: "include",
        cache: "no-store",
      });

      if (res.ok) {
        return await res.json();
      }

      if (res.status === 401) {
        // Try refresh once
        try {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          });

          if (refreshRes.ok) {
            // Retry profile fetch after refresh
            const retryRes = await fetch(`${API_BASE_URL}/me/profile`, {
              credentials: "include",
              cache: "no-store",
            });
            if (retryRes.ok) {
              return await retryRes.json();
            }
          }
        } catch {
          // Network error during refresh — treat as unauthenticated
        }
        // Both tokens are invalid — clear stale cookies via logout endpoint
        // so middleware won't keep sending user to protected routes
        try {
          await fetch(`${API_BASE_URL}/auth/logout`, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          });
        } catch {
          // Best-effort cookie cleanup
        }
        return null;
      }

      // Other error (500, network, etc.) — don't treat as logged out
      return null;
    } catch {
      // Network error — don't treat as logged out
      return null;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const userData = await fetchProfile();
    setUser(userData);
  }, [fetchProfile]);

  // ── Initial auth check on mount ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Safety fallback: if auth check hasn't resolved in 15s, stop the loading
    // screen (prevents infinite stuck state on network issues)
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        console.warn("[Auth] Safety timeout — ending loading state");
        setIsLoading(false);
      }
    }, 15000);

    const checkAuth = async () => {
      const userData = await fetchProfile();
      if (!cancelled) {
        setUser(userData);
        setIsLoading(false);
        clearTimeout(safetyTimer);
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Listen for session-expired events from api.ts ────────────────────────
  // When the API client cannot refresh the token, it dispatches this event.
  // We perform a clean logout + redirect here.
  useEffect(() => {
    const handleSessionExpired = () => {
      console.warn("[Auth] Session expired event received — logging out");
      performLogout("/auth/login");
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [performLogout]);

  // ── Background token refresh (every 12 minutes) ──────────────────────────
  // Keeps the access token fresh. Runs silently in the background.
  useEffect(() => {
    if (!user) return;

    const REFRESH_INTERVAL_MS = 12 * 60 * 1000; // 12 min (access TTL is 15 min)

    const refreshAccessToken = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });

        if (res.ok) {
          // Update user data in case anything changed (role, suspension, etc.)
          const profileRes = await fetch(`${API_BASE_URL}/me/profile`, {
            credentials: "include",
            cache: "no-store",
          });
          if (profileRes.ok) {
            setUser(await profileRes.json());
          } else if (profileRes.status === 401) {
            // Both tokens invalid — force logout
            performLogout("/auth/login");
          }
        }
        // If refresh fails due to network, stay logged in (temporary outage)
        // The user will see errors on next API call and be prompted appropriately
      } catch {
        // Network error — ignore silently, don't force logout
      }
    };

    const interval = setInterval(refreshAccessToken, REFRESH_INTERVAL_MS);

    // Refresh immediately when tab becomes visible (handles laptop sleep / tab switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAccessToken();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, performLogout]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (
    email: string,
    password: string,
    totpCode?: string,
    rememberMe?: boolean,
  ) => {
    const body: Record<string, unknown> = { email, password, remember_me: rememberMe ?? true };
    if (totpCode) body.totp_code = totpCode;

    // Use raw fetch for login — we don't want the api client to intercept 401
    // during login itself (would create a loop)
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail || "Login failed");
    }

    // Fetch profile after login — cookies are now set
    const userData = await fetchProfile();
    if (!userData) {
      throw new Error("Failed to load user profile after login");
    }
    setUser(userData);
    isHandlingExpiry.current = false; // Reset in case of re-login after session expiry
  }, [fetchProfile]);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await performLogout("/auth/login");
  }, [performLogout]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, isAdmin, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
