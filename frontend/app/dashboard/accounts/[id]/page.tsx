"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { accountsService } from "@/lib/services/accounts";
import { toast } from "sonner";
import { ArrowLeft, Wallet, TrendingUp, Activity, RefreshCw, Play, Square, Zap, ZapOff, Loader2, AlertTriangle, History, Settings, Award, BarChart3, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AccountSettingsModal from "../components/AccountSettingsModal";
import { historyService, type PnlSummary } from "@/lib/services/history";
import { useAccountWebSocket } from "@/lib/hooks/useAccountWebSocket";

export default function AccountDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [pnlSummary, setPnlSummary] = useState<PnlSummary | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [incomeFilter, setIncomeFilter] = useState("ALL");

  // Live WebSocket data
  const { liveData, status: wsStatus } = useAccountWebSocket(accountId);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [accData, dashboardData, pnlData] = await Promise.all([
        accountsService.getAccount(accountId),
        accountsService.getAccountDashboard(accountId),
        historyService.getPnlSummary(accountId).catch(() => null),
      ]);
      setAccount(accData);
      setData(dashboardData);
      setPnlSummary(pnlData);
    } catch (error: any) {
      toast.error(error.message || "Failed to load account dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountId) {
      fetchData();
    }
  }, [accountId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-[#848E9C]" />
      </div>
    );
  }

  if (!data || !account) {
    return (
      <div className="text-center mt-10">
        <h2 className="text-xl text-[#848E9C]">Account not found or failed to load data</h2>
        <Button className="mt-4" onClick={() => router.push('/dashboard/accounts')}>Back to Accounts</Button>
      </div>
    );
  }

  const { account_summary: rest_account_summary, recent_trades, income_history } = data;

  // Merge: live WS data overrides initial REST snapshot
  const positions = liveData.positions ?? data.positions;
  const balances = liveData.balances ?? data.balances;
  const open_orders = liveData.open_orders ?? data.open_orders;
  // Merge account summary: live WS balance data overrides REST
  const account_summary = liveData.account_summary
    ? { ...rest_account_summary, ...liveData.account_summary }
    : rest_account_summary;

  const formatCurrency = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
  };

  return (
    <div className="max-w-7xl mx-auto pb-10">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/accounts" className="text-[#848E9C] hover:text-[#F0B90B] transition-colors shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#EAECEF] mb-0.5 flex items-center gap-2 flex-wrap">
              <span className="truncate">{account.name}</span>
              {account.is_testnet && <span className="text-[10px] bg-[#F0B90B]/10 text-[#F0B90B] px-2 py-0.5 rounded uppercase font-bold tracking-widest border border-[#F0B90B]/20 shrink-0">Testnet</span>}
            </h1>
            <p className="text-sm text-[#848E9C]">Live Binance Futures data</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Auto-Trade Toggle */}
          <button
            onClick={async () => {
              try {
                await accountsService.toggleAutoTrade(accountId, !account.auto_trade_enabled);
                toast.success(account.auto_trade_enabled ? "Auto-trade disabled" : "Auto-trade enabled");
                fetchData();
              } catch (e: any) { toast.error(e.message || "Failed"); }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              account.auto_trade_enabled
                ? 'bg-[#0ECB81]/10 text-[#0ECB81] border border-[#0ECB81]/30 hover:bg-[#0ECB81]/20'
                : 'bg-[#2B2F36] text-[#848E9C] border border-[#2B2F36] hover:border-[#F0B90B]/30'
            }`}
          >
            {account.auto_trade_enabled ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
            Auto-Trade {account.auto_trade_enabled ? "ON" : "OFF"}
          </button>
          {account.status === "RUNNING" ? (
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#F0B90B] text-[#1E2026] hover:bg-[#D0980B] transition-all" onClick={async () => {
              try { await accountsService.stopTrading(accountId); toast.success("Stopped"); fetchData(); } catch(e:any) { toast.error(e.message); }
            }}>
              <Square className="h-3 w-3" /> Stop
            </button>
          ) : (
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#0ECB81] text-[#1E2026] hover:bg-[#0ECB81]/80 transition-all" onClick={async () => {
              try { await accountsService.startTrading(accountId); toast.success("Started"); fetchData(); } catch(e:any) { toast.error(e.message); }
            }}>
              <Play className="h-3 w-3" /> Start
            </button>
          )}
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#2B2F36] text-[#EAECEF] border border-[#2B2F36] hover:border-[#F0B90B]/30 transition-all">
            <Settings className="h-3 w-3" /> Settings
          </button>
          <Link href={`/dashboard/accounts/${accountId}/history`}>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#2B2F36] text-[#EAECEF] border border-[#2B2F36] hover:border-[#F0B90B]/30 transition-all">
              <History className="h-3 w-3" /> History
            </button>
          </Link>
          <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#2B2F36] text-[#EAECEF] border border-[#2B2F36] hover:border-[#F0B90B]/30 transition-all">
            <RefreshCw className="h-3 w-3" />
          </button>
          {/* Live WebSocket Status Indicator */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 mb-8">
        <Card className="bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border-[#2B2F36] shadow-xl backdrop-blur-md overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#848E9C]">
                <Wallet className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-medium tracking-wide">Wallet Balance</h3>
              </div>
            </div>
            <div className="text-3xl font-bold text-[#EAECEF] font-mono tracking-tight">
              {formatCurrency(account_summary.total_wallet_balance)}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border-[#2B2F36] shadow-xl backdrop-blur-md overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#848E9C]">
                <TrendingUp className={`h-4 w-4 ${parseFloat(account_summary.total_unrealized_pnl) >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`} />
                <h3 className="text-sm font-medium tracking-wide">Unrealized PnL</h3>
              </div>
            </div>
            <div className={`text-3xl font-bold font-mono tracking-tight ${parseFloat(account_summary.total_unrealized_pnl) >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
              {parseFloat(account_summary.total_unrealized_pnl) > 0 ? '+' : ''}{formatCurrency(account_summary.total_unrealized_pnl)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border-[#2B2F36] shadow-xl backdrop-blur-md overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#848E9C]">
                <BarChart3 className={`h-4 w-4 ${(pnlSummary?.net_pnl || 0) >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`} />
                <h3 className="text-sm font-medium tracking-wide">Realized PnL</h3>
              </div>
            </div>
            <div className={`text-3xl font-bold font-mono tracking-tight ${(pnlSummary?.net_pnl || 0) >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
              {(pnlSummary?.net_pnl || 0) > 0 ? '+' : ''}{formatCurrency(pnlSummary?.net_pnl || 0)}
            </div>
            {pnlSummary && pnlSummary.closed_baskets > 0 && (
              <div className="text-xs text-[#848E9C] mt-2 font-mono">
                {pnlSummary.winning_baskets}/{pnlSummary.closed_baskets} wins · {pnlSummary.win_rate}% WR
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border-[#2B2F36] shadow-xl backdrop-blur-md overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#848E9C]">
                <Activity className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-medium tracking-wide">Margin Balance</h3>
              </div>
            </div>
            <div className="text-3xl font-bold text-[#EAECEF] font-mono tracking-tight">
              {formatCurrency(account_summary.total_margin_balance)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border-[#2B2F36] shadow-xl backdrop-blur-md overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#848E9C]">
                <Wallet className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-medium tracking-wide">Available Balance</h3>
              </div>
            </div>
            <div className="text-3xl font-bold text-[#EAECEF] font-mono tracking-tight">
              {formatCurrency(account_summary.available_balance)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border-[#2B2F36] shadow-xl backdrop-blur-md overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#848E9C]">
                <Award className="h-4 w-4 text-[#F0B90B]" />
                <h3 className="text-sm font-medium tracking-wide">Total Fees</h3>
              </div>
            </div>
            <div className="text-3xl font-bold text-[#F0B90B] font-mono tracking-tight">
              {formatCurrency(pnlSummary?.total_fees_paid || 0)}
            </div>
            {pnlSummary && (
              <div className="text-xs text-[#848E9C] mt-2 font-mono">
                {pnlSummary.total_baskets} baskets total
                {(pnlSummary.error_baskets || 0) > 0 && <span className="text-[#F6465D]"> · {pnlSummary.error_baskets} errors</span>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="positions" className="w-full flex flex-col">
        <div className="w-full overflow-x-auto pb-2 mb-4 scrollbar-hide">
          <TabsList className="bg-[#2B2F36] border border-[#2B2F36] p-1.5 h-auto flex inline-flex min-w-max rounded-lg">
            <TabsTrigger value="positions" className="rounded-md px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-[#F0B90B] data-[state=active]:text-[#1E2026] data-[state=active]:shadow-md">Positions ({positions?.length || 0})</TabsTrigger>
            <TabsTrigger value="balances" className="rounded-md px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-[#F0B90B] data-[state=active]:text-[#1E2026] data-[state=active]:shadow-md">Balances</TabsTrigger>
            <TabsTrigger value="orders" className="rounded-md px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-[#F0B90B] data-[state=active]:text-[#1E2026] data-[state=active]:shadow-md">Open Orders ({open_orders?.length || 0})</TabsTrigger>
            <TabsTrigger value="trades" className="rounded-md px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-[#F0B90B] data-[state=active]:text-[#1E2026] data-[state=active]:shadow-md">Recent Trades</TabsTrigger>
            <TabsTrigger value="income" className="rounded-md px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-[#F0B90B] data-[state=active]:text-[#1E2026] data-[state=active]:shadow-md">Income History</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="positions" className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden shadow-xl backdrop-blur-sm mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-xs tracking-wider border-b border-[#2B2F36]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Symbol</th>
                  <th className="px-6 py-4 font-semibold">Size</th>
                  <th className="px-6 py-4 font-semibold">Entry Price</th>
                  <th className="px-6 py-4 font-semibold">Mark Price</th>
                  <th className="px-6 py-4 font-semibold">Liq. Price</th>
                  <th className="px-6 py-4 font-semibold">Margin</th>
                  <th className="px-6 py-4 font-semibold">Maint Margin</th>
                  <th className="px-6 py-4 font-semibold text-right">Unrealized PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {positions?.length > 0 ? positions.map((p: any, i: number) => {
                  const pnl = parseFloat(p.unRealizedProfit);
                  const amt = parseFloat(p.positionAmt);
                  const mark = parseFloat(p.markPrice);
                  const sizeUsdt = Math.abs(amt * mark);
                  return (
                    <tr key={i} className="hover:bg-[#181A20]/40 transition-colors">
                      <td className="px-6 py-4 font-medium text-[#EAECEF] flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base tracking-tight">{p.symbol}</span>
                          <span className="text-xs bg-[#181A20]/80 border border-[#2B2F36] px-2 py-0.5 rounded-md text-[#EAECEF] font-mono">{p.leverage}x</span>
                        </div>
                      </td>
                      <td className={`px-6 py-4 font-medium text-base ${amt > 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
                        {amt > 0 ? '+' : '-'}${sizeUsdt.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-[#EAECEF] font-mono">{parseFloat(p.entryPrice).toFixed(2)}</td>
                      <td className="px-6 py-4 text-[#EAECEF] font-mono">{mark.toFixed(2)}</td>
                      <td className="px-6 py-4 text-[#EAECEF] font-mono">{parseFloat(p.liquidationPrice).toFixed(2)}</td>
                      <td className="px-6 py-4 text-[#EAECEF] font-mono">${parseFloat(p.initialMargin || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 text-[#EAECEF] font-mono">${parseFloat(p.maintMargin || 0).toFixed(2)}</td>
                      <td className={`px-6 py-4 text-right font-bold text-base font-mono ${pnl >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
                        {pnl > 0 ? '+' : ''}{pnl.toFixed(4)}
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-[#848E9C]">
                      <div className="flex flex-col items-center gap-2">
                        <Activity className="h-8 w-8 text-[#2B2F36]" />
                        <p>No open positions right now.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="balances" className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden shadow-xl backdrop-blur-sm mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-xs tracking-wider border-b border-[#2B2F36]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Asset</th>
                  <th className="px-6 py-4 font-semibold">Wallet Balance</th>
                  <th className="px-6 py-4 font-semibold">Available</th>
                  <th className="px-6 py-4 font-semibold text-right">Unrealized PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {balances?.length > 0 ? balances.map((b: any, i: number) => {
                  const pnl = parseFloat(b.crossUnRealizedPNL);
                  return (
                    <tr key={i} className="hover:bg-[#181A20]/40 transition-colors">
                      <td className="px-6 py-4 font-bold text-[#EAECEF] text-base">{b.asset}</td>
                      <td className="px-6 py-4 text-[#EAECEF] font-mono text-base">{parseFloat(b.balance).toFixed(4)}</td>
                      <td className="px-6 py-4 text-[#EAECEF] font-mono text-base">{parseFloat(b.availableBalance).toFixed(4)}</td>
                      <td className={`px-6 py-4 text-right font-bold font-mono text-base ${pnl > 0 ? 'text-[#0ECB81]' : pnl < 0 ? 'text-[#F6465D]' : 'text-[#848E9C]'}`}>
                        {pnl > 0 ? '+' : ''}{pnl.toFixed(4)}
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-[#848E9C]">No balances found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden shadow-xl backdrop-blur-sm mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-xs tracking-wider border-b border-[#2B2F36]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Time</th>
                  <th className="px-6 py-4 font-semibold">Symbol</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Side</th>
                  <th className="px-6 py-4 font-semibold">Price</th>
                  <th className="px-6 py-4 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {open_orders?.length > 0 ? open_orders.map((o: any, i: number) => (
                  <tr key={i} className="hover:bg-[#181A20]/40 transition-colors">
                    <td className="px-6 py-4 text-[#848E9C] font-mono text-xs">{new Date(o.time).toLocaleString()}</td>
                    <td className="px-6 py-4 font-medium text-[#EAECEF] tracking-tight">{o.symbol}</td>
                    <td className="px-6 py-4 text-[#EAECEF]">
                      <span className="bg-[#181A20]/80 border border-[#2B2F36] px-2 py-1 rounded text-xs">{o.type}</span>
                    </td>
                    <td className={`px-6 py-4 font-bold ${o.side === 'BUY' ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>{o.side}</td>
                    <td className="px-6 py-4 text-[#EAECEF] font-mono">{parseFloat(o.price).toFixed(4)}</td>
                    <td className="px-6 py-4 text-right text-[#EAECEF] font-mono font-medium">{o.origQty}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-[#848E9C]">
                      <div className="flex flex-col items-center gap-2">
                        <Activity className="h-8 w-8 text-[#2B2F36]" />
                        <p>No open orders right now.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="trades" className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden shadow-xl backdrop-blur-sm mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-xs tracking-wider border-b border-[#2B2F36]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Time</th>
                  <th className="px-6 py-4 font-semibold">Symbol</th>
                  <th className="px-6 py-4 font-semibold">Side</th>
                  <th className="px-6 py-4 font-semibold">Price</th>
                  <th className="px-6 py-4 font-semibold">Qty (USDT)</th>
                  <th className="px-6 py-4 font-semibold">Commission</th>
                  <th className="px-6 py-4 font-semibold text-right">Realized PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {recent_trades?.length > 0 ? recent_trades.slice().reverse().map((t: any, i: number) => {
                  const pnl = parseFloat(t.realizedPnl);
                  return (
                    <tr key={i} className="hover:bg-[#181A20]/40 transition-colors">
                      <td className="px-6 py-4 text-[#848E9C] font-mono text-xs">{new Date(t.time).toLocaleString()}</td>
                      <td className="px-6 py-4 font-medium text-[#EAECEF] tracking-tight">{t.symbol}</td>
                      <td className={`px-6 py-4 font-bold ${t.side === 'BUY' ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>{t.side}</td>
                      <td className="px-6 py-4 text-[#EAECEF] font-mono">{parseFloat(t.price).toFixed(4)}</td>
                      <td className="px-6 py-4 text-[#EAECEF] font-mono">${(parseFloat(t.qty) * parseFloat(t.price)).toFixed(2)}</td>
                      <td className="px-6 py-4 text-amber-400 font-mono text-xs">{parseFloat(t.commission || 0).toFixed(4)} {t.commissionAsset || ''}</td>
                      <td className={`px-6 py-4 text-right font-bold font-mono text-base ${pnl > 0 ? 'text-[#0ECB81]' : pnl < 0 ? 'text-[#F6465D]' : 'text-[#848E9C]'}`}>
                        {pnl > 0 ? '+' : ''}{pnl.toFixed(4)}
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-[#848E9C]">No recent trades.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="income" className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl overflow-hidden shadow-xl backdrop-blur-sm mt-0">
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
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-xs tracking-wider border-b border-[#2B2F36]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Time</th>
                  <th className="px-6 py-4 font-semibold">Symbol</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Asset</th>
                  <th className="px-6 py-4 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181A20]">
                {(() => {
                  if (!income_history || income_history.length === 0) {
                    return <tr><td colSpan={5} className="px-6 py-12 text-center text-[#848E9C]">No income records.</td></tr>;
                  }
                  const filtered = income_history.filter((inc: any) => incomeFilter === "ALL" || inc.incomeType === incomeFilter);
                  if (filtered.length === 0) {
                    return <tr><td colSpan={5} className="px-6 py-12 text-center text-[#848E9C]">No records found for this type.</td></tr>;
                  }
                  return filtered.slice().reverse().map((inc: any, i: number) => {
                    const amount = parseFloat(inc.income);
                    return (
                      <tr key={i} className="hover:bg-[#181A20]/40 transition-colors">
                        <td className="px-6 py-4 text-[#848E9C] font-mono text-xs">{new Date(inc.time).toLocaleString()}</td>
                        <td className="px-6 py-4 font-medium text-[#EAECEF] tracking-tight">{inc.symbol}</td>
                        <td className="px-6 py-4 text-[#EAECEF]">
                          <span className={`px-2.5 py-1 rounded text-xs font-semibold tracking-wide ${inc.incomeType === 'REALIZED_PNL' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : inc.incomeType === 'FUNDING_FEE' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-[#181A20]/50 text-[#848E9C] border border-[#2B2F36]'}`}>
                            {inc.incomeType.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-[#EAECEF]">{inc.asset}</td>
                        <td className={`px-6 py-4 text-right font-bold font-mono text-base ${amount > 0 ? 'text-[#0ECB81]' : amount < 0 ? 'text-[#F6465D]' : 'text-[#848E9C]'}`}>
                          {amount > 0 ? '+' : ''}{amount.toFixed(4)}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Settings Modal */}
      {account && (
        <AccountSettingsModal
          account={account}
          isOpen={showSettings}
          onOpenChange={setShowSettings}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
