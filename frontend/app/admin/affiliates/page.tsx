"use client";
import { useEffect, useState } from "react";
import {
  Users, DollarSign, Settings, Loader2, Save, TrendingUp,
  ArrowUpRight, CheckCircle, XCircle, Clock, X,
} from "lucide-react";
import api from "@/lib/api";

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  APPROVED: { bg: "rgba(14,203,129,0.1)", text: "#0ECB81" },
  PENDING: { bg: "rgba(240,185,11,0.1)", text: "#F0B90B" },
  REJECTED: { bg: "rgba(246,70,93,0.1)", text: "#F6465D" },
};

export default function AdminAffiliatesPage() {
  const [overview, setOverview] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configDraft, setConfigDraft] = useState({ enabled: true, default_commission_pct: 10 });
  const [tab, setTab] = useState<"withdrawals" | "users" | "config">("withdrawals");
  const [actionModal, setActionModal] = useState<any>(null);

  const load = async () => {
    try {
      const [o, c, u, w] = await Promise.all([
        api.get("/admin/affiliates/overview").then((r) => r.json()),
        api.get("/admin/affiliates/config").then((r) => r.json()),
        api.get("/admin/affiliates/users").then((r) => r.json()),
        api.get("/admin/affiliates/withdrawals").then((r) => r.json()),
      ]);
      setOverview(o);
      setConfig(c);
      setConfigDraft(c);
      setUsers(u.items || []);
      setWithdrawals(w.items || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await api.put("/admin/affiliates/config", configDraft);
      setConfig(await res.json());
    } catch {}
    setSaving(false);
  };

  const setOverride = async (userId: string, pct: number | null) => {
    try { await api.put(`/admin/affiliates/users/${userId}/override`, { commission_pct: pct }); load(); } catch {}
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-[#F0B90B]" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Commissions", value: `$${(overview?.total_paid || 0).toFixed(2)}`, icon: DollarSign, color: "#0ECB81" },
          { label: "Total Withdrawn", value: `$${(overview?.total_withdrawn || 0).toFixed(2)}`, icon: ArrowUpRight, color: "#F6465D" },
          { label: "Pending Withdrawals", value: `${overview?.pending_withdrawals || 0} ($${(overview?.pending_withdrawal_amount || 0).toFixed(2)})`, icon: Clock, color: "#F0B90B" },
          { label: "Total Referrals", value: overview?.total_referrals || 0, icon: Users, color: "#3B82F6" },
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

      {/* Tabs */}
      <div className="bg-[#1E2026] border border-[#2B3139] rounded-xl overflow-hidden">
        <div className="flex border-b border-[#2B3139]">
          {(["withdrawals", "users", "config"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${tab === t ? "text-[#F0B90B] border-b-2 border-[#F0B90B]" : "text-[#5E6673] hover:text-[#848E9C]"}`}>
              {t === "withdrawals" ? `Withdrawals (${withdrawals.length})` : t === "users" ? `Users (${users.length})` : "Config"}
            </button>
          ))}
        </div>

        {/* Withdrawals Tab */}
        {tab === "withdrawals" && (
          <div className="overflow-x-auto">
            {withdrawals.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#5E6673]">No withdrawal requests yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-[#5E6673] uppercase tracking-wider border-b border-[#2B3139]">
                    <th className="text-left px-4 py-2.5">User</th>
                    <th className="text-right px-3 py-2.5">Amount</th>
                    <th className="text-center px-3 py-2.5">Method</th>
                    <th className="text-left px-3 py-2.5">Address</th>
                    <th className="text-center px-3 py-2.5">Status</th>
                    <th className="text-center px-3 py-2.5">Date</th>
                    <th className="text-center px-3 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2B3139]/50">
                  {withdrawals.map((w) => {
                    const st = STATUS_STYLES[w.status] || STATUS_STYLES.PENDING;
                    return (
                      <tr key={w.id} className="hover:bg-[#2B3139]/15">
                        <td className="px-4 py-3">
                          <div className="text-sm text-[#EAECEF]">{w.user_name || w.user_email?.split("@")[0]}</div>
                          <div className="text-[10px] text-[#5E6673]">{w.user_email}</div>
                        </td>
                        <td className="text-right px-3 py-3 text-[#EAECEF] font-semibold">${w.amount.toFixed(2)}</td>
                        <td className="text-center px-3 py-3">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[#2B3139] text-[#848E9C]">{w.method}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-[#848E9C] font-mono">{w.wallet_address.length > 18 ? w.wallet_address.slice(0, 8) + "..." + w.wallet_address.slice(-6) : w.wallet_address}</span>
                        </td>
                        <td className="text-center px-3 py-3">
                          <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ backgroundColor: st.bg, color: st.text }}>{w.status}</span>
                        </td>
                        <td className="text-center px-3 py-3 text-[11px] text-[#5E6673]">{new Date(w.created_at).toLocaleDateString()}</td>
                        <td className="text-center px-3 py-3">
                          {w.status === "PENDING" ? (
                            <div className="flex items-center gap-1 justify-center">
                              <button onClick={() => setActionModal({ ...w, action: "approve" })}
                                className="p-1.5 rounded bg-[#0ECB81]/10 text-[#0ECB81] hover:bg-[#0ECB81]/20 transition-colors">
                                <CheckCircle className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setActionModal({ ...w, action: "reject" })}
                                className="p-1.5 rounded bg-[#F6465D]/10 text-[#F6465D] hover:bg-[#F6465D]/20 transition-colors">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#5E6673]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Users Tab */}
        {tab === "users" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-[#5E6673] uppercase tracking-wider border-b border-[#2B3139]">
                  <th className="text-left px-4 py-2.5">User</th>
                  <th className="text-center px-3 py-2.5">Referrals</th>
                  <th className="text-right px-3 py-2.5">Earned</th>
                  <th className="text-right px-3 py-2.5">Balance</th>
                  <th className="text-center px-3 py-2.5">Commission %</th>
                  <th className="text-center px-3 py-2.5">Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2B3139]/50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#2B3139]/15">
                    <td className="px-4 py-3">
                      <div className="text-sm text-[#EAECEF]">{u.display_name || u.email.split("@")[0]}</div>
                      <div className="text-[10px] text-[#5E6673]">{u.email}</div>
                    </td>
                    <td className="text-center px-3 py-3 text-[#EAECEF]">{u.referral_count}</td>
                    <td className="text-right px-3 py-3 text-[#0ECB81] font-medium">${u.total_earned.toFixed(2)}</td>
                    <td className="text-right px-3 py-3 text-[#EAECEF]">${u.affiliate_balance.toFixed(2)}</td>
                    <td className="text-center px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${u.commission_override != null ? "bg-[#F0B90B]/10 text-[#F0B90B]" : "text-[#5E6673]"}`}>
                        {u.commission_override != null ? `${u.commission_override}%` : `${config?.default_commission_pct || 10}% (default)`}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3">
                      <select value={u.commission_override ?? ""}
                        onChange={(e) => setOverride(u.id, e.target.value === "" ? null : parseFloat(e.target.value))}
                        className="text-xs px-2 py-1 bg-[#0B0E11] border border-[#2B2F36] rounded text-[#EAECEF] focus:outline-none">
                        <option value="">Default</option>
                        {[5, 10, 15, 20, 25, 30].map((p) => <option key={p} value={p}>{p}%</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Config Tab */}
        {tab === "config" && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="h-4 w-4 text-[#F0B90B]" />
              <span className="text-sm font-bold text-[#EAECEF]">Affiliate Configuration</span>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={configDraft.enabled}
                  onChange={(e) => setConfigDraft({ ...configDraft, enabled: e.target.checked })}
                  className="w-4 h-4 rounded border-[#2B3139] bg-[#0B0E11] text-[#F0B90B]" />
                <span className="text-sm text-[#EAECEF]">System Enabled</span>
              </label>
              <div>
                <label className="block text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider mb-1">Default Commission %</label>
                <input type="number" step="0.5" min="0" max="100" value={configDraft.default_commission_pct}
                  onChange={(e) => setConfigDraft({ ...configDraft, default_commission_pct: parseFloat(e.target.value) || 0 })}
                  className="w-24 px-3 py-2 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-lg focus:ring-1 focus:ring-[#F0B90B]/40 focus:outline-none" />
              </div>
              <button onClick={saveConfig} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0B0E11] bg-[#F0B90B] rounded-lg hover:bg-[#D4A20B] disabled:opacity-50 transition-all">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionModal && (
        <WithdrawalActionModal
          withdrawal={actionModal}
          onClose={() => setActionModal(null)}
          onDone={() => { setActionModal(null); load(); }}
        />
      )}
    </div>
  );
}


function WithdrawalActionModal({ withdrawal, onClose, onDone }: { withdrawal: any; onClose: () => void; onDone: () => void }) {
  const isApprove = withdrawal.action === "approve";
  const [txHash, setTxHash] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!isApprove && !reason.trim()) return setError("Rejection reason is required");
    setLoading(true);
    setError("");
    try {
      const endpoint = `/admin/affiliates/withdrawals/${withdrawal.id}/${isApprove ? "approve" : "reject"}`;
      const res = await api.post(endpoint, {
        tx_hash: txHash || null,
        reject_reason: reason || null,
        admin_note: note || null,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
      onDone();
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1E2026] border border-[#2B3139] rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2B3139]">
          <h3 className="text-sm font-bold text-[#EAECEF]">{isApprove ? "Approve" : "Reject"} Withdrawal</h3>
          <button onClick={onClose} className="text-[#5E6673] hover:text-[#EAECEF]"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Summary */}
          <div className="bg-[#0B0E11] rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-xs"><span className="text-[#5E6673]">User</span><span className="text-[#EAECEF]">{withdrawal.user_email}</span></div>
            <div className="flex justify-between text-xs"><span className="text-[#5E6673]">Amount</span><span className="text-[#EAECEF] font-semibold">${withdrawal.amount.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-[#5E6673]">Method</span><span className="text-[#EAECEF]">{withdrawal.method}</span></div>
            <div className="flex justify-between text-xs"><span className="text-[#5E6673]">Address</span><span className="text-[#EAECEF] font-mono text-[11px]">{withdrawal.wallet_address}</span></div>
          </div>

          {isApprove ? (
            <div>
              <label className="block text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider mb-1">Transaction Hash (optional)</label>
              <input type="text" value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Paste TX hash after sending..."
                className="w-full px-3 py-2.5 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-lg focus:outline-none placeholder:text-[#5E6673]/50" />
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider mb-1">Rejection Reason *</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason for rejection..."
                className="w-full px-3 py-2.5 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-lg focus:outline-none resize-none placeholder:text-[#5E6673]/50" />
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider mb-1">Admin Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note..."
              className="w-full px-3 py-2.5 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-lg focus:outline-none placeholder:text-[#5E6673]/50" />
          </div>

          {error && <div className="text-xs text-[#F6465D] bg-[#F6465D]/10 rounded-lg px-3 py-2">{error}</div>}

          <button onClick={submit} disabled={loading}
            className={`w-full py-3 rounded-lg text-sm font-bold transition-all disabled:opacity-50 ${isApprove ? "bg-[#0ECB81] text-white hover:bg-[#0BB574]" : "bg-[#F6465D] text-white hover:bg-[#E03E54]"}`}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : isApprove ? "Approve & Mark Paid" : "Reject & Refund"}
          </button>
        </div>
      </div>
    </div>
  );
}
