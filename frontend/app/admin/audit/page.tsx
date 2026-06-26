"use client";
import { useEffect, useState } from "react";
import { adminUsersService, type AuditLogEntry } from "@/lib/services/adminUsers";
import { toast } from "sonner";
import { RefreshCw, Shield, Calendar, ChevronDown, User, Monitor } from "lucide-react";

// Action badge color map
const actionColors: Record<string, { bg: string; text: string; border: string }> = {
  LOGIN_SUCCESS: { bg: "bg-[#0ECB81]/10", text: "text-[#0ECB81]", border: "border-[#0ECB81]/20" },
  LOGIN_FAILED: { bg: "bg-[#F6465D]/10", text: "text-[#F6465D]", border: "border-[#F6465D]/20" },
  LOGOUT: { bg: "bg-[#848E9C]/10", text: "text-[#848E9C]", border: "border-[#848E9C]/20" },
  PASSWORD_CHANGE: { bg: "bg-[#F0B90B]/10", text: "text-[#F0B90B]", border: "border-[#F0B90B]/20" },
  ACCOUNT_SUSPENDED: { bg: "bg-[#F6465D]/10", text: "text-[#F6465D]", border: "border-[#F6465D]/20" },
  ACCOUNT_UNSUSPENDED: { bg: "bg-[#0ECB81]/10", text: "text-[#0ECB81]", border: "border-[#0ECB81]/20" },
  ROLE_CHANGED: { bg: "bg-[#F0B90B]/10", text: "text-[#F0B90B]", border: "border-[#F0B90B]/20" },
  API_KEY_CREATED: { bg: "bg-[#3B82F6]/10", text: "text-[#3B82F6]", border: "border-[#3B82F6]/20" },
  API_KEY_DELETED: { bg: "bg-[#F6465D]/10", text: "text-[#F6465D]", border: "border-[#F6465D]/20" },
};

const defaultColor = { bg: "bg-[#F0B90B]/10", text: "text-[#F0B90B]", border: "border-[#F0B90B]/20" };

function getActionColor(action: string) {
  return actionColors[action] || defaultColor;
}

