"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { historyService, type HistoryBasket, type PnlSummary } from "@/lib/services/history";
import { accountsService } from "@/lib/services/accounts";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Download, TrendingUp, Award, BarChart3, Target, Filter, AlertTriangle, Zap, ShieldAlert } from "lucide-react";
import EquityChart from "../../components/EquityChart";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const fmt = (v: number | null) => v != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v) : "$0.00";

const statusCls: Record<string, string> = {
  OPEN: "bg-blue-500/15 text-[#F0B90B] border-blue-500/30",
  OPENING: "bg-amber-500/15 text-[#F0B90B] border-amber-500/30",
  CLOSED: "bg-emerald-500/15 text-[#0ECB81] border-emerald-500/30",
  LIQUIDATED: "bg-rose-500/15 text-[#F6465D] border-rose-500/30",
};

const exitReasonBadge = (reason: string | null) => {
  if (!reason) return <span className="text-[#363A45]">—</span>;
  const map: Record<string, { label: string; cls: string; icon?: string }> = {
    TP_FILLED: { label: "TP Hit", cls: "bg-[#0ECB81]/10 text-[#0ECB81] border-[#0ECB81]/25", icon: "✅" },
    MANUAL_CLOSE: { label: "Manual Close", cls: "bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/25", icon: "⚠️" },
    AGE_LIMIT: { label: "Age Limit", cls: "bg-orange-500/10 text-orange-400 border-orange-500/25", icon: "⏰" },
    RISK_STOP: { label: "Risk Stop", cls: "bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/25", icon: "🛡️" },
    LIQUIDATION: { label: "Liquidation", cls: "bg-[#F6465D]/10 text-[#F6465D] border-[#F6465D]/25", icon: "🚨" },
    ADL: { label: "ADL", cls: "bg-[#F6465D]/10 text-[#F6465D] border-[#F6465D]/25", icon: "⚡" },
    reconciled_no_position: { label: "Reconciled", cls: "bg-[#363A45]/20 text-[#848E9C] border-[#363A45]/40", icon: "🔄" },
  };
  const badge = map[reason] || { label: reason, cls: "bg-[#363A45]/20 text-[#848E9C] border-[#363A45]/40" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge.cls}`}>
      {badge.icon && <span>{badge.icon}</span>}{badge.label}
    </span>
  );
};

export default function AccountHistoryPage() {
  const { id: accountId } = useParams() as { id: string };
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<any>(null);
  const [baskets, setBaskets] = useState<HistoryBasket[]>([]);
  const [pnl, setPnl] = useState<PnlSummary | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusF, setStatusF] = useState("");
  const [sideF, setSideF] = useState("");
  const [exitF, setExitF] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b, p] = await Promise.all([
        accountsService.getAccount(accountId),
        historyService.listBaskets(accountId, { page, per_page: 15, status: statusF || undefined, side: sideF || undefined, exit_reason: exitF || undefined }),
        historyService.getPnlSummary(accountId),
      ]);
      setAccount(a); setBaskets(b.items); setTotal(b.total); setPnl(p);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  }, [accountId, page, statusF, sideF, exitF]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    try {
      const blob = await historyService.exportCsv(accountId);
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `export_${accountId}.csv`; a.click();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/accounts/${accountId}`} className="text-[#848E9C] hover:text-[#F0B90B] shrink-0"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0"><h1 className="text-xl sm:text-2xl font-bold text-[#EAECEF] mb-0.5 truncate">{account?.name} — History</h1><p className="text-sm text-[#848E9C]">Basket history & PnL analytics</p></div>
        </div>
        <div className="flex gap-2 sm:ml-auto shrink-0">
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#2B2F36] text-[#EAECEF] border border-[#2B2F36] hover:border-[#F0B90B]/30 transition-all"><Download className="h-3 w-3" />CSV</button>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#2B2F36] text-[#EAECEF] border border-[#2B2F36] hover:border-[#F0B90B]/30 transition-all"><RefreshCw className="h-3 w-3" /></button>
        </div>
      </div>
      {pnl && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-8">
          {[
            { icon: TrendingUp, label: "Net PnL", value: (pnl.net_pnl > 0 ? "+" : "") + fmt(pnl.net_pnl), cls: pnl.net_pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]" },
            { icon: Award, label: "Win Rate", value: pnl.win_rate + "%", cls: "text-[#EAECEF]", sub: `${pnl.winning_baskets}/${pnl.closed_baskets}` },
            { icon: BarChart3, label: "Total Fees", value: fmt(pnl.total_fees_paid), cls: "text-[#F0B90B]" },
            { icon: Target, label: "Baskets", value: String(pnl.total_baskets), cls: "text-[#EAECEF]", sub: `${pnl.total_baskets - pnl.closed_baskets} active${(pnl.error_baskets || 0) > 0 ? ` · ${pnl.error_baskets} errors` : ''}` },
            { icon: AlertTriangle, label: "Manual Close", value: String(pnl.manual_close_count || 0), cls: pnl.manual_close_count > 0 ? "text-[#F0B90B]" : "text-[#363A45]" },
            { icon: ShieldAlert, label: "Risk Stops", value: String(pnl.risk_stop_count || 0), cls: pnl.risk_stop_count > 0 ? "text-[#F0B90B]" : "text-[#363A45]" },
            { icon: Zap, label: "Liquidations", value: String(pnl.liquidation_count || 0), cls: pnl.liquidation_count > 0 ? "text-[#F6465D]" : "text-[#363A45]" },
          ].map((c, i) => (
            <Card key={i} className="bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border-[#2B2F36] shadow-xl">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-[#848E9C] mb-3"><c.icon className="h-4 w-4" /><span className="text-xs uppercase tracking-wider">{c.label}</span></div>
                <div className={`text-2xl font-bold font-mono ${c.cls}`}>{c.value}</div>
                {c.sub && <div className="text-xs text-[#848E9C] mt-1">{c.sub}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <div className="mb-8">
        <EquityChart accountId={accountId} />
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Filter className="h-4 w-4 text-[#848E9C]" />
        <select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }} className="bg-[#2B2F36] border border-[#2B2F36] rounded-lg px-3 py-1.5 text-sm text-[#EAECEF] focus:border-[#F0B90B]/30 focus:outline-none transition-all">
          <option value="">All Status</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="ERROR">Error</option><option value="LIQUIDATED">Liquidated</option>
        </select>
        <select value={sideF} onChange={e => { setSideF(e.target.value); setPage(1); }} className="bg-[#2B2F36] border border-[#2B2F36] rounded-lg px-3 py-1.5 text-sm text-[#EAECEF] focus:border-[#F0B90B]/30 focus:outline-none transition-all">
          <option value="">All Sides</option><option value="LONG">Long</option><option value="SHORT">Short</option>
        </select>
        <select value={exitF} onChange={e => { setExitF(e.target.value); setPage(1); }} className="bg-[#2B2F36] border border-[#2B2F36] rounded-lg px-3 py-1.5 text-sm text-[#EAECEF] focus:border-[#F0B90B]/30 focus:outline-none transition-all">
          <option value="">All Exit Reasons</option>
          <option value="TP_FILLED">✅ TP Hit</option>
          <option value="MANUAL_CLOSE">⚠️ Manual Close</option>
          <option value="AGE_LIMIT">⏰ Age Limit</option>
          <option value="RISK_STOP">🛡️ Risk Stop</option>
          <option value="LIQUIDATION">🚨 Liquidation</option>
          <option value="ADL">⚡ ADL</option>
          <option value="reconciled_no_position">🔄 Reconciled</option>
        </select>
        <span className="text-xs text-[#848E9C] ml-auto">{total} baskets</span>
      </div>
      <div className="bg-[#181A20] border border-[#2B2F36] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[1100px]">
            <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-xs tracking-wider border-b border-[#2B2F36]">
              <tr>{["Bucket ID","Symbol","Side","Status","Exit Reason","Lev","Entry","TP","SO#","Margin","Fees","PnL","Duration","Opened"].map(h=><th key={h} className={`px-4 py-4 font-semibold ${h==="PnL"?"text-right":""}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[#181A20]">
              {loading ? <tr><td colSpan={14} className="py-12 text-center"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-[#848E9C]" /></td></tr>
              : baskets.length ? baskets.map(b=>(
                <tr key={b.id} className="hover:bg-[#1E2026]/60 cursor-pointer transition-colors" onClick={()=>router.push(`/dashboard/accounts/${accountId}/history/${b.id}`)}>
                  <td className="px-4 py-4 font-mono text-xs text-[#848E9C]">#{b.id.split('-')[0].toUpperCase()}</td>
                  <td className="px-4 py-4 font-medium text-[#EAECEF]">{b.symbol}</td>
                  <td className={`px-4 py-4 font-bold ${b.side==="LONG"?"text-[#0ECB81]":"text-[#F6465D]"}`}>{b.side}</td>
                  <td className="px-4 py-4"><span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${statusCls[b.status]||"bg-[#181A20] text-[#848E9C] border-[#2B2F36]"}`}>{b.status}</span></td>
                  <td className="px-4 py-4">{exitReasonBadge(b.exit_reason)}</td>
                  <td className="px-4 py-4 text-[#EAECEF] font-mono text-xs">{b.leverage}x</td>
                  <td className="px-4 py-4 text-[#EAECEF] font-mono text-xs">{b.avg_entry != null ? b.avg_entry.toFixed(2) : "—"}</td>
                  <td className="px-4 py-4 text-[#EAECEF] font-mono text-xs">{b.tp_price != null ? b.tp_price.toFixed(2) : "—"}</td>
                  <td className="px-4 py-4 text-[#EAECEF]">{b.sos_filled}</td>
                  <td className="px-4 py-4 text-[#EAECEF] font-mono text-xs">{b.bo_margin != null ? fmt(b.bo_margin) : "—"}</td>
                  <td className="px-4 py-4 text-[#F0B90B] font-mono text-xs">{b.fees_paid != null ? fmt(b.fees_paid) : "—"}</td>
                  <td className={`px-4 py-4 text-right font-bold font-mono ${(b.realized_pnl||0)>=0?"text-[#0ECB81]":"text-[#F6465D]"}`}>{b.realized_pnl != null ? fmt(b.realized_pnl) : "—"}</td>
                  <td className="px-4 py-4 text-[#848E9C] text-xs whitespace-nowrap">{b.duration || "—"}</td>
                  <td className="px-4 py-4 text-[#848E9C] text-xs whitespace-nowrap">{b.opened_at ? new Date(b.opened_at).toLocaleDateString() : "—"}</td>
                </tr>
              )) : <tr><td colSpan={14} className="py-12 text-center text-[#848E9C]">No baskets found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {total > 15 && <div className="flex justify-center gap-3 mt-6">
        <Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</Button>
        <span className="text-[#848E9C] text-sm flex items-center">Page {page}/{Math.ceil(total/15)}</span>
        <Button variant="outline" size="sm" disabled={page*15>=total} onClick={()=>setPage(p=>p+1)}>Next</Button>
      </div>}
    </div>
  );
}
