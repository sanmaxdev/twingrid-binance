"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Crown, Users, TrendingUp, DollarSign, Search, Filter,
  Settings, CheckCircle2, AlertTriangle, RefreshCcw, Edit3, X, Save
} from "lucide-react";
import api from "@/lib/api";

interface UserSub {
  user_id: string; email: string; display_name: string | null;
  plan_id: string; status: string; current_period_end: string;
  grace_period_end: string | null; cancel_at_period_end: boolean;
  started_at: string; updated_at: string;
}

interface Revenue {
  total_revenue: number; monthly_revenue: number; mrr_estimate: number;
  active_by_plan: Record<string, number>; total_active: number;
}

interface Plan {
  id: string; name: string; price_usd: number; max_accounts: number | null;
  default_fee_pct: number; daily_backtest_limit: number | null;
  max_backtest_days: number | null; ai_builder_access: boolean;
  is_active: boolean; description: string;
}

const STATUS_STYLE: Record<string, string> = {
  active:       "bg-[#0ECB81]/10 text-[#0ECB81]",
  grace_period: "bg-amber-500/10 text-amber-400",
  cancelled:    "bg-[#F6465D]/10 text-[#F6465D]",
  expired:      "bg-[#848E9C]/10 text-[#848E9C]",
};

const PLAN_STYLE: Record<string, string> = {
  free:  "bg-[#2B2F36] text-[#848E9C]",
  pro:   "bg-[#F0B90B]/10 text-[#F0B90B]",
  elite: "bg-purple-500/10 text-purple-400",
};

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<UserSub[]>([]);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("");
  const [tab, setTab] = useState<"users" | "plans">("users");
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editValues, setEditValues] = useState<Partial<Plan>>({});
  const [overridingUser, setOverridingUser] = useState<UserSub | null>(null);
  const [overridePlanId, setOverridePlanId] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterPlan) params.set("plan_id", filterPlan);

      const [subsRes, revenueRes, plansRes] = await Promise.all([
        api.get(`/admin/subscriptions?${params}`),
        api.get("/admin/subscriptions/revenue"),
        api.get("/admin/plans"),
      ]);
      const [subsData, revData, plansData] = await Promise.all([
        subsRes.json(), revenueRes.json(), plansRes.json()
      ]);
      setSubs(subsData.items || []);
      setRevenue(revData);
      setPlans(plansData);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [search, filterPlan]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSavePlan = async () => {
    if (!editingPlan) return;
    setSaving(true);
    try {
      const res = await api.patch(`/admin/plans/${editingPlan.id}`, editValues);
      if (res.ok) {
        showToast(`${editingPlan.name} plan updated`);
        setEditingPlan(null);
        await loadData();
      } else {
        showToast("Failed to update plan", "error");
      }
    } finally { setSaving(false); }
  };

  const handleOverride = async () => {
    if (!overridingUser || !overridePlanId) return;
    setSaving(true);
    try {
      const res = await api.patch(`/admin/subscriptions/${overridingUser.user_id}`, { plan_id: overridePlanId });
      if (res.ok) {
        showToast(`Plan updated for ${overridingUser.email}`);
        setOverridingUser(null);
        await loadData();
      }
    } finally { setSaving(false); }
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl border shadow-2xl text-sm font-medium ${toast.type === "success" ? "bg-[#0ECB81]/10 border-[#0ECB81]/30 text-[#0ECB81]" : "bg-[#F6465D]/10 border-[#F6465D]/30 text-[#F6465D]"}`}>
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EAECEF] flex items-center gap-3"><Crown size={22} className="text-[#F0B90B]" /> Subscriptions</h1>
          <p className="text-[#848E9C] text-sm mt-1">Manage user plans, plan configuration, and billing revenue.</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2B2F36] text-[#848E9C] hover:text-[#EAECEF] text-sm transition-colors">
          <RefreshCcw size={14} /> Refresh
        </button>
      </div>

      {/* Revenue Stats */}
      {revenue && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "MRR Estimate", value: `$${revenue.mrr_estimate.toFixed(2)}`, icon: TrendingUp, color: "text-[#0ECB81]" },
            { label: "This Month", value: `$${revenue.monthly_revenue.toFixed(2)}`, icon: DollarSign, color: "text-[#F0B90B]" },
            { label: "All Time Revenue", value: `$${revenue.total_revenue.toFixed(2)}`, icon: DollarSign, color: "text-[#848E9C]" },
            { label: "Active Subscribers", value: revenue.total_active, icon: Users, color: "text-purple-400" },
          ].map((s, i) => (
            <div key={i} className="rounded-xl border border-[#2B2F36] bg-[#1E2026] p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon size={16} className={s.color} />
                <span className="text-[#848E9C] text-xs font-semibold uppercase tracking-wider">{s.label}</span>
              </div>
              <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Plan Distribution */}
      {revenue && (
        <div className="grid grid-cols-3 gap-3">
          {["free", "pro", "elite"].map(p => (
            <div key={p} className="rounded-xl border border-[#2B2F36] bg-[#1E2026] p-4 flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${PLAN_STYLE[p]}`}>{p}</span>
              <span className="text-xl font-bold text-[#EAECEF]">{revenue.active_by_plan[p] || 0}</span>
              <span className="text-[#848E9C] text-xs">users</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#2B2F36] pb-0">
        {(["users", "plans"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px capitalize transition-colors ${tab === t ? "border-[#F0B90B] text-[#F0B90B]" : "border-transparent text-[#848E9C] hover:text-[#EAECEF]"}`}>
            {t === "users" ? <><Users size={14} className="inline mr-1.5" />User Subscriptions</> : <><Settings size={14} className="inline mr-1.5" />Plan Configuration</>}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5E6673]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email..."
                className="w-full pl-9 pr-4 py-2.5 bg-[#2B2F36] border border-[#363A45] rounded-xl text-sm text-[#EAECEF] placeholder-[#5E6673] focus:outline-none focus:border-[#F0B90B]/50" />
            </div>
            <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
              className="px-4 py-2.5 bg-[#2B2F36] border border-[#363A45] rounded-xl text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]/50">
              <option value="">All Plans</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="elite">Elite</option>
            </select>
          </div>

          <div className="rounded-2xl border border-[#2B2F36] bg-[#1E2026] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2B2F36] text-[#848E9C]">
                  {["User", "Plan", "Status", "Renewal Date", ""].map((h, i) => (
                    <th key={i} className="text-left px-5 py-3.5 text-xs uppercase tracking-wider font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-12 text-[#848E9C]">Loading...</td></tr>
                ) : subs.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-[#848E9C]">No subscriptions found</td></tr>
                ) : subs.map(s => (
                  <tr key={s.user_id} className="border-b border-[#2B2F36]/50 hover:bg-[#2B2F36]/20 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-medium text-[#EAECEF]">{s.display_name || s.email}</div>
                      <div className="text-[#848E9C] text-xs">{s.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${PLAN_STYLE[s.plan_id]}`}>{s.plan_id}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[s.status] || "bg-[#2B2F36] text-[#848E9C]"}`}>{s.status.replace("_", " ").toUpperCase()}</span>
                      {s.grace_period_end && <p className="text-amber-400 text-[10px] mt-1">Grace until {fmt(s.grace_period_end)}</p>}
                    </td>
                    <td className="px-5 py-4 text-[#848E9C] text-xs">
                      {s.cancel_at_period_end ? <span className="text-[#F6465D]">Cancels {fmt(s.current_period_end)}</span> : fmt(s.current_period_end)}
                    </td>
                    <td className="px-5 py-4">
                      <button onClick={() => { setOverridingUser(s); setOverridePlanId(s.plan_id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2B2F36] text-[#848E9C] hover:text-[#EAECEF] text-xs font-medium transition-colors">
                        <Edit3 size={12} /> Override
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Plans Config Tab */}
      {tab === "plans" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map(plan => (
            <div key={plan.id} className="rounded-2xl border border-[#2B2F36] bg-[#1E2026] p-5">
              <div className="flex items-center justify-between mb-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${PLAN_STYLE[plan.id]}`}>{plan.name}</span>
                <button onClick={() => { setEditingPlan(plan); setEditValues({ name: plan.name, price_usd: plan.price_usd, max_accounts: plan.max_accounts, default_fee_pct: plan.default_fee_pct, daily_backtest_limit: plan.daily_backtest_limit, max_backtest_days: plan.max_backtest_days, ai_builder_access: plan.ai_builder_access, description: plan.description }); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2B2F36] text-[#848E9C] hover:text-[#EAECEF] text-xs font-medium transition-colors">
                  <Edit3 size={12} /> Edit
                </button>
              </div>
              <div className="space-y-2.5 text-sm">
                {[
                  ["Price", `$${plan.price_usd}/mo`],
                  ["Profit Share", `${plan.default_fee_pct}%`],
                  ["Max Accounts", plan.max_accounts === null ? "Unlimited" : String(plan.max_accounts)],
                  ["Backtest / Day", plan.daily_backtest_limit === null ? "No Access" : String(plan.daily_backtest_limit)],
                  ["Max Backtest Range", plan.max_backtest_days ? `${plan.max_backtest_days} days` : "—"],
                  ["AI Builder", plan.ai_builder_access ? "✓ Yes" : "✗ No"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[#848E9C] text-xs">{label}</span>
                    <span className="text-[#EAECEF] font-semibold text-xs">{value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[#5E6673] text-[11px] mt-3 leading-relaxed">{plan.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Edit Plan Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1E2026] border border-[#2B2F36] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-[#EAECEF]">Edit {editingPlan.name} Plan</h3>
              <button onClick={() => setEditingPlan(null)} className="text-[#848E9C] hover:text-[#EAECEF]"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Plan Name", field: "name", type: "text" },
                { label: "Price (USD/month)", field: "price_usd", type: "number" },
                { label: "Profit Share %", field: "default_fee_pct", type: "number" },
                { label: "Max Accounts (blank = unlimited)", field: "max_accounts", type: "number" },
                { label: "Daily Backtest Limit (blank = no access)", field: "daily_backtest_limit", type: "number" },
                { label: "Max Backtest Days", field: "max_backtest_days", type: "number" },
                { label: "Description", field: "description", type: "text" },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label className="block text-[#848E9C] text-xs font-semibold mb-1.5 uppercase tracking-wider">{label}</label>
                  <input
                    type={type}
                    value={(editValues as any)[field] ?? ""}
                    onChange={e => setEditValues(prev => ({ ...prev, [field]: type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value || null }))}
                    className="w-full px-4 py-2.5 bg-[#0B0E11] border border-[#2B2F36] rounded-xl text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]/50"
                  />
                </div>
              ))}
              <div className="flex items-center gap-3">
                <label className="text-[#848E9C] text-xs font-semibold uppercase tracking-wider">AI Builder Access</label>
                <button onClick={() => setEditValues(prev => ({ ...prev, ai_builder_access: !prev.ai_builder_access }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${editValues.ai_builder_access ? "bg-[#F0B90B]" : "bg-[#2B2F36]"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${editValues.ai_builder_access ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditingPlan(null)} className="flex-1 py-2.5 rounded-xl border border-[#2B2F36] text-[#848E9C] text-sm hover:text-[#EAECEF] transition-colors">Cancel</button>
              <button onClick={handleSavePlan} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-[#F0B90B] text-[#0B0E11] text-sm font-bold hover:bg-[#D0980B] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Save size={14} /> {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Plan Modal */}
      {overridingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1E2026] border border-[#2B2F36] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-[#EAECEF] mb-1">Override Plan</h3>
            <p className="text-[#848E9C] text-sm mb-4">{overridingUser.email}</p>
            <select value={overridePlanId} onChange={e => setOverridePlanId(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0B0E11] border border-[#2B2F36] rounded-xl text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]/50 mb-4">
              {plans.map(p => <option key={p.id} value={p.id}>{p.name} (${p.price_usd}/mo)</option>)}
            </select>
            <p className="text-amber-400 text-xs mb-4 flex items-center gap-2"><AlertTriangle size={12} />Admin overrides are applied without charging the user's wallet.</p>
            <div className="flex gap-3">
              <button onClick={() => setOverridingUser(null)} className="flex-1 py-2.5 rounded-xl border border-[#2B2F36] text-[#848E9C] text-sm hover:text-[#EAECEF] transition-colors">Cancel</button>
              <button onClick={handleOverride} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-[#F0B90B] text-[#0B0E11] text-sm font-bold hover:bg-[#D0980B] transition-colors disabled:opacity-50">
                {saving ? "Saving..." : "Apply Override"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
