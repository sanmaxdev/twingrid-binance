"use client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import TrendFilterSection from "@/components/TrendFilterSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { adminService } from "@/lib/services/admin";

const SYMBOLS = [
  { value: "BTCUSDT", label: "BTC / USDT", icon: "₿" },
  { value: "ETHUSDT", label: "ETH / USDT", icon: "Ξ" },
  { value: "SOLUSDT", label: "SOL / USDT", icon: "◎" },
  { value: "XRPUSDT", label: "XRP / USDT", icon: "✕" },
];

const MAX_ACTIVE_SYMBOLS = 3;

interface Props {
  accountId: string;
  settingsData: any;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function AdminSettingsModal({ accountId, settingsData, isOpen, onOpenChange, onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settings, setSettings] = useState({
    active_symbols: ["BTCUSDT"] as string[], leverage: 10,
    sizing_mode: "fixed_usd" as "fixed_usd" | "pct_capital",
    base_order_usd: 1.0, base_order_pct: 1.0,
    compounding_enabled: false, compounding_pct: 100,
    volume_scale: 1.5, max_safety_orders: 7, step_scale: 1.35,
    take_profit_pct: 1.0, tp_mode: "pct" as "pct" | "fixed", tp_fixed_amount: 5.0,
    rsi_long_threshold: 40, rsi_short_threshold: 60,
    signal_threshold: 55, allow_long: true, allow_short: true,
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
  });

  useEffect(() => {
    if (settingsData?.config) {
      const c = settingsData.config;
      // Backward compat: active_symbol (string) -> active_symbols (array)
      const activeSyms: string[] = Array.isArray(c.active_symbols)
        ? c.active_symbols
        : c.active_symbol
          ? [c.active_symbol]
          : ["BTCUSDT"];
      setSettings({
        active_symbols: activeSyms,
        leverage: c.leverage || 10,
        sizing_mode: c.sizing_mode || "fixed_usd",
        base_order_usd: c.base_order_usd ?? 1.0,
        base_order_pct: c.base_order_pct ?? 1.0,
        compounding_enabled: c.compounding_enabled ?? false,
        compounding_pct: c.compounding_pct ?? 100,
        volume_scale: c.volume_scale || 1.5,
        max_safety_orders: c.max_safety_orders ?? 7,
        step_scale: c.step_scale || 1.35,
        take_profit_pct: c.take_profit_pct ?? 1.0,
        tp_mode: c.tp_mode || "pct",
        tp_fixed_amount: c.tp_fixed_amount ?? 5.0,
        rsi_long_threshold: c.rsi_long_threshold ?? 40,
        rsi_short_threshold: c.rsi_short_threshold ?? 60,
        signal_threshold: c.signal_threshold ?? 55,
        allow_long: c.allow_long ?? true,
        allow_short: c.allow_short ?? true,
        max_basket_age_hours: c.max_basket_age_hours ?? 72,
        trend_filter_enabled: c.trend_filter_enabled ?? false,
        trend_timeframes: c.trend_timeframes ?? ["1d", "4h"],
        trend_mode: c.trend_mode ?? "majority",
        trend_ema_fast: c.trend_ema_fast ?? 9,
        trend_ema_slow: c.trend_ema_slow ?? 21,
        risk_controller_enabled: c.risk_controller_enabled ?? false,
        rc_max_so_trigger: c.rc_max_so_trigger ?? 5,
        rc_margin_usage_pct: c.rc_margin_usage_pct ?? 80,
        rc_max_basket_loss_pct: c.rc_max_basket_loss_pct ?? 10,
        rc_max_basket_loss_usd: c.rc_max_basket_loss_usd ?? 50,
        rc_loss_mode: c.rc_loss_mode ?? "pct_wallet",
        rc_loss_direction: c.rc_loss_direction ?? "exceeds",
        rc_margin_guard_enabled: c.rc_margin_guard_enabled ?? true,
      });
    }
  }, [settingsData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await adminService.updateAccountSettings(accountId, settings);
      toast.success("Settings updated (admin override)");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Failed to update settings");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setSettings(prev => ({ ...prev, [name]: type === "number" ? (parseFloat(value) || 0) : value }));
  };

  const toggleSymbol = (sym: string) => {
    setSettings(prev => {
      const current = prev.active_symbols;
      if (current.includes(sym)) {
        if (current.length <= 1) { toast.error("At least 1 trading pair must be selected"); return prev; }
        return { ...prev, active_symbols: current.filter(s => s !== sym) };
      } else {
        if (current.length >= MAX_ACTIVE_SYMBOLS) { toast.error(`Maximum ${MAX_ACTIVE_SYMBOLS} pairs allowed`); return prev; }
        return { ...prev, active_symbols: [...current, sym] };
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Admin Settings Override</DialogTitle>
            <DialogDescription>Override trading parameters for this account. Changes apply immediately.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            {/* Symbol (Multi-Select) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Trading Pairs</label>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  settings.active_symbols.length >= MAX_ACTIVE_SYMBOLS
                    ? "bg-[#F0B90B]/15 text-[#F0B90B]"
                    : "bg-neutral-800 text-neutral-400"
                }`}>
                  {settings.active_symbols.length}/{MAX_ACTIVE_SYMBOLS} active
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {SYMBOLS.map(sym => (
                  <button key={sym.value} type="button"
                    onClick={() => toggleSymbol(sym.value)}
                    className={`flex items-center justify-center gap-1.5 py-3 px-2 rounded-lg border text-sm font-semibold transition-all duration-200 ${
                      settings.active_symbols.includes(sym.value)
                        ? "border-[#F0B90B] bg-[#F0B90B]/10 text-[#F0B90B] shadow-[0_0_12px_rgba(240,185,11,0.15)]"
                        : "border-neutral-700 bg-neutral-900/50 text-neutral-400 hover:border-neutral-500"
                    }`}>
                    <span className="text-lg">{sym.icon}</span>
                    <span className="text-xs">{sym.label.split(' / ')[0]}</span>
                    {settings.active_symbols.includes(sym.value) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F0B90B] ml-0.5"></span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            {/* Sizing */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 block">Position Sizing</label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {(["fixed_usd", "pct_capital"] as const).map(mode => (
                  <button key={mode} type="button" onClick={() => setSettings(prev => ({ ...prev, sizing_mode: mode }))}
                    className={`py-2.5 px-3 rounded-lg border text-sm font-semibold transition-all duration-200 ${
                      settings.sizing_mode === mode ? "border-[#F0B90B] bg-[#F0B90B]/10 text-[#F0B90B]" : "border-neutral-700 bg-neutral-900/50 text-neutral-400 hover:border-neutral-500"
                    }`}>{mode === "fixed_usd" ? "Fixed USD ($)" : "% of Capital"}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {settings.sizing_mode === "fixed_usd" ? (
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium text-neutral-300">Base Order ($)</label>
                    <Input name="base_order_usd" type="number" step="0.1" min="0.1" value={settings.base_order_usd} onChange={handleChange} required />
                  </div>
                ) : (
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium text-neutral-300">Base Order (%)</label>
                    <Input name="base_order_pct" type="number" step="0.1" min="0.1" value={settings.base_order_pct} onChange={handleChange} required />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-neutral-300">Leverage (x)</label>
                  <Input name="leverage" type="number" min="1" max="125" value={settings.leverage} onChange={handleChange} required />
                </div>
              </div>
            </div>
            {/* Compounding */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Compounding</label>
                <button type="button" onClick={() => setSettings(prev => ({ ...prev, compounding_enabled: !prev.compounding_enabled }))}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${settings.compounding_enabled ? "bg-[#0ECB81]" : "bg-neutral-700"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${settings.compounding_enabled ? "translate-x-5" : ""}`} />
                </button>
              </div>
            </div>
            {/* Grid */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 block">Grid Configuration</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-neutral-300">Max Safety Orders</label>
                  <Input name="max_safety_orders" type="number" step={1} min={0} max={20}
                    value={settings.max_safety_orders} onChange={handleChange} required />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-neutral-300">Take Profit</label>
                  <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                    <button type="button" onClick={() => setSettings(prev => ({ ...prev, tp_mode: "pct" as const }))}
                      className={`py-1 px-2 rounded-lg border text-[10px] font-semibold transition-all duration-200 ${
                        settings.tp_mode === "pct" ? "border-[#F0B90B] bg-[#F0B90B]/10 text-[#F0B90B]" : "border-neutral-700 bg-neutral-900/50 text-neutral-400 hover:border-neutral-500"
                      }`}>% Balance</button>
                    <button type="button" onClick={() => setSettings(prev => ({ ...prev, tp_mode: "fixed" as const }))}
                      className={`py-1 px-2 rounded-lg border text-[10px] font-semibold transition-all duration-200 ${
                        settings.tp_mode === "fixed" ? "border-[#F0B90B] bg-[#F0B90B]/10 text-[#F0B90B]" : "border-neutral-700 bg-neutral-900/50 text-neutral-400 hover:border-neutral-500"
                      }`}>Fixed ($)</button>
                  </div>
                  {settings.tp_mode === "pct" ? (
                    <Input name="take_profit_pct" type="number" step={0.1} min={0.1}
                      value={settings.take_profit_pct} onChange={handleChange} required />
                  ) : (
                    <Input name="tp_fixed_amount" type="number" step={0.5} min={0.5}
                      value={settings.tp_fixed_amount} onChange={handleChange} required />
                  )}
                </div>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-neutral-300">Volume Scale</label>
                  <Input name="volume_scale" type="number" step={0.1} min={1.0}
                    value={settings.volume_scale} onChange={handleChange} required />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-neutral-300">Step Scale</label>
                  <Input name="step_scale" type="number" step={0.01} min={1.0}
                    value={settings.step_scale} onChange={handleChange} required />
                </div>
              </div>
            </div>
            {/* Risk Management */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 block">Risk Management</label>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-neutral-300">Max Basket Age</label>
                <select
                  value={(settings as any).max_basket_age_hours}
                  onChange={(e) => setSettings(prev => ({ ...prev, max_basket_age_hours: parseInt(e.target.value) }))}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-[#F0B90B] outline-none"
                >
                  <option value={0}>Off (no limit)</option>
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                  <option value={72}>72 hours (default)</option>
                  <option value={168}>7 days</option>
                </select>
                <p className="text-[11px] text-neutral-500">Force-close baskets older than this. 0 = disabled.</p>
              </div>
            </div>
            {/* Trend Filter */}
            <TrendFilterSection
              enabled={settings.trend_filter_enabled}
              timeframes={settings.trend_timeframes}
              mode={settings.trend_mode}
              emaFast={settings.trend_ema_fast}
              emaSlow={settings.trend_ema_slow}
              onChange={(key, value) => setSettings(prev => ({ ...prev, [key]: value }))}
            />
            {/* Signal */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 block">Signal Sensitivity</label>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-neutral-300">Entry Threshold</label>
                <span className={`text-sm font-bold font-mono px-2 py-0.5 rounded ${
                  settings.signal_threshold <= 40 ? "text-[#F6465D] bg-[#F6465D]/10" :
                  settings.signal_threshold <= 55 ? "text-[#F0B90B] bg-[#F0B90B]/10" : "text-[#0ECB81] bg-[#0ECB81]/10"
                }`}>{settings.signal_threshold}</span>
              </div>
              <input type="range" min="30" max="80" step="5" value={settings.signal_threshold}
                onChange={e => setSettings(prev => ({ ...prev, signal_threshold: parseInt(e.target.value) }))}
                className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer accent-[#F0B90B]" />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-[#F6465D] font-semibold">AGGRESSIVE</span>
                <span className="text-[10px] text-[#0ECB81] font-semibold">CONSERVATIVE</span>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-neutral-300">RSI Long (&lt;)</label>
                  <Input name="rsi_long_threshold" type="number" min="20" max="50" value={settings.rsi_long_threshold} onChange={handleChange} />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-neutral-300">RSI Short (&gt;)</label>
                  <Input name="rsi_short_threshold" type="number" min="50" max="80" value={settings.rsi_short_threshold} onChange={handleChange} />
                </div>
              </div>
            </div>
            {/* Direction */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 block">Trade Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setSettings(prev => ({ ...prev, allow_long: !prev.allow_long }))}
                  className={`py-2.5 px-3 rounded-lg border text-sm font-semibold transition-all duration-200 ${
                    settings.allow_long ? "border-[#0ECB81]/50 bg-[#0ECB81]/10 text-[#0ECB81]" : "border-neutral-700 bg-neutral-900/50 text-neutral-500"
                  }`}>🟢 Long {settings.allow_long ? "ON" : "OFF"}</button>
                <button type="button" onClick={() => setSettings(prev => ({ ...prev, allow_short: !prev.allow_short }))}
                  className={`py-2.5 px-3 rounded-lg border text-sm font-semibold transition-all duration-200 ${
                    settings.allow_short ? "border-[#F6465D]/50 bg-[#F6465D]/10 text-[#F6465D]" : "border-neutral-700 bg-neutral-900/50 text-neutral-500"
                  }`}>🔴 Short {settings.allow_short ? "ON" : "OFF"}</button>
              </div>
            </div>

            {/* ── RISK CONTROLLER ── */}
            <div className="border border-[#2B2F36] rounded-xl p-4 bg-[#0B0E11]/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#F0B90B]/10 flex items-center justify-center">
                    <span className="text-sm">🛡️</span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#F0B90B] uppercase tracking-wider">Risk Controller</span>
                    <p className="text-[10px] text-neutral-500 mt-0.5">Auto-close losing baskets before liquidation</p>
                  </div>
                </div>
                <button type="button" onClick={() => setSettings(prev => ({ ...prev, risk_controller_enabled: !prev.risk_controller_enabled }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${settings.risk_controller_enabled ? "bg-[#F0B90B]" : "bg-neutral-700"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.risk_controller_enabled ? "translate-x-5" : ""}`} />
                </button>
              </div>
              {settings.risk_controller_enabled && (
                <div className="space-y-3 mt-3 pt-3 border-t border-[#2B2F36]">
                  <div className="grid gap-1.5">
                    <label className="text-xs text-neutral-400">SO Trigger</label>
                    <Input type="number" min="1" max="20" value={settings.rc_max_so_trigger}
                      onChange={(e) => setSettings(prev => ({ ...prev, rc_max_so_trigger: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs text-neutral-400">Loss Mode</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" onClick={() => setSettings(prev => ({ ...prev, rc_loss_mode: "pct_wallet" as const }))}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${settings.rc_loss_mode === "pct_wallet"
                          ? "bg-[#F0B90B]/10 border border-[#F0B90B]/30 text-[#F0B90B]" : "bg-neutral-900 border border-neutral-700 text-neutral-500"}`}>% Wallet</button>
                      <button type="button" onClick={() => setSettings(prev => ({ ...prev, rc_loss_mode: "fixed_usd" as const }))}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${settings.rc_loss_mode === "fixed_usd"
                          ? "bg-[#F0B90B]/10 border border-[#F0B90B]/30 text-[#F0B90B]" : "bg-neutral-900 border border-neutral-700 text-neutral-500"}`}>Fixed $</button>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs text-neutral-400">
                      {settings.rc_loss_mode === "pct_wallet" ? "Max Loss (% wallet)" : "Max Loss ($)"}
                    </label>
                    <Input type="number" min="1"
                      value={settings.rc_loss_mode === "pct_wallet" ? settings.rc_max_basket_loss_pct : settings.rc_max_basket_loss_usd}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setSettings(prev => ({
                          ...prev,
                          ...(prev.rc_loss_mode === "pct_wallet" ? { rc_max_basket_loss_pct: val } : { rc_max_basket_loss_usd: val })
                        }));
                      }} />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs text-neutral-400">Exit Direction</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" onClick={() => setSettings(prev => ({ ...prev, rc_loss_direction: "exceeds" as const }))}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${settings.rc_loss_direction === "exceeds"
                          ? "bg-[#F6465D]/10 border border-[#F6465D]/30 text-[#F6465D]"
                          : "bg-neutral-900 border border-neutral-700 text-neutral-500"}`}>⛔ Exceeds</button>
                      <button type="button" onClick={() => setSettings(prev => ({ ...prev, rc_loss_direction: "recovers_to" as const }))}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${settings.rc_loss_direction === "recovers_to"
                          ? "bg-[#0ECB81]/10 border border-[#0ECB81]/30 text-[#0ECB81]"
                          : "bg-neutral-900 border border-neutral-700 text-neutral-500"}`}>↩️ Recovers To</button>
                    </div>
                    <p className="text-[10px] text-neutral-500">
                      {settings.rc_loss_direction === "exceeds"
                        ? "Close when loss exceeds threshold."
                        : "Close only when PnL recovers back to threshold."}
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-neutral-400">Margin Guard</label>
                      <button type="button"
                        onClick={() => setSettings(prev => ({ ...prev, rc_margin_guard_enabled: !prev.rc_margin_guard_enabled }))}
                        className={`relative w-8 h-4 rounded-full transition-colors ${settings.rc_margin_guard_enabled ? "bg-[#F0B90B]" : "bg-neutral-700"}`}>
                        <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${settings.rc_margin_guard_enabled ? "translate-x-4" : ""}`} />
                      </button>
                    </div>
                    {settings.rc_margin_guard_enabled && (
                      <>
                        <Input type="number" min="50" max="99" step="5" value={settings.rc_margin_usage_pct}
                          onChange={(e) => setSettings(prev => ({ ...prev, rc_margin_usage_pct: parseFloat(e.target.value) || 80 }))} />
                        <p className="text-[10px] text-neutral-500">Independent — fires regardless of SO count</p>
                      </>
                    )}
                    {!settings.rc_margin_guard_enabled && (
                      <p className="text-[10px] text-[#F6465D]/70">Disabled — no margin protection active</p>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Settings"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
