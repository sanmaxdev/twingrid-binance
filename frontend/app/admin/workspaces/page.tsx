"use client";

import { useEffect, useState } from "react";
import { adminService, AdminWorkspace } from "@/lib/services/admin";
import { toast } from "sonner";
import { Briefcase, Search, MoreHorizontal } from "lucide-react";

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const data = await adminService.getWorkspaces(0, 100); setWorkspaces(data); }
      catch { toast.error("Failed to fetch workspaces"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#EAECEF] mb-1">Workspace Management</h1>
          <p className="text-sm text-[#848E9C]">Monitor and manage all tenant workspaces across the system.</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#2B2F36] rounded-xl overflow-hidden border border-[#2B2F36]">
        <div className="p-4 border-b border-[#181A20] flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#848E9C]" size={16} />
            <input
              type="text"
              placeholder="Search workspaces..."
              className="bg-[#181A20] border border-[#2B2F36] text-sm text-[#EAECEF] rounded-lg pl-9 pr-4 py-2.5 focus:ring-1 focus:ring-[#F0B90B]/50 focus:border-[#F0B90B]/50 focus:outline-none w-64 placeholder-[#848E9C] transition-all"
            />
          </div>
          <div className="text-xs text-[#848E9C] font-medium uppercase tracking-wider">
            {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-[#848E9C] text-sm">Loading workspaces...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0B0E11] border-b border-[#181A20] text-[11px] uppercase tracking-wider text-[#848E9C] font-semibold">
                  <th className="p-4 font-semibold">Workspace Name</th>
                  <th className="p-4 font-semibold">Workspace ID</th>
                  <th className="p-4 font-semibold">Owner ID</th>
                  <th className="p-4 font-semibold">Created</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {workspaces.map((workspace) => (
                  <tr key={workspace.id} className="hover:bg-[#181A20]/60 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#F0B90B]/10 flex items-center justify-center text-[#F0B90B] border border-[#F0B90B]/20">
                          <Briefcase size={14} />
                        </div>
                        <div className="font-semibold text-[#EAECEF] text-sm">{workspace.name}</div>
                      </div>
                    </td>
                    <td className="p-4 text-xs text-[#848E9C] font-mono">{workspace.id}</td>
                    <td className="p-4 text-xs text-[#848E9C] font-mono">{workspace.owner_id}</td>
                    <td className="p-4 text-xs text-[#848E9C]">
                      {workspace.created_at ? new Date(workspace.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-4 text-right">
                      <button className="p-1.5 text-[#848E9C] hover:text-[#F0B90B] rounded-md hover:bg-[#181A20] transition-all">
                        <MoreHorizontal size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {workspaces.length === 0 && (
              <div className="p-10 text-center text-[#848E9C] text-sm">No workspaces found.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