// Format action name for display
function formatAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionF, setActionF] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await adminUsersService.getAuditLog({
        page,
        action: actionF || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setEntries(d.items);
      setTotal(d.total);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, actionF, startDate, endDate]);

  const clearDateFilter = () => {
    setStartDate("");
    setEndDate("");
    setShowDateFilter(false);
    setPage(1);
  };

  const hasDateFilter = startDate || endDate;

  return (
    <div className="max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#EAECEF] flex items-center gap-3">
            <Shield className="h-6 w-6 text-[#F0B90B]" /> Audit Log
          </h1>
          <p className="text-sm text-[#848E9C] mt-1">Cross-user security audit trail</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold bg-[#2B2F36] text-[#EAECEF] hover:bg-[#2B2F36]/80 border border-[#2B2F36] transition-all">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Filter by action..."
          value={actionF}
          onChange={e => { setActionF(e.target.value); setPage(1); }}
          className="bg-[#181A20] border border-[#2B2F36] rounded-lg px-3 py-2.5 text-sm text-[#EAECEF] w-64 focus:outline-none focus:ring-1 focus:ring-[#F0B90B]/50 focus:border-[#F0B90B]/50 placeholder-[#848E9C] transition-all"
        />

        {/* Date range toggle */}
        <button
          onClick={() => setShowDateFilter(!showDateFilter)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${
            hasDateFilter
              ? "bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/30"
              : "bg-[#181A20] text-[#848E9C] border-[#2B2F36] hover:border-[#F0B90B]/30"
          }`}
        >
          <Calendar className="h-4 w-4" />
          {hasDateFilter ? "Date Filter Active" : "Date Range"}
          <ChevronDown className={`h-3 w-3 transition-transform ${showDateFilter ? "rotate-180" : ""}`} />
        </button>

        {hasDateFilter && (
          <button
            onClick={clearDateFilter}
            className="text-xs text-[#F6465D] hover:text-[#F6465D]/80 font-medium transition-colors"
          >
            Clear dates
          </button>
        )}

        <span className="ml-auto text-xs text-[#848E9C] font-mono">
          {total} total entries
        </span>
      </div>

      {/* Date range inputs */}
      {showDateFilter && (
        <div className="mb-5 flex items-center gap-3 p-4 bg-[#181A20] border border-[#2B2F36] rounded-xl">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#848E9C] font-semibold uppercase tracking-wider whitespace-nowrap">From</label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setPage(1); }}
              className="bg-[#2B2F36] border border-[#363A45] rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:ring-1 focus:ring-[#F0B90B]/50 [color-scheme:dark]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#848E9C] font-semibold uppercase tracking-wider whitespace-nowrap">To</label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setPage(1); }}
              className="bg-[#2B2F36] border border-[#363A45] rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:ring-1 focus:ring-[#F0B90B]/50 [color-scheme:dark]"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-[#2B2F36] rounded-xl overflow-hidden border border-[#2B2F36]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-[11px] tracking-wider border-b border-[#181A20]">
              <tr>
                {["Action", "Actor", "Target", "IP Address", "Time", ""].map(h => (
                  <th key={h} className="px-5 py-3.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#181A20]">
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center"><RefreshCw className="h-5 w-5 animate-spin mx-auto text-[#848E9C]" /></td></tr>
              ) : entries.length ? entries.map((e) => {
                const actionColor = getActionColor(e.action);
                const isExpanded = expandedRow === e.id;

                return (
                  <tr
                    key={e.id}
                    className={`hover:bg-[#181A20]/60 transition-colors cursor-pointer ${isExpanded ? "bg-[#181A20]/40" : ""}`}
                    onClick={() => setExpandedRow(isExpanded ? null : e.id)}
                  >
                    {/* Action */}
                    <td className="px-5 py-3.5">
                      <span className={`${actionColor.bg} ${actionColor.text} border ${actionColor.border} px-2.5 py-1 rounded-md text-[11px] font-semibold inline-block`}>
                        {e.action}
                      </span>
                    </td>

                    {/* Actor */}
                    <td className="px-5 py-3.5">
                      {e.actor_email ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#F0B90B]/10 flex items-center justify-center text-[#F0B90B] text-[9px] font-bold uppercase border border-[#F0B90B]/20 shrink-0">
                            {e.actor_email.substring(0, 2)}
                          </div>
                          <div className="min-w-0">
                            {e.actor_name && <div className="text-[#EAECEF] text-xs font-semibold truncate">{e.actor_name}</div>}
                            <div className="text-[#848E9C] text-[11px] truncate">{e.actor_email}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#848E9C] text-[11px] flex items-center gap-1.5">
                          <Monitor className="h-3 w-3" /> System
                        </span>
                      )}
                    </td>

                    {/* Target */}
                    <td className="px-5 py-3.5">
                      {e.target_email ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#848E9C]/10 flex items-center justify-center text-[#848E9C] text-[9px] font-bold uppercase border border-[#848E9C]/20 shrink-0">
                            {e.target_email.substring(0, 2)}
                          </div>
                          <div className="min-w-0">
                            {e.target_name && <div className="text-[#EAECEF] text-xs font-semibold truncate">{e.target_name}</div>}
                            <div className="text-[#848E9C] text-[11px] truncate">{e.target_email}</div>
                          </div>
                        </div>
                      ) : e.target_account_id ? (
                        <span className="text-[#848E9C] text-[11px] font-mono">Account: {e.target_account_id.slice(0, 8)}…</span>
                      ) : (
                        <span className="text-[#848E9C]/40 text-[11px]">—</span>
                      )}
                    </td>

                    {/* IP */}
                    <td className="px-5 py-3.5">
                      <span className="text-[#848E9C] text-[11px] font-mono">{e.ip_address || "—"}</span>
                    </td>

                    {/* Time */}
                    <td className="px-5 py-3.5">
                      {e.occurred_at ? (
                        <div>
                          <div className="text-[#EAECEF] text-[11px]">{new Date(e.occurred_at).toLocaleDateString()}</div>
                          <div className="text-[#848E9C] text-[10px]">{new Date(e.occurred_at).toLocaleTimeString()}</div>
                        </div>
                      ) : (
                        <span className="text-[#848E9C]/40 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Impersonating badge */}
                    <td className="px-5 py-3.5">
                      {e.impersonating ? (
                        <span className="bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                          Impersonating
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6} className="py-12 text-center text-[#848E9C] text-sm">No audit entries found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex justify-center items-center gap-3 mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-[#2B2F36] text-[#EAECEF] border border-[#2B2F36] disabled:opacity-30 transition-all hover:bg-[#363A45]"
          >
            Previous
          </button>
          <span className="text-[#848E9C] text-sm flex items-center font-mono">
            Page {page}/{Math.ceil(total / 50)}
          </span>
          <button
            disabled={page * 50 >= total}
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-[#2B2F36] text-[#EAECEF] border border-[#2B2F36] disabled:opacity-30 transition-all hover:bg-[#363A45]"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
