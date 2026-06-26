"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminService } from "@/lib/services/admin";
import { historyService, type HistoryBasket, type PnlSummary } from "@/lib/services/history";
import { toast } from "sonner";
import { ArrowLeft, Wallet, TrendingUp, Activity, RefreshCw, Settings, Shield, Mail, BarChart3, Award, Trophy, Layers, History, Loader2, WifiOff, XCircle, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdminSettingsModal from "./AdminSettingsModal";
import { useAccountWebSocket } from "@/lib/hooks/useAccountWebSocket";

export default function AdminAccountDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);
  const [confirmCloseSymbol, setConfirmCloseSymbol] = useState<string | null>(null);
  const [incomeFilter, setIncomeFilter] = useState("ALL");

  // History tab state
  const [baskets, setBaskets] = useState<HistoryBasket[]>([]);
  const [basketsLoading, setBasketsLoading] = useState(false);
  const [basketPage, setBasketPage] = useState(1);
  const [basketTotal, setBasketTotal] = useState(0);
  const [basketStatusF, setBasketStatusF] = useState("");
  const [basketSideF, setBasketSideF] = useState("");
  const [basketExitF, setBasketExitF] = useState("");

  // Live WebSocket data
  const { liveData, status: wsStatus } = useAccountWebSocket(accountId);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashboardData, settings] = await Promise.all([
        adminService.getAccountDashboard(accountId),
        adminService.getAccountSettings(accountId),
      ]);
      setData(dashboardData);
      setSettingsData(settings);
    } catch (error: any) { toast.error(error.message || "Failed to load"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (accountId) fetchData(); }, [accountId]);

  const loadBaskets = useCallback(async () => {
    setBasketsLoading(true);
    try {
      const b = await historyService.listBaskets(accountId, { page: basketPage, status: basketStatusF || undefined, side: basketSideF || undefined, exit_reason: basketExitF || undefined });
      setBaskets(b.items); setBasketTotal(b.total);
    } catch (e: any) { toast.error(e.message); } finally { setBasketsLoading(false); }
  }, [accountId, basketPage, basketStatusF, basketSideF, basketExitF]);

  useEffect(() => { if (accountId) loadBaskets(); }, [loadBaskets]);

  const exportCsv = async () => {
    try {
      const blob = await historyService.exportCsv(accountId);
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `export_${accountId}.csv`; a.click();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleClosePosition = (symbol: string) => {
    setConfirmCloseSymbol(symbol);
  };

  const executeClosePosition = async () => {
    if (!confirmCloseSymbol) return;
    const symbol = confirmCloseSymbol;
    setConfirmCloseSymbol(null);
    
    setClosingSymbol(symbol);
    try {
      await adminService.closeAccountPosition(accountId, symbol);
      toast.success(`Position ${symbol} closed successfully.`);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || `Failed to close ${symbol} position`);
    } finally {
      setClosingSymbol(null);
    }
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-[#F0B90B] rounded-full animate-pulse" />
        <span className="text-sm text-[#848E9C]">Loading dashboard...</span>
      </div>
    </div>
  );

  if (!data) return (
    <div className="text-center mt-10">
      <h2 className="text-lg text-[#848E9C] mb-4">Account data failed to load</h2>
      <button onClick={() => router.push('/admin/accounts')} className="px-4 py-2 rounded-md text-sm font-semibold bg-[#F0B90B] text-[#1E2026]">Back</button>
    </div>
  );

  const { account_summary: rest_account_summary, account_info, owner, pnl_summary, recent_trades, income_history } = data;

  // Merge: live WS data overrides initial REST snapshot
  const positions = liveData.positions ?? data.positions;
  const balances = liveData.balances ?? data.balances;
  const open_orders = liveData.open_orders ?? data.open_orders;
  // Merge account summary: live WS balance data overrides REST
  const account_summary = liveData.account_summary
    ? { ...rest_account_summary, ...liveData.account_summary }
    : rest_account_summary;
  const ps = pnl_summary || {};
  const fmt = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
  };

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
  const pnlVal = parseFloat(account_summary.total_unrealized_pnl);
  const rpnl = ps.net_pnl || 0;

  return (
    <div className="max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link href="/admin/accounts" className="text-[#848E9C] hover:text-[#F0B90B] transition-colors shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-[#EAECEF] flex items-center gap-2 flex-wrap">
              <span className="truncate">{account_info?.name || "Account"}</span>
              <span className="text-[10px] bg-[#F0B90B]/10 text-[#F0B90B] px-2 py-0.5 rounded uppercase font-bold tracking-widest border border-[#F0B90B]/20 shrink-0">Admin</span>
              {account_info?.is_testnet ? (
                <span className="text-[10px] bg-[#F0B90B]/10 text-[#F0B90B] px-2 py-0.5 rounded uppercase font-bold tracking-widest border border-[#F0B90B]/20 shrink-0">Testnet</span>
              ) : (
                <span className="text-[10px] bg-[#0ECB81]/10 text-[#0ECB81] px-2 py-0.5 rounded uppercase font-bold tracking-widest border border-[#0ECB81]/20 shrink-0">Mainnet</span>
              )}
            </h1>
            <p className="text-sm text-[#848E9C]">Live Binance Futures data</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowSettings(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-[#F0B90B] text-[#1E2026] hover:bg-[#D0980B] transition-all">
            <Settings className="h-4 w-4" /> Settings
          </button>
          <button onClick={fetchData} className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-[#2B2F36] text-[#EAECEF] hover:bg-[#2B2F36]/80 border border-[#2B2F36] transition-all">
            <RefreshCw className="h-4 w-4" />
          </button>
          {/* Live WebSocket Status Indicator */}
          <div className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
            wsStatus === 'connected'
              ? 'bg-[#0ECB81]/10 text-[#0ECB81] border-[#0ECB81]/30'
              : wsStatus === 'connecting'
                ? 'bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/30'
                : 'bg-[#2B2F36] text-[#848E9C] border-[#2B2F36]'
          }`}>
            {wsStatus === 'connected' ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0ECB81] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0ECB81]"></span>
                </span>
                Live
              </>
            ) : wsStatus === 'connecting' ? (
              <>
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Connecting
              </>
            ) : (
              <>
                <WifiOff className="h-2.5 w-2.5" />
                Offline
              </>
            )}
          </div>
        </div>
      </div>

      {/* Owner Info Banner */}
      {owner && (
        <div className="bg-[#2B2F36] rounded-xl p-4 mb-6 border border-[#2B2F36] flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 rounded-full bg-[#F0B90B]/10 flex items-center justify-center text-[#F0B90B] font-bold text-sm uppercase border border-[#F0B90B]/20 shrink-0">
            {(owner.email || "??").substring(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[#EAECEF]">{owner.display_name || owner.email?.split('@')[0]}</span>
              {(owner.role === "SUPER_ADMIN" || owner.role === "ADMIN") && (
                <span className="text-[10px] bg-[#F0B90B]/10 text-[#F0B90B] px-1.5 py-0.5 rounded uppercase font-bold border border-[#F0B90B]/20">{owner.role.replace('_', ' ')}</span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold border ${owner.is_active ? 'bg-[#0ECB81]/10 text-[#0ECB81] border-[#0ECB81]/20' : 'bg-[#F6465D]/10 text-[#F6465D] border-[#F6465D]/20'}`}>
                {owner.is_active ? 'Active' : 'Suspended'}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 mt-1 flex-wrap text-xs text-[#848E9C]">
              <span className="flex items-center gap-1"><Mail size={11} /> {owner.email}</span>
              <span className="hidden sm:inline text-[#2B2F36]">·</span>
              <span>{account_info?.exchange}</span>
              <span className={`font-medium ${account_info?.status === 'RUNNING' ? 'text-[#0ECB81]' : account_info?.status === 'IDLE' ? 'text-[#F0B90B]' : 'text-[#F6465D]'}`}>{account_info?.status}</span>
            </div>
          </div>
        </div>
      )}

      {/* Live Balance Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <div className="bg-[#2B2F36] rounded-xl p-4 sm:p-5 border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-[#F0B90B]/10"><Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#F0B90B]" /></div>
            <span className="text-[10px] sm:text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Wallet</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-[#EAECEF] tracking-tight truncate">{fmt(account_summary.total_wallet_balance)}</div>
        </div>
        <div className="bg-[#2B2F36] rounded-xl p-4 sm:p-5 border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className={`p-1.5 rounded-lg ${pnlVal >= 0 ? 'bg-[#0ECB81]/10' : 'bg-[#F6465D]/10'}`}><TrendingUp className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${pnlVal >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`} /></div>
            <span className="text-[10px] sm:text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Unrealized PnL</span>
          </div>
          <div className={`text-lg sm:text-2xl font-bold font-mono tracking-tight truncate ${pnlVal >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
            {pnlVal > 0 ? '+' : ''}{fmt(account_summary.total_unrealized_pnl)}
          </div>
        </div>
        <div className="bg-[#2B2F36] rounded-xl p-4 sm:p-5 border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-purple-500/10"><Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-400" /></div>
            <span className="text-[10px] sm:text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Margin</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-[#EAECEF] tracking-tight truncate">{fmt(account_summary.total_margin_balance)}</div>
        </div>
        <div className="bg-[#2B2F36] rounded-xl p-4 sm:p-5 border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-[#0ECB81]/10"><Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#0ECB81]" /></div>
            <span className="text-[10px] sm:text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Available</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-[#EAECEF] tracking-tight truncate">{fmt(account_summary.available_balance)}</div>
        </div>
      </div>

      {/* Trading Performance Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <div className="bg-[#2B2F36] rounded-xl p-4 sm:p-5 border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className={`p-1.5 rounded-lg ${rpnl >= 0 ? 'bg-[#0ECB81]/10' : 'bg-[#F6465D]/10'}`}><BarChart3 className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${rpnl >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`} /></div>
            <span className="text-[10px] sm:text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Realized PnL</span>
          </div>
          <div className={`text-lg sm:text-2xl font-bold font-mono tracking-tight truncate ${rpnl >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
            {rpnl > 0 ? '+' : ''}{fmt(rpnl)}
          </div>
          {ps.closed_baskets > 0 && <div className="text-[10px] text-[#848E9C] mt-1.5 font-mono">{ps.winning_baskets}W / {ps.losing_baskets}L</div>}
        </div>
        <div className="bg-[#2B2F36] rounded-xl p-4 sm:p-5 border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-[#F0B90B]/10"><Award className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#F0B90B]" /></div>
            <span className="text-[10px] sm:text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Total Fees</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-[#F0B90B] tracking-tight truncate">{fmt(ps.total_fees_paid || 0)}</div>
        </div>
        <div className="bg-[#2B2F36] rounded-xl p-4 sm:p-5 border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-cyan-500/10"><Trophy className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-cyan-400" /></div>
            <span className="text-[10px] sm:text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Win Rate</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-[#EAECEF] tracking-tight">{ps.win_rate || 0}%</div>
          {ps.closed_baskets > 0 && <div className="text-[10px] text-[#848E9C] mt-1.5 font-mono">{ps.winning_baskets}/{ps.closed_baskets} wins</div>}
        </div>
        <div className="bg-[#2B2F36] rounded-xl p-4 sm:p-5 border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-blue-500/10"><Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-400" /></div>
            <span className="text-[10px] sm:text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Baskets</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-[#EAECEF] tracking-tight">{ps.total_baskets || 0}</div>
          <div className="text-[10px] text-[#848E9C] mt-1.5 font-mono">
            {ps.active_baskets || 0} active · {ps.closed_baskets || 0} closed
            {(ps.error_baskets || 0) > 0 && <span className="text-[#F6465D]"> · {ps.error_baskets} errors</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="positions" className="w-full flex flex-col">
        <div className="w-full overflow-x-auto pb-2 mb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="bg-[#2B2F36] border border-[#2B2F36] p-1 h-auto flex inline-flex min-w-max rounded-lg">
            {[
              { v: "positions", l: `Positions (${positions?.length || 0})` },
              { v: "balances", l: "Balances" },
              { v: "orders", l: `Orders (${open_orders?.length || 0})` },
              { v: "trades", l: "Trades" },
              { v: "income", l: "Income" },
              { v: "history", l: "History" },
            ].map(t => (
              <TabsTrigger key={t.v} value={t.v}
                className="rounded-md px-3 sm:px-5 py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition-all text-[#848E9C] whitespace-nowrap data-[state=active]:bg-[#F0B90B] data-[state=active]:text-[#1E2026] data-[state=active]:shadow-sm">
                {t.l}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Positions */}
        <TabsContent value="positions" className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-[11px] tracking-wider border-b border-[#181A20]">
                <tr>
                  {["Symbol","Size","Entry","Mark","Liq.","Margin","Maint","PnL"].map(h=><th key={h} className={`px-4 py-3 font-semibold ${h==="PnL"?"text-right":""}`}>{h}</th>)}
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {positions?.length > 0 ? positions.map((p: any, i: number) => {
                  const pnl = parseFloat(p.unRealizedProfit);
                  const amt = parseFloat(p.positionAmt);
                  const mark = parseFloat(p.markPrice);
                  const sizeUsdt = Math.abs(amt * mark);
                  return (
                    <tr key={i} className="hover:bg-[#181A20]/60 transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#EAECEF]">{p.symbol} <span className="text-[10px] bg-[#181A20] border border-[#2B2F36] px-1 py-0.5 rounded text-[#848E9C] font-mono ml-1">{p.leverage}x</span></td>
                      <td className={`px-4 py-3 font-semibold font-mono ${amt > 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>{amt > 0 ? '+' : '-'}${sizeUsdt.toFixed(2)}</td>
                      <td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">{parseFloat(p.entryPrice).toFixed(2)}</td>
                      <td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">{mark.toFixed(2)}</td>
                      <td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">{parseFloat(p.liquidationPrice).toFixed(2)}</td>
                      <td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">${parseFloat(p.initialMargin || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">${parseFloat(p.maintMargin || 0).toFixed(2)}</td>
                      <td className={`px-4 py-3 text-right font-bold font-mono ${pnl >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>{pnl > 0 ? '+' : ''}{pnl.toFixed(4)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleClosePosition(p.symbol)}
                          disabled={closingSymbol === p.symbol}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#F6465D]/10 text-[#F6465D] hover:bg-[#F6465D]/20 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {closingSymbol === p.symbol ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={9} className="px-4 py-12 text-center text-[#848E9C] text-xs">No open positions.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Balances */}
        <TabsContent value="balances" className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[400px]">
              <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-[11px] tracking-wider border-b border-[#181A20]">
                <tr><th className="px-4 py-3 font-semibold">Asset</th><th className="px-4 py-3 font-semibold">Balance</th><th className="px-4 py-3 font-semibold">Available</th><th className="px-4 py-3 font-semibold text-right">PnL</th></tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {balances?.length > 0 ? balances.map((b: any, i: number) => {
                  const bpnl = parseFloat(b.crossUnRealizedPNL);
                  return (
                    <tr key={i} className="hover:bg-[#181A20]/60"><td className="px-4 py-3 font-bold text-[#EAECEF]">{b.asset}</td><td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">{parseFloat(b.balance).toFixed(4)}</td><td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">{parseFloat(b.availableBalance).toFixed(4)}</td><td className={`px-4 py-3 text-right font-bold font-mono ${bpnl > 0 ? 'text-[#0ECB81]' : bpnl < 0 ? 'text-[#F6465D]' : 'text-[#848E9C]'}`}>{bpnl > 0 ? '+' : ''}{bpnl.toFixed(4)}</td></tr>
                  );
                }) : <tr><td colSpan={4} className="px-4 py-12 text-center text-[#848E9C] text-xs">No balances.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders" className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[650px]">
              <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-[11px] tracking-wider border-b border-[#181A20]">
                <tr>{["Time","Symbol","Type","Side","Price","Qty","Filled","RO"].map(h=><th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {open_orders?.length > 0 ? open_orders.map((o: any, i: number) => (
                  <tr key={i} className="hover:bg-[#181A20]/60">
                    <td className="px-4 py-3 text-[#848E9C] font-mono text-[11px] whitespace-nowrap">{new Date(o.time).toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold text-[#EAECEF]">{o.symbol}</td>
                    <td className="px-4 py-3"><span className="bg-[#181A20] border border-[#2B2F36] px-2 py-0.5 rounded text-[11px] text-[#848E9C]">{o.type}</span></td>
                    <td className={`px-4 py-3 font-bold text-xs ${o.side === 'BUY' ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>{o.side}</td>
                    <td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">{parseFloat(o.price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">{o.origQty}</td>
                    <td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">{o.executedQty || "0"}</td>
                    <td className="px-4 py-3 text-[#848E9C] text-[11px]">{o.reduceOnly ? "Yes" : "No"}</td>
                  </tr>
                )) : <tr><td colSpan={8} className="px-4 py-12 text-center text-[#848E9C] text-xs">No open orders.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Trades */}
        <TabsContent value="trades" className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[600px]">
              <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-[11px] tracking-wider border-b border-[#181A20]">
                <tr>{["Time","Symbol","Side","Price","Qty (USDT)","Commission","PnL"].map(h=><th key={h} className={`px-4 py-3 font-semibold ${h==="PnL"?"text-right":""}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {recent_trades?.length > 0 ? recent_trades.slice().reverse().map((t: any, i: number) => {
                  const tpnl = parseFloat(t.realizedPnl);
                  return (
                    <tr key={i} className="hover:bg-[#181A20]/60">
                      <td className="px-4 py-3 text-[#848E9C] font-mono text-[11px] whitespace-nowrap">{new Date(t.time).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-[#EAECEF]">{t.symbol}</td>
                      <td className={`px-4 py-3 font-bold text-xs ${t.side === 'BUY' ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>{t.side}</td>
                      <td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">{parseFloat(t.price).toFixed(2)}</td>
                      <td className="px-4 py-3 text-[#EAECEF] font-mono text-xs">${(parseFloat(t.qty) * parseFloat(t.price)).toFixed(2)}</td>
                      <td className="px-4 py-3 text-[#F0B90B] font-mono text-[11px]">{parseFloat(t.commission || 0).toFixed(4)} {t.commissionAsset || ''}</td>
                      <td className={`px-4 py-3 text-right font-bold font-mono ${tpnl > 0 ? 'text-[#0ECB81]' : tpnl < 0 ? 'text-[#F6465D]' : 'text-[#848E9C]'}`}>{tpnl > 0 ? '+' : ''}{tpnl.toFixed(4)}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={7} className="px-4 py-12 text-center text-[#848E9C] text-xs">No recent trades.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Income */}
        <TabsContent value="income" className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden mt-0">
          {income_history?.length > 0 && (
            <div className="border-b border-[#2B2F36] bg-[#0B0E11] px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setIncomeFilter("ALL")}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${incomeFilter === "ALL" ? "bg-[#F0B90B] text-[#1E2026]" : "bg-[#2B2F36] text-[#848E9C] hover:text-[#EAECEF]"}`}
              >
                All
              </button>
              {Array.from(new Set(income_history.map((inc: any) => inc.incomeType))).map((type: any) => (
                <button
                  key={type}
                  onClick={() => setIncomeFilter(type)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap uppercase ${incomeFilter === type ? "bg-[#F0B90B] text-[#1E2026]" : "bg-[#2B2F36] text-[#848E9C] hover:text-[#EAECEF]"}`}
                >
                  {type.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[500px]">
              <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-[11px] tracking-wider border-b border-[#181A20]">
                <tr>{["Time","Symbol","Type","Asset","Amount"].map(h=><th key={h} className={`px-4 py-3 font-semibold ${h==="Amount"?"text-right":""}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {(() => {
                  if (!income_history || income_history.length === 0) {
                    return <tr><td colSpan={5} className="px-4 py-12 text-center text-[#848E9C] text-xs">No income records.</td></tr>;
                  }
                  const filtered = income_history.filter((inc: any) => incomeFilter === "ALL" || inc.incomeType === incomeFilter);
                  if (filtered.length === 0) {
                    return <tr><td colSpan={5} className="px-4 py-12 text-center text-[#848E9C] text-xs">No records found for this type.</td></tr>;
                  }
                  return filtered.slice().reverse().map((inc: any, i: number) => {
                    const amt = parseFloat(inc.income);
                    return (
                      <tr key={i} className="hover:bg-[#181A20]/60">
                        <td className="px-4 py-3 text-[#848E9C] font-mono text-[11px] whitespace-nowrap">{new Date(inc.time).toLocaleString()}</td>
                        <td className="px-4 py-3 font-semibold text-[#EAECEF]">{inc.symbol}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${inc.incomeType === 'REALIZED_PNL' ? 'bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20' : inc.incomeType === 'FUNDING_FEE' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-[#181A20] text-[#848E9C] border border-[#2B2F36]'}`}>{inc.incomeType?.replace(/_/g, ' ')}</span></td>
                        <td className="px-4 py-3 font-semibold text-[#EAECEF]">{inc.asset}</td>
                        <td className={`px-4 py-3 text-right font-bold font-mono ${amt > 0 ? 'text-[#0ECB81]' : amt < 0 ? 'text-[#F6465D]' : 'text-[#848E9C]'}`}>{amt > 0 ? '+' : ''}{amt.toFixed(4)}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-0">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Filter className="h-4 w-4 text-[#848E9C]" />
            <select value={basketStatusF} onChange={e => { setBasketStatusF(e.target.value); setBasketPage(1); }} className="bg-[#2B2F36] border border-[#2B2F36] rounded-lg px-3 py-1.5 text-sm text-[#EAECEF] focus:border-[#F0B90B]/30 focus:outline-none transition-all">
              <option value="">All Status</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="ERROR">Error</option><option value="LIQUIDATED">Liquidated</option>
            </select>
            <select value={basketSideF} onChange={e => { setBasketSideF(e.target.value); setBasketPage(1); }} className="bg-[#2B2F36] border border-[#2B2F36] rounded-lg px-3 py-1.5 text-sm text-[#EAECEF] focus:border-[#F0B90B]/30 focus:outline-none transition-all">
              <option value="">All Sides</option><option value="LONG">Long</option><option value="SHORT">Short</option>
            </select>
            <select value={basketExitF} onChange={e => { setBasketExitF(e.target.value); setBasketPage(1); }} className="bg-[#2B2F36] border border-[#2B2F36] rounded-lg px-3 py-1.5 text-sm text-[#EAECEF] focus:border-[#F0B90B]/30 focus:outline-none transition-all">
              <option value="">All Exit Reasons</option>
              <option value="TP_FILLED">✅ TP Hit</option>
              <option value="MANUAL_CLOSE">⚠️ Manual Close</option>
              <option value="AGE_LIMIT">⏰ Age Limit</option>
              <option value="RISK_STOP">🛡️ Risk Stop</option>
              <option value="LIQUIDATION">🚨 Liquidation</option>
              <option value="ADL">⚡ ADL</option>
              <option value="reconciled_no_position">🔄 Reconciled</option>
            </select>
            <span className="text-xs text-[#848E9C] ml-auto">{basketTotal} baskets</span>
            <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#2B2F36] text-[#EAECEF] border border-[#2B2F36] hover:border-[#F0B90B]/30 transition-all"><Download className="h-3 w-3" />CSV</button>
            <button onClick={loadBaskets} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#2B2F36] text-[#EAECEF] border border-[#2B2F36] hover:border-[#F0B90B]/30 transition-all"><RefreshCw className="h-3 w-3" /></button>
          </div>
          <div className="bg-[#181A20] border border-[#2B2F36] rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[1100px]">
                <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-xs tracking-wider border-b border-[#2B2F36]">
                  <tr>{["Bucket ID","Symbol","Side","Status","Exit Reason","Lev","Entry","TP","SO#","Margin","Fees","PnL","Duration","Opened"].map(h=><th key={h} className={`px-4 py-4 font-semibold ${h==="PnL"?"text-right":""}`}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-[#181A20]">
                  {basketsLoading ? <tr><td colSpan={14} className="py-12 text-center"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-[#848E9C]" /></td></tr>
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
          {basketTotal > 25 && <div className="flex justify-center gap-3 mt-6">
            <Button variant="outline" size="sm" disabled={basketPage<=1} onClick={()=>setBasketPage(p=>p-1)}>Previous</Button>
            <span className="text-[#848E9C] text-sm flex items-center">Page {basketPage}/{Math.ceil(basketTotal/25)}</span>
            <Button variant="outline" size="sm" disabled={basketPage*25>=basketTotal} onClick={()=>setBasketPage(p=>p+1)}>Next</Button>
          </div>}
        </TabsContent>
      </Tabs>

      <AdminSettingsModal accountId={accountId} settingsData={settingsData} isOpen={showSettings} onOpenChange={setShowSettings} onSuccess={fetchData} />

      {/* Confirm Close Position Modal */}
      <Dialog open={!!confirmCloseSymbol} onOpenChange={(open) => !open && setConfirmCloseSymbol(null)}>
        <DialogContent className="bg-[#1E2026] border-[#2B2F36] text-[#EAECEF] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#F0B90B]">Close Position</DialogTitle>
            <DialogDescription className="text-[#848E9C] pt-2">
              Are you sure you want to close the <span className="font-bold text-[#EAECEF]">{confirmCloseSymbol}</span> position?
              This will execute a MARKET order and cancel all open orders for this symbol.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 sm:justify-end">
            <button
              onClick={() => setConfirmCloseSymbol(null)}
              className="px-4 py-2 rounded-md text-sm font-semibold bg-[#2B2F36] text-[#EAECEF] hover:bg-[#2B2F36]/80 border border-[#2B2F36] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={executeClosePosition}
              disabled={!!closingSymbol}
              className="px-4 py-2 rounded-md text-sm font-semibold bg-[#F6465D] text-white hover:bg-[#F6465D]/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {closingSymbol === confirmCloseSymbol ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Close Position
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
