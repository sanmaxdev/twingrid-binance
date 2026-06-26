"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity, Wallet, Bot, TrendingUp, Plus, ArrowRight,
  Briefcase, BookOpen, RefreshCw, Clock, BarChart3, AlertTriangle,
  Loader2, WifiOff
} from "lucide-react";
import api from "@/lib/api";
import { useWorkspace } from "./WorkspaceContext";
import { accountsService, type AccountResponse } from "@/lib/services/accounts";
import { historyService, type EquitySnapshot } from "@/lib/services/history";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid
} from "recharts";
import { useMultiAccountWebSocket } from "@/lib/hooks/useMultiAccountWebSocket";

const fmt = (v: number) =>
  "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DashboardOverview() {
  const { activeWorkspace } = useWorkspace();
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [dashboards, setDashboards] = useState<Record<string, any>>({});
  const [equityData, setEquityData] = useState<{ t: string; v: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletWarning, setWalletWarning] = useState<{balance: number; minimum: number} | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allAccs = await accountsService.listAccounts();
      const accs = activeWorkspace
        ? allAccs.filter((a) => a.workspace_id === activeWorkspace.id)
        : allAccs;
      setAccounts(accs);

      const dashMap: Record<string, any> = {};
      await Promise.all(
        accs.map(async (a) => {
          try {
            const d = await accountsService.getAccountDashboard(a.id);
            dashMap[a.id] = d;
          } catch {}
        })
      );
      setDashboards(dashMap);

      setEquityData([]);
      if (accs.length > 0) {
        try {
          const eq = await historyService.getEquityHistory(accs[0].id, 24);
          setEquityData(
            eq.map((s) => ({
              t: new Date(s.recorded_at).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              }),
              v: Number(s.total_equity),
            }))
          );
        } catch {}
      }

      // Check Twin Grid Balance
      try {
        const walletRes = await api.get("/wallet/balance");
        const walletData = await walletRes.json();
        if (walletData.fee_enabled && !walletData.is_sufficient) {
          setWalletWarning({ balance: walletData.balance, minimum: walletData.minimum_required });
        } else {
          setWalletWarning(null);
        }
      } catch {}
    } catch {}
    setLoading(false);
  }, [activeWorkspace?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live WebSocket data for all accounts
  const accountIds = accounts.map(a => a.id);
  const { liveMap, status: wsStatus } = useMultiAccountWebSocket(accountIds);

  // Aggregate stats — merge REST snapshots with live WS data
  const totalAccounts = accounts.length;
  const activeBots = accounts.filter((a) => a.status === "RUNNING").length;
  let totalBalance = 0;
  let totalPnl = 0;
  Object.entries(dashboards).forEach(([accId, d]: [string, any]) => {
    if (d?.account_summary) {
      // If we have live WS data for this account, prefer it
      const live = liveMap[accId];
      if (live?.totalWalletBalance) {
        // Use pre-calculated totals from backend (correct — from /fapi/v2/account)
        totalBalance += parseFloat(live.totalWalletBalance);
        totalPnl += parseFloat(live.totalUnrealizedProfit || "0");
      } else {
        totalBalance += parseFloat(d.account_summary.total_wallet_balance || "0");
        totalPnl += parseFloat(d.account_summary.total_unrealized_pnl || "0");
      }
    }
  });

  const hasAccounts = totalAccounts > 0;
  const eqFirst = equityData[0]?.v || 0;
  const eqLast = equityData[equityData.length - 1]?.v || 0;
  const eqChange = eqLast - eqFirst;
  const eqPositive = eqChange >= 0;

  const stats = [
    {
      name: "Active Bots",
      value: String(activeBots),
      icon: Bot,
      trend: `${totalAccounts} total`,
      color: "text-[#F0B90B]",
      bg: "bg-[#F0B90B]/10",
    },
    {
      name: "Connected Accounts",
      value: String(totalAccounts),
      icon: Wallet,
      trend: hasAccounts ? "Linked" : "None",
      color: "text-[#F0B90B]",
      bg: "bg-[#F0B90B]/10",
    },
    {
      name: "Wallet Balance",
      value: fmt(totalBalance),
      icon: BarChart3,
      trend: hasAccounts ? "Live" : "—",
      color: "text-[#0ECB81]",
      bg: "bg-[#0ECB81]/10",
    },
    {
      name: "Unrealized PnL",
      value: (totalPnl >= 0 ? "+" : "-") + fmt(totalPnl),
      icon: TrendingUp,
      trend: hasAccounts
        ? totalPnl >= 0
          ? "Profit"
          : "Loss"
        : "—",
      color: totalPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]",
      bg: totalPnl >= 0 ? "bg-[#0ECB81]/10" : "bg-[#F6465D]/10",
    },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#1E2026]/80 backdrop-blur-md border border-[#2B2F36]/50 rounded-input px-3 py-2 shadow-card">
        <span className="text-[10px] text-[#5E6673]">{payload[0].payload.t}</span>
        <div className="text-sm font-bold text-[#EAECEF] font-mono">
          {fmt(payload[0].value)}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#EAECEF] mb-1">
            Dashboard Overview
          </h1>
          <p className="text-sm text-[#848E9C] font-medium">
            Welcome to your TWIN GRID command center.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={load}
            className="flex justify-center items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#848E9C] bg-[#2B2F36] border border-[#363A45] rounded-[6px] hover:text-[#EAECEF] hover:border-[#F0B90B]/30 transition-all duration-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {/* Live WS Status */}
          <div className={`flex items-center gap-1.5 px-3 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
            wsStatus === 'connected'
              ? 'bg-[#0ECB81]/10 text-[#0ECB81] border-[#0ECB81]/30'
              : wsStatus === 'connecting'
                ? 'bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/30'
                : 'bg-[#2B2F36] text-[#848E9C] border-[#363A45]'
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
          <Link href="/dashboard/accounts" className="w-full sm:w-auto">
            <button className="w-full flex justify-center items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[6px] hover:bg-[#D0980B] transition-all duration-200 shadow-pill">
              <Plus className="h-4 w-4" />
              Connect Exchange
            </button>
          </Link>
        </div>
      </div>

      {/* Twin Grid Balance Warning */}
      {walletWarning && (
        <div className="mb-6 bg-[#F6465D]/10 border border-[#F6465D]/30 rounded-card p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-[#F6465D] mt-0.5 shrink-0" size={20} />
            <div>
              <p className="text-sm font-semibold text-[#F6465D]">Insufficient Twin Grid Balance</p>
              <p className="text-xs text-[#F6465D]/80 mt-0.5">
                Your balance (${walletWarning.balance.toFixed(2)}) is below the minimum required (${walletWarning.minimum.toFixed(2)}). Your bot cannot open new trades.
              </p>
            </div>
          </div>
          <Link href="/dashboard/wallet">
            <button className="shrink-0 px-4 py-2 rounded-[6px] bg-[#F6465D] text-white text-xs font-semibold hover:bg-[#F6465D]/90 transition-colors">
              Deposit Now →
            </button>
          </Link>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="bg-[#1E2026]/40 backdrop-blur-xl border border-[#2B2F36]/50 rounded-card p-5 hover:border-[#F0B90B]/30 hover:shadow-[0_0_20px_rgba(240,185,11,0.05)] transition-all duration-300">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-2.5 rounded-lg ${stat.bg}`}>
                  <Icon size={20} className={stat.color} />
                </div>
                <span className="text-[10px] font-semibold text-[#5E6673] bg-[#2B2F36] px-2 py-1 rounded-md uppercase tracking-wider">
                  {stat.trend}
                </span>
              </div>
              <h3 className={`text-2xl font-bold font-mono mb-1 ${
                stat.name === "Unrealized PnL"
                  ? totalPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                  : "text-[#EAECEF]"
              }`}>
                {loading ? "—" : stat.value}
              </h3>
              <p className="text-xs font-semibold text-[#848E9C]">{stat.name}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main — Equity Chart */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-[#1E2026]/40 backdrop-blur-xl border border-[#2B2F36]/50 rounded-card p-6">
            {!hasAccounts ? (
              <div className="h-80 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-[#2B2F36] rounded-full flex items-center justify-center mb-4">
                  <Activity size={32} className="text-[#5E6673]" />
                </div>
                <h3 className="text-lg font-bold text-[#EAECEF] mb-2">
                  No Trading Activity Yet
                </h3>
                <p className="text-sm text-[#848E9C] max-w-sm mb-6 font-medium">
                  Connect a Binance account and configure your TWIN GRID
                  strategy to start seeing performance metrics here.
                </p>
                <Link href="/dashboard/accounts">
                  <button className="px-6 py-2.5 text-sm font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[6px] hover:bg-[#D0980B] transition-all duration-200 flex items-center gap-2">
                    Setup Bot <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
              </div>
            ) : equityData.length >= 2 ? (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-sm font-semibold text-[#848E9C] uppercase tracking-wider mb-1">Portfolio Equity</h3>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-[#EAECEF] font-mono">
                        {fmt(eqLast)}
                      </span>
                      <span className={`text-sm font-semibold font-mono px-2 py-0.5 rounded-md ${
                        eqPositive
                          ? "text-[#0ECB81] bg-[#0ECB81]/10"
                          : "text-[#F6465D] bg-[#F6465D]/10"
                      }`}>
                        {eqPositive ? "+" : ""}{fmt(eqChange)}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#5E6673] flex items-center gap-1 font-semibold uppercase tracking-wider">
                    <Clock className="h-3 w-3" /> Last 24h
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={equityData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={eqPositive ? "#0ECB81" : "#F6465D"} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={eqPositive ? "#0ECB81" : "#F6465D"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2B2F36" vertical={false} />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10, fill: "#5E6673" }}
                      axisLine={{ stroke: "#2B2F36" }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 10, fill: "#5E6673" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => "$" + v.toLocaleString()}
                      width={70}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={eqPositive ? "#0ECB81" : "#F6465D"}
                      strokeWidth={2}
                      fill="url(#dashGrad)"
                      dot={false}
                      animationDuration={800}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center text-center">
                <Clock className="h-12 w-12 text-[#2B2F36] mb-4" />
                <h3 className="text-lg font-bold text-[#EAECEF] mb-2">
                  Building Equity History…
                </h3>
                <p className="text-sm text-[#848E9C] max-w-sm font-medium">
                  Your account is connected. Equity snapshots are recorded every 60 seconds.
                  The chart will appear once enough data is collected.
                </p>
              </div>
            )}
          </div>

          {/* Active Accounts */}
          {hasAccounts && (
            <div className="bg-[#1E2026]/40 backdrop-blur-xl border border-[#2B2F36]/50 rounded-card p-6">
              <h3 className="text-sm font-semibold text-[#848E9C] uppercase tracking-wider mb-4">Active Accounts</h3>
              <div className="space-y-2">
                {accounts.map((acc) => {
                  const dash = dashboards[acc.id];
                  const live = liveMap[acc.id];
                  // Prefer live WS data when available, else fall back to REST snapshot
                  let bal = 0;
                  let pnl = 0;
                  if (live?.totalWalletBalance) {
                    bal = parseFloat(live.totalWalletBalance);
                    pnl = parseFloat(live.totalUnrealizedProfit || "0");
                  } else if (dash?.account_summary) {
                    bal = parseFloat(dash.account_summary.total_wallet_balance || "0");
                    pnl = parseFloat(dash.account_summary.total_unrealized_pnl || "0");
                  }
                  return (
                    <Link key={acc.id} href={`/dashboard/accounts/${acc.id}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-input border border-[#2B2F36]/50 bg-[#1E2026]/20 hover:border-[#F0B90B]/30 hover:bg-[#1E2026]/60 transition-all duration-300 cursor-pointer group gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 shrink-0 rounded-full ${
                            acc.status === "RUNNING" ? "bg-[#0ECB81]" : "bg-[#5E6673]"
                          }`} />
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-[#EAECEF] group-hover:text-[#F0B90B] transition-colors truncate block">
                              {acc.name}
                            </span>
                            <span className="text-[10px] text-[#5E6673] font-semibold uppercase">
                              {acc.is_testnet ? "Testnet" : "Mainnet"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t border-[#363A45] sm:border-0 pt-3 sm:pt-0">
                          <span className="text-sm font-mono text-[#EAECEF] font-semibold">{fmt(bal)}</span>
                          <span className={`text-sm font-mono font-bold ${
                            pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                          }`}>
                            {pnl >= 0 ? "+" : ""}{fmt(pnl)}
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-[#5E6673] group-hover:text-[#F0B90B] transition-colors hidden sm:block" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-5">
          <div className="bg-[#1E2026]/40 backdrop-blur-xl border border-[#2B2F36]/50 rounded-card p-6">
            <h3 className="text-sm font-semibold text-[#848E9C] uppercase tracking-wider mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                href="/dashboard/accounts"
                className="flex items-center justify-between p-3.5 rounded-input border border-[#2B2F36]/50 bg-[#1E2026]/20 hover:border-[#F0B90B]/30 hover:bg-[#1E2026]/60 transition-all duration-300 group"
              >
                <div className="flex items-center gap-3">
                  <Wallet size={18} className="text-[#F0B90B]" />
                  <span className="text-sm font-semibold text-[#EAECEF]">API Credentials</span>
                </div>
                <ArrowRight size={16} className="text-[#5E6673] group-hover:text-[#F0B90B] transition-colors" />
              </Link>
              <Link
                href="/dashboard/workspaces"
                className="flex items-center justify-between p-3.5 rounded-input border border-[#2B2F36]/50 bg-[#1E2026]/20 hover:border-[#F0B90B]/30 hover:bg-[#1E2026]/60 transition-all duration-300 group"
              >
                <div className="flex items-center gap-3">
                  <Briefcase size={18} className="text-[#F0B90B]" />
                  <span className="text-sm font-semibold text-[#EAECEF]">Manage Workspaces</span>
                </div>
                <ArrowRight size={16} className="text-[#5E6673] group-hover:text-[#F0B90B] transition-colors" />
              </Link>
            </div>
          </div>

          {/* Help Card */}
          <div className="bg-[#1E2026]/40 backdrop-blur-xl border border-[#F0B90B]/20 shadow-[0_0_20px_rgba(240,185,11,0.05)] rounded-card p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#F0B90B]/5 rounded-full blur-[60px] pointer-events-none" />
            <h3 className="text-base font-bold text-[#EAECEF] mb-2 relative z-10">Need Help?</h3>
            <p className="text-sm text-[#848E9C] mb-4 font-medium relative z-10">
              Read our guide to understand how TWIN GRID dynamically adjusts to market conditions.
            </p>
            <Link href="/dashboard/guide">
              <button className="text-sm font-semibold text-[#F0B90B] hover:text-[#FFD000] transition-colors relative z-10 flex items-center gap-1">
                View Getting Started Guide <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
