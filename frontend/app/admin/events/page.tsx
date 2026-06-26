"use client";
import { useEffect, useState } from "react";
import { adminUsersService, type AdminEvent } from "@/lib/services/adminUsers";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, Info, AlertCircle, Bug, Zap, Calendar, ChevronDown } from "lucide-react";

const sevIcon: Record<string, any> = { DEBUG: Bug, INFO: Info, WARN: AlertTriangle, ERROR: AlertCircle, CRITICAL: Zap };
const sevCls: Record<string, string> = {
  DEBUG: "text-[#848E9C] bg-[#181A20] border-[#2B2F36]",
  INFO: "text-[#F0B90B] bg-[#F0B90B]/5 border-[#F0B90B]/20",
  WARN: "text-[#F0B90B] bg-[#F0B90B]/10 border-[#F0B90B]/30",
  ERROR: "text-[#F6465D] bg-[#F6465D]/5 border-[#F6465D]/20",
  CRITICAL: "text-[#F6465D] bg-[#F6465D]/10 border-[#F6465D]/30",
};

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sevFilter, setSevFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminUsersService.getEvents({
        page,
        severity: sevFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setEvents(data.items);
      setTotal(data.total);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, sevFilter, startDate, endDate]);

  const clearDateFilter = () => {
    setStartDate("");
    setEndDate("");
    setShowDateFilter(false);
    setPage(1);
  };

  const hasDateFilter = startDate || endDate;

  return (
    <div className="max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#EAECEF]">System Events</h1>
          <p className="text-sm text-[#848E9C] mt-1">Real-time platform event feed</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold bg-[#2B2F36] text-[#EAECEF] hover:bg-[#2B2F36]/80 border border-[#2B2F36] transition-all">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Severity filters + date range */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {["", "DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"].map(s => (
          <button key={s} onClick={() => { setSevFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all border ${
              sevFilter === s ? "bg-[#F0B90B] text-[#1E2026] border-[#F0B90B]" : "bg-[#2B2F36] text-[#848E9C] border-[#2B2F36] hover:border-[#F0B90B]/30"
            }`}>
            {s || "All"}
          </button>
        ))}

        <div className="w-px h-6 bg-[#2B2F36] mx-1 hidden sm:block" />

        {/* Date range toggle */}
        <button
          onClick={() => setShowDateFilter(!showDateFilter)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-all ${
            hasDateFilter
              ? "bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/30"
              : "bg-[#2B2F36] text-[#848E9C] border-[#2B2F36] hover:border-[#F0B90B]/30"
          }`}
        >
          <Calendar className="h-3.5 w-3.5" />
          {hasDateFilter ? "Date Active" : "Date Range"}
          <ChevronDown className={`h-3 w-3 transition-transform ${showDateFilter ? "rotate-180" : ""}`} />
        </button>

        {hasDateFilter && (
          <button
            onClick={clearDateFilter}
            className="text-[11px] text-[#F6465D] hover:text-[#F6465D]/80 font-semibold transition-colors uppercase tracking-wider"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-xs text-[#848E9C] font-mono">
          {total} events
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

      {/* Events List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-12 text-center"><RefreshCw className="h-5 w-5 animate-spin mx-auto text-[#848E9C]" /></div>
        ) : events.length ? events.map(e => {
          const Icon = sevIcon[e.severity] || Info;
          return (
            <div key={e.id} className={`flex items-start gap-4 p-4 rounded-xl border ${sevCls[e.severity] || sevCls.INFO}`}>
              <Icon className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-sm">{e.title}</span>
                  <span className="text-[11px] opacity-60 font-mono">{e.type}</span>
                </div>
                {e.message && <p className="text-xs opacity-80 mb-1">{e.message}</p>}
                <div className="text-[11px] opacity-50">{e.occurred_at ? new Date(e.occurred_at).toLocaleString() : ""}</div>
              </div>
              <span className="text-[11px] font-mono opacity-50 shrink-0 uppercase tracking-wider">{e.severity}</span>
            </div>
          );
        }) : (
          <div className="py-12 text-center text-[#848E9C] text-sm">No events found.</div>
        )}
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
