"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, ArrowLeft, TrendingUp, TrendingDown, Target, Activity, DollarSign,
  Shield, Zap, BarChart3, Trash2, ChevronLeft, ChevronRight, Eye, Calendar,
  FlaskConical, Filter, FileDown,
} from "lucide-react";
import { adminService } from "@/lib/services/admin";
import { exportPDF } from "../exportReport";
import dynamic from "next/dynamic";

const BacktestChart = dynamic(() => import("@/components/BacktestChart"), { ssr: false });

const SYMBOLS = [
  { value: "", label: "All", icon: "🔘" },
  { value: "BTCUSDT", label: "BTC", icon: "₿" },
  { value: "ETHUSDT", label: "ETH", icon: "Ξ" },
  { value: "SOLUSDT", label: "SOL", icon: "◎" },
  { value: "XRPUSDT", label: "XRP", icon: "✕" },
];

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return "—"; }
};

function StatPill({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center px-2 py-1">
      <span className="text-[9px] text-[#848E9C] uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-bold font-mono ${color}`}>{value}</span>
    </div>
  );
}

export default function BacktestHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewData, setViewData] = useState<any>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const fetchHistory = async (p: number, sym: string) => {
    setLoading(true);
    try {
      const res = await adminService.getBacktestHistory(p, 15, sym || undefined);
      setData(res);
    } catch (err: any) {
      toast.error(err.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(page, symbolFilter); }, [page, symbolFilter]);

  const handleDelete = async (id: string) => {
    if (deleting) return;
    setDeleting(id);
    try {
      await adminService.deleteBacktest(id);
      toast.success("Backtest deleted");
      fetchHistory(page, symbolFilter);
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleView = async (id: string) => {
    setViewingId(id);
    setViewLoading(true);
    try {
      const res = await adminService.getBacktestDetail(id);
      setViewData(res);
    } catch (err: any) {
      toast.error(err.message || "Failed to load details");
      setViewingId(null);
    } finally {
      setViewLoading(false);
    }
  };

  const items = data?.items || [];
  const totalPages = data?.total_pages || 1;
  const total = data?.total || 0;

  // ── Detail Modal ──
  if (viewingId && viewData) {
    const fr = viewData.full_result;
    const s = fr?.summary || {};
    const cfg = viewData.config || {};
    return (
      <div className="max-w-7xl mx-auto">
        <button onClick={() => { setViewingId(null); setViewData(null); }}
          className="flex items-center gap-2 text-sm text-[#848E9C] hover:text-[#EAECEF] mb-4 transition-colors">
          <ArrowLeft size={16} /> Back to History
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-[#F0B90B]" />
              {viewData.symbol} — {viewData.period_days}D Backtest
            </h1>
            <p className="text-sm text-[#848E9C] mt-1">
              {fmtDate(viewData.created_at)} · ${viewData.initial_capital} capital · {cfg.leverage || 10}x
              {viewData.label && <span className="ml-2 text-[#F0B90B]">"{viewData.label}"</span>}
            </p>
          </div>
          <button
            onClick={() => exportPDF(fr, cfg)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#2B2F36] hover:bg-[#F0B90B]/10 border border-[#2B2F36] hover:border-[#F0B90B]/30 text-[#848E9C] hover:text-[#F0B90B] rounded-xl text-sm font-bold transition-all"
          >
            <FileDown size={16} /> Export PDF
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          {[
            { l: "Trades", v: `${s.total_trades}`, icon: Activity, c: "text-blue-400", sub: `${s.winning_trades}W / ${s.losing_trades}L` },
            { l: "Win Rate", v: `${s.win_rate}%`, icon: Target, c: s.win_rate >= 60 ? "text-emerald-400" : s.win_rate >= 45 ? "text-amber-400" : "text-[#F0B90B]" },
            { l: "Total PnL", v: `$${(s.total_pnl || 0).toFixed(2)}`, icon: DollarSign, c: s.total_pnl >= 0 ? "text-emerald-400" : "text-[#F6465D]", sub: `${s.total_pnl_pct >= 0 ? "+" : ""}${s.total_pnl_pct}%` },
            { l: "Max DD", v: `${s.max_drawdown_pct}%`, icon: TrendingDown, c: s.max_drawdown_pct <= 5 ? "text-emerald-400" : s.max_drawdown_pct <= 15 ? "text-amber-400" : "text-[#F6465D]" },
            { l: "Sharpe", v: `${s.sharpe_ratio}`, icon: Zap, c: s.sharpe_ratio >= 1.5 ? "text-emerald-400" : s.sharpe_ratio >= 0.5 ? "text-amber-400" : "text-[#F0B90B]" },
            { l: "Profit Factor", v: `${s.profit_factor}`, icon: Shield, c: s.profit_factor >= 2 ? "text-emerald-400" : s.profit_factor >= 1 ? "text-amber-400" : "text-[#F0B90B]" },
          ].map((stat, i) => (
            <div key={i} className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl p-4 hover:border-[#F0B90B]/20 transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg bg-[#181A20] ${stat.c}`}><stat.icon size={16} /></div>
                <span className="text-xs font-semibold text-[#848E9C] uppercase tracking-wider">{stat.l}</span>
              </div>
              <div className={`text-xl font-bold ${stat.c}`}>{stat.v}</div>
              {stat.sub && <div className="text-xs text-[#848E9C] mt-0.5">{stat.sub}</div>}
            </div>
          ))}
        </div>

        {/* Capital Row */}
        <div className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl p-4 flex flex-wrap items-center gap-6 mb-6">
          <div><span className="text-xs text-[#848E9C]">Initial</span><div className="text-lg font-bold text-white">${s.initial_capital?.toFixed(2)}</div></div>
          <div className="text-[#848E9C] text-xl hidden sm:block">→</div>
          <div><span className="text-xs text-[#848E9C]">Final</span>
            <div className={`text-lg font-bold ${s.final_capital >= s.initial_capital ? "text-emerald-400" : "text-[#F6465D]"}`}>${s.final_capital?.toFixed(2)}</div>
          </div>
          <div className="ml-auto flex flex-wrap gap-4">
            <div><span className="text-xs text-[#848E9C]">Trading Fees</span><div className="text-sm font-semibold text-amber-400">-${(s.total_trading_fees || 0).toFixed(2)}</div></div>
            <div><span className="text-xs text-[#848E9C]">Funding Paid</span><div className="text-sm font-semibold text-orange-400">-${(s.total_funding_paid || 0).toFixed(2)}</div></div>
            <div><span className="text-xs text-[#848E9C]">Funding Rcvd</span><div className="text-sm font-semibold text-emerald-400">+${(s.total_funding_received || 0).toFixed(2)}</div></div>
            <div className="border-l border-[#2B2F36] pl-4"><span className="text-xs text-[#848E9C]">Total Cost</span><div className="text-sm font-bold text-amber-400">-${(s.total_fees_paid || 0).toFixed(2)}</div></div>
            {s.liquidated && <div className="px-3 py-1 bg-[#F6465D]/10 border border-[#F6465D]/30 rounded-lg text-sm font-bold text-[#F6465D]">LIQUIDATED</div>}
          </div>
        </div>

        {/* Trend Filter Banner */}
        {s.trend_filter_enabled && (
          <div className="bg-[#F0B90B]/5 border border-[#F0B90B]/20 rounded-xl p-4 flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="text-[#F0B90B] text-sm">📊</span>
              <div>
                <span className="text-xs font-bold text-[#F0B90B]">Trend Filter Active</span>
                <p className="text-[11px] text-[#848E9C] mt-0.5">
                  {s.trend_blocked_count > 0 ? `Blocked ${s.trend_blocked_count} counter-trend signals.` : 'All entries aligned with trend.'}
                </p>
              </div>
            </div>
            <div className="text-lg font-bold font-mono text-[#F0B90B] px-3 py-1 rounded-lg bg-[#F0B90B]/10">{s.trend_blocked_count}</div>
          </div>
        )}

        {/* Config Summary */}
        <div className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl p-5 mb-6">
          <h3 className="text-sm font-bold text-[#EAECEF] mb-3">Configuration Used</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 text-[11px]">
            {(() => {
              const rcOn = cfg.risk_controller_enabled === true;
              const lossMode = cfg.rc_loss_mode === "fixed_usd"
                ? `$${cfg.rc_max_basket_loss_usd ?? 50} Fixed`
                : `${cfg.rc_max_basket_loss_pct ?? 10}% Wallet`;
              const exitDir = cfg.rc_loss_direction === "recovers_to" ? "↩️ Recovers To" : "⛔ Exceeds";
              const marginGuardOn = cfg.rc_margin_guard_enabled !== false; // default true
              const marginGuard = marginGuardOn ? `ON · ${cfg.rc_margin_usage_pct ?? 80}%` : "OFF";

              const rows: [string, React.ReactNode, string?][] = [
                ["Symbol", cfg.symbol],
                ["Period", `${viewData.period_days}D`],
                ["Capital", `$${viewData.initial_capital}`],
                ["Leverage", `${cfg.leverage}x`],
                ["Sizing", cfg.sizing_mode === "fixed_usd" ? `$${cfg.base_order_usd} Fixed` : `${cfg.base_order_pct}% Cap`],
                ["Max SOs", cfg.max_safety_orders],
                ["Take Profit", cfg.tp_mode === "fixed" ? `$${cfg.tp_fixed_amount}` : `${cfg.take_profit_pct}%`],
                ["Vol Scale", `${cfg.volume_scale}x`],
                ["Step Scale", `${cfg.step_scale}x`],
                ["ATR Multi", cfg.atr_multiplier],
                ["Step Range", `${cfg.step_min_pct}–${cfg.step_max_pct}%`],
                ["Threshold", cfg.signal_threshold],
                ["RSI L/S", `<${cfg.rsi_long_threshold} / >${cfg.rsi_short_threshold}`],
                ["Compounding", cfg.compounding_enabled ? `${cfg.compounding_pct}%` : "Off"],
                ["Directions", `${cfg.allow_long !== false ? "✓L" : "✗L"} / ${cfg.allow_short !== false ? "✓S" : "✗S"}`],
                ["Fees (M/T)", `${((cfg.maker_fee || 0.0002) * 100).toFixed(2)}/${((cfg.taker_fee || 0.0004) * 100).toFixed(2)}%`],
                ["Max Age", cfg.max_basket_age_hours ? `${cfg.max_basket_age_hours}h` : "Off"],
                // ── Risk Controller ──
                ["Risk Ctrl", rcOn ? `ON · SO≥${cfg.rc_max_so_trigger ?? 5}` : "Off", rcOn ? "text-[#F0B90B]" : undefined],
                ...(rcOn ? [
                  ["Loss Mode", lossMode] as [string, React.ReactNode, string?],
                  ["Exit Dir", exitDir] as [string, React.ReactNode, string?],
                  ["Margin Guard", marginGuard, !marginGuardOn ? "text-[#F6465D]/80" : "text-[#0ECB81]"] as [string, React.ReactNode, string?],
                ] : []),
                ["Trend", cfg.trend_filter_enabled ? `ON (${(cfg.trend_timeframes || []).join(", ")})` : "Off"],
                ...(cfg.trend_filter_enabled ? [
                  ["Trend Mode", cfg.trend_mode || "majority"] as [string, React.ReactNode, string?],
                  ["Trend EMA", `${cfg.trend_ema_fast || 9}/${cfg.trend_ema_slow || 21}`] as [string, React.ReactNode, string?],
                ] : []),
              ];

              return rows.map(([k, v, vc], i) => (
                <div key={i} className="flex justify-between py-1 px-2 bg-[#181A20] rounded-lg">
                  <span className="text-[#848E9C]">{k}</span>
                  <span className={`font-mono font-medium ${vc || "text-[#EAECEF]"}`}>{v}</span>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Chart Simulation (if data exists) */}
        {fr?.price_data?.length > 0 && (
          <div className="mb-6">
            <BacktestChart
              priceData={fr.price_data}
              equityCurve={fr.equity_curve || []}
              tradeEvents={fr.trade_events || []}
              trades={fr.trades || []}
              symbol={viewData.symbol}
            />
          </div>
        )}

        {/* Trades Table */}
        {fr?.trades && fr.trades.length > 0 && (
          <div className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#2B2F36]">
              <h3 className="text-sm font-bold text-[#EAECEF]">Trade History ({fr.trades.length})</h3>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0B0E11]/95 backdrop-blur z-10">
                  <tr className="text-[#848E9C] text-[10px] uppercase tracking-wider">
                    <th className="px-3 py-2.5 text-left">#</th>
                    <th className="px-3 py-2.5 text-left">Side</th>
                    <th className="px-3 py-2.5 text-left">Entry</th>
                    <th className="px-3 py-2.5 text-left">Exit</th>
                    <th className="px-3 py-2.5 text-center">Dur.</th>
                    <th className="px-3 py-2.5 text-right">Entry $</th>
                    <th className="px-3 py-2.5 text-right">Exit $</th>
                    <th className="px-3 py-2.5 text-right">Margin</th>
                    <th className="px-3 py-2.5 text-right">PnL</th>
                    <th className="px-3 py-2.5 text-right">PnL%</th>
                    <th className="px-3 py-2.5 text-center">SOs</th>
                    <th className="px-3 py-2.5 text-left">Exit</th>
                  </tr>
                </thead>
                <tbody>
                  {fr.trades.map((t: any) => {
                    const isOpen = t.exit_reason === "END_OF_DATA";
                    return (
                    <tr key={t.id} className={`border-t border-[#2B2F36]/50 ${isOpen ? 'opacity-50' : 'hover:bg-[#181A20]/30'}`}>
                      <td className="px-3 py-2 text-[#848E9C] font-mono text-xs">{t.id}</td>
                      <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.side === "LONG" ? "bg-emerald-500/10 text-emerald-400" : "bg-[#F6465D]/10 text-[#F6465D]"}`}>{t.side}</span></td>
                      <td className="px-3 py-2 text-[11px] text-[#848E9C] whitespace-nowrap">{fmtDate(t.entry_time)}</td>
                      <td className="px-3 py-2 text-[11px] text-[#848E9C] whitespace-nowrap">{fmtDate(t.exit_time)}</td>
                      <td className="px-3 py-2 text-center text-[10px] text-[#848E9C]">{t.duration || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-[#EAECEF]">${t.entry_price}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-[#EAECEF]">${t.exit_price}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-blue-400">${(t.margin || 0).toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${isOpen ? 'text-[#848E9C]' : t.pnl >= 0 ? 'text-emerald-400' : 'text-[#F6465D]'}`}>
                        {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(4)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono text-xs ${(t.pnl_pct || 0) >= 0 ? 'text-emerald-400/70' : 'text-[#F6465D]/70'}`}>
                        {(t.pnl_pct || 0) >= 0 ? "+" : ""}{(t.pnl_pct || 0).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-xs text-[#848E9C]">{t.sos_filled}/{t.max_sos || "—"}</td>
                      <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        t.exit_reason === "TP" ? "bg-emerald-500/10 text-emerald-400" :
                        t.exit_reason === "MAX_AGE" ? "bg-orange-500/10 text-orange-400" :
                        t.exit_reason === "END_OF_DATA" ? "bg-amber-500/15 text-amber-400" :
                        t.exit_reason === "RISK_STOP" ? "bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20" :
                        t.exit_reason === "LIQUIDATED" ? "bg-[#F6465D]/15 text-[#F6465D]" :
                        "bg-neutral-700 text-[#848E9C]"
                      }`}>{isOpen ? 'OPEN' : t.exit_reason === "RISK_STOP" ? '🛡️ RISK' : t.exit_reason}</span></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List View ──
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-[#F0B90B]" />
            Backtest History
          </h1>
          <p className="text-sm text-[#848E9C] mt-1">{total} saved backtest{total !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/admin/backtest"
          className="flex items-center gap-2 px-4 py-2 bg-[#F0B90B] hover:bg-[#D0980B] text-[#1E2026] rounded-xl text-sm font-bold transition-all">
          <FlaskConical size={16} /> New Backtest
        </Link>
      </div>

      {/* Symbol Filter */}
      <div className="flex items-center gap-2 mb-4">
        <Filter size={14} className="text-[#848E9C]" />
        {SYMBOLS.map(sym => (
          <button key={sym.value} onClick={() => { setSymbolFilter(sym.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              symbolFilter === sym.value
                ? "bg-[#F0B90B]/10 border-[#F0B90B]/30 text-[#F0B90B]"
                : "bg-[#181A20] border-[#2B2F36] text-[#848E9C] hover:border-[#F0B90B]/20"
            }`}>
            {sym.icon} {sym.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-[#2B2F36] rounded-xl p-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#F0B90B] mx-auto mb-3" />
          <p className="text-sm text-[#848E9C]">Loading history...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-[#2B2F36] rounded-xl p-16 text-center">
          <BarChart3 size={48} className="mx-auto text-[#848E9C] mb-4" />
          <h3 className="text-lg font-semibold text-[#848E9C] mb-2">No Backtests Yet</h3>
          <p className="text-sm text-[#848E9C]">Run a backtest to see it appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => {
            const pnlColor = item.total_pnl >= 0 ? "text-emerald-400" : "text-[#F6465D]";
            const wrColor = item.win_rate >= 60 ? "text-emerald-400" : item.win_rate >= 45 ? "text-amber-400" : "text-[#F6465D]";
            return (
              <div key={item.id}
                className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl p-4 hover:border-[#F0B90B]/20 transition-all group">
                {/* Top Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg">{item.symbol === "BTCUSDT" ? "₿" : item.symbol === "ETHUSDT" ? "Ξ" : item.symbol === "XRPUSDT" ? "✕" : "◎"}</span>
                      <span className="text-sm font-bold text-[#EAECEF]">{item.symbol.replace("USDT", "/USDT")}</span>
                    </div>
                    <span className="text-[10px] text-[#848E9C] bg-[#181A20] px-2 py-0.5 rounded font-mono">{item.period_days}D</span>
                    <span className="text-[10px] text-[#848E9C] bg-[#181A20] px-2 py-0.5 rounded font-mono">${item.initial_capital}</span>
                    {item.config?.leverage && <span className="text-[10px] text-[#848E9C] bg-[#181A20] px-2 py-0.5 rounded font-mono">{item.config.leverage}x</span>}
                    {item.trend_filter_enabled && <span className="text-[10px] text-[#F0B90B] bg-[#F0B90B]/10 px-2 py-0.5 rounded font-semibold">📊 Trend</span>}
                    {item.liquidated && <span className="text-[10px] text-[#F6465D] bg-[#F6465D]/10 px-2 py-0.5 rounded font-bold">LIQUIDATED</span>}
                    {item.label && <span className="text-[10px] text-[#F0B90B]/70 italic">"{item.label}"</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#848E9C] mr-2">{fmtDate(item.created_at)}</span>
                    <button onClick={() => handleView(item.id)}
                      className="p-1.5 rounded-lg bg-[#181A20] hover:bg-[#F0B90B]/10 text-[#848E9C] hover:text-[#F0B90B] transition-all" title="View Details">
                      <Eye size={14} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} disabled={deleting === item.id}
                      className="p-1.5 rounded-lg bg-[#181A20] hover:bg-[#F6465D]/10 text-[#848E9C] hover:text-[#F6465D] transition-all" title="Delete">
                      {deleting === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex flex-wrap items-center gap-1 bg-[#181A20] rounded-lg px-2 py-1.5">
                  <StatPill label="Trades" value={`${item.total_trades}`} color="text-blue-400" />
                  <div className="w-px h-6 bg-[#2B2F36]" />
                  <StatPill label="Win Rate" value={`${item.win_rate}%`} color={wrColor} />
                  <div className="w-px h-6 bg-[#2B2F36]" />
                  <StatPill label="PnL" value={`${item.total_pnl >= 0 ? "+" : ""}$${item.total_pnl.toFixed(2)}`} color={pnlColor} />
                  <div className="w-px h-6 bg-[#2B2F36]" />
                  <StatPill label="Return" value={`${item.total_pnl_pct >= 0 ? "+" : ""}${item.total_pnl_pct}%`} color={pnlColor} />
                  <div className="w-px h-6 bg-[#2B2F36]" />
                  <StatPill label="Max DD" value={`${item.max_drawdown_pct}%`} color={item.max_drawdown_pct <= 10 ? "text-emerald-400" : "text-amber-400"} />
                  <div className="w-px h-6 bg-[#2B2F36]" />
                  <StatPill label="Sharpe" value={`${item.sharpe_ratio}`} color={item.sharpe_ratio >= 1 ? "text-emerald-400" : "text-[#848E9C]"} />
                  <div className="w-px h-6 bg-[#2B2F36]" />
                  <StatPill label="PF" value={`${item.profit_factor}`} color={item.profit_factor >= 1.5 ? "text-emerald-400" : "text-[#848E9C]"} />
                  <div className="w-px h-6 bg-[#2B2F36]" />
                  <StatPill label="Fees" value={`$${item.total_fees_paid.toFixed(2)}`} color="text-amber-400" />
                  <div className="w-px h-6 bg-[#2B2F36]" />
                  <StatPill label="Final" value={`$${item.final_capital.toFixed(2)}`} color={item.final_capital >= item.initial_capital ? "text-emerald-400" : "text-[#F6465D]"} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="p-2 rounded-lg bg-[#2B2F36] hover:bg-[#F0B90B]/10 text-[#848E9C] hover:text-[#F0B90B] disabled:opacity-30 transition-all">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-[#848E9C] font-mono">
            Page <span className="text-[#EAECEF] font-bold">{page}</span> of {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="p-2 rounded-lg bg-[#2B2F36] hover:bg-[#F0B90B]/10 text-[#848E9C] hover:text-[#F0B90B] disabled:opacity-30 transition-all">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
