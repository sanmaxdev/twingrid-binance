"use client";

import { useEffect, useState, useRef } from "react";
import { adminService, AdminUser } from "@/lib/services/admin";
import { toast } from "sonner";
import { Users, Shield, Search, MoreHorizontal, ShieldCheck, ShieldOff, Ban, UserCheck, Trash2, Pencil, X, Check, Wallet, Crown } from "lucide-react";

import { useConfirmDialog } from "@/components/ConfirmDialog";
import UserDetailModal from "@/components/admin/UserDetailModal";

function UserActionMenu({ user, onAction, currentUserId }: { user: AdminUser; onAction: (action: string, user: AdminUser) => void; currentUserId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isSelf = user.id === currentUserId;
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isSuspended = !user.is_active;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="p-1.5 text-[#848E9C] hover:text-[#F0B90B] rounded-md hover:bg-[#181A20] transition-all">
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-[#1E2026] border border-[#2B2F36] rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
          {/* Role actions */}
          {!isSelf && !isSuperAdmin && (
            <>
              {user.role === "USER" && (
                <button onClick={() => { onAction("promote", user); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-[#EAECEF] hover:bg-[#2B2F36] transition-colors text-left">
                  <ShieldCheck size={14} className="text-[#F0B90B]" /> Promote to Admin
                </button>
              )}
              {user.role === "ADMIN" && (
                <button onClick={() => { onAction("demote", user); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-[#EAECEF] hover:bg-[#2B2F36] transition-colors text-left">
                  <ShieldOff size={14} className="text-[#848E9C]" /> Demote to User
                </button>
              )}
              <div className="h-px bg-[#2B2F36] my-1" />
            </>
          )}

          {/* Suspend / Unsuspend */}
          {!isSelf && !isSuperAdmin && (
            <>
              {isSuspended ? (
                <button onClick={() => { onAction("unsuspend", user); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-[#0ECB81] hover:bg-[#2B2F36] transition-colors text-left">
                  <UserCheck size={14} /> Unsuspend User
                </button>
              ) : (
                <button onClick={() => { onAction("suspend", user); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-[#F0B90B] hover:bg-[#2B2F36] transition-colors text-left">
                  <Ban size={14} /> Suspend User
                </button>
              )}
            </>
          )}

          {/* Edit */}
          <button onClick={() => { onAction("edit", user); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-[#EAECEF] hover:bg-[#2B2F36] transition-colors text-left">
            <Pencil size={14} className="text-[#848E9C]" /> Edit Display Name
          </button>

          {/* Delete */}
          {!isSelf && !isSuperAdmin && (
            <>
              <div className="h-px bg-[#2B2F36] my-1" />
              <button onClick={() => { onAction("delete", user); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-[#F6465D] hover:bg-[#F6465D]/10 transition-colors text-left">
                <Trash2 size={14} /> Delete User
              </button>
            </>
          )}

          {/* Self / Super Admin label */}
          {(isSelf || isSuperAdmin) && !isSelf && (
            <div className="px-4 py-2.5 text-[11px] text-[#848E9C]/60 italic">Protected account</div>
          )}
          {isSelf && (
            <div className="px-4 py-2.5 text-[11px] text-[#848E9C]/60 italic">This is you</div>
          )}
        </div>
      )}
    </div>
  );
}

function SuspendModal({ user, onConfirm, onClose }: { user: AdminUser; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1E2026] border border-[#2B2F36] rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[#EAECEF]">Suspend User</h3>
          <button onClick={onClose} className="text-[#848E9C] hover:text-[#EAECEF]"><X size={18} /></button>
        </div>
        <p className="text-sm text-[#848E9C] mb-4">
          Suspending <span className="text-[#EAECEF] font-semibold">{user.email}</span> will immediately revoke access and terminate all active sessions.
        </p>
        <label className="block text-xs font-semibold text-[#848E9C] uppercase tracking-wider mb-2">Reason</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for suspension..."
          className="w-full bg-[#181A20] border border-[#2B2F36] rounded-lg px-3 py-2.5 text-sm text-[#EAECEF] placeholder-[#848E9C] focus:outline-none focus:ring-1 focus:ring-[#F0B90B]/50 resize-none" />
        <div className="flex gap-3 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold bg-[#2B2F36] text-[#EAECEF] hover:bg-[#2B2F36]/80 transition-all">Cancel</button>
          <button onClick={() => onConfirm(reason || "Suspended by admin")}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-[#F6465D] text-white hover:bg-[#F6465D]/80 transition-all">
            Suspend User
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ user, onConfirm, onClose }: { user: AdminUser; onConfirm: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(user.display_name || "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1E2026] border border-[#2B2F36] rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[#EAECEF]">Edit User</h3>
          <button onClick={onClose} className="text-[#848E9C] hover:text-[#EAECEF]"><X size={18} /></button>
        </div>
        <p className="text-sm text-[#848E9C] mb-4">Editing <span className="text-[#EAECEF] font-semibold">{user.email}</span></p>
        <label className="block text-xs font-semibold text-[#848E9C] uppercase tracking-wider mb-2">Display Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Display name..."
          className="w-full bg-[#181A20] border border-[#2B2F36] rounded-lg px-3 py-2.5 text-sm text-[#EAECEF] placeholder-[#848E9C] focus:outline-none focus:ring-1 focus:ring-[#F0B90B]/50" />
        <div className="flex gap-3 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold bg-[#2B2F36] text-[#EAECEF] hover:bg-[#2B2F36]/80 transition-all">Cancel</button>
          <button onClick={() => onConfirm(name)}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-[#F0B90B] text-[#1E2026] hover:bg-[#D0980B] transition-all flex items-center gap-1.5">
            <Check size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const fetchUsers = async () => {
    try { const data = await adminService.getUsers(0, 100); setUsers(data); }
    catch { toast.error("Failed to fetch users"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.display_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAction = async (action: string, user: AdminUser) => {
    try {
      switch (action) {
        case "promote": {
          const ok = await confirm({ title: "Promote User", message: `Promote ${user.email} to ADMIN role?`, confirmLabel: "Promote", variant: "warning" });
          if (!ok) return;
          await adminService.promoteUser(user.id);
          toast.success(`${user.email} promoted to Admin`);
          break;
        }
        case "demote": {
          const ok = await confirm({ title: "Demote User", message: `Demote ${user.email} to USER role?`, confirmLabel: "Demote", variant: "warning" });
          if (!ok) return;
          await adminService.demoteUser(user.id);
          toast.success(`${user.email} demoted to User`);
          break;
        }
        case "suspend":
          setSuspendTarget(user);
          return;
        case "unsuspend": {
          const ok = await confirm({ title: "Unsuspend User", message: `Restore access for ${user.email}?`, confirmLabel: "Unsuspend", variant: "info" });
          if (!ok) return;
          await adminService.unsuspendUser(user.id);
          toast.success(`${user.email} unsuspended`);
          break;
        }
        case "edit":
          setEditTarget(user);
          return;
        case "delete": {
          const ok = await confirm({
            title: "Permanently Delete User",
            message: `This will permanently remove ${user.email} and ALL associated data including accounts, sessions, and workspaces.\n\nThis action CANNOT be undone.`,
            confirmLabel: "Delete Permanently",
            variant: "danger",
          });
          if (!ok) return;
          await adminService.deleteUser(user.id);
          toast.success(`${user.email} permanently deleted`);
          break;
        }
      }
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    }
  };

  const handleSuspendConfirm = async (reason: string) => {
    if (!suspendTarget) return;
    try {
      await adminService.suspendUser(suspendTarget.id, reason);
      toast.success(`${suspendTarget.email} suspended`);
      setSuspendTarget(null);
      fetchUsers();
    } catch (e: any) { toast.error(e.message || "Suspend failed"); }
  };

  const handleEditConfirm = async (displayName: string) => {
    if (!editTarget) return;
    try {
      await adminService.updateUser(editTarget.id, { display_name: displayName });
      toast.success(`${editTarget.email} updated`);
      setEditTarget(null);
      fetchUsers();
    } catch (e: any) { toast.error(e.message || "Update failed"); }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#EAECEF] mb-1">User Management</h1>
          <p className="text-sm text-[#848E9C]">Manage users, roles, and access across the platform.</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#2B2F36] rounded-xl overflow-hidden border border-[#2B2F36]">
        <div className="p-4 border-b border-[#181A20] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#848E9C]" size={16} />
            <input type="text" placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="bg-[#181A20] border border-[#2B2F36] text-sm text-[#EAECEF] rounded-lg pl-9 pr-4 py-2.5 focus:ring-1 focus:ring-[#F0B90B]/50 focus:border-[#F0B90B]/50 focus:outline-none w-full sm:w-64 placeholder-[#848E9C] transition-all" />
          </div>
          <div className="text-xs text-[#848E9C] font-medium uppercase tracking-wider">
            {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-[#848E9C] text-sm">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-[#0B0E11] border-b border-[#181A20] text-[11px] uppercase tracking-wider text-[#848E9C] font-semibold">
                  <th className="p-4 font-semibold">User</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Plan</th>
                  <th className="p-4 font-semibold">Role</th>
                  <th className="p-4 font-semibold">TG Balance</th>
                  <th className="p-4 font-semibold">Joined</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-[#181A20]/60 transition-colors cursor-pointer" onClick={() => setViewUserId(user.id)}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#F0B90B]/10 flex items-center justify-center text-[#F0B90B] font-bold text-xs uppercase border border-[#F0B90B]/20">
                          {user.email.substring(0, 2)}
                        </div>
                        <div>
                          <div className="font-semibold text-[#EAECEF] text-sm">{user.display_name || user.email.split('@')[0]}</div>
                          <div className="text-[11px] text-[#848E9C]">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      {user.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#0ECB81]/10 text-[#0ECB81] border border-[#0ECB81]/20">Active</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F6465D]/10 text-[#F6465D] border border-[#F6465D]/20">Suspended</span>
                      )}
                    </td>
                    <td className="p-4">
                      {(() => {
                        const planId = (user as any).subscription?.plan_id || "free";
                        const planCfg: Record<string, { label: string; cls: string }> = {
                          free:  { label: "Free",  cls: "bg-[#2B2F36] text-[#848E9C] border-[#363A45]" },
                          pro:   { label: "Pro",   cls: "bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/30" },
                          elite: { label: "Elite", cls: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
                        };
                        const cfg = planCfg[planId] || planCfg.free;
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${cfg.cls}`}>
                            <Crown size={10} />{cfg.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="p-4">
                      {user.role === "SUPER_ADMIN" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0B90B]">
                          <Shield size={14} /> Super Admin
                        </span>
                      ) : user.role === "ADMIN" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0B90B]/70">
                          <Shield size={14} /> Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#848E9C]">
                          <Users size={14} /> User
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`text-sm font-semibold tabular-nums ${(user.twin_grid_balance || 0) >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
                        ${(user.twin_grid_balance || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-[#848E9C]">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                      <UserActionMenu user={user} onAction={handleAction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="p-10 text-center text-[#848E9C] text-sm">No users found.</div>
            )}
          </div>
        )}
      </div>

      {/* Suspend Modal */}
      {suspendTarget && <SuspendModal user={suspendTarget} onConfirm={handleSuspendConfirm} onClose={() => setSuspendTarget(null)} />}
      {/* Edit Modal */}
      {editTarget && <EditModal user={editTarget} onConfirm={handleEditConfirm} onClose={() => setEditTarget(null)} />}
      {viewUserId && <UserDetailModal userId={viewUserId} onClose={() => setViewUserId(null)} />}
      {ConfirmDialog}
    </div>
  );
}
