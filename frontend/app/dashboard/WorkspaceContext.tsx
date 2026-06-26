"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import api from "@/lib/api";

type Workspace = {
  id: string;
  name: string;
  owner_id: string;
};

type WorkspaceContextType = {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (ws: Workspace) => void;
  refreshWorkspaces: () => Promise<void>;
  loading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkspaces = async () => {
    // Don't fetch if not authenticated — avoids 401 noise
    if (!isAuthenticated) {
      setWorkspaces([]);
      setActiveWorkspaceState(null);
      setLoading(false);
      return;
    }

    try {
      const res = await api.get("/workspaces/");
      const data = await res.json();
      setWorkspaces(data);

      const savedId = localStorage.getItem("active_workspace");
      if (data.length > 0) {
        const found = savedId ? data.find((w: Workspace) => w.id === savedId) : null;
        if (found) {
          setActiveWorkspaceState(found);
        } else {
          setActiveWorkspaceState(data[0]);
          localStorage.setItem("active_workspace", data[0].id);
        }
      } else {
        setActiveWorkspaceState(null);
        localStorage.removeItem("active_workspace");
      }
    } catch (err: any) {
      // "Session expired" errors are handled globally by AuthContext.
      // Other errors (network blips) — log but don't crash.
      if (err?.message !== "Session expired") {
        console.warn("[WorkspaceContext] Failed to load workspaces:", err?.message);
      }
      setWorkspaces([]);
      setActiveWorkspaceState(null);
    } finally {
      setLoading(false);
    }
  };

  // Only fetch workspaces once auth has resolved and user is authenticated
  useEffect(() => {
    if (authLoading) return; // Wait for auth check to complete first
    fetchWorkspaces();
  }, [isAuthenticated, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveWorkspace = (ws: Workspace) => {
    setActiveWorkspaceState(ws);
    localStorage.setItem("active_workspace", ws.id);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        setActiveWorkspace,
        refreshWorkspaces: fetchWorkspaces,
        loading: authLoading || loading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
