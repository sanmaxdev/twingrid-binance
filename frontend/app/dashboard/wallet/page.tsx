"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  Coins, ArrowUpCircle, ArrowDownCircle, Clock, CheckCircle2,
  XCircle, Copy, ExternalLink, AlertTriangle, Loader2, Send, RefreshCw,
  HelpCircle, X, BookOpen, Shield, Calculator, Zap
} from "lucide-react";
import { useScrollLock } from "@/lib/hooks/useScrollLock";
import { Portal } from "@/components/Portal";

interface WalletBalance {
  balance: number;
  minimum_required: number;
  is_sufficient: boolean;
  fee_percentage: number;
  fee_enabled: boolean;
  admin_override: boolean;
  override_note: string | null;
}

interface WalletSummary {
  balance: number;
  total_deposited: number;
  total_fees_paid: number;
  pending_deposits: number;
  fee_percentage: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  fee_percentage: number | null;
  basket_pnl: number | null;
  basket_id: string | null;
  note: string | null;
  created_at: string;
}

interface DepositInfo {
  deposit_address: string;
  network: string;
  currency: string;
  min_deposit: number;
}

interface DepositRequest {
  id: string;
  amount: number;
  tx_hash: string;
  status: string;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
}

export default function WalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [depTotal, setDepTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"deposit" | "history" | "fees">("deposit");

  // Deposit form
  const [depositAmount, setDepositAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFeeInfo, setShowFeeInfo] = useState(false);
  const [showTxHelp, setShowTxHelp] = useState(false);

  // Lock body scroll when modals are open
  useScrollLock(showFeeInfo || showTxHelp);

  const fetchData = useCallback(async () => {
    try {
      const [balRes, sumRes, infoRes, txRes, depRes] = await Promise.all([
        api.get("/wallet/balance"),
        api.get("/wallet/summary"),
        api.get("/wallet/deposit-info"),
        api.get("/wallet/transactions?per_page=15"),
        api.get("/wallet/deposits?per_page=15"),
      ]);
      const [balData, sumData, infoData, txData, depData] = await Promise.all([
        balRes.json(), sumRes.json(), infoRes.json(), txRes.json(), depRes.json(),
      ]);
      setBalance(balData);
      setSummary(sumData);
      setDepositInfo(infoData);
      setTransactions(txData.items);
      setTxTotal(txData.total);
      setDeposits(depData.items);
      setDepTotal(depData.total);
    } catch (e) {
      console.error("Failed to load wallet data", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await api.post("/wallet/deposit", {
        amount: parseFloat(depositAmount),
        tx_hash: txHash.trim(),
      });
      const data = await res.json();
      setSubmitMsg({ type: "success", text: data.message || "Deposit submitted!" });
      setDepositAmount("");
      setTxHash("");
      fetchData();
    } catch (err: any) {
      setSubmitMsg({ type: "error", text: err.message || "Failed to submit deposit" });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#F0B90B]/10 text-[#F0B90B]"><Clock size={12} />Pending</span>;
      case "COMPLETED":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#0ECB81]/10 text-[#0ECB81]"><CheckCircle2 size={12} />Completed</span>;
      case "REJECTED":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#F6465D]/10 text-[#F6465D]"><XCircle size={12} />Rejected</span>;
      default:
        return <span className="text-xs text-[#848E9C]">{status}</span>;
    }
  };

  const getTxIcon = (type: string) => {
    switch (type) {
      case "FEE_DEDUCTION": return <ArrowDownCircle size={16} className="text-[#F6465D]" />;
      case "DEPOSIT": return <ArrowUpCircle size={16} className="text-[#0ECB81]" />;
      case "ADMIN_CREDIT": return <ArrowUpCircle size={16} className="text-[#3B82F6]" />;
      case "ADMIN_DEBIT": return <ArrowDownCircle size={16} className="text-[#F59E0B]" />;
      case "AFFILIATE_TRANSFER": return <ArrowUpCircle size={16} className="text-[#A78BFA]" />;
      case "AFFILIATE_COMMISSION": return <ArrowUpCircle size={16} className="text-[#0ECB81]" />;
      case "SUBSCRIPTION_CHARGE": return <ArrowDownCircle size={16} className="text-[#F59E0B]" />;
      default: return <Coins size={16} className="text-[#848E9C]" />;
    }
  };

  const getTxLabel = (type: string) => {
    switch (type) {
      case "FEE_DEDUCTION": return "Profit Share Fee";
      case "DEPOSIT": return "Deposit Credited";
      case "ADMIN_CREDIT": return "Admin Credit";
      case "ADMIN_DEBIT": return "Admin Debit";
      case "AFFILIATE_TRANSFER": return "Affiliate Transfer";
      case "AFFILIATE_COMMISSION": return "Affiliate Commission";
      case "SUBSCRIPTION_CHARGE": return "Subscription Charge";
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#F0B90B]" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EAECEF] flex items-center gap-2">
            <Coins className="text-[#F0B90B]" size={28} /> Twin Grid Wallet
          </h1>
          <p className="text-sm text-[#848E9C] mt-1">Manage your profit-share balance and deposits</p>
        </div>
        <button onClick={() => { setLoading(true); fetchData(); }} className="p-2 rounded-lg bg-[#2B2F36] text-[#848E9C] hover:text-[#EAECEF] transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Balance Warning */}
      {balance && !balance.is_sufficient && balance.fee_enabled && (
        <div className="bg-[#F6465D]/10 border border-[#F6465D]/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-[#F6465D] mt-0.5 shrink-0" size={20} />
          <div>
            <p className="text-sm font-semibold text-[#F6465D]">Insufficient Balance</p>
            <p className="text-xs text-[#F6465D]/80 mt-0.5">
              Your Twin Grid Balance (${balance.balance.toFixed(2)}) is below the minimum required (${balance.minimum_required.toFixed(2)}). 
              Your bot cannot open new trades until you deposit funds.
            </p>
          </div>
        </div>
      )}

      {/* Admin Fee Override Notice */}
      {balance?.admin_override && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <Shield className="text-amber-400 mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-sm font-semibold text-amber-400">Custom Fee Rate Applied</p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              {balance.override_note || `Your profit share fee has been set to ${balance.fee_percentage}% by an administrator.`}
            </p>
          </div>
        </div>
      )}

      {/* Balance + Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Main Balance */}
        <div className="md:col-span-2 bg-gradient-to-br from-[#2B2F36] to-[#1E2026] border border-[#363A45] rounded-xl p-6">
          <div className="text-xs font-medium text-[#848E9C] uppercase tracking-wider mb-2">Current Balance</div>
          <div className={`text-3xl font-bold ${(balance?.balance ?? 0) >= 0 ? 'text-[#EAECEF]' : 'text-[#F6465D]'}`}>
            ${(balance?.balance ?? 0).toFixed(2)}
            <span className="text-xs font-normal text-[#848E9C] ml-2">USDT</span>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-[#848E9C]">
            <span>Min Required: <span className="text-[#EAECEF]">${(balance?.minimum_required ?? 0).toFixed(2)}</span></span>
            <span>Fee Rate: <span className="text-[#F0B90B]">{balance?.fee_percentage ?? 0}%</span></span>
          </div>
          {balance?.fee_enabled === false && (
            <div className="mt-2 text-xs text-[#0ECB81] bg-[#0ECB81]/10 inline-block px-2 py-0.5 rounded">Fee system disabled</div>
          )}
        </div>

        {/* Stats */}
        <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl p-5">
          <div className="text-xs font-medium text-[#848E9C] uppercase tracking-wider mb-1">Total Deposited</div>
          <div className="text-xl font-bold text-[#0ECB81]">${(summary?.total_deposited ?? 0).toFixed(2)}</div>
        </div>
        <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl p-5">
          <div className="text-xs font-medium text-[#848E9C] uppercase tracking-wider mb-1">Total Fees Paid</div>
          <div className="text-xl font-bold text-[#F6465D]">${(summary?.total_fees_paid ?? 0).toFixed(2)}</div>
          {(summary?.pending_deposits ?? 0) > 0 && (
            <div className="mt-1 text-xs text-[#F0B90B]">{summary!.pending_deposits} deposit(s) pending</div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#2B2F36] rounded-xl p-1">
        {(["deposit", "history", "fees"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab
                ? "bg-[#F0B90B]/10 text-[#F0B90B]"
                : "text-[#848E9C] hover:text-[#EAECEF]"
            }`}
          >
            {tab === "deposit" ? "Deposit" : tab === "history" ? "Deposits History" : "All History"}

          </button>
        ))}
      </div>

      {/* Deposit Tab */}
      {activeTab === "deposit" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Deposit Address */}
          <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[#EAECEF] mb-4 flex items-center gap-2">
              <Send size={16} className="text-[#F0B90B]" /> Deposit Address
            </h3>
            <div className="bg-[#181A20] rounded-lg p-4 border border-[#363A45]">
              <div className="text-xs text-[#848E9C] mb-1">Network: <span className="text-[#EAECEF]">{depositInfo?.network}</span></div>
              <div className="text-xs text-[#848E9C] mb-3">Currency: <span className="text-[#F0B90B] font-bold">{depositInfo?.currency}</span></div>
              <div className="bg-[#0B0E11] rounded-lg p-3 font-mono text-xs text-[#EAECEF] break-all flex items-center justify-between gap-2">
                <span>{depositInfo?.deposit_address}</span>
                <button
                  onClick={() => handleCopy(depositInfo?.deposit_address || "")}
                  className="shrink-0 p-1.5 rounded bg-[#2B2F36] hover:bg-[#363A45] transition-colors"
                  title="Copy address"
                >
                  <Copy size={14} className={copied ? "text-[#0ECB81]" : "text-[#848E9C]"} />
                </button>
              </div>
              {copied && <p className="text-xs text-[#0ECB81] mt-2">✓ Copied to clipboard</p>}
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-start gap-2 text-xs text-[#848E9C]">
                <AlertTriangle size={14} className="text-[#F0B90B] shrink-0 mt-0.5" />
                <span>Only send <strong className="text-[#EAECEF]">USDT</strong> via <strong className="text-[#EAECEF]">TRC-20</strong> network. Other tokens will be lost.</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-[#848E9C]">
                <AlertTriangle size={14} className="text-[#F0B90B] shrink-0 mt-0.5" />
                <span>Minimum deposit: <strong className="text-[#EAECEF]">${depositInfo?.min_deposit?.toFixed(2)} USDT</strong></span>
              </div>
            </div>
          </div>

          {/* Submit Deposit Form */}
          <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[#EAECEF] mb-4 flex items-center gap-2">
              <ArrowUpCircle size={16} className="text-[#0ECB81]" /> Submit Deposit
            </h3>
            <form onSubmit={handleDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#848E9C] mb-1.5">Amount (USDT)</label>
                <input
                  type="number"
                  step="0.01"
                  min={depositInfo?.min_deposit || 10}
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  placeholder={`Min ${depositInfo?.min_deposit || 10} USDT`}
                  className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F0B90B] focus:border-[#F0B90B] focus:outline-none transition-colors placeholder:text-[#5E6673]"
                  required
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#848E9C] mb-1.5">
                  Transaction Hash (TRC-20)
                  <button
                    type="button"
                    onClick={() => setShowTxHelp(true)}
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#2B2F36] hover:bg-[#F0B90B]/20 text-[#5E6673] hover:text-[#F0B90B] transition-colors"
                    title="What is a Transaction Hash?"
                  >
                    <HelpCircle size={11} />
                  </button>
                </label>
                <input
                  type="text"
                  value={txHash}
                  onChange={e => setTxHash(e.target.value)}
                  placeholder="Enter your TRC-20 transaction hash"
                  className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F0B90B] focus:border-[#F0B90B] focus:outline-none transition-colors placeholder:text-[#5E6673] font-mono"
                  required
                  minLength={10}
                />
              </div>
              {submitMsg && (
                <div className={`text-xs p-3 rounded-lg ${
                  submitMsg.type === "success" ? "bg-[#0ECB81]/10 text-[#0ECB81] border border-[#0ECB81]/30" : "bg-[#F6465D]/10 text-[#F6465D] border border-[#F6465D]/30"
                }`}>
                  {submitMsg.text}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || !depositAmount || !txHash}
                className="w-full py-3 rounded-lg bg-[#F0B90B] text-[#1E2026] font-semibold text-sm hover:bg-[#F0B90B]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {submitting ? "Submitting..." : "Submit Deposit"}
              </button>
            </form>
            <p className="text-xs text-[#5E6673] mt-3">
              After submitting, an admin will verify your transaction and credit your balance.
            </p>
          </div>
        </div>
      )}

      {/* Deposits History Tab */}
      {activeTab === "history" && (
        <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#363A45]">
            <h3 className="text-sm font-semibold text-[#EAECEF]">Deposit Requests ({depTotal})</h3>
          </div>
          {deposits.length === 0 ? (
            <div className="p-8 text-center text-[#848E9C] text-sm">No deposits yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#848E9C] border-b border-[#363A45]">
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-right px-4 py-3 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 font-medium">TX Hash</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map(d => (
                    <tr key={d.id} className="border-b border-[#363A45]/50 hover:bg-[#363A45]/20 transition-colors">
                      <td className="px-4 py-3 text-[#EAECEF] whitespace-nowrap">
                        {new Date(d.created_at).toLocaleDateString()} {new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-right text-[#0ECB81] font-medium">${d.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#848E9C]">
                        <a
                          href={`https://tronscan.org/#/transaction/${d.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-[#F0B90B] transition-colors"
                        >
                          {d.tx_hash.slice(0, 8)}...{d.tx_hash.slice(-6)}
                          <ExternalLink size={12} />
                        </a>
                      </td>
                      <td className="px-4 py-3 text-center">{getStatusBadge(d.status)}</td>
                      <td className="px-4 py-3 text-xs text-[#848E9C]">{d.reject_reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Fee History Tab */}
      {activeTab === "fees" && (
        <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#363A45]">
            <h3 className="text-sm font-semibold text-[#EAECEF]">All Transactions ({txTotal})</h3>
          </div>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-[#848E9C] text-sm">No transactions yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#848E9C] border-b border-[#363A45]">
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-right px-4 py-3 font-medium">Amount</th>
                    <th className="text-right px-4 py-3 font-medium">Balance After</th>
                    <th className="text-right px-4 py-3 font-medium">Basket PnL</th>
                    <th className="text-left px-4 py-3 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(t => (
                    <tr key={t.id} className="border-b border-[#363A45]/50 hover:bg-[#363A45]/20 transition-colors">
                      <td className="px-4 py-3 text-[#EAECEF] whitespace-nowrap text-xs">
                        {new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getTxIcon(t.type)}
                          <span className="text-[#EAECEF] text-xs font-medium">{getTxLabel(t.type)}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${t.amount >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
                        {t.amount >= 0 ? '+' : ''}{t.amount.toFixed(2)}

                      </td>
                      <td className="px-4 py-3 text-right text-[#EAECEF]">${t.balance_after.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-xs text-[#848E9C]">
                        {t.basket_pnl ? `$${t.basket_pnl.toFixed(2)}` : "—"}

                        {t.fee_percentage ? ` (${t.fee_percentage}%)` : ""}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#848E9C] max-w-[200px] truncate">{t.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Learn More Card */}
      <div className="bg-gradient-to-r from-[#2B2F36] to-[#1E2026] border border-[#363A45] rounded-xl p-6 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-[#F0B90B]/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-[#3B82F6]/5 rounded-full blur-[60px] pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-[#F0B90B]/10 shrink-0">
              <HelpCircle size={20} className="text-[#F0B90B]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#EAECEF]">How does the fee system work?</h3>
              <p className="text-xs text-[#848E9C] mt-0.5">Learn how Twin Grid calculates and deducts profit-share fees from your balance.</p>
            </div>
          </div>
          <button
            onClick={() => setShowFeeInfo(true)}
            className="shrink-0 px-5 py-2.5 rounded-lg bg-[#F0B90B]/10 text-[#F0B90B] text-sm font-semibold hover:bg-[#F0B90B]/20 transition-all border border-[#F0B90B]/20 flex items-center gap-2"
          >
            <BookOpen size={16} />
            Learn More
          </button>
        </div>
      </div>

      {/* Transaction Hash Help Modal */}
      {showTxHelp && (
        <Portal>
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-start sm:items-center justify-center overflow-y-auto p-4 pt-8 sm:pt-4" onClick={() => setShowTxHelp(false)}>
          <div
            className="bg-[#1E2026] border border-[#2B2F36] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto relative my-auto sm:my-0"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-[#1E2026] z-20 flex items-center justify-between p-5 pb-4 border-b border-[#2B2F36]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-[#3B82F6]/20 to-[#3B82F6]/5">
                  <HelpCircle size={20} className="text-[#3B82F6]" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#EAECEF]">How to Find Your Transaction Hash</h2>
                  <p className="text-xs text-[#848E9C]">Step-by-step guide</p>
                </div>
              </div>
              <button onClick={() => setShowTxHelp(false)} className="p-2 rounded-lg text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#2B2F36] transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-5">
              {/* What is it */}
              <div className="bg-[#2B2F36]/40 rounded-xl p-4 border border-[#363A45]/30">
                <h3 className="text-sm font-bold text-[#EAECEF] mb-2 flex items-center gap-2">
                  <span className="text-base">🔗</span> What is a Transaction Hash?
                </h3>
                <p className="text-xs text-[#848E9C] leading-relaxed">
                  A <span className="text-[#F0B90B] font-semibold">Transaction Hash (TxID)</span> is a unique identifier 
                  generated when you send cryptocurrency. It serves as proof that the transaction was initiated and can be 
                  used to track its status on the blockchain.
                </p>
              </div>

              {/* From Binance */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F0B90B]/15 text-[10px] font-bold text-[#F0B90B]">1</span>
                  <h3 className="text-sm font-bold text-[#EAECEF]">From Binance</h3>
                </div>
                <div className="ml-8 space-y-1.5 text-xs text-[#848E9C] leading-relaxed">
                  <p>1. Go to <span className="text-[#EAECEF] font-medium">Wallet → Transaction History</span></p>
                  <p>2. Find your USDT withdrawal to TRC-20</p>
                  <p>3. Click on the transaction to expand details</p>
                  <p>4. Copy the <span className="text-[#F0B90B] font-medium">TxID</span> — it starts with a long string of letters and numbers</p>
                </div>
              </div>

              {/* From TronLink / Trust Wallet */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#0ECB81]/15 text-[10px] font-bold text-[#0ECB81]">2</span>
                  <h3 className="text-sm font-bold text-[#EAECEF]">From TronLink / Trust Wallet</h3>
                </div>
                <div className="ml-8 space-y-1.5 text-xs text-[#848E9C] leading-relaxed">
                  <p>1. Open your wallet app and go to <span className="text-[#EAECEF] font-medium">Activity / History</span></p>
                  <p>2. Tap on the USDT transfer you made</p>
                  <p>3. Look for <span className="text-[#F0B90B] font-medium">"Transaction ID"</span> or <span className="text-[#F0B90B] font-medium">"TxHash"</span></p>
                  <p>4. Tap the copy icon next to it</p>
                </div>
              </div>

              {/* From Blockchain Explorer */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#3B82F6]/15 text-[10px] font-bold text-[#3B82F6]">3</span>
                  <h3 className="text-sm font-bold text-[#EAECEF]">From Blockchain Explorer</h3>
                </div>
                <div className="ml-8 space-y-1.5 text-xs text-[#848E9C] leading-relaxed">
                  <p>1. Visit <span className="text-[#3B82F6] font-medium">tronscan.org</span></p>
                  <p>2. Search for your wallet address</p>
                  <p>3. Find the relevant transfer in the transactions list</p>
                  <p>4. The <span className="text-[#F0B90B] font-medium">Hash</span> column shows your Transaction Hash</p>
                </div>
              </div>

              {/* Example */}
              <div className="bg-[#0B0E11] rounded-xl p-4 border border-[#2B2F36]">
                <p className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider mb-2">Example Transaction Hash</p>
                <code className="text-xs text-[#F0B90B] font-mono break-all leading-relaxed">
                  a1b2c3d4e5f6...78901234abcdef
                </code>
                <p className="text-[11px] text-[#5E6673] mt-2">
                  It is typically 64 characters long and contains letters (a-f) and numbers.
                </p>
              </div>

              {/* Tips */}
              <div className="bg-[#F0B90B]/5 border border-[#F0B90B]/15 rounded-xl p-4">
                <h4 className="text-xs font-bold text-[#F0B90B] mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Important Tips
                </h4>
                <ul className="text-xs text-[#848E9C] space-y-1.5 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-[#F0B90B] mt-0.5">•</span>
                    Make sure the hash is from a <span className="text-[#EAECEF] font-medium">TRC-20 (Tron)</span> network transfer, not ERC-20 or BEP-20.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#F0B90B] mt-0.5">•</span>
                    Wait for the transaction to be <span className="text-[#0ECB81] font-medium">confirmed</span> on the blockchain before submitting.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#F0B90B] mt-0.5">•</span>
                    Double-check that you sent to the correct deposit address shown on this page.
                  </li>
                </ul>
              </div>

              {/* Close button */}
              <button
                onClick={() => setShowTxHelp(false)}
                className="w-full py-3 rounded-lg text-sm font-semibold text-[#EAECEF] bg-[#2B2F36] hover:bg-[#363A45] transition-colors border border-[#363A45]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Fee Info Modal */}
      {showFeeInfo && (
        <Portal>
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-start sm:items-center justify-center overflow-y-auto p-4 pt-8 sm:pt-4" onClick={() => setShowFeeInfo(false)}>
          <div
            className="bg-[#1E2026]/95 backdrop-blur-xl border border-[#2B2F36] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto relative my-auto sm:my-0"
            onClick={e => e.stopPropagation()}
          >
            {/* Decorative glow */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-[#F0B90B]/8 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-[#3B82F6]/6 rounded-full blur-[80px] pointer-events-none" />

            {/* Header */}
            <div className="sticky top-0 bg-[#1E2026] z-20 flex items-center justify-between p-6 pb-4 border-b border-[#2B2F36]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-[#F0B90B]/20 to-[#F0B90B]/5">
                  <Coins size={22} className="text-[#F0B90B]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#EAECEF]">Twin Grid Fee System</h2>
                  <p className="text-xs text-[#848E9C]">Profit-sharing explained</p>
                </div>
              </div>
              <button onClick={() => setShowFeeInfo(false)} className="p-2 rounded-lg text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#2B2F36] transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 relative">
              {/* What is it */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#F0B90B]/10 flex items-center justify-center text-[#F0B90B] text-xs font-bold">1</div>
                  <h3 className="text-sm font-semibold text-[#EAECEF]">What is the Profit-Share Fee?</h3>
                </div>
                <p className="text-xs text-[#848E9C] leading-relaxed pl-8">
                  Twin Grid charges a small percentage of your profit each time a basket trade closes profitably. This is how the platform sustains development and infrastructure. If a basket closes at a loss, <strong className="text-[#0ECB81]">no fee is charged</strong>.
                </p>
              </div>

              {/* How it's calculated */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#3B82F6]/10 flex items-center justify-center text-[#3B82F6] text-xs font-bold">2</div>
                  <h3 className="text-sm font-semibold text-[#EAECEF] flex items-center gap-2"><Calculator size={14} className="text-[#3B82F6]" /> Fee Calculation</h3>
                </div>
                <div className="pl-8 bg-[#181A20] rounded-xl p-4 border border-[#2B2F36]">
                  <div className="text-center space-y-2">
                    <div className="text-xs text-[#848E9C]">Formula</div>
                    <div className="text-sm font-mono text-[#F0B90B] font-bold">Fee = Basket Profit × Fee %</div>
                    <div className="border-t border-[#2B2F36] pt-3 mt-3 space-y-1">
                      <p className="text-xs text-[#848E9C]">Example: Basket closes with <strong className="text-[#0ECB81]">$50 profit</strong></p>
                      <p className="text-xs text-[#848E9C]">Fee rate: <strong className="text-[#F0B90B]">{balance?.fee_percentage || 20}%</strong></p>
                      <p className="text-xs text-[#EAECEF] font-semibold">Fee deducted: <span className="text-[#F6465D]">${((50 * (balance?.fee_percentage || 20)) / 100).toFixed(2)}</span></p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Minimum Balance */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#0ECB81]/10 flex items-center justify-center text-[#0ECB81] text-xs font-bold">3</div>
                  <h3 className="text-sm font-semibold text-[#EAECEF] flex items-center gap-2"><Shield size={14} className="text-[#0ECB81]" /> Minimum Balance Requirement</h3>
                </div>
                <p className="text-xs text-[#848E9C] leading-relaxed pl-8">
                  To start trading, you must maintain a minimum balance in your Twin Grid Wallet. This amount is dynamically calculated based on your trading configuration:
                </p>
                <div className="pl-8 bg-[#181A20] rounded-xl p-4 border border-[#2B2F36]">
                  <div className="text-center space-y-1">
                    <div className="text-xs text-[#848E9C]">Min Balance Formula</div>
                    <div className="text-sm font-mono text-[#0ECB81] font-bold">Capital × TP% × Fee% × Safety Multiplier</div>
                  </div>
                </div>
                <p className="text-xs text-[#848E9C] leading-relaxed pl-8">
                  The safety multiplier (typically 2×) ensures your balance can cover at least two profitable basket closures.
                </p>
              </div>

              {/* Balance Gate */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#F6465D]/10 flex items-center justify-center text-[#F6465D] text-xs font-bold">4</div>
                  <h3 className="text-sm font-semibold text-[#EAECEF] flex items-center gap-2"><Zap size={14} className="text-[#F6465D]" /> What Happens if Balance is Low?</h3>
                </div>
                <p className="text-xs text-[#848E9C] leading-relaxed pl-8">
                  If your balance falls below the minimum requirement, your bot will <strong className="text-[#F6465D]">pause new trade entries</strong> until you deposit more funds. Existing open positions will continue to be managed normally — only new entries are blocked.
                </p>
              </div>

              {/* Negative balance */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#F59E0B]/10 flex items-center justify-center text-[#F59E0B] text-xs font-bold">5</div>
                  <h3 className="text-sm font-semibold text-[#EAECEF]">Can My Balance Go Negative?</h3>
                </div>
                <p className="text-xs text-[#848E9C] leading-relaxed pl-8">
                  Yes. If your balance is low but open baskets close profitably, the fee is still deducted — which may push your balance into negative. You&apos;ll need to deposit funds to clear the deficit before the bot can open new trades.
                </p>
              </div>

              {/* Current stats */}
              {balance && (
                <div className="bg-gradient-to-br from-[#F0B90B]/5 to-transparent rounded-xl p-4 border border-[#F0B90B]/10">
                  <div className="text-xs font-semibold text-[#F0B90B] uppercase tracking-wider mb-3">Your Current Configuration</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div className="text-lg font-bold text-[#EAECEF]">{balance.fee_percentage}%</div>
                      <div className="text-[10px] text-[#848E9C]">Fee Rate</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${balance.balance >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>${balance.balance.toFixed(2)}</div>
                      <div className="text-[10px] text-[#848E9C]">Balance</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-[#EAECEF]">${balance.minimum_required.toFixed(2)}</div>
                      <div className="text-[10px] text-[#848E9C]">Min Required</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 pt-2">
              <button
                onClick={() => setShowFeeInfo(false)}
                className="w-full py-3 rounded-xl bg-[#F0B90B] text-[#1E2026] font-semibold text-sm hover:bg-[#F0B90B]/90 transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
