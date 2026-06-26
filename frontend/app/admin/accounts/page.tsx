"use client";

import { useEffect, useState, useCallback } from "react";
import { adminService } from "@/lib/services/admin";
import { toast } from "sonner";
import { Search, RefreshCw, Eye, Wallet, TrendingUp, TrendingDown, Loader2, WifiOff } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { useMultiAccountWebSocket, type LiveAccountData } from "@/lib/hooks/useMultiAccountWebSocket";

type BalanceData = {
  balance: number | null;
  pnl: number | null;
  source: string;
};

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Batch-fetched REST balances: { accountId: { balance, pnl, source } }
  const [restBalances, setRestBalances] = useState<Record<string, BalanceData>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    try { const data = await adminService.getAllAccounts(0, 100); setAccounts(data); }
    catch { toast.error("Failed to fetch accounts"); }
    finally { setLoading(false); }
  };

  // Batch-fetch all balances in a single request (rate-limit safe)
  const fetchBalances = useCallback(async () => {
    setBalancesLoading(true);
    try {
      const data = await adminService.getAccountBalances();
      const map: Record<string, BalanceData> = {};
      if (data?.balances) {
        for (const [id, bal] of Object.entries(data.balances)) {
          map[id] = {
            balance: bal.total_wallet_balance !== null ? parseFloat(bal.total_wallet_balance) : null,
            pnl: bal.total_unrealized_pnl !== null ? parseFloat(bal.total_unrealized_pnl) : null,
            source: bal.source || "unknown",
          };
        }
      }
      setRestBalances(map);
    } catch {
      // Silently fail — balances show "—" on error
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, []);

  // Fetch balances after accounts are loaded
  useEffect(() => {
    if (accounts.length > 0) {
      fetchBalances();
    }
  }, [accounts.length, fetchBalances]);

  const handleRefresh = () => {
    fetchAccounts();
    fetchBalances();
  };

  // Single WebSocket connection for all accounts
  const accountIds = accounts.map((a) => a.id);
  const { liveMap, status: wsStatus } = useMultiAccountWebSocket(accountIds);

  const filteredAccounts = accounts.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.owner_email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#EAECEF] mb-1">Account Monitoring</h1>
          <p className="text-sm text-[#848E9C]">View and monitor all connected exchange accounts across all users.</p>
        </div>
        <button onClick={handleRefresh} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold bg-[#2B2F36] text-[#EAECEF] hover:bg-[#2B2F36]/80 border border-[#2B2F36] transition-all disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        {/* Live WS status badge */}
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
      </div>

      {/* Table */}
      <div className="bg-[#2B2F36] rounded-xl overflow-hidden border border-[#2B2F36]">
        <div className="p-4 border-b border-[#181A20] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#848E9C]" size={16} />
            <input type="text" placeholder="Search accounts or owners..."
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#181A20] border border-[#2B2F36] text-sm text-[#EAECEF] rounded-lg pl-9 pr-4 py-2.5 focus:ring-1 focus:ring-[#F0B90B]/50 focus:border-[#F0B90B]/50 focus:outline-none w-full sm:w-72 placeholder-[#848E9C] transition-all" />
          </div>
          <div className="text-xs text-[#848E9C] font-medium uppercase tracking-wider">
            {filteredAccounts.length} account{filteredAccounts.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[900px]">
            <thead className="bg-[#0B0E11] text-[#848E9C] uppercase text-[11px] tracking-wider border-b border-[#181A20]">
              <tr>
                <th className="px-6 py-3.5 font-semibold">Account</th>
                <th className="px-6 py-3.5 font-semibold">Owner</th>
                <th className="px-6 py-3.5 font-semibold">Network</th>
                <th className="px-6 py-3.5 font-semibold">Status</th>
                <th className="px-6 py-3.5 font-semibold">Balance</th>
                <th className="px-6 py-3.5 font-semibold">Unrealized PnL</th>
                <th className="px-6 py-3.5 font-semibold">Added On</th>
                <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#181A20]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-[#848E9C]">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    <span className="text-xs">Loading accounts...</span>
                  </td>
                </tr>
              ) : filteredAccounts.length > 0 ? (
                filteredAccounts.map((account) => {
                  // Resolve balance: WS live data > batch REST data
                  const live = liveMap[account.id];
                  const rest = restBalances[account.id];

                  let balance: number | null = null;
                  let pnl: number | null = null;
                  let isLive = false;

                  if (live?.totalWalletBalance) {
                    balance = parseFloat(live.totalWalletBalance);
                    pnl = parseFloat(live.totalUnrealizedProfit || "0");
                    isLive = true;
                  } else if (rest && rest.balance !== null) {
                    balance = rest.balance;
                    pnl = rest.pnl;
                  }

                  const hasData = balance !== null;
                  const isBalanceLoading = balancesLoading && !hasData && !isLive;
                  const pnlColor = pnl !== null && pnl > 0 ? "text-[#0ECB81]" : pnl !== null && pnl < 0 ? "text-[#F6465D]" : "text-[#848E9C]";

                  return (
                    <tr key={account.id} className="hover:bg-[#181A20]/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-[#EAECEF]">{account.name}</div>
                        <div className="text-[11px] text-[#848E9C]">{account.exchange}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-[#EAECEF]">{account.owner_email || '—'}</div>
                      </td>
                      <td className="px-6 py-4">
                        {account.is_testnet ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20">Testnet</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#0ECB81]/10 text-[#0ECB81] border border-[#0ECB81]/20">Mainnet</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${account.status === 'RUNNING' ? 'bg-[#0ECB81]' : account.status === 'IDLE' ? 'bg-[#F0B90B]' : 'bg-[#F6465D]'}`} />
                          <span className="text-[#EAECEF] text-xs font-medium">{account.status}</span>
                        </div>
                      </td>
                      {/* Balance */}
                      <td className="px-6 py-4">
                        {isBalanceLoading ? (
                          <div className="h-4 w-20 bg-[#2B2F36] rounded animate-pulse" />
                        ) : hasData ? (
                          <div className="flex items-center gap-1.5">
                            <Wallet className="h-3 w-3 text-[#F0B90B] shrink-0" />
                            <span className="text-sm font-semibold text-[#EAECEF] font-mono">
                              ${balance!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-[#0ECB81] animate-pulse" title="Live" />}
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#5E6673]">—</span>
                        )}
                      </td>
                      {/* Unrealized PnL */}
                      <td className="px-6 py-4">
                        {isBalanceLoading ? (
                          <div className="h-4 w-16 bg-[#2B2F36] rounded animate-pulse" />
                        ) : pnl !== null ? (
                          <div className="flex items-center gap-1.5">
                            {pnl >= 0 ? (
                              <TrendingUp className="h-3 w-3 text-[#0ECB81] shrink-0" />
                            ) : (
                              <TrendingDown className="h-3 w-3 text-[#F6465D] shrink-0" />
                            )}
                            <span className={`text-sm font-semibold font-mono ${pnlColor}`}>
                              {pnl > 0 ? "+" : ""}${Math.abs(pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#5E6673]">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-[#848E9C] text-xs">
                        {account.created_at ? format(new Date(account.created_at), "MMM d, yyyy") : 'Unknown'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/admin/accounts/${account.id}`}>
                          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#F0B90B]/10 text-[#F0B90B] hover:bg-[#F0B90B]/20 border border-[#F0B90B]/20 transition-all">
                            <Eye className="h-3.5 w-3.5" />
                            View Data
                          </button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-[#848E9C] text-xs">No accounts found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
