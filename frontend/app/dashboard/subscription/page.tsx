"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Crown, CheckCircle2, Bot, BarChart2, Sparkles, Zap, AlertTriangle,
  CreditCard, Calendar, RefreshCcw, X, ArrowRight, Receipt, TrendingUp
} from "lucide-react";
import api from "@/lib/api";

interface Plan {
  id: string; name: string; price_usd: number; max_accounts: number | null;
  default_fee_pct: number; daily_backtest_limit: number | null;
  max_backtest_days: number | null; ai_builder_access: boolean; description: string;
}

interface Subscription {
  plan_id: string; status: string; current_period_end: string;
  grace_period_end: string | null; cancel_at_period_end: boolean; started_at: string;
}

interface Invoice {
  id: string; plan_id: string; amount: number; status: string;
  billing_period_start: string; billing_period_end: string;
  failure_reason: string | null; created_at: string;
}

const PLAN_ICONS: Record<string, React.ElementType> = { free: Bot, pro: BarChart2, elite: Crown };
const PLAN_COLORS: Record<string, { border: string; glow: string; badge: string; btn: string }> = {
  free:  { border: "border-[#2B2F36]",     glow: "",                                          badge: "bg-[#2B2F36] text-[#848E9C]",                  btn: "bg-[#2B2F36] text-[#EAECEF] hover:bg-[#363A45]" },
  pro:   { border: "border-[#F0B90B]/60",  glow: "shadow-[0_0_40px_rgba(240,185,11,0.12)]",  badge: "bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/30", btn: "bg-[#F0B90B] text-[#0B0E11] hover:bg-[#D0980B]" },
  elite: { border: "border-purple-500/40", glow: "shadow-[0_0_40px_rgba(168,85,247,0.12)]",  badge: "bg-purple-500/10 text-purple-400 border border-purple-500/30",  btn: "bg-gradient-to-r from-purple-600 to-purple-500 text-white hover:from-purple-500 hover:to-purple-400" },
};

