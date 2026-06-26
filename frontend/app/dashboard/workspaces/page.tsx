"use client";

import { useState, useEffect } from "react";
import api from "@/lib/api";
import { useWorkspace } from "../WorkspaceContext";
import { accountsService, type AccountResponse } from "@/lib/services/accounts";
import {
  Plus, X, Wallet, Briefcase, Copy, Check, Crown, Trash2, Edit3, CheckCircle2
} from "lucide-react";
import { useScrollLock } from "@/lib/hooks/useScrollLock";
import { Portal } from "@/components/Portal";

function WorkspaceInitials({ name }: { name: string }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = [
    "from-[#F0B90B] to-[#D0980B]",
    "from-[#0ECB81] to-[#0BA360]",
    "from-[#F0B90B] to-[#FFD000]",
    "from-[#F6465D] to-[#D93A4E]",
    "from-[#0ECB81] to-[#0ECB81]",
    "from-[#FFD000] to-[#F0B90B]",
  ];
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return (
    <div className={`w-11 h-11 rounded-lg bg-gradient-to-br ${colors[idx]} flex items-center justify-center text-[#1E2026] font-bold text-sm shrink-0`}>
      {initials}
    </div>
  );
}

export default function WorkspacesPage() {
  const { workspaces, activeWorkspace, setActiveWorkspace, refreshWorkspaces } = useWorkspace();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [accountCounts, setAccountCounts] = useState<Record<string, number>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useScrollLock(!!deletingId);

  useEffect(() => {
    (async () => {
      try {
        const accs = await accountsService.listAccounts();
        const counts: Record<string, number> = {};
        accs.forEach((a) => {
          counts[a.workspace_id] = (counts[a.workspace_id] || 0) + 1;
        });
        setAccountCounts(counts);
      } catch {}
    })();
  }, [workspaces]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post("/workspaces/", { name: newName });
      setNewName("");
      setIsCreating(false);
      await refreshWorkspaces();
    } catch (err: any) {
      setError(err.message || "Failed to create workspace");
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      await api.patch(`/workspaces/${id}`, { name: renameValue.trim() });
      setRenamingId(null);
      await refreshWorkspaces();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/workspaces/${id}`);
      setDeletingId(null);
      await refreshWorkspaces();
    } catch (err: any) {
      setError(err.message || "Cannot delete workspace");
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#EAECEF] mb-1">Workspaces</h1>
          <p className="text-sm text-[#848E9C] font-medium">
            Group and organize your Binance trading accounts.
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[6px] hover:bg-[#D0980B] transition-all duration-200 shadow-pill"
        >
          <Plus className="h-4 w-4" /> New Workspace
        </button>
      </div>

      {/* Create Form */}
      {isCreating && (
        <div className="bg-[#1E2026] border border-[#2B2F36] rounded-card p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#EAECEF]">Create Workspace</h2>
            <button onClick={() => { setIsCreating(false); setError(""); }} className="text-[#5E6673] hover:text-[#EAECEF] transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5">Name</label>
              <input
                type="text" required autoFocus
                className="w-full px-4 py-2.5 text-sm text-[#EAECEF] bg-[#2B2F36] border border-[#363A45] rounded-input focus:ring-1 focus:ring-[#F0B90B] focus:border-[#F0B90B] focus:outline-none placeholder-[#5E6673] transition-colors"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. High-Frequency, Spot Scalping…"
              />
            </div>
            <button type="submit" disabled={saving || !newName.trim()} className="px-6 py-2.5 text-sm font-semibold bg-[#0ECB81] text-[#1E2026] rounded-[6px] hover:bg-[#0BA360] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
              {saving ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={() => { setIsCreating(false); setError(""); }} className="px-4 py-2.5 text-sm font-semibold text-[#848E9C] bg-[#2B2F36] border border-[#363A45] rounded-[6px] hover:text-[#EAECEF] transition-colors">
              Cancel
            </button>
          </form>
          {error && <p className="text-sm text-[#F6465D] bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-input p-2.5 mt-3 font-medium">{error}</p>}
        </div>
      )}

      {/* Delete Modal */}
      {deletingId && (
        <Portal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
          <div className="bg-[#1E2026] border border-[#2B2F36] rounded-card w-full max-w-sm p-6 text-center shadow-card">
            <div className="w-12 h-12 rounded-full bg-[#F6465D]/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="h-6 w-6 text-[#F6465D]" />
            </div>
            <h3 className="text-lg font-bold text-[#EAECEF] mb-2">Delete Workspace?</h3>
            <p className="text-sm text-[#848E9C] mb-6 font-medium">
              This will remove the workspace. Accounts inside it will become unassigned.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeletingId(null)} className="px-5 py-2.5 text-sm font-semibold text-[#848E9C] bg-[#2B2F36] border border-[#363A45] rounded-[6px] hover:text-[#EAECEF] transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deletingId)} className="px-5 py-2.5 text-sm font-semibold bg-[#F6465D] text-white rounded-[6px] hover:bg-[#D93A4E] transition-colors">Delete</button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Workspace Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {workspaces.map((ws) => {
          const isActive = activeWorkspace?.id === ws.id;
          const accCount = accountCounts[ws.id] || 0;
          const isRenaming = renamingId === ws.id;

          return (
            <div
              key={ws.id}
              className={`bg-[#1E2026] rounded-card p-5 transition-all duration-200 group ${
                isActive
                  ? "border border-[#F0B90B]/30 ring-1 ring-[#F0B90B]/10"
                  : "border border-[#2B2F36] hover:border-[#363A45]"
              }`}
            >
              {/* Top row */}
              <div className="flex items-center gap-3 mb-4">
                <WorkspaceInitials name={ws.name} />
                <div className="flex-1 min-w-0">
                  {isRenaming ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        className="flex-1 px-3 py-1.5 text-sm text-[#EAECEF] bg-[#2B2F36] border border-[#363A45] rounded-input focus:ring-1 focus:ring-[#F0B90B] focus:border-[#F0B90B] focus:outline-none"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(ws.id); if (e.key === "Escape") setRenamingId(null); }}
                      />
                      <button onClick={() => handleRename(ws.id)} className="px-3 py-1.5 text-xs font-semibold bg-[#0ECB81] text-[#1E2026] rounded-[6px] hover:bg-[#0BA360] transition-colors">Save</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[#EAECEF] truncate">{ws.name}</h3>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#F0B90B] bg-[#F0B90B]/10 border border-[#F0B90B]/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Active
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-4 mb-4 px-1">
                <div className="flex items-center gap-2 text-sm">
                  <Wallet className="h-4 w-4 text-[#5E6673]" />
                  <span className="text-[#EAECEF] font-semibold">{accCount}</span>
                  <span className="text-[#848E9C] text-xs">{accCount === 1 ? "Account" : "Accounts"}</span>
                </div>
                <button
                  onClick={() => copyId(ws.id)}
                  className="flex items-center gap-1 text-[11px] text-[#5E6673] hover:text-[#848E9C] transition-colors font-mono ml-auto"
                  title="Copy workspace ID"
                >
                  {ws.id.slice(0, 8)}…
                  {copiedId === ws.id ? <Check className="h-3 w-3 text-[#0ECB81]" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-[#2B2F36]">
                {!isActive ? (
                  <button
                    onClick={() => setActiveWorkspace(ws)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#848E9C] bg-[#2B2F36] border border-[#363A45] rounded-[6px] hover:text-[#F0B90B] hover:border-[#F0B90B]/30 transition-all duration-200"
                  >
                    <Crown className="h-3 w-3" /> Set Active
                  </button>
                ) : (
                  <span className="text-xs text-[#5E6673] font-medium">Currently selected</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => { setRenamingId(ws.id); setRenameValue(ws.name); }}
                    className="p-2 text-[#5E6673] hover:text-[#EAECEF] hover:bg-[#2B2F36] rounded-[6px] transition-all"
                    title="Rename"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  {!isActive && (
                    <button
                      onClick={() => setDeletingId(ws.id)}
                      className="p-2 text-[#5E6673] hover:text-[#F6465D] hover:bg-[#F6465D]/10 rounded-[6px] transition-all"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {workspaces.length === 0 && (
        <div className="bg-[#1E2026] border border-[#2B2F36] rounded-card p-12 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-xl bg-[#2B2F36] flex items-center justify-center mb-4">
            <Briefcase className="h-8 w-8 text-[#5E6673]" />
          </div>
          <h3 className="text-lg font-bold text-[#EAECEF] mb-2">No Workspaces Yet</h3>
          <p className="text-sm text-[#848E9C] max-w-sm mb-6 font-medium">
            Create your first workspace to start organizing your trading accounts into logical groups.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[6px] hover:bg-[#D0980B] transition-all duration-200"
          >
            <Plus className="h-4 w-4" /> Create First Workspace
          </button>
        </div>
      )}
    </div>
  );
}
