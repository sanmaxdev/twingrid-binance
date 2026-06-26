"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { historyService, type BasketForensics } from "@/lib/services/history";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const fmt = (v: number|null|undefined) => v != null ? "$"+v.toFixed(4) : "\u2014";
const fmtUsd = (v: number|null|undefined) => v != null ? "$"+v.toFixed(2) : "\u2014";

const orderStatusCls: Record<string, string> = {
  NEW: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PARTIALLY_FILLED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  FILLED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  CANCELED: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
  EXPIRED: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  REJECTED: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const exitBannerConfig: Record<string, { icon: string; label: string; cls: string; msg: string }> = {
  TP_FILLED: {
    icon: "✅", label: "Take Profit Hit",
    cls: "bg-[#0ECB81]/8 border-[#0ECB81]/20 text-[#0ECB81]",
    msg: "This basket was closed automatically when the take-profit target was reached.",
  },
  MANUAL_CLOSE: {
    icon: "⚠️", label: "Closed on Binance",
    cls: "bg-[#F0B90B]/8 border-[#F0B90B]/20 text-[#F0B90B]",
    msg: "This position was closed directly on the Binance platform, not by Twin Grid. All orphan orders were automatically canceled.",
  },
  AGE_LIMIT: {
    icon: "⏰", label: "Age Limit Exceeded",
    cls: "bg-orange-500/8 border-orange-500/20 text-orange-400",
    msg: "This basket was force-closed because it exceeded the maximum age limit configured in your settings.",
  },
  RISK_STOP: {
    icon: "🛡️", label: "Risk Controller Stop",
    cls: "bg-[#F0B90B]/8 border-[#F0B90B]/20 text-[#F0B90B]",
    msg: "This basket was force-closed by the Risk Controller to prevent liquidation. The position exceeded your configured affordable loss threshold or the account margin usage triggered the Margin Guard.",
  },
  LIQUIDATION: {
    icon: "🚨", label: "Liquidation",
    cls: "bg-[#F6465D]/8 border-[#F6465D]/20 text-[#F6465D]",
    msg: "This position was liquidated by the exchange due to insufficient margin. Please review your leverage and risk settings.",
  },
  ADL: {
    icon: "⚡", label: "Auto-Deleveraging",
    cls: "bg-[#F6465D]/8 border-[#F6465D]/20 text-[#F6465D]",
    msg: "This position was closed by Binance's Auto-Deleveraging (ADL) system.",
  },
  reconciled_no_position: {
    icon: "🔄", label: "Reconciled",
    cls: "bg-[#363A45]/15 border-[#363A45]/30 text-[#848E9C]",
    msg: "This basket was detected as having no matching position on Binance during reconciliation.",
  },
};

export default function BasketForensicsPage() {
  const { id: accountId, basketId } = useParams() as { id: string; basketId: string };
  const [loading, setLoading] = useState(true);
  const [basket, setBasket] = useState<BasketForensics|null>(null);

  const load = async () => {
    setLoading(true);
    try { setBasket(await historyService.getBasketForensics(accountId, basketId)); }
    catch (e:any) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [accountId, basketId]);

  if (loading) return <div className="flex h-64 items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-[#848E9C]" /></div>;
  if (!basket) return <div className="text-center mt-10 text-[#848E9C]">Basket not found</div>;

  const b = basket;
  const bannerCfg = b.exit_reason ? exitBannerConfig[b.exit_reason] : null;

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <div className="flex items-center gap-4 mb-8">
        <Link href={`/dashboard/accounts/${accountId}/history`} className="text-[#848E9C] hover:text-[#F0B90B] transition-colors"><ArrowLeft className="h-6 w-6" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-[#EAECEF] flex items-center gap-3">{b.symbol}
            <span className={`text-sm px-2 py-0.5 rounded font-semibold ${b.side==="LONG"?"bg-[#0ECB81]/15 text-[#0ECB81]":"bg-[#F6465D]/15 text-[#F6465D]"}`}>{b.side}</span>
            <span className="text-sm px-2 py-0.5 rounded bg-[#2B2F36] text-[#848E9C] border border-[#2B2F36]">{b.status}</span>
          </h1>
          <p className="text-[#848E9C] text-sm mt-1">Basket Forensics — Order Timeline</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>

      {/* Exit Reason Banner */}
      {bannerCfg && (
        <div className={`mb-6 px-5 py-4 rounded-xl border ${bannerCfg.cls}`}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-lg">{bannerCfg.icon}</span>
            <span className="font-bold text-sm">{bannerCfg.label}</span>
          </div>
          <p className="text-xs opacity-80 leading-relaxed">{bannerCfg.msg}</p>
        </div>
      )}
      {b.exit_reason && !bannerCfg && (
        <div className="mb-6 px-5 py-4 bg-[#F0B90B]/8 border border-[#F0B90B]/20 rounded-xl text-[#F0B90B]">
          <div className="flex items-center gap-2 text-sm font-bold">⚠️ Exit: {b.exit_reason}</div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-8">
        {[
          { l: "BO Price", v: fmt(b.bo_price) },
          { l: "Avg Entry", v: fmt(b.avg_entry) },
          { l: "TP Price", v: fmt(b.tp_price) },
          { l: "Liq Price", v: fmt(b.liquidation_price) },
          { l: "Qty (USDT)", v: b.qty != null && b.avg_entry != null ? fmtUsd(b.qty * b.avg_entry) : "\u2014" },
          { l: "Leverage", v: b.leverage+"x" },
          { l: "SO Filled", v: String(b.sos_filled) },
          { l: "Realized PnL", v: fmt(b.realized_pnl), cls: (b.realized_pnl||0)>=0?"text-[#0ECB81]":"text-[#F6465D]" },
          { l: "Fees", v: b.fees_paid != null ? fmt(b.fees_paid) : "\u2014", cls: "text-[#F0B90B]" },
          { l: "Funding", v: b.funding_paid != null ? fmt(b.funding_paid) : "\u2014" },
          { l: "Exit Reason", v: b.exit_reason || "\u2014", cls: b.exit_reason === "MANUAL_CLOSE" || b.exit_reason === "RISK_STOP" ? "text-[#F0B90B]" : b.exit_reason === "LIQUIDATION" || b.exit_reason === "ADL" ? "text-[#F6465D]" : b.exit_reason === "TP_FILLED" ? "text-[#0ECB81]" : undefined },
          { l: "Duration", v: b.duration || "\u2014" },
        ].map((c,i) => (
          <Card key={i} className="bg-[#181A20] border-[#2B2F36]"><CardContent className="p-4">
            <div className="text-[10px] text-[#5E6673] uppercase tracking-wider mb-1.5">{c.l}</div>
            <div className={`text-lg font-bold font-mono truncate ${c.cls||"text-[#EAECEF]"}`}>{c.v}</div>
          </CardContent></Card>
        ))}
      </div>

      {/* Order Timeline */}
      <h2 className="text-lg font-bold text-[#EAECEF] mb-4 flex items-center gap-2"><Clock className="h-5 w-5 text-[#F0B90B]" />Order Timeline ({b.orders.length})</h2>
      <div className="bg-[#181A20] border border-[#2B2F36] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#0B0E11] text-[#5E6673] uppercase text-xs tracking-wider border-b border-[#2B2F36]">
              <tr>{["Role","Side","Type","Status","Notional","Price","Fill Notional","Avg Fill","Commission","Placed","Filled"].map(h=><th key={h} className="px-4 py-3 font-semibold text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[#2B2F36]/30">
              {b.orders.map(o=>(
                <tr key={o.id} className="hover:bg-[#1E2026]/60 transition-colors">
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-md text-xs font-bold ${o.role==="BO"?"bg-blue-500/15 text-blue-400":o.role==="TP"?"bg-[#0ECB81]/15 text-[#0ECB81]":"bg-[#F0B90B]/15 text-[#F0B90B]"}`}>{o.role}</span></td>
                  <td className={`px-4 py-3 font-bold ${o.side==="BUY"?"text-[#0ECB81]":"text-[#F6465D]"}`}>{o.side}</td>
                  <td className="px-4 py-3 text-[#EAECEF]">{o.type}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${orderStatusCls[o.status] || "bg-[#2B2F36] text-[#848E9C] border-[#2B2F36]"}`}>{o.status}</span></td>
                  <td className="px-4 py-3 font-mono text-[#EAECEF]">{o.qty != null && o.price != null ? fmtUsd(Number(o.qty) * Number(o.price)) : "\u2014"}</td>
                  <td className="px-4 py-3 font-mono text-[#EAECEF]">{o.price != null ? Number(o.price).toFixed(2) : "\u2014"}</td>
                  <td className="px-4 py-3 font-mono text-[#EAECEF]">{o.filled_qty != null && o.avg_fill_price != null ? fmtUsd(Number(o.filled_qty) * Number(o.avg_fill_price)) : "\u2014"}</td>
                  <td className="px-4 py-3 font-mono text-[#EAECEF]">{o.avg_fill_price != null ? Number(o.avg_fill_price).toFixed(2) : "\u2014"}</td>
                  <td className="px-4 py-3 font-mono text-[#F0B90B]">{o.commission != null ? fmt(o.commission) : "\u2014"}</td>
                  <td className="px-4 py-3 text-[#848E9C] text-xs whitespace-nowrap">{o.placed_at ? new Date(o.placed_at).toLocaleString() : "\u2014"}</td>
                  <td className="px-4 py-3 text-[#848E9C] text-xs whitespace-nowrap">{o.filled_at ? new Date(o.filled_at).toLocaleString() : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
