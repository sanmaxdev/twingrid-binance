"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2, Play, TrendingUp, TrendingDown, Target, BarChart3, Activity, DollarSign, Shield, Zap, FileDown, Calendar, HelpCircle, Clock, ShieldAlert, Maximize2, X } from "lucide-react";
import { adminService } from "@/lib/services/admin";
import { exportPDF } from "./exportReport";
import StrategyGuideModal from "@/components/StrategyGuideModal";
import TrendFilterSection from "@/components/TrendFilterSection";
import dynamic from "next/dynamic";

const BacktestChart = dynamic(() => import("@/components/BacktestChart"), { ssr: false });

const SYMBOLS = [
  { value: "BTCUSDT", label: "BTC", icon: "₿" },
  { value: "ETHUSDT", label: "ETH", icon: "Ξ" },
  { value: "SOLUSDT", label: "SOL", icon: "◎" },
  { value: "XRPUSDT", label: "XRP", icon: "✕" },
];

const PERIODS = [
  { value: 1, label: "1D" },
  { value: 3, label: "3D" },
  { value: 7, label: "7D" },
  { value: 14, label: "14D" },
  { value: 30, label: "30D" },
  { value: 60, label: "60D" },
  { value: 90, label: "90D" },
  { value: 180, label: "180D" },
  { value: 365, label: "1Y" },
];

const fmtDate = (iso: string) => {
  try { const d = new Date(iso); return d.toLocaleDateString("en-US", { month:"short", day:"numeric" }) + " " + d.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:false }); } catch { return "—"; }
};

