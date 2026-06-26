"use client";
import { useEffect, useState } from "react";
import {
  Users, DollarSign, TrendingUp, Copy, Check, Loader2, Link2,
  Wallet, ArrowUpRight, ArrowDownLeft, X, ArrowRight,
} from "lucide-react";
import api from "@/lib/api";
import { useScrollLock } from "@/lib/hooks/useScrollLock";
import { Portal } from "@/components/Portal";

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  COMPLETED: { bg: "rgba(14,203,129,0.1)",  text: "#0ECB81" },
  APPROVED:  { bg: "rgba(14,203,129,0.1)",  text: "#0ECB81" },
  PENDING:   { bg: "rgba(240,185,11,0.1)",  text: "#F0B90B" },
  REJECTED:  { bg: "rgba(246,70,93,0.1)",   text: "#F6465D" },
};

export default function AffiliatesPage() {
  const [stats, setStats]               = useState<any>(null);
  const [referrals, setReferrals]       = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [copied, setCopied]             = useState(false);
  const [tab, setTab]                   = useState<"transactions" | "referrals">("transactions");
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  useScrollLock(showWithdraw || showTransfer);

  const load = async () => {
    try {
      const [s, r, t] = await Promise.all([
        api.get("/affiliates/stats").then((r) => r.json()),
        api.get("/affiliates/referrals").then((r) => r.json()),
        api.get("/affiliates/transactions").then((r) => r.json()),
      ]);
      setStats(s);
      setReferrals(r.items || []);
      setTransactions(t.items || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copyLink = () => {
    if (stats?.referral_link) {
      navigator.clipboard.writeText(stats.referral_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-[#F0B90B]" />
    </div>
  );

  const affiliateBalance = stats?.affiliate_balance || 0;
  const minWithdrawal    = stats?.min_withdrawal || 10;
  const minTransfer      = 5;

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-10">

      {/* ── Wallet Card ── */}
      <div className="bg-gradient-to-br from-[#2B3139] to-[#1E2026] border border-[#2B3139] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#F0B90B]/10">
              <Wallet className="h-5 w-5 text-[#F0B90B]" />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider">Affiliate Wallet</div>
              <div className="text-2xl font-bold text-[#EAECEF]">
                ${affiliateBalance.toFixed(2)}
                <span className="text-xs text-[#5E6673] ml-1">USDT</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTransfer(true)}
              disabled={affiliateBalance < minTransfer}
              className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-[#A78BFA] bg-[#A78BFA]/10 border border-[#A78BFA]/30 rounded-lg hover:bg-[#A78BFA]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ArrowRight className="h-3.5 w-3.5" /> Transfer to Wallet
            </button>
            <button
              onClick={() => setShowWithdraw(true)}
              disabled={affiliateBalance < minWithdrawal}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-[#0B0E11] bg-[#F0B90B] rounded-lg hover:bg-[#D4A20B] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Withdraw
            </button>
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Earned",    value: `$${(stats?.total_earned       || 0).toFixed(2)}`, color: "#0ECB81" },
            { label: "Total Withdrawn", value: `$${(stats?.total_withdrawn    || 0).toFixed(2)}`, color: "#F6465D" },
            { label: "Pending",         value: `$${(stats?.pending_withdrawal || 0).toFixed(2)}`, color: "#F0B90B" },
          ].map((s, i) => (
            <div key={i} className="bg-[#0B0E11]/40 rounded-lg px-3 py-2">
              <div className="text-[10px] text-[#5E6673] uppercase tracking-wider">{s.label}</div>
              <div className="text-sm font-bold" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Minimum hints */}
        <div className="flex items-center gap-4 mt-3 text-[10px] text-[#5E6673]">
          <span>Min Transfer: <span className="text-[#A78BFA]">${minTransfer} USDT</span></span>
          <span>Min Withdraw: <span className="text-[#F0B90B]">${minWithdrawal} USDT</span></span>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Referrals", value: stats?.total_referrals || 0,                           icon: Users,       color: "#3B82F6" },
          { label: "This Month",      value: `$${(stats?.month_earned || 0).toFixed(2)}`,            icon: TrendingUp,  color: "#0ECB81" },
          { label: "Min Withdrawal",  value: `$${minWithdrawal}`,                                    icon: DollarSign,  color: "#F0B90B" },
        ].map((s, i) => (
          <div key={i} className="bg-[#1E2026] border border-[#2B3139] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="h-3.5 w-3.5" style={{ color: s.color }} />
              <span className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider">{s.label}</span>
            </div>
            <div className="text-lg font-bold text-[#EAECEF]">{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Referral Link ── */}
      <div className="bg-[#1E2026] border border-[#2B3139] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="h-4 w-4 text-[#F0B90B]" />
          <span className="text-sm font-bold text-[#EAECEF]">Your Referral Link</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2.5 bg-[#0B0E11] border border-[#2B2F36] rounded-lg">
            <span className="text-xs text-[#848E9C] font-mono break-all select-all">{stats?.referral_link}</span>
          </div>
          <button onClick={copyLink}
            className={`px-4 py-2.5 rounded-lg text-sm font-semibold shrink-0 transition-all ${copied ? "bg-[#0ECB81] text-white" : "bg-[#F0B90B] text-[#0B0E11] hover:bg-[#D4A20B]"}`}>
            {copied ? <><Check className="h-4 w-4 inline mr-1" />Copied</> : <><Copy className="h-4 w-4 inline mr-1" />Copy</>}
          </button>
        </div>
        <p className="text-[10px] text-[#5E6673] mt-2">Share this link — earn 10% of the trading fees your referrals generate.</p>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-[#1E2026] border border-[#2B3139] rounded-xl overflow-hidden">
        <div className="flex border-b border-[#2B3139]">
          {(["transactions", "referrals"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${tab === t ? "text-[#F0B90B] border-b-2 border-[#F0B90B]" : "text-[#5E6673] hover:text-[#848E9C]"}`}>
              {t === "transactions" ? `Transaction History (${transactions.length})` : `Referrals (${referrals.length})`}
            </button>
          ))}
        </div>

        {/* Transaction History */}
        {tab === "transactions" && (
          <div className="divide-y divide-[#2B3139]/50">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#5E6673]">No transactions yet.</div>
            ) : transactions.map((t) => {
              const isCommission = t.type === "COMMISSION";
              const isTransfer   = t.type === "TRANSFER";
              const st = STATUS_STYLES[t.status] || STATUS_STYLES.PENDING;

              // Icon and label per type
              let iconBg    = "bg-[#F6465D]/10";
              let iconEl    = <ArrowUpRight className="h-3.5 w-3.5 text-[#F6465D]" />;
              let typeLabel = "Withdrawal";
              let amtColor  = "text-[#F6465D]";

              if (isCommission) {
                iconBg    = "bg-[#0ECB81]/10";
                iconEl    = <ArrowDownLeft className="h-3.5 w-3.5 text-[#0ECB81]" />;
                typeLabel = "Commission";
                amtColor  = "text-[#0ECB81]";
              } else if (isTransfer) {
                iconBg    = "bg-[#A78BFA]/10";
                iconEl    = <ArrowRight className="h-3.5 w-3.5 text-[#A78BFA]" />;
                typeLabel = "Transfer to Twin Grid Wallet";
                amtColor  = "text-[#A78BFA]";
              }

              return (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${iconBg}`}>{iconEl}</div>
                    <div>
                      <div className="text-sm font-medium text-[#EAECEF]">{typeLabel}</div>
                      <div className="text-[11px] text-[#5E6673]">
                        {t.description} · {new Date(t.created_at).toLocaleDateString()}
                      </div>
                      {t.reject_reason && (
                        <div className="text-[10px] text-[#F6465D] mt-0.5">Reason: {t.reject_reason}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${amtColor}`}>
                      {t.amount >= 0 ? "+" : ""}${Math.abs(t.amount).toFixed(2)}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ backgroundColor: st.bg, color: st.text }}>
                      {t.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Referrals */}
        {tab === "referrals" && (
          <div className="divide-y divide-[#2B3139]/50">
            {referrals.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#5E6673]">No referrals yet. Share your link to start earning!</div>
            ) : referrals.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[#EAECEF]">{r.display_name}</div>
                  <div className="text-[11px] text-[#5E6673]">{r.email} · Joined {new Date(r.joined_at).toLocaleDateString()}</div>
                </div>
                <div className="text-sm font-semibold text-[#0ECB81]">${r.commission_earned.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showTransfer && (
        <TransferModal
          balance={affiliateBalance}
          minTransfer={minTransfer}
          onClose={() => setShowTransfer(false)}
          onSuccess={() => { setShowTransfer(false); load(); }}
        />
      )}
      {showWithdraw && (
        <WithdrawModal
          balance={affiliateBalance}
          minWithdrawal={minWithdrawal}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => { setShowWithdraw(false); load(); }}
        />
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   Transfer Modal — instant affiliate → Twin Grid Wallet
═══════════════════════════════════════════════════════════════════════════ */
function TransferModal({ balance, minTransfer, onClose, onSuccess }: {
  balance: number; minTransfer: number; onClose: () => void; onSuccess: () => void;
}) {
  const [amount,  setAmount]  = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setError("");
    const amt = parseFloat(amount);
    if (!amt || amt < minTransfer)
      return setError(`Minimum transfer is $${minTransfer}`);
    if (amt > balance)
      return setError(`Insufficient balance. Available: $${balance.toFixed(2)}`);

    setLoading(true);
    try {
      const res  = await api.post("/affiliates/transfer-to-wallet", { amount: amt });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Transfer failed");
      setSuccess(true);
      setTimeout(onSuccess, 1500);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-[#1E2026] border border-[#2B3139] rounded-xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#2B3139]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#A78BFA]/10">
                <ArrowRight className="h-4 w-4 text-[#A78BFA]" />
              </div>
              <h3 className="text-sm font-bold text-[#EAECEF]">Transfer to Twin Grid Wallet</h3>
            </div>
            <button onClick={onClose} className="text-[#5E6673] hover:text-[#EAECEF]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {success ? (
              /* Success state */
              <div className="py-8 text-center space-y-2">
                <div className="text-4xl">✅</div>
                <p className="text-sm font-semibold text-[#0ECB81]">Transfer Successful!</p>
                <p className="text-xs text-[#5E6673]">Funds added to your Twin Grid Wallet instantly.</p>
              </div>
            ) : (
              <>
                {/* Flow visualisation */}
                <div className="flex items-center justify-between gap-2 bg-[#0B0E11] rounded-lg p-3">
                  <div className="text-center flex-1">
                    <div className="text-[10px] text-[#5E6673] uppercase tracking-wider mb-1">Affiliate Wallet</div>
                    <div className="text-base font-bold text-[#EAECEF]">${balance.toFixed(2)}</div>
                    <div className="text-[10px] text-[#5E6673]">USDT</div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-[#A78BFA] shrink-0" />
                  <div className="text-center flex-1">
                    <div className="text-[10px] text-[#5E6673] uppercase tracking-wider mb-1">Twin Grid Wallet</div>
                    <div className="text-base font-bold text-[#A78BFA]">Instant</div>
                    <div className="text-[10px] text-[#0ECB81]">No approval needed</div>
                  </div>
                </div>

                {/* Amount input */}
                <div>
                  <label className="block text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider mb-1.5">
                    Amount (USDT)
                  </label>
                  <div className="relative">
                    <input
                      type="number" step="0.01" min={minTransfer} max={balance}
                      value={amount} onChange={(e) => setAmount(e.target.value)}
                      placeholder={`Min $${minTransfer}`}
                      className="w-full px-3 py-2.5 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-lg focus:ring-1 focus:ring-[#A78BFA]/40 focus:outline-none pr-16 placeholder:text-[#5E6673]/50"
                    />
                    <button
                      onClick={() => setAmount(balance.toFixed(2))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[#A78BFA] hover:text-[#7C3AED]"
                    >MAX</button>
                  </div>
                </div>

                {error && (
                  <div className="text-xs text-[#F6465D] bg-[#F6465D]/10 rounded-lg px-3 py-2">{error}</div>
                )}

                <button
                  onClick={submit} disabled={loading}
                  className="w-full py-3 rounded-lg text-sm font-bold text-white bg-[#A78BFA] hover:bg-[#7C3AED] disabled:opacity-50 transition-all"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Transfer Instantly"}
                </button>

                <p className="text-[10px] text-[#5E6673] text-center">
                  Transfers are instant — no admin review needed. Min: ${minTransfer} USDT.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   Withdraw Modal — external withdrawal (requires admin approval)
═══════════════════════════════════════════════════════════════════════════ */
function WithdrawModal({ balance, minWithdrawal, onClose, onSuccess }: {
  balance: number; minWithdrawal: number; onClose: () => void; onSuccess: () => void;
}) {
  const [amount,  setAmount]  = useState("");
  const [method,  setMethod]  = useState<"BINANCE_ID" | "TRC20">("TRC20");
  const [address, setAddress] = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    const amt = parseFloat(amount);
    if (!amt || amt < minWithdrawal)
      return setError(`Minimum withdrawal is $${minWithdrawal}`);
    if (amt > balance)
      return setError(`Insufficient balance. Available: $${balance.toFixed(2)}`);
    if (!address.trim())
      return setError("Enter your wallet address or Binance ID");

    setLoading(true);
    try {
      const res  = await api.post("/affiliates/withdraw", { amount: amt, method, wallet_address: address.trim() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-[#1E2026] border border-[#2B3139] rounded-xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#2B3139]">
            <h3 className="text-sm font-bold text-[#EAECEF]">Withdraw Commission</h3>
            <button onClick={onClose} className="text-[#5E6673] hover:text-[#EAECEF]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Balance display */}
            <div className="bg-[#0B0E11] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[#5E6673] uppercase tracking-wider">Available Balance</div>
              <div className="text-xl font-bold text-[#EAECEF]">
                ${balance.toFixed(2)} <span className="text-xs text-[#5E6673]">USDT</span>
              </div>
            </div>

            {/* Method */}
            <div>
              <label className="block text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider mb-1.5">
                Withdrawal Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["TRC20", "BINANCE_ID"] as const).map((m) => (
                  <button key={m} onClick={() => setMethod(m)}
                    className={`py-2.5 rounded-lg text-xs font-semibold transition-all border ${
                      method === m
                        ? "border-[#F0B90B] bg-[#F0B90B]/10 text-[#F0B90B]"
                        : "border-[#2B3139] text-[#5E6673] hover:border-[#5E6673]"
                    }`}>
                    {m === "TRC20" ? "USDT (TRC20)" : "Binance ID"}
                  </button>
                ))}
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider mb-1.5">
                {method === "TRC20" ? "TRC20 Wallet Address" : "Binance ID"}
              </label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder={method === "TRC20" ? "T..." : "Enter Binance ID"}
                className="w-full px-3 py-2.5 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-lg focus:ring-1 focus:ring-[#F0B90B]/40 focus:outline-none placeholder:text-[#5E6673]/50" />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider mb-1.5">
                Amount (USDT)
              </label>
              <div className="relative">
                <input type="number" step="0.01" min={minWithdrawal} max={balance}
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Min $${minWithdrawal}`}
                  className="w-full px-3 py-2.5 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-lg focus:ring-1 focus:ring-[#F0B90B]/40 focus:outline-none pr-16 placeholder:text-[#5E6673]/50" />
                <button onClick={() => setAmount(balance.toString())}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[#F0B90B] hover:text-[#D4A20B]">
                  MAX
                </button>
              </div>
            </div>

            {error && (
              <div className="text-xs text-[#F6465D] bg-[#F6465D]/10 rounded-lg px-3 py-2">{error}</div>
            )}

            <button onClick={submit} disabled={loading}
              className="w-full py-3 rounded-lg text-sm font-bold text-[#0B0E11] bg-[#F0B90B] hover:bg-[#D4A20B] disabled:opacity-50 transition-all">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Submit Withdrawal"}
            </button>

            <p className="text-[10px] text-[#5E6673] text-center">
              Withdrawals are reviewed within 24h. Min: ${minWithdrawal} USDT.
            </p>
          </div>
        </div>
      </div>
    </Portal>
  );
}
