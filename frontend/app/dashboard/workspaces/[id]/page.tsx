"use client";

import { useEffect, useState, use } from "react";
import api from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";

export default function WorkspaceMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const { id: workspaceId } = unwrappedParams;

  const [members, setMembers] = useState<any[]>([]);
  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("VIEWER");
  const [error, setError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const loadData = async () => {
    try {
      const [wsRes, membersRes] = await Promise.all([
        api.get(`/workspaces/${workspaceId}`, { headers: { "x-workspace-id": workspaceId } }),
        api.get(`/workspaces/${workspaceId}/members`, { headers: { "x-workspace-id": workspaceId } })
      ]);
      setWorkspace(await wsRes.json());
      setMembers(await membersRes.json());
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInviteLoading(true);
    try {
      await api.post(`/workspaces/${workspaceId}/members`, {
        email: inviteEmail,
        role: inviteRole
      }, { headers: { "x-workspace-id": workspaceId } });
      setInviteEmail("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    const ok = await confirm({
      title: "Remove Member",
      message: "Are you sure you want to remove this member from the workspace?",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/workspaces/${workspaceId}/members/${userId}`, { headers: { "x-workspace-id": workspaceId } });
      await loadData();
      toast.success("Member removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!workspace) return <div>Workspace not found or access denied</div>;

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <Link href="/dashboard/workspaces" className="text-neutral-400 hover:text-white text-sm">
          ← Back to Workspaces
        </Link>
        <h1 className="text-3xl font-bold mt-4">{workspace.name}</h1>
        <p className="text-neutral-400 mt-1">Manage workspace settings and team members</p>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-neutral-800">
          <h2 className="text-xl font-semibold mb-4">Add Member</h2>
          <form onSubmit={handleInvite} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-400 mb-1">Email address</label>
              <input
                type="email"
                required
                className="w-full px-4 py-2 text-white bg-neutral-800 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-neutral-400 mb-1">Role</label>
              <select
                className="w-full px-4 py-2 text-white bg-neutral-800 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="VIEWER">Viewer</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviteLoading}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              Add Member
            </button>
          </form>
          {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
        </div>

        <div className="p-0">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-800/50 text-neutral-400 text-sm">
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Joined</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {members.map((m) => (
                <tr key={m.user_id} className="hover:bg-neutral-800/20">
                  <td className="px-6 py-4">
                    <div className="font-medium">{m.user_display_name || "Unknown"}</div>
                    <div className="text-sm text-neutral-400">{m.user_email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-neutral-800 rounded text-xs font-medium border border-neutral-700">
                      {m.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-400">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {m.role !== "OWNER" && (
                      <button
                        onClick={() => handleRemove(m.user_id)}
                        className="text-red-400 hover:text-red-300 text-sm font-medium transition"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
      {ConfirmDialog}
    </>  
  );
}