// ─── Stat Card ───
function StatCard({ label, value, icon: Icon, color = "text-white", sub }: { label: string; value: string; icon: any; color?: string; sub?: string }) {
  return (
    <div className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl p-4 hover:border-[#F0B90B]/20 transition-all duration-200">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg bg-[#181A20] ${color}`}><Icon size={16} /></div>
        <span className="text-xs font-semibold text-[#848E9C] uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-[#848E9C] mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Main Page ───
export default function BacktestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const phaseTimerRef = useRef<any>(null);
  const elapsedRef = useRef<any>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const [config, setConfig] = useState({
    symbol: "BTCUSDT",
    period_days: 7,
    initial_capital: 1000,
    leverage: 10,
    sizing_mode: "fixed_usd",
    base_order_usd: 1.0,
    base_order_pct: 1.0,
    compounding_enabled: false,
    compounding_pct: 100,
    max_safety_orders: 7,
    take_profit_pct: 1.0,
    tp_mode: "pct" as "pct" | "fixed",
    tp_fixed_amount: 5.0,
    volume_scale: 1.5,
    step_scale: 1.35,
    rsi_long_threshold: 40,
    rsi_short_threshold: 60,
    signal_threshold: 55,
    allow_long: true,
    allow_short: true,
    atr_multiplier: 0.6,
    step_min_pct: 0.4,
    step_max_pct: 2.5,
    max_basket_age_hours: 72,
    // Trend filter
    trend_filter_enabled: false,
    trend_timeframes: ["1d", "4h"] as string[],
    trend_mode: "majority",
    trend_ema_fast: 9,
    trend_ema_slow: 21,
    // Risk controller
    risk_controller_enabled: false,
    rc_max_so_trigger: 5,
    rc_margin_usage_pct: 80,
    rc_max_basket_loss_pct: 10,
    rc_max_basket_loss_usd: 50,
    rc_loss_mode: "pct_wallet" as "pct_wallet" | "fixed_usd",
    rc_loss_direction: "exceeds" as "exceeds" | "recovers_to",
    rc_margin_guard_enabled: true,
    // Chart simulation
    chart_enabled: true,
  });

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    setLoadingPhase(0);
    setElapsed(0);

    // Phase progression timer — advances through stages
    const phaseDelays = [2000, 4000, 6000, 10000]; // ms before advancing
    let currentPhase = 0;
    phaseTimerRef.current = setInterval(() => {
      if (currentPhase < 4) {
        currentPhase++;
        setLoadingPhase(currentPhase);
      }
    }, phaseDelays[Math.min(currentPhase, phaseDelays.length - 1)] || 4000);

    // Elapsed timer
    elapsedRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    try {
      const payload: any = { ...config };
      // Convert UI percentages to fractions for API
      payload.step_min_pct = (config.step_min_pct || 0.4) / 100;
      payload.step_max_pct = (config.step_max_pct || 2.5) / 100;
      if (useCustomDates && startDate && endDate) {
        payload.start_date = new Date(startDate).toISOString();
        payload.end_date = new Date(endDate).toISOString();
      }
      const data = await adminService.runBacktest(payload);
      setResult(data);
      toast.success(`Backtest complete — ${data.summary.total_trades} trades`);
    } catch (err: any) {
      toast.error(err.message || "Backtest failed");
    } finally {
      setLoading(false);
      setLoadingPhase(0);
      clearInterval(phaseTimerRef.current);
      clearInterval(elapsedRef.current);
    }
  };

  const num = (name: string, value: number) => (
    <input type="number" value={value} onChange={e => setConfig(p => ({ ...p, [name]: parseFloat(e.target.value) || 0 }))}
      className="w-full bg-[#181A20] border border-[#2B2F36] rounded-lg px-3 py-2 text-sm text-white focus:border-[#F0B90B] focus:ring-1 focus:ring-[#F0B90B] outline-none" />
  );

  const s = result?.summary;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Strategy Backtest</h1>
          <p className="text-[#848E9C] text-sm">Simulate the Twin Grid strategy against historical Binance data</p>
        </div>
        <Link href="/admin/backtest/history"
          className="flex items-center gap-2 px-4 py-2.5 bg-[#2B2F36] hover:bg-[#F0B90B]/10 border border-[#2B2F36] hover:border-[#F0B90B]/30 text-[#848E9C] hover:text-[#F0B90B] rounded-xl text-sm font-bold transition-all">
          <Clock size={16} /> View History
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* ─── CONFIG PANEL ─── */}
        <div className="lg:col-span-1">
        {/* ─── CONFIG PANEL ─── */}
        <div className="bg-[#1E2026] border border-[#2B2F36] rounded-2xl overflow-hidden sticky top-8">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#0B0E11] border-b border-[#2B2F36]">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 bg-[#F0B90B] rounded-full" />
              <span className="text-xs font-bold text-[#EAECEF] uppercase tracking-wider">Configuration</span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setShowGuide(true)}
                className="flex items-center gap-1 text-[10px] font-semibold text-[#F0B90B] hover:text-[#D4A20B] transition-colors px-2 py-1 rounded-lg hover:bg-[#F0B90B]/10">
                <HelpCircle className="h-3 w-3" /> Guide
              </button>
              <button type="button" onClick={() => setConfigModalOpen(true)}
                title="Expand config panel"
                className="flex items-center gap-1 text-[10px] font-semibold text-[#848E9C] hover:text-[#EAECEF] transition-colors px-2 py-1 rounded-lg hover:bg-[#2B2F36]">
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <StrategyGuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} />

          <div className="overflow-y-auto max-h-[calc(100vh-160px)] p-4 space-y-4">

            {/* ── Section: Setup ── */}
            <div>
              <div className="text-[9px] font-bold text-[#848E9C] uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="flex-1 h-px bg-[#2B2F36]" />SETUP<span className="flex-1 h-px bg-[#2B2F36]" />
              </div>

              {/* Symbol */}
              <div className="mb-3">
                <label className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5 block">Symbol</label>
                <div className="grid grid-cols-4 gap-1">
                  {SYMBOLS.map(sym => (
                    <button key={sym.value} type="button" onClick={() => setConfig(p => ({ ...p, symbol: sym.value }))}
                      className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${config.symbol === sym.value
                        ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]"
                        : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C] hover:border-[#F0B90B]/30"
                      }`}>
                      {sym.icon} {sym.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Period */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider">Period</label>
                  <button type="button" onClick={() => setUseCustomDates(!useCustomDates)}
                    className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${useCustomDates ? "bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/30" : "bg-[#0B0E11] text-[#848E9C] border border-[#2B2F36]"}`}>
                    <Calendar size={9} /> Custom
                  </button>
                </div>
                {!useCustomDates ? (
                  <div className="grid grid-cols-5 gap-1">
                    {PERIODS.map(p => (
                      <button key={p.value} type="button" onClick={() => setConfig(prev => ({ ...prev, period_days: p.value }))}
                        className={`py-1 rounded-md text-[10px] font-bold transition-all ${config.period_days === p.value
                          ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]"
                          : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C] hover:border-[#F0B90B]/20"
                        }`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-[#848E9C] mb-0.5 block">Start</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        className="w-full bg-[#0B0E11] border border-[#2B2F36] rounded-lg px-2 py-1 text-[10px] text-white focus:border-[#F0B90B] outline-none" />
                    </div>
                    <div>
                      <label className="text-[9px] text-[#848E9C] mb-0.5 block">End</label>
                      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        className="w-full bg-[#0B0E11] border border-[#2B2F36] rounded-lg px-2 py-1 text-[10px] text-white focus:border-[#F0B90B] outline-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* Capital + Leverage side by side */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[#848E9C] mb-1 block">Capital ($)</label>
                  {num("initial_capital", config.initial_capital)}
                </div>
                <div>
                  <label className="text-[10px] text-[#848E9C] mb-1 block">Leverage</label>
                  {num("leverage", config.leverage)}
                </div>
              </div>
            </div>

            {/* ── Section: Strategy ── */}
            <div>
              <div className="text-[9px] font-bold text-[#848E9C] uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="flex-1 h-px bg-[#2B2F36]" />STRATEGY<span className="flex-1 h-px bg-[#2B2F36]" />
              </div>

              {/* Sizing Mode */}
              <div className="mb-3">
                <label className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5 block">Sizing</label>
                <div className="grid grid-cols-2 gap-1 mb-1.5">
                  {(["fixed_usd", "pct_capital"] as const).map(m => (
                    <button key={m} type="button" onClick={() => setConfig(p => ({ ...p, sizing_mode: m }))}
                      className={`py-1 rounded-lg text-[10px] font-bold transition-all ${config.sizing_mode === m
                        ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]"
                        : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C]"
                      }`}>
                      {m === "fixed_usd" ? "Fixed $" : "% Capital"}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div>
                    <label className="text-[9px] text-[#848E9C] mb-0.5 block">
                      {config.sizing_mode === "fixed_usd" ? "Base Order ($)" : "Base Order (%)"}
                    </label>
                    {config.sizing_mode === "fixed_usd"
                      ? num("base_order_usd", config.base_order_usd)
                      : num("base_order_pct", config.base_order_pct)}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[9px] text-[#848E9C]">Compound</label>
                      <button type="button" onClick={() => setConfig(p => ({ ...p, compounding_enabled: !p.compounding_enabled }))}
                        className={`relative w-7 h-3.5 rounded-full transition-colors ${config.compounding_enabled ? "bg-[#0ECB81]" : "bg-[#2B2F36]"}`}>
                        <span className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${config.compounding_enabled ? "translate-x-3.5" : ""}`} />
                      </button>
                    </div>
                    {config.compounding_enabled
                      ? num("compounding_pct", config.compounding_pct)
                      : <div className="h-[34px] flex items-center px-2 bg-[#0B0E11] border border-[#2B2F36] rounded-lg text-[10px] text-[#848E9C]/50">Disabled</div>
                    }
                  </div>
                </div>
              </div>

              {/* Take Profit Mode */}
              <div className="mb-3">
                <label className="text-[10px] text-[#848E9C] mb-1 block">Take Profit</label>
                <div className="grid grid-cols-2 gap-1 mb-1.5">
                  <button type="button" onClick={() => setConfig(p => ({ ...p, tp_mode: "pct" as const }))}
                    className={`py-1 rounded-lg text-[10px] font-bold transition-all ${config.tp_mode === "pct"
                      ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]"
                      : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C]"}`}>% Balance</button>
                  <button type="button" onClick={() => setConfig(p => ({ ...p, tp_mode: "fixed" as const }))}
                    className={`py-1 rounded-lg text-[10px] font-bold transition-all ${config.tp_mode === "fixed"
                      ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]"
                      : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C]"}`}>Fixed $</button>
                </div>
                {config.tp_mode === "pct" ? num("take_profit_pct", config.take_profit_pct) : num("tp_fixed_amount", config.tp_fixed_amount)}
              </div>

              {/* Grid params 2×2 grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">Max SOs</label>{num("max_safety_orders", config.max_safety_orders)}</div>
                <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">Vol Scale</label>{num("volume_scale", config.volume_scale)}</div>
                <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">Step Scale</label>{num("step_scale", config.step_scale)}</div>
                <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">ATR Multi</label>{num("atr_multiplier", config.atr_multiplier)}</div>
              </div>

              {/* Step range + Age */}
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">Step Min%</label>{num("step_min_pct", config.step_min_pct)}</div>
                <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">Step Max%</label>{num("step_max_pct", config.step_max_pct)}</div>
                <div>
                  <label className="text-[9px] text-[#848E9C] mb-0.5 block">Max Age</label>
                  <select value={config.max_basket_age_hours}
                    onChange={(e) => setConfig({ ...config, max_basket_age_hours: parseInt(e.target.value) })}
                    className="w-full bg-[#0B0E11] border border-[#2B2F36] rounded-lg px-1.5 py-[7px] text-[10px] text-white focus:border-[#F0B90B] outline-none">
                    <option value={0}>Off</option>
                    <option value={24}>24h</option>
                    <option value={48}>48h</option>
                    <option value={72}>72h</option>
                    <option value={168}>7d</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── Section: Protection ── */}
            <div>
              <div className="text-[9px] font-bold text-[#848E9C] uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="flex-1 h-px bg-[#2B2F36]" />PROTECTION<span className="flex-1 h-px bg-[#2B2F36]" />
              </div>
              <div className="rounded-xl border border-[#2B2F36] bg-[#0B0E11]/50 overflow-hidden">
                {/* RC Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#2B2F36]">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert size={12} className="text-[#F0B90B]" />
                    <span className="text-[10px] font-bold text-[#F0B90B] uppercase tracking-wider">Risk Controller</span>
                  </div>
                  <button type="button" onClick={() => setConfig(p => ({ ...p, risk_controller_enabled: !p.risk_controller_enabled }))}
                    className={`relative w-8 h-4 rounded-full transition-colors ${config.risk_controller_enabled ? "bg-[#F0B90B]" : "bg-[#2B2F36]"}`}>
                    <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${config.risk_controller_enabled ? "translate-x-4" : ""}`} />
                  </button>
                </div>
                {config.risk_controller_enabled && (
                  <div className="p-3 space-y-2.5">
                    {/* SO Trigger — full width */}
                    <div>
                      <label className="text-[9px] text-[#848E9C] mb-0.5 block">SO Trigger (activates at SO ≥)</label>
                      {num("rc_max_so_trigger", config.rc_max_so_trigger)}
                    </div>
                    {/* Loss Mode */}
                    <div>
                      <label className="text-[9px] text-[#848E9C] mb-1 block">Loss Mode</label>
                      <div className="grid grid-cols-2 gap-1 mb-1.5">
                        <button type="button" onClick={() => setConfig(p => ({ ...p, rc_loss_mode: "pct_wallet" as const }))}
                          className={`py-1 rounded-lg text-[10px] font-bold transition-all ${config.rc_loss_mode === "pct_wallet"
                            ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]"
                            : "bg-[#181A20] border border-[#2B2F36] text-[#848E9C]"}`}>% Wallet</button>
                        <button type="button" onClick={() => setConfig(p => ({ ...p, rc_loss_mode: "fixed_usd" as const }))}
                          className={`py-1 rounded-lg text-[10px] font-bold transition-all ${config.rc_loss_mode === "fixed_usd"
                            ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]"
                            : "bg-[#181A20] border border-[#2B2F36] text-[#848E9C]"}`}>Fixed $</button>
                      </div>
                      {config.rc_loss_mode === "pct_wallet"
                        ? num("rc_max_basket_loss_pct", config.rc_max_basket_loss_pct)
                        : num("rc_max_basket_loss_usd", config.rc_max_basket_loss_usd)}
                    </div>
                    {/* Exit Direction */}
                    <div>
                      <label className="text-[9px] text-[#848E9C] mb-1 block">Exit Direction</label>
                      <div className="grid grid-cols-2 gap-1">
                        <button type="button" onClick={() => setConfig(p => ({ ...p, rc_loss_direction: "exceeds" as const }))}
                          className={`py-1 rounded-lg text-[10px] font-bold transition-all ${config.rc_loss_direction === "exceeds"
                            ? "bg-[#F6465D]/15 border border-[#F6465D]/40 text-[#F6465D]"
                            : "bg-[#181A20] border border-[#2B2F36] text-[#848E9C]"}`}>⛔ Exceeds</button>
                        <button type="button" onClick={() => setConfig(p => ({ ...p, rc_loss_direction: "recovers_to" as const }))}
                          className={`py-1 rounded-lg text-[10px] font-bold transition-all ${config.rc_loss_direction === "recovers_to"
                            ? "bg-[#0ECB81]/15 border border-[#0ECB81]/40 text-[#0ECB81]"
                            : "bg-[#181A20] border border-[#2B2F36] text-[#848E9C]"}`}>↩️ Recovers</button>
                      </div>
                    </div>
                    {/* Margin Guard */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[9px] text-[#848E9C]">Margin Guard</label>
                        <button type="button"
                          onClick={() => setConfig(p => ({ ...p, rc_margin_guard_enabled: !p.rc_margin_guard_enabled }))}
                          className={`relative w-7 h-3.5 rounded-full transition-colors ${config.rc_margin_guard_enabled ? "bg-[#F0B90B]" : "bg-[#2B2F36]"}`}>
                          <span className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${config.rc_margin_guard_enabled ? "translate-x-3.5" : ""}`} />
                        </button>
                      </div>
                      {config.rc_margin_guard_enabled
                        ? num("rc_margin_usage_pct", config.rc_margin_usage_pct)
                        : <p className="text-[9px] text-[#F6465D]/70">Disabled — no margin protection</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Section: Signals ── */}
            <div>
              <div className="text-[9px] font-bold text-[#848E9C] uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="flex-1 h-px bg-[#2B2F36]" />SIGNALS<span className="flex-1 h-px bg-[#2B2F36]" />
              </div>

              {/* Signal Threshold slider */}
              <div className="mb-3">
                <div className="flex justify-between mb-1">
                  <label className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider">Signal Threshold</label>
                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                    config.signal_threshold <= 40 ? "text-[#F0B90B] bg-[#F6465D]/10" :
                    config.signal_threshold <= 55 ? "text-amber-400 bg-amber-500/10" :
                    "text-emerald-400 bg-emerald-500/10"
                  }`}>{config.signal_threshold}</span>
                </div>
                <input type="range" min="30" max="80" step="5" value={config.signal_threshold}
                  onChange={e => setConfig(p => ({ ...p, signal_threshold: parseInt(e.target.value) }))}
                  className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer accent-[#F0B90B]" />
                <div className="flex justify-between mt-0.5">
                  <span className="text-[8px] text-[#F0B90B] font-bold">AGGRESSIVE</span>
                  <span className="text-[8px] text-emerald-400 font-bold">CONSERVATIVE</span>
                </div>
              </div>

              {/* RSI + Directions in a 2x2 grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">RSI Long (&lt;)</label>{num("rsi_long_threshold", config.rsi_long_threshold)}</div>
                <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">RSI Short (&gt;)</label>{num("rsi_short_threshold", config.rsi_short_threshold)}</div>
                <button type="button" onClick={() => setConfig(p => ({ ...p, allow_long: !p.allow_long }))}
                  className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${config.allow_long
                    ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400"
                    : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C]"
                  }`}>🟢 Long {config.allow_long ? "ON" : "OFF"}</button>
                <button type="button" onClick={() => setConfig(p => ({ ...p, allow_short: !p.allow_short }))}
                  className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${config.allow_short
                    ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]"
                    : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C]"
                  }`}>🔴 Short {config.allow_short ? "ON" : "OFF"}</button>
              </div>

              {/* Trend Filter */}
              <TrendFilterSection
                enabled={config.trend_filter_enabled}
                timeframes={config.trend_timeframes}
                mode={config.trend_mode}
                emaFast={config.trend_ema_fast}
                emaSlow={config.trend_ema_slow}
                onChange={(key, value) => setConfig(p => ({ ...p, [key]: value }))}
                compact
              />
            </div>

            {/* Chart toggle */}
            <div className="flex items-center justify-between py-2 px-3 bg-[#0B0E11] border border-[#2B2F36] rounded-xl">
              <div className="flex items-center gap-2">
                <BarChart3 size={13} className="text-[#F0B90B]" />
                <span className="text-[10px] font-bold text-[#848E9C]">Chart Simulation</span>
              </div>
              <button type="button" onClick={() => setConfig(p => ({ ...p, chart_enabled: !p.chart_enabled }))}
                className={`w-8 h-4 rounded-full relative transition-colors duration-200 ${config.chart_enabled ? "bg-[#F0B90B]" : "bg-[#2B2F36]"}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-200 ${config.chart_enabled ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>

          </div>{/* end scroll area */}

          {/* ── Run Button — sticky at bottom ── */}
          <div className="px-4 py-3 border-t border-[#2B2F36] bg-[#0B0E11]">
            <button onClick={handleRun} disabled={loading}
              className="w-full py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-[#F0B90B] hover:bg-[#D0980B] disabled:opacity-50 text-[#1E2026]">
              {loading ? <><Loader2 size={15} className="animate-spin" /> Running...</> : <><Play size={15} /> Run Backtest</>}
            </button>
          </div>

        </div>{/* end panel card */}
        </div>{/* end lg:col-span-1 */}

        {/* ─── CONFIG MODAL (expanded view) ─── */}
        {configModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfigModalOpen(false)} />
            {/* Modal Card */}
            <div className="relative bg-[#1E2026] border border-[#2B2F36] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-[#0B0E11] border-b border-[#2B2F36] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-5 bg-[#F0B90B] rounded-full" />
                  <h2 className="text-sm font-bold text-[#EAECEF] uppercase tracking-wider">Backtest Configuration</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20 font-semibold">
                    {config.symbol} · {config.period_days}D · {config.leverage}x
                  </span>
                </div>
                <button onClick={() => setConfigModalOpen(false)}
                  className="p-1.5 rounded-lg text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#2B2F36] transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body — 3 columns */}
              <div className="overflow-y-auto flex-1 p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                  {/* ── Col 1: Setup ── */}
                  <div className="space-y-4">
                    <div className="text-[9px] font-bold text-[#848E9C] uppercase tracking-widest flex items-center gap-2">
                      <span className="flex-1 h-px bg-[#2B2F36]" />SETUP<span className="flex-1 h-px bg-[#2B2F36]" />
                    </div>
                    {/* Symbol */}
                    <div>
                      <label className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5 block">Symbol</label>
                      <div className="grid grid-cols-4 gap-1">
                        {SYMBOLS.map(sym => (
                          <button key={sym.value} type="button" onClick={() => setConfig(p => ({ ...p, symbol: sym.value }))}
                            className={`py-2 rounded-lg text-xs font-bold transition-all ${config.symbol === sym.value
                              ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]"
                              : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C] hover:border-[#F0B90B]/30"}`}>
                            {sym.icon} {sym.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Period */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider">Period</label>
                        <button type="button" onClick={() => setUseCustomDates(!useCustomDates)}
                          className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${useCustomDates ? "bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/30" : "bg-[#0B0E11] text-[#848E9C] border-[#2B2F36]"}`}>
                          <Calendar size={9} /> Custom
                        </button>
                      </div>
                      {!useCustomDates ? (
                        <div className="grid grid-cols-5 gap-1">
                          {PERIODS.map(p => (
                            <button key={p.value} type="button" onClick={() => setConfig(prev => ({ ...prev, period_days: p.value }))}
                              className={`py-1.5 rounded-md text-[10px] font-bold transition-all ${config.period_days === p.value
                                ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]"
                                : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C] hover:border-[#F0B90B]/20"}`}>
                              {p.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">Start</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                              className="w-full bg-[#0B0E11] border border-[#2B2F36] rounded-lg px-2 py-1.5 text-xs text-white focus:border-[#F0B90B] outline-none" /></div>
                          <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">End</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                              className="w-full bg-[#0B0E11] border border-[#2B2F36] rounded-lg px-2 py-1.5 text-xs text-white focus:border-[#F0B90B] outline-none" /></div>
                        </div>
                      )}
                    </div>
                    {/* Capital + Leverage */}
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs text-[#848E9C] mb-1 block">Capital ($)</label>{num("initial_capital", config.initial_capital)}</div>
                      <div><label className="text-xs text-[#848E9C] mb-1 block">Leverage</label>{num("leverage", config.leverage)}</div>
                    </div>
                    {/* Signal */}
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider">Signal Threshold</label>
                        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${config.signal_threshold <= 40 ? "text-[#F0B90B] bg-[#F6465D]/10" : config.signal_threshold <= 55 ? "text-amber-400 bg-amber-500/10" : "text-emerald-400 bg-emerald-500/10"}`}>{config.signal_threshold}</span>
                      </div>
                      <input type="range" min="30" max="80" step="5" value={config.signal_threshold}
                        onChange={e => setConfig(p => ({ ...p, signal_threshold: parseInt(e.target.value) }))}
                        className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer accent-[#F0B90B]" />
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[8px] text-[#F0B90B] font-bold">AGGRESSIVE</span>
                        <span className="text-[8px] text-emerald-400 font-bold">CONSERVATIVE</span>
                      </div>
                    </div>
                    {/* RSI + Directions */}
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-xs text-[#848E9C] mb-1 block">RSI Long (&lt;)</label>{num("rsi_long_threshold", config.rsi_long_threshold)}</div>
                      <div><label className="text-xs text-[#848E9C] mb-1 block">RSI Short (&gt;)</label>{num("rsi_short_threshold", config.rsi_short_threshold)}</div>
                      <button type="button" onClick={() => setConfig(p => ({ ...p, allow_long: !p.allow_long }))}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${config.allow_long ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400" : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C]"}`}>
                        🟢 Long {config.allow_long ? "ON" : "OFF"}
                      </button>
                      <button type="button" onClick={() => setConfig(p => ({ ...p, allow_short: !p.allow_short }))}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${config.allow_short ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]" : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C]"}`}>
                        🔴 Short {config.allow_short ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>

                  {/* ── Col 2: Strategy ── */}
                  <div className="space-y-4">
                    <div className="text-[9px] font-bold text-[#848E9C] uppercase tracking-widest flex items-center gap-2">
                      <span className="flex-1 h-px bg-[#2B2F36]" />STRATEGY<span className="flex-1 h-px bg-[#2B2F36]" />
                    </div>
                    {/* Sizing */}
                    <div>
                      <label className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5 block">Sizing Mode</label>
                      <div className="grid grid-cols-2 gap-1 mb-2">
                        {(["fixed_usd", "pct_capital"] as const).map(m => (
                          <button key={m} type="button" onClick={() => setConfig(p => ({ ...p, sizing_mode: m }))}
                            className={`py-1.5 rounded-lg text-xs font-bold transition-all ${config.sizing_mode === m ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]" : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C]"}`}>
                            {m === "fixed_usd" ? "Fixed $" : "% Capital"}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] text-[#848E9C] mb-0.5 block">{config.sizing_mode === "fixed_usd" ? "Base Order ($)" : "Base Order (%)"}</label>
                          {config.sizing_mode === "fixed_usd" ? num("base_order_usd", config.base_order_usd) : num("base_order_pct", config.base_order_pct)}
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-0.5">
                            <label className="text-[9px] text-[#848E9C]">Compound</label>
                            <button type="button" onClick={() => setConfig(p => ({ ...p, compounding_enabled: !p.compounding_enabled }))}
                              className={`relative w-7 h-3.5 rounded-full transition-colors ${config.compounding_enabled ? "bg-[#0ECB81]" : "bg-[#2B2F36]"}`}>
                              <span className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${config.compounding_enabled ? "translate-x-3.5" : ""}`} />
                            </button>
                          </div>
                          {config.compounding_enabled ? num("compounding_pct", config.compounding_pct) : <div className="h-[34px] flex items-center px-2 bg-[#0B0E11] border border-[#2B2F36] rounded-lg text-[10px] text-[#848E9C]/50">Disabled</div>}
                        </div>
                      </div>
                    </div>
                    {/* Take Profit */}
                    <div>
                      <label className="text-xs text-[#848E9C] mb-1 block">Take Profit</label>
                      <div className="grid grid-cols-2 gap-1 mb-2">
                        <button type="button" onClick={() => setConfig(p => ({ ...p, tp_mode: "pct" as const }))}
                          className={`py-1.5 rounded-lg text-xs font-bold transition-all ${config.tp_mode === "pct" ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]" : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C]"}`}>% Balance</button>
                        <button type="button" onClick={() => setConfig(p => ({ ...p, tp_mode: "fixed" as const }))}
                          className={`py-1.5 rounded-lg text-xs font-bold transition-all ${config.tp_mode === "fixed" ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]" : "bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C]"}`}>Fixed $</button>
                      </div>
                      {config.tp_mode === "pct" ? num("take_profit_pct", config.take_profit_pct) : num("tp_fixed_amount", config.tp_fixed_amount)}
                    </div>
                    {/* Grid params */}
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-xs text-[#848E9C] mb-1 block">Max SOs</label>{num("max_safety_orders", config.max_safety_orders)}</div>
                      <div><label className="text-xs text-[#848E9C] mb-1 block">Vol Scale</label>{num("volume_scale", config.volume_scale)}</div>
                      <div><label className="text-xs text-[#848E9C] mb-1 block">Step Scale</label>{num("step_scale", config.step_scale)}</div>
                      <div><label className="text-xs text-[#848E9C] mb-1 block">ATR Multi</label>{num("atr_multiplier", config.atr_multiplier)}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">Step Min%</label>{num("step_min_pct", config.step_min_pct)}</div>
                      <div><label className="text-[9px] text-[#848E9C] mb-0.5 block">Step Max%</label>{num("step_max_pct", config.step_max_pct)}</div>
                      <div>
                        <label className="text-[9px] text-[#848E9C] mb-0.5 block">Max Age</label>
                        <select value={config.max_basket_age_hours} onChange={e => setConfig({ ...config, max_basket_age_hours: parseInt(e.target.value) })}
                          className="w-full bg-[#0B0E11] border border-[#2B2F36] rounded-lg px-1.5 py-[7px] text-[10px] text-white focus:border-[#F0B90B] outline-none">
                          <option value={0}>Off</option><option value={24}>24h</option><option value={48}>48h</option><option value={72}>72h</option><option value={168}>7d</option>
                        </select>
                      </div>
                    </div>
                    {/* Trend Filter */}
                    <TrendFilterSection enabled={config.trend_filter_enabled} timeframes={config.trend_timeframes} mode={config.trend_mode} emaFast={config.trend_ema_fast} emaSlow={config.trend_ema_slow} onChange={(key, value) => setConfig(p => ({ ...p, [key]: value }))} compact />
                  </div>

                  {/* ── Col 3: Protection ── */}
                  <div className="space-y-4">
                    <div className="text-[9px] font-bold text-[#848E9C] uppercase tracking-widest flex items-center gap-2">
                      <span className="flex-1 h-px bg-[#2B2F36]" />PROTECTION<span className="flex-1 h-px bg-[#2B2F36]" />
                    </div>
                    <div className="rounded-xl border border-[#2B2F36] bg-[#0B0E11]/50 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2B2F36]">
                        <div className="flex items-center gap-1.5">
                          <ShieldAlert size={13} className="text-[#F0B90B]" />
                          <span className="text-xs font-bold text-[#F0B90B] uppercase tracking-wider">Risk Controller</span>
                        </div>
                        <button type="button" onClick={() => setConfig(p => ({ ...p, risk_controller_enabled: !p.risk_controller_enabled }))}
                          className={`relative w-9 h-5 rounded-full transition-colors ${config.risk_controller_enabled ? "bg-[#F0B90B]" : "bg-[#2B2F36]"}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config.risk_controller_enabled ? "translate-x-4" : ""}`} />
                        </button>
                      </div>
                      {config.risk_controller_enabled && (
                        <div className="p-3 space-y-3">
                          <div><label className="text-xs text-[#848E9C] mb-1 block">SO Trigger (activates at SO ≥)</label>{num("rc_max_so_trigger", config.rc_max_so_trigger)}</div>
                          <div>
                            <label className="text-xs text-[#848E9C] mb-1 block">Loss Mode</label>
                            <div className="grid grid-cols-2 gap-1 mb-1.5">
                              <button type="button" onClick={() => setConfig(p => ({ ...p, rc_loss_mode: "pct_wallet" as const }))}
                                className={`py-1.5 rounded-lg text-xs font-bold ${config.rc_loss_mode === "pct_wallet" ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]" : "bg-[#181A20] border border-[#2B2F36] text-[#848E9C]"}`}>% Wallet</button>
                              <button type="button" onClick={() => setConfig(p => ({ ...p, rc_loss_mode: "fixed_usd" as const }))}
                                className={`py-1.5 rounded-lg text-xs font-bold ${config.rc_loss_mode === "fixed_usd" ? "bg-[#F0B90B]/15 border border-[#F0B90B]/40 text-[#F0B90B]" : "bg-[#181A20] border border-[#2B2F36] text-[#848E9C]"}`}>Fixed $</button>
                            </div>
                            {config.rc_loss_mode === "pct_wallet" ? num("rc_max_basket_loss_pct", config.rc_max_basket_loss_pct) : num("rc_max_basket_loss_usd", config.rc_max_basket_loss_usd)}
                          </div>
                          <div>
                            <label className="text-xs text-[#848E9C] mb-1 block">Exit Direction</label>
                            <div className="grid grid-cols-2 gap-1">
                              <button type="button" onClick={() => setConfig(p => ({ ...p, rc_loss_direction: "exceeds" as const }))}
                                className={`py-1.5 rounded-lg text-xs font-bold ${config.rc_loss_direction === "exceeds" ? "bg-[#F6465D]/15 border border-[#F6465D]/40 text-[#F6465D]" : "bg-[#181A20] border border-[#2B2F36] text-[#848E9C]"}`}>⛔ Exceeds</button>
                              <button type="button" onClick={() => setConfig(p => ({ ...p, rc_loss_direction: "recovers_to" as const }))}
                                className={`py-1.5 rounded-lg text-xs font-bold ${config.rc_loss_direction === "recovers_to" ? "bg-[#0ECB81]/15 border border-[#0ECB81]/40 text-[#0ECB81]" : "bg-[#181A20] border border-[#2B2F36] text-[#848E9C]"}`}>↩️ Recovers</button>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs text-[#848E9C]">Margin Guard</label>
                              <button type="button" onClick={() => setConfig(p => ({ ...p, rc_margin_guard_enabled: !p.rc_margin_guard_enabled }))}
                                className={`relative w-9 h-5 rounded-full transition-colors ${config.rc_margin_guard_enabled ? "bg-[#F0B90B]" : "bg-[#2B2F36]"}`}>
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config.rc_margin_guard_enabled ? "translate-x-4" : ""}`} />
                              </button>
                            </div>
                            {config.rc_margin_guard_enabled ? num("rc_margin_usage_pct", config.rc_margin_usage_pct) : <p className="text-[9px] text-[#F6465D]/70">Disabled — no margin protection</p>}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Chart + Chart toggle */}
                    <div className="flex items-center justify-between py-2.5 px-3 bg-[#0B0E11] border border-[#2B2F36] rounded-xl">
                      <div className="flex items-center gap-2"><BarChart3 size={14} className="text-[#F0B90B]" /><span className="text-xs font-bold text-[#848E9C]">Chart Simulation</span></div>
                      <button type="button" onClick={() => setConfig(p => ({ ...p, chart_enabled: !p.chart_enabled }))}
                        className={`w-9 h-5 rounded-full relative transition-colors ${config.chart_enabled ? "bg-[#F0B90B]" : "bg-[#2B2F36]"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${config.chart_enabled ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-[#2B2F36] bg-[#0B0E11] shrink-0 flex gap-3">
                <button onClick={() => setConfigModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-[#848E9C] border border-[#2B2F36] hover:bg-[#2B2F36] hover:text-[#EAECEF] transition-all">
                  Close
                </button>
                <button onClick={() => { setConfigModalOpen(false); handleRun(); }} disabled={loading}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-[#F0B90B] hover:bg-[#D0980B] disabled:opacity-50 text-[#1E2026]">
                  {loading ? <><Loader2 size={15} className="animate-spin" /> Running...</> : <><Play size={15} /> Run Backtest</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── RESULTS PANEL ─── */}
        <div className="space-y-6 min-w-0">
          {!result && !loading && (
            <div className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl p-16 text-center">
              <BarChart3 size={48} className="mx-auto text-[#848E9C] mb-4" />
              <h3 className="text-lg font-semibold text-[#848E9C] mb-2">No Backtest Results</h3>
              <p className="text-sm text-[#848E9C]">Configure parameters and click "Run Backtest" to simulate the strategy.</p>
            </div>
          )}

          {loading && (() => {
            const phases = [
              { label: "Initializing Engine", detail: "Configuring strategy parameters & grid logic", icon: "⚙️" },
              { label: "Fetching Market Data", detail: `Loading ${config.period_days > 30 ? '5m' : '1m'} candles (cache → API fallback)`, icon: "📡" },
              { label: "Computing Indicators", detail: "RSI · Bollinger Bands · EMA Slope · ATR · Multi-timeframe analysis", icon: "📊" },
              { label: "Running Simulation", detail: `Bar-by-bar signal evaluation across ~${config.period_days > 30 ? Math.round(config.period_days * 288).toLocaleString() : Math.round(config.period_days * 1440).toLocaleString()} candles`, icon: "🔄" },
              { label: "Analyzing Results", detail: "Calculating Sharpe ratio, drawdown curves & trade statistics", icon: "🧮" },
            ];
            const progressPct = Math.min(95, (loadingPhase / (phases.length - 1)) * 90 + 5);
            const fmtElapsed = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;

            return (
              <div className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10">
                      <div className="absolute inset-0 border-2 border-[#F0B90B]/30 rounded-full" />
                      <div className="absolute inset-0 border-2 border-[#F0B90B] rounded-full border-t-transparent animate-spin" />
                      <div className="absolute inset-[6px] bg-[#F0B90B]/10 rounded-full flex items-center justify-center">
                        <Activity className="h-4 w-4 text-[#F0B90B]" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-[#EAECEF]">Backtest Engine Active</h3>
                      <p className="text-xs text-[#848E9C]">{config.symbol} · {config.period_days}D · {config.leverage}x Leverage</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-mono font-bold text-[#F0B90B]">{fmtElapsed}</div>
                    <div className="text-[10px] text-[#848E9C] uppercase tracking-wider">Elapsed</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-6">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-[10px] text-[#848E9C] uppercase tracking-wider font-semibold">Progress</span>
                    <span className="text-xs font-mono font-bold text-[#F0B90B]">{Math.round(progressPct)}%</span>
                  </div>
                  <div className="w-full h-2 bg-[#181A20] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${progressPct}%`,
                        background: 'linear-gradient(90deg, #F0B90B, #F8D12F)',
                        boxShadow: '0 0 12px rgba(240,185,11,0.4)',
                      }}
                    />
                  </div>
                </div>

                {/* Phase Steps */}
                <div className="space-y-2">
                  {phases.map((phase, idx) => {
                    const isActive = idx === loadingPhase;
                    const isDone = idx < loadingPhase;
                    return (
                      <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 ${
                        isActive ? 'bg-[#F0B90B]/5 border border-[#F0B90B]/20' :
                        isDone ? 'bg-[#0ECB81]/5 border border-transparent' :
                        'border border-transparent opacity-40'
                      }`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isDone ? 'bg-[#0ECB81]/20 text-[#0ECB81]' :
                          isActive ? 'bg-[#F0B90B]/20 text-[#F0B90B]' :
                          'bg-[#181A20] text-[#848E9C]'
                        }`}>
                          {isDone ? '✓' : isActive ? <span className="animate-pulse">{phase.icon}</span> : (idx + 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-semibold ${isDone ? 'text-[#0ECB81]' : isActive ? 'text-[#EAECEF]' : 'text-[#848E9C]'}`}>
                            {phase.label}
                          </div>
                          {(isActive || isDone) && (
                            <div className="text-[10px] text-[#848E9C] mt-0.5 truncate">{phase.detail}</div>
                          )}
                        </div>
                        {isActive && (
                          <div className="flex gap-0.5">
                            <div className="w-1 h-1 bg-[#F0B90B] rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                            <div className="w-1 h-1 bg-[#F0B90B] rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                            <div className="w-1 h-1 bg-[#F0B90B] rounded-full animate-pulse" style={{ animationDelay: '400ms' }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Footer Info */}
                <div className="mt-5 pt-4 border-t border-[#181A20] flex items-center justify-between">
                  <div className="text-[10px] text-[#848E9C]">
                    Resolution: <span className="text-[#EAECEF] font-medium">{config.period_days > 30 ? '5-minute' : '1-minute'}</span> candles
                    {config.period_days > 30 && <span className="text-[#F0B90B] ml-1">(optimized)</span>}
                  </div>
                  <div className="text-[10px] text-[#848E9C]">
                    Est. candles: <span className="text-[#EAECEF] font-mono font-medium">{config.period_days > 30 ? Math.round(config.period_days * 288).toLocaleString() : Math.round(config.period_days * 1440).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {result && s && (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <StatCard label="Trades" value={`${s.total_trades}`} icon={Activity} color="text-blue-400" sub={`${s.winning_trades}W / ${s.losing_trades}L`} />
                <StatCard label="Win Rate" value={`${s.win_rate}%`} icon={Target}
                  color={s.win_rate >= 60 ? "text-emerald-400" : s.win_rate >= 45 ? "text-amber-400" : "text-[#F0B90B]"} />
                <StatCard label="Total PnL" value={`$${s.total_pnl.toFixed(2)}`} icon={DollarSign}
                  color={s.total_pnl >= 0 ? "text-emerald-400" : "text-[#F0B90B]"} sub={`${s.total_pnl_pct >= 0 ? "+" : ""}${s.total_pnl_pct}%`} />
                <StatCard label="Max DD" value={`${s.max_drawdown_pct}%`} icon={TrendingDown}
                  color={s.max_drawdown_pct <= 5 ? "text-emerald-400" : s.max_drawdown_pct <= 15 ? "text-amber-400" : "text-[#F0B90B]"} />
                <StatCard label="Sharpe" value={`${s.sharpe_ratio}`} icon={Zap}
                  color={s.sharpe_ratio >= 1.5 ? "text-emerald-400" : s.sharpe_ratio >= 0.5 ? "text-amber-400" : "text-[#F0B90B]"} />
                <StatCard label="Profit Factor" value={`${s.profit_factor}`} icon={Shield}
                  color={s.profit_factor >= 2 ? "text-emerald-400" : s.profit_factor >= 1 ? "text-amber-400" : "text-[#F0B90B]"} />
              </div>

              {/* Trend Filter Banner (if active) */}
              {s.trend_filter_enabled && (
                <div className="bg-[#F0B90B]/5 border border-[#F0B90B]/20 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[#F0B90B] text-sm">📊</span>
                    <div>
                      <span className="text-xs font-bold text-[#F0B90B]">Trend Filter Active</span>
                      <p className="text-[11px] text-[#848E9C] mt-0.5">
                        {s.trend_blocked_count > 0
                          ? `Blocked ${s.trend_blocked_count} counter-trend signal${s.trend_blocked_count > 1 ? 's' : ''} from opening baskets.`
                          : 'No signals were blocked — all entries aligned with the macro trend.'
                        }
                      </p>
                    </div>
                  </div>
                  <div className="text-lg font-bold font-mono text-[#F0B90B] px-3 py-1 rounded-lg bg-[#F0B90B]/10">
                    {s.trend_blocked_count}
                  </div>
                </div>
              )}
              {/* Risk Controller Banner (if active) */}
              {s.risk_controller_enabled && (
                <div className="bg-[#F0B90B]/5 border border-[#F0B90B]/20 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[#F0B90B] text-sm">🛡️</span>
                    <div>
                      <span className="text-xs font-bold text-[#F0B90B]">Risk Controller Active</span>
                      <p className="text-[11px] text-[#848E9C] mt-0.5">
                        {(s.risk_stops_count || 0) > 0
                          ? `Force-closed ${s.risk_stops_count} basket${s.risk_stops_count > 1 ? 's' : ''} to prevent liquidation.`
                          : 'No baskets triggered the risk controller — all exits were via TP or timeout.'
                        }
                      </p>
                    </div>
                  </div>
                  <div className={`text-lg font-bold font-mono px-3 py-1 rounded-lg ${
                    (s.risk_stops_count || 0) > 0 ? 'text-[#F0B90B] bg-[#F0B90B]/10' : 'text-[#0ECB81] bg-[#0ECB81]/10'
                  }`}>
                    {s.risk_stops_count || 0}
                  </div>
                </div>
              )}

              {/* Capital Summary */}
              <div className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-w-0">
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <div><span className="text-xs text-[#848E9C]">Initial</span><div className="text-lg font-bold text-white">${s.initial_capital.toFixed(2)}</div></div>
                  <div className="text-[#848E9C] text-xl hidden sm:block">→</div>
                  <div><span className="text-xs text-[#848E9C]">Final</span>
                    <div className={`text-lg font-bold ${s.final_capital >= s.initial_capital ? "text-emerald-400" : "text-[#F0B90B]"}`}>${s.final_capital.toFixed(2)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 sm:gap-6 text-left sm:text-right">
                  <div>
                    <span className="text-xs text-[#848E9C]">Trading Fees</span>
                    <div className="text-sm font-semibold text-amber-400">-${(s.total_trading_fees || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-xs text-[#848E9C]">Funding Paid</span>
                    <div className="text-sm font-semibold text-orange-400">-${(s.total_funding_paid || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-xs text-[#848E9C]">Funding Received</span>
                    <div className="text-sm font-semibold text-emerald-400">+${(s.total_funding_received || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-xs text-[#848E9C]">Net Funding</span>
                    <div className={`text-sm font-semibold ${(s.total_funding_net || 0) <= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                      {(s.total_funding_net || 0) > 0 ? '-' : '+'}${Math.abs(s.total_funding_net || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="border-l border-[#2B2F36] pl-4 sm:pl-6">
                    <span className="text-xs text-[#848E9C]">Total Cost</span>
                    <div className="text-sm font-bold text-amber-400">-${(s.total_fees_paid || 0).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {/* Open Trade Banner */}
              {s.has_open_trade && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 text-sm">⚠️</span>
                    <div>
                      <span className="text-xs font-bold text-amber-400">Open Trade at Data End</span>
                      <p className="text-[11px] text-[#848E9C] mt-0.5">An active basket was still open when data ended. Its PnL is <strong className="text-[#EAECEF]">unrealized</strong> and excluded from all statistics.</p>
                    </div>
                  </div>
                  <div className={`text-sm font-bold font-mono px-3 py-1 rounded-lg ${s.open_trade_pnl >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#F6465D]/10 text-[#F6465D]'}`}>
                    {s.open_trade_pnl >= 0 ? '+' : ''}{s.open_trade_pnl.toFixed(4)} (unrealized)
                  </div>
                </div>
              )}

              {/* Interactive Candlestick Chart */}
              {config.chart_enabled && result.price_data?.length > 0 && (
                <BacktestChart
                  priceData={result.price_data}
                  equityCurve={result.equity_curve}
                  tradeEvents={result.trade_events || []}
                  trades={result.trades || []}
                  symbol={config.symbol}
                />
              )}

              {/* Trades Table */}
              <div className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden min-w-0">
                <div className="px-5 py-3 border-b border-[#2B2F36] flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#EAECEF]">
                    Trade History ({s.total_trades}{s.has_open_trade ? ' + 1 open' : ''})
                  </h3>
                  <button onClick={() => exportPDF(result, config)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181A20] hover:bg-[#2B2F36] border border-[#2B2F36] rounded-lg text-xs font-semibold text-[#EAECEF] transition-all">
                    <FileDown size={13} /> Export PDF
                  </button>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#0B0E11]/95 backdrop-blur z-10">
                      <tr className="text-[#848E9C] text-[10px] uppercase tracking-wider">
                        <th className="px-3 py-2.5 text-left">#</th>
                        <th className="px-3 py-2.5 text-left">Side</th>
                        <th className="px-3 py-2.5 text-left">Entry Time</th>
                        <th className="px-3 py-2.5 text-left">Exit Time</th>
                        <th className="px-3 py-2.5 text-center">Dur.</th>
                        <th className="px-3 py-2.5 text-right">Entry $</th>
                        <th className="px-3 py-2.5 text-right">Avg Entry</th>
                        <th className="px-3 py-2.5 text-right">Exit $</th>
                        <th className="px-3 py-2.5 text-right">Notional</th>
                        <th className="px-3 py-2.5 text-right">Margin</th>
                        <th className="px-3 py-2.5 text-right">PnL</th>
                        <th className="px-3 py-2.5 text-right">PnL%</th>
                        <th className="px-3 py-2.5 text-right">Trade Fee</th>
                        <th className="px-3 py-2.5 text-right">Funding</th>
                        <th className="px-3 py-2.5 text-center">SOs</th>
                        <th className="px-3 py-2.5 text-left">Exit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t: any) => {
                        const isOpen = t.exit_reason === "END_OF_DATA";
                        return (
                        <tr key={t.id} className={`border-t border-[#2B2F36]/50 transition-colors ${isOpen ? 'bg-amber-500/[0.03] opacity-60' : 'hover:bg-[#181A20]/30'}`}>
                          <td className="px-3 py-2 text-[#848E9C] font-mono text-xs">{t.id}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.side === "LONG"
                              ? "bg-emerald-500/10 text-emerald-400" : "bg-[#F6465D]/10 text-[#F0B90B]"}`}>
                              {t.side}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-[#848E9C] whitespace-nowrap">{fmtDate(t.entry_time)}</td>
                          <td className="px-3 py-2 text-[11px] text-[#848E9C] whitespace-nowrap">{fmtDate(t.exit_time)}</td>
                          <td className="px-3 py-2 text-center text-[10px] text-[#848E9C]">{t.duration || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-[#EAECEF]">${t.entry_price}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-[#848E9C]">${t.avg_entry}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-[#EAECEF]">${t.exit_price}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-[#848E9C]">${(t.notional || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-blue-400">${(t.margin || 0).toFixed(2)}</td>
                          <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${isOpen ? 'text-[#848E9C]' : t.pnl >= 0 ? 'text-emerald-400' : 'text-[#F6465D]'}`}>
                            {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(4)}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono text-xs ${isOpen ? 'text-[#848E9C]/70' : (t.pnl_pct || 0) >= 0 ? 'text-emerald-400/70' : 'text-[#F6465D]/70'}`}>
                            {(t.pnl_pct || 0) >= 0 ? "+" : ""}{(t.pnl_pct || 0).toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-amber-400/60">-${(t.trading_fees || t.fees || 0).toFixed(4)}</td>
                          <td className={`px-3 py-2 text-right font-mono text-xs ${(t.funding_net || 0) <= 0 ? 'text-emerald-400/60' : 'text-orange-400/60'}`}>
                            {(t.funding_net || 0) === 0 ? '—' : `${(t.funding_net || 0) > 0 ? '-' : '+'}$${Math.abs(t.funding_net || 0).toFixed(4)}`}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-xs text-[#848E9C]">{t.sos_filled}/{t.max_sos || "—"}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              t.exit_reason === "TP" ? "bg-emerald-500/10 text-emerald-400" :
                              t.exit_reason === "MAX_AGE" ? "bg-orange-500/10 text-orange-400" :
                              t.exit_reason === "END_OF_DATA" ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" :
                              t.exit_reason === "RISK_STOP" ? "bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20" :
                              t.exit_reason === "LIQUIDATED" ? "bg-[#F6465D]/10 text-[#F6465D] border border-[#F6465D]/20" :
                              "bg-neutral-700 text-[#848E9C]"
                            }`}>{isOpen ? 'OPEN' : t.exit_reason === "RISK_STOP" ? '🛡️ RISK' : t.exit_reason}</span>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