function PlanCard({ plan, isActive, isCurrent, currentPlanPrice, onSubscribe, loading, walletBalance }: {
  plan: Plan; isActive: boolean; isCurrent: boolean; loading: boolean;
  walletBalance: number; currentPlanPrice: number; onSubscribe: (id: string) => void;
}) {
  const Icon = PLAN_ICONS[plan.id] || Bot;
  const colors = PLAN_COLORS[plan.id];
  const canAfford = plan.price_usd === 0 || walletBalance >= plan.price_usd;

  return (
    <div className={`relative flex flex-col rounded-2xl border-2 p-6 transition-all duration-300 bg-[#1E2026] ${colors.border} ${colors.glow} ${isActive ? "scale-[1.01]" : ""}`}>
      {plan.id === "pro" && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 bg-[#F0B90B] text-[#0B0E11] text-[10px] font-extrabold rounded-full uppercase tracking-widest">Most Popular</span>
        </div>
      )}

      <div className="flex items-start justify-between mb-5">
        <div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${plan.id === "elite" ? "bg-purple-500/20 border border-purple-500/30" : plan.id === "pro" ? "bg-[#F0B90B]/10 border border-[#F0B90B]/20" : "bg-[#2B2F36]"}`}>
            <Icon size={20} className={plan.id === "elite" ? "text-purple-400" : plan.id === "pro" ? "text-[#F0B90B]" : "text-[#848E9C]"} />
          </div>
          <h3 className="text-lg font-bold text-[#EAECEF] flex items-center gap-2">
            {plan.name}
            {plan.id === "elite" && <Sparkles size={14} className="text-purple-400" />}
          </h3>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-extrabold ${plan.id === "elite" ? "text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400" : plan.id === "pro" ? "text-[#F0B90B]" : "text-[#EAECEF]"}`}>
            ${plan.price_usd}
          </div>
          <div className="text-[#848E9C] text-xs mt-0.5">/ month</div>
        </div>
      </div>

      <ul className="space-y-2.5 text-sm flex-1 mb-6">
        <li className="flex items-center gap-2 text-[#EAECEF]">
          <CheckCircle2 size={14} className={plan.id === "elite" ? "text-purple-400" : plan.id === "pro" ? "text-[#0ECB81]" : "text-[#5E6673]"} />
          {plan.max_accounts === null ? "Unlimited Accounts" : `${plan.max_accounts} Account${plan.max_accounts > 1 ? "s" : ""}`}
        </li>
        <li className="flex items-center gap-2 text-[#EAECEF]">
          <CheckCircle2 size={14} className={plan.id === "elite" ? "text-purple-400" : plan.id === "pro" ? "text-[#0ECB81]" : "text-[#5E6673]"} />
          {plan.default_fee_pct}% Profit Share
        </li>
        <li className={`flex items-center gap-2 ${plan.daily_backtest_limit ? "text-[#EAECEF]" : "text-[#5E6673]"}`}>
          {plan.daily_backtest_limit
            ? <CheckCircle2 size={14} className={plan.id === "elite" ? "text-purple-400" : "text-[#0ECB81]"} />
            : <span className="w-3.5 h-3.5 rounded-full border border-[#2B2F36] shrink-0" />}
          Backtest Engine
          {plan.daily_backtest_limit && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${plan.id === "elite" ? "bg-purple-400/10 text-purple-400" : "bg-[#F0B90B]/10 text-[#F0B90B]"}`}>
              {plan.daily_backtest_limit}/day
            </span>
          )}
        </li>
        <li className={`flex items-center gap-2 ${plan.ai_builder_access ? "text-[#EAECEF]" : "text-[#5E6673]"}`}>
          {plan.ai_builder_access
            ? <CheckCircle2 size={14} className="text-purple-400" />
            : <span className="w-3.5 h-3.5 rounded-full border border-[#2B2F36] shrink-0" />}
          AI Strategy Builder
          {plan.ai_builder_access && <Sparkles size={12} className="text-purple-400" />}
        </li>
      </ul>

      {isCurrent ? (
        <div className={`w-full py-2.5 rounded-xl text-sm font-bold text-center ${colors.badge}`}>
          ✓ Current Plan
        </div>
      ) : (
        <div>
          {!canAfford && plan.price_usd > 0 && (
            <p className="text-[#F6465D] text-[10px] mb-2 text-center">
              Need ${(plan.price_usd - walletBalance).toFixed(2)} more in wallet
            </p>
          )}
          <button
            onClick={() => onSubscribe(plan.id)}
            disabled={loading || !canAfford}
            className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${colors.btn} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {loading ? "Processing..." : (
              plan.price_usd === 0
                ? "Downgrade to Free"
                : plan.price_usd < currentPlanPrice
                  ? `Downgrade to ${plan.name}`
                  : `Upgrade to ${plan.name}`
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [effectivePlan, setEffectivePlan] = useState<Plan | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      const [plansRes, subRes, invoicesRes] = await Promise.all([
        api.get("/subscriptions/plans"),
        api.get("/subscriptions/current"),
        api.get("/subscriptions/invoices"),
      ]);
      const [plansData, subData, invoicesData] = await Promise.all([
        plansRes.json(), subRes.json(), invoicesRes.json(),
      ]);
      setPlans(plansData);
      setSubscription(subData.subscription);
      setEffectivePlan(subData.effective_plan);
      setWalletBalance(subData.wallet_balance);
      setInvoices(invoicesData);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubscribe = async (planId: string) => {
    setActionLoading(true);
    try {
      const res = await api.post("/subscriptions/subscribe", { plan_id: planId });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        showToast(typeof err.detail === "string" ? err.detail : "Subscription failed", "error");
      } else {
        showToast(`Successfully subscribed to ${plans.find(p => p.id === planId)?.name} plan!`);
        await loadData();
      }
    } finally {
      setActionLoading(false);
      setConfirmPlan(null);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      const res = await api.post("/subscriptions/cancel", {});
      if (res.ok) {
        const data = await res.json();
        showToast(data.message);
        await loadData();
      }
    } finally {
      setActionLoading(false);
      setShowCancelConfirm(false);
    }
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#F0B90B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl border shadow-2xl text-sm font-medium transition-all ${toast.type === "success" ? "bg-[#0ECB81]/10 border-[#0ECB81]/30 text-[#0ECB81]" : "bg-[#F6465D]/10 border-[#F6465D]/30 text-[#F6465D]"}`}>
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#EAECEF] flex items-center gap-3">
          <Crown size={24} className="text-[#F0B90B]" /> Subscription
        </h1>
        <p className="text-[#848E9C] text-sm mt-1">Manage your plan, billing, and feature access.</p>
      </div>

      {/* Current Plan Status */}
      {subscription && effectivePlan && (
        <div className={`rounded-2xl border p-6 ${PLAN_COLORS[effectivePlan.id]?.border} ${PLAN_COLORS[effectivePlan.id]?.glow} bg-[#1E2026]`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${effectivePlan.id === "elite" ? "bg-purple-500/20" : effectivePlan.id === "pro" ? "bg-[#F0B90B]/10" : "bg-[#2B2F36]"}`}>
                {(() => { const Icon = PLAN_ICONS[effectivePlan.id] || Bot; return <Icon size={24} className={effectivePlan.id === "elite" ? "text-purple-400" : effectivePlan.id === "pro" ? "text-[#F0B90B]" : "text-[#848E9C]"} />; })()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-[#EAECEF]">{effectivePlan.name} Plan</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PLAN_COLORS[effectivePlan.id]?.badge}`}>{subscription.status.toUpperCase()}</span>
                </div>
                <p className="text-[#848E9C] text-sm mt-0.5">{effectivePlan.description}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 text-sm">
              {effectivePlan.price_usd > 0 && (
                <>
                  <div className="flex items-center gap-2 text-[#848E9C]">
                    <Calendar size={14} />
                    <span>{subscription.cancel_at_period_end ? "Expires" : "Renews"} {fmt(subscription.current_period_end)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#848E9C]">
                    <CreditCard size={14} />
                    <span>Wallet: <span className="text-[#EAECEF] font-semibold">${walletBalance.toFixed(2)}</span></span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Grace period warning */}
          {subscription.status === "grace_period" && subscription.grace_period_end && (
            <div className="mt-4 flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-amber-400 text-sm font-semibold">Payment Failed – Grace Period</p>
                <p className="text-[#848E9C] text-xs mt-0.5">
                  Your renewal failed. Add funds to your wallet before {fmt(subscription.grace_period_end)} to keep your {effectivePlan.name} plan. After that, you'll be downgraded to Free.
                </p>
              </div>
            </div>
          )}

          {/* Cancel notice */}
          {subscription.cancel_at_period_end && (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-[#F6465D]/10 border border-[#F6465D]/20">
              <AlertTriangle size={16} className="text-[#F6465D] shrink-0" />
              <p className="text-[#F6465D] text-sm">
                Cancellation scheduled — access continues until {fmt(subscription.current_period_end)}.
              </p>
            </div>
          )}

          {/* Actions */}
          {effectivePlan.price_usd > 0 && !subscription.cancel_at_period_end && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#F6465D]/30 text-[#F6465D] text-xs font-medium hover:bg-[#F6465D]/10 transition-colors"
              >
                <X size={14} /> Cancel Subscription
              </button>
            </div>
          )}
        </div>
      )}

      {/* Plan Cards */}
      <div>
        <h2 className="text-lg font-bold text-[#EAECEF] mb-4 flex items-center gap-2">
          <Zap size={18} className="text-[#F0B90B]" /> Available Plans
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isActive={effectivePlan?.id === plan.id}
              isCurrent={subscription?.plan_id === plan.id && subscription?.status !== "grace_period"}
              walletBalance={walletBalance}
              loading={actionLoading}
              currentPlanPrice={effectivePlan?.price_usd ?? 0}
              onSubscribe={(id) => setConfirmPlan(plans.find(p => p.id === id) || null)}
            />
          ))}
        </div>
      </div>

      {/* Billing History */}
      {invoices.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-[#EAECEF] mb-4 flex items-center gap-2">
            <Receipt size={18} className="text-[#848E9C]" /> Billing History
          </h2>
          <div className="rounded-2xl border border-[#2B2F36] bg-[#1E2026] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2B2F36] text-[#848E9C]">
                  <th className="text-left px-6 py-3.5 text-xs uppercase tracking-wider font-semibold">Plan</th>
                  <th className="text-left px-6 py-3.5 text-xs uppercase tracking-wider font-semibold">Period</th>
                  <th className="text-left px-6 py-3.5 text-xs uppercase tracking-wider font-semibold">Amount</th>
                  <th className="text-left px-6 py-3.5 text-xs uppercase tracking-wider font-semibold">Status</th>
                  <th className="text-left px-6 py-3.5 text-xs uppercase tracking-wider font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={inv.id} className={`border-b border-[#2B2F36]/50 hover:bg-[#2B2F36]/20 transition-colors ${i === invoices.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-6 py-4 font-semibold text-[#EAECEF] capitalize">{inv.plan_id}</td>
                    <td className="px-6 py-4 text-[#848E9C] text-xs">{fmt(inv.billing_period_start)} – {fmt(inv.billing_period_end)}</td>
                    <td className="px-6 py-4 font-bold text-[#EAECEF]">${inv.amount.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${inv.status === "paid" ? "bg-[#0ECB81]/10 text-[#0ECB81]" : "bg-[#F6465D]/10 text-[#F6465D]"}`}>
                        {inv.status.toUpperCase()}
                      </span>
                      {inv.failure_reason && <p className="text-[#F6465D] text-[10px] mt-1">{inv.failure_reason}</p>}
                    </td>
                    <td className="px-6 py-4 text-[#848E9C] text-xs">{fmt(inv.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm Subscription Modal */}
      {confirmPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1E2026] border border-[#2B2F36] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            {(() => {
              const isDowngrade = confirmPlan.price_usd < (effectivePlan?.price_usd ?? 0);
              return (
                <>
                  <h3 className="text-lg font-bold text-[#EAECEF] mb-2">
                    {isDowngrade ? "Confirm Downgrade" : "Confirm Upgrade"}
                  </h3>
                  <p className="text-[#848E9C] text-sm mb-4">
                    {isDowngrade ? (
                      <>
                        Switch to <strong className="text-[#EAECEF]">{confirmPlan.name}</strong> for{" "}
                        <strong className="text-[#F0B90B]">${confirmPlan.price_usd}/month</strong>?
                        {confirmPlan.price_usd === 0
                          ? " Your plan will downgrade to Free at the end of the current period."
                          : " Your new plan takes effect immediately and is billed from your wallet."}
                      </>
                    ) : (
                      <>
                        Upgrade to <strong className="text-[#EAECEF]">{confirmPlan.name}</strong> for{" "}
                        <strong className="text-[#F0B90B]">${confirmPlan.price_usd}/month</strong>?
                        This will be deducted from your TwinGrid wallet immediately.
                      </>
                    )}
                  </p>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#0B0E11] mb-4 text-sm">
                    <span className="text-[#848E9C]">Wallet Balance</span>
                    <span className="text-[#EAECEF] font-bold">${walletBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setConfirmPlan(null)} className="flex-1 py-2.5 rounded-xl border border-[#2B2F36] text-[#848E9C] text-sm font-medium hover:text-[#EAECEF] transition-colors">Cancel</button>
                    <button
                      onClick={() => handleSubscribe(confirmPlan.id)}
                      disabled={actionLoading}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${PLAN_COLORS[confirmPlan.id]?.btn} disabled:opacity-50`}
                    >
                      {actionLoading ? "Processing..." : "Confirm"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Confirm Cancel Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1E2026] border border-[#2B2F36] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-[#EAECEF] mb-2">Cancel Subscription?</h3>
            <p className="text-[#848E9C] text-sm mb-5">
              You'll retain access until {subscription?.current_period_end ? fmt(subscription.current_period_end) : "end of period"}. After that, your account will be downgraded to the Free plan.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-[#2B2F36] text-[#848E9C] text-sm font-medium hover:text-[#EAECEF] transition-colors">Keep Plan</button>
              <button onClick={handleCancel} disabled={actionLoading} className="flex-1 py-2.5 rounded-xl bg-[#F6465D]/90 text-white text-sm font-bold hover:bg-[#F6465D] transition-colors disabled:opacity-50">
                {actionLoading ? "..." : "Cancel Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
