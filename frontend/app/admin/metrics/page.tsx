"use client";
import { useEffect, useState } from "react";
import { adminUsersService, type PlatformMetrics } from "@/lib/services/adminUsers";
import { toast } from "sonner";
import { RefreshCw, Users, Server, BarChart3, AlertTriangle, TrendingUp, Activity } from "lucide-react";

export default function AdminMetricsPage() {
  const [m, setM] = useState<PlatformMetrics|null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { setM(await adminUsersService.getMetrics()); } catch(e:any) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-[#F0B90B] rounded-full animate-pulse" />
        <span className="text-sm text-[#848E9C]">Loading metrics...</span>
      </div>
    </div>
  );
  if (!m) return <div className="text-center mt-10 text-[#848E9C]">Failed to load metrics</div>;

  const cards = [
    { icon: Users, label: "Total Users", value: m.users.total, sub: `${m.users.active_24h} active 24h` },
    { icon: Users, label: "Suspended", value: m.users.suspended },
    { icon: Server, label: "Total Accounts", value: m.accounts.total, sub: `${m.accounts.running} running` },
    { icon: BarChart3, label: "Total Baskets", value: m.baskets.total, sub: `${m.baskets.active} active` },
    { icon: TrendingUp, label: "Total Realized PnL", value: `$${m.pnl.total_realized.toFixed(2)}`, highlight: true },
    { icon: AlertTriangle, label: "Liquidations (30d)", value: m.baskets.liquidations_30d, danger: true },
    { icon: Activity, label: "Critical Events (24h)", value: m.system.critical_events_24h, danger: true },
  ];

  return (
    <div className="max-w-7xl mx-auto pb-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#EAECEF]">Platform Metrics</h1>
          <p className="text-sm text-[#848E9C] mt-1">Live platform-wide statistics</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold bg-[#2B2F36] text-[#EAECEF] hover:bg-[#2B2F36]/80 border border-[#2B2F36] transition-all">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {cards.map((c,i) => (
          <div key={i} className={`bg-[#2B2F36] rounded-xl p-5 border transition-all duration-200 ${
            c.danger ? 'border-[#F6465D]/20 hover:border-[#F6465D]/40' :
            c.highlight ? 'border-[#0ECB81]/20 hover:border-[#0ECB81]/40' :
            'border-[#2B2F36] hover:border-[#F0B90B]/20'
          }`}>
            <div className="flex items-center gap-2 text-[#848E9C] mb-3">
              <c.icon className={`h-4 w-4 ${c.danger ? 'text-[#F6465D]' : c.highlight ? 'text-[#0ECB81]' : 'text-[#F0B90B]'}`} />
              <span className="text-xs font-semibold uppercase tracking-wider">{c.label}</span>
            </div>
            <div className={`text-2xl font-semibold font-mono ${
              c.danger ? 'text-[#F6465D]' : c.highlight ? 'text-[#0ECB81]' : 'text-[#EAECEF]'
            }`}>{c.value}</div>
            {c.sub && <div className="text-[11px] text-[#848E9C] mt-1">{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Role Distribution */}
      <h2 className="text-base font-semibold text-[#EAECEF] mb-4">Role Distribution</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(m.users.by_role).map(([role, count]) => (
          <div key={role} className="bg-[#2B2F36] rounded-xl p-4 flex items-center justify-between border border-[#2B2F36]">
            <span className="text-sm text-[#848E9C] font-medium">{role}</span>
            <span className="text-xl font-semibold font-mono text-[#EAECEF]">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
