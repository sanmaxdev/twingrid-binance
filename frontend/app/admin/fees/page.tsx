"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { DollarSign, Settings, CheckCircle2, XCircle, Clock, Search, ArrowUpCircle, ArrowDownCircle, Loader2, RefreshCw, ExternalLink, UserPlus, AlertTriangle, X } from "lucide-react";

export default function AdminFeesPage() {
  const [tab, setTab] = useState<"deposits" | "settings" | "users" | "transactions">("deposits");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [depTotal, setDepTotal] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);

  // Settings form
  const [editSettings, setEditSettings] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // User balance search
  const [searchEmail, setSearchEmail] = useState("");
  const [searchedUser, setSearchedUser] = useState<any>(null);
  const [adjustAmt, setAdjustAmt] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [feeOverride, setFeeOverride] = useState("");
  const [actionMsg, setActionMsg] = useState<{type: string; text: string} | null>(null);

  // Auto-suggest
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const suggestTimer = useRef<NodeJS.Timeout | null>(null);

  // All users list
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allUsersTotal, setAllUsersTotal] = useState(0);
  const [allUsersPage, setAllUsersPage] = useState(1);
  const [allUsersLoading, setAllUsersLoading] = useState(false);

  // Modal state for approve/reject
  const [modal, setModal] = useState<{type: "approve" | "reject"; depositId: string; email: string; amount: number} | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, setRes, depRes, txRes] = await Promise.all([
        api.get("/admin/fees/dashboard"), api.get("/admin/fees/settings"),
        api.get("/admin/fees/deposits?per_page=25&status=PENDING"), api.get("/admin/fees/transactions?per_page=25"),
      ]);
      const [d, s, dep, tx] = await Promise.all([dashRes.json(), setRes.json(), depRes.json(), txRes.json()]);
      setDashboard(d); setSettings(s); setEditSettings(s);
      setDeposits(dep.items); setDepTotal(dep.total);
      setTransactions(tx.items); setTxTotal(tx.total);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  const fetchAllUsers = useCallback(async (page: number) => {
    setAllUsersLoading(true);
    try {
      const res = await api.get(`/admin/users?per_page=10&page=${page}`);
      const data = await res.json();
      setAllUsers(data.items);
      setAllUsersTotal(data.total);
    } catch (e) { console.error(e); } finally { setAllUsersLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (tab === "users") fetchAllUsers(allUsersPage); }, [tab, allUsersPage, fetchAllUsers]);

  // Auto-suggest: debounced search when 2+ chars typed
  useEffect(() => {
    if (searchEmail.length < 2 || searchedUser) {
      setSuggestions([]);
      return;
    }
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/admin/users?search=${encodeURIComponent(searchEmail)}&per_page=8`);
        const data = await res.json();
        setSuggestions(data.items || []);
      } catch { setSuggestions([]); }
    }, 300);
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
  }, [searchEmail, searchedUser]);

  const handleSelectSuggest = async (user: any) => {
    setSuggestions([]);
    setSearchEmail(user.display_name || user.email);
    try {
      const balRes = await api.get(`/admin/fees/users/${user.id}/balance`);
      setSearchedUser(await balRes.json());
    } catch (e: any) { setActionMsg({ type: "error", text: e.message }); }
  };

  const handleSelectFromTable = async (user: any) => {
    setSearchEmail(user.display_name || user.email);
    try {
      const balRes = await api.get(`/admin/fees/users/${user.id}/balance`);
      setSearchedUser(await balRes.json());
      // Scroll to top
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) { setActionMsg({ type: "error", text: e.message }); }
  };

  const handleApprove = async () => {
    if (!modal) return;
    setModalLoading(true);
    try {
      await api.post(`/admin/fees/deposits/${modal.depositId}/approve`, {});
      setModal(null);
      fetchData();
    } catch (e: any) {
      setActionMsg({ type: "error", text: e.message || "Failed to approve deposit" });
      setModal(null);
    } finally { setModalLoading(false); }
  };

  const handleReject = async () => {
    if (!modal) return;
    setModalLoading(true);
    try {
      await api.post(`/admin/fees/deposits/${modal.depositId}/reject?reason=${encodeURIComponent(rejectReason || "Rejected by admin")}`, {});
      setModal(null);
      setRejectReason("");
      fetchData();
    } catch (e: any) {
      setActionMsg({ type: "error", text: e.message || "Failed to reject deposit" });
      setModal(null);
    } finally { setModalLoading(false); }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await api.put("/admin/fees/settings", {
        fee_percentage: editSettings.fee_percentage, deposit_address: editSettings.deposit_address,
        min_deposit: editSettings.min_deposit, min_balance_multiplier: editSettings.min_balance_multiplier,
        fee_enabled: editSettings.fee_enabled,
      });
      fetchData(); setActionMsg({ type: "success", text: "Settings saved!" });
    } catch (e: any) { setActionMsg({ type: "error", text: e.message }); } finally { setSaving(false); }
  };

  const handleSearchUser = async () => {
    setSearchedUser(null); setActionMsg(null);
    try {
      const res = await api.get(`/admin/users?search=${encodeURIComponent(searchEmail)}&per_page=1`);
      const data = await res.json();
      if (data.items.length === 0) { setActionMsg({ type: "error", text: "User not found" }); return; }
      const u = data.items[0];
      const balRes = await api.get(`/admin/fees/users/${u.id}/balance`);
      setSearchedUser(await balRes.json());
    } catch (e: any) { setActionMsg({ type: "error", text: e.message }); }
  };

  const handleAdjust = async () => {
    if (!searchedUser || !adjustAmt || !adjustNote) return;
    try {
      const res = await api.post(`/admin/fees/users/${searchedUser.user_id}/adjust`, { amount: parseFloat(adjustAmt), note: adjustNote });
      const data = await res.json();
      setActionMsg({ type: "success", text: `Balance adjusted. New: $${data.new_balance.toFixed(2)}` });
      setAdjustAmt(""); setAdjustNote(""); handleSearchUser(); fetchAllUsers(allUsersPage);
    } catch (e: any) { setActionMsg({ type: "error", text: e.message }); }
  };

  const handleFeeOverride = async () => {
    if (!searchedUser) return;
    try {
      await api.put(`/admin/fees/users/${searchedUser.user_id}/fee-override`, { fee_percentage_override: feeOverride ? parseFloat(feeOverride) : null });
      setActionMsg({ type: "success", text: feeOverride ? `Fee override set to ${feeOverride}%` : "Fee override cleared" });
      setFeeOverride(""); handleSearchUser();
    } catch (e: any) { setActionMsg({ type: "error", text: e.message }); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-[#F0B90B]" /></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#EAECEF] flex items-center gap-2"><DollarSign className="text-[#F0B90B]" size={28} /> Fee Management</h1>
          <p className="text-sm text-[#848E9C] mt-1">Manage profit-share fees, deposits, and user balances</p>
        </div>
        <button onClick={() => { setLoading(true); fetchData(); }} className="p-2 rounded-lg bg-[#2B2F36] text-[#848E9C] hover:text-[#EAECEF]"><RefreshCw size={18} /></button>
      </div>

      {/* Dashboard KPIs */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Fees Collected", value: `$${dashboard.total_fees_collected.toFixed(2)}`, color: "text-[#0ECB81]" },
            { label: "Total Deposits", value: `$${dashboard.total_deposits.toFixed(2)}`, color: "text-[#3B82F6]" },
            { label: "Pending Deposits", value: dashboard.pending_deposit_count, color: "text-[#F0B90B]" },
            { label: "Pending Amount", value: `$${dashboard.pending_deposit_amount.toFixed(2)}`, color: "text-[#F0B90B]" },
            { label: "Users w/ Balance", value: dashboard.active_users_with_balance, color: "text-[#EAECEF]" },
            { label: "Negative Balances", value: `$${dashboard.total_negative_balances.toFixed(2)}`, color: "text-[#F6465D]" },
          ].map((kpi, i) => (
            <div key={i} className="bg-[#2B2F36] border border-[#363A45] rounded-xl p-4">
              <div className="text-[10px] font-medium text-[#848E9C] uppercase tracking-wider mb-1">{kpi.label}</div>
              <div className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[#2B2F36] rounded-xl p-1">
        {(["deposits", "users", "settings", "transactions"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${tab === t ? "bg-[#F0B90B]/10 text-[#F0B90B]" : "text-[#848E9C] hover:text-[#EAECEF]"}`}>
            {t === "deposits" ? `Pending Deposits (${dashboard?.pending_deposit_count || 0})` : t === "users" ? "User Balances" : t === "settings" ? "Settings" : "All Transactions"}
          </button>
        ))}
      </div>

      {/* Pending Deposits */}
      {tab === "deposits" && (
        <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#363A45]"><h3 className="text-sm font-semibold text-[#EAECEF]">Pending Deposit Requests</h3></div>
          {deposits.length === 0 ? <div className="p-8 text-center text-[#848E9C] text-sm">No pending deposits</div> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs text-[#848E9C] border-b border-[#363A45]">
              <th className="text-left px-4 py-3 font-medium">User</th><th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">TX Hash</th><th className="text-left px-4 py-3 font-medium">Date</th><th className="text-center px-4 py-3 font-medium">Actions</th>
            </tr></thead><tbody>
              {deposits.map(d => (
                <tr key={d.id} className="border-b border-[#363A45]/50 hover:bg-[#363A45]/20">
                  <td className="px-4 py-3 text-[#EAECEF] text-xs">{d.user_email}</td>
                  <td className="px-4 py-3 text-right text-[#0ECB81] font-medium">${d.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#848E9C]">
                    <a href={`https://tronscan.org/#/transaction/${d.tx_hash}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#F0B90B]">
                      {d.tx_hash.slice(0, 12)}...{d.tx_hash.slice(-8)} <ExternalLink size={12} />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#848E9C] whitespace-nowrap">{new Date(d.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setModal({type: "approve", depositId: d.id, email: d.user_email, amount: d.amount})} className="px-3 py-1.5 rounded-lg bg-[#0ECB81]/10 text-[#0ECB81] text-xs font-medium hover:bg-[#0ECB81]/20 flex items-center gap-1"><CheckCircle2 size={14} />Approve</button>
                      <button onClick={() => { setRejectReason(""); setModal({type: "reject", depositId: d.id, email: d.user_email, amount: d.amount}); }} className="px-3 py-1.5 rounded-lg bg-[#F6465D]/10 text-[#F6465D] text-xs font-medium hover:bg-[#F6465D]/20 flex items-center gap-1"><XCircle size={14} />Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      )}

      {/* User Balances */}
      {tab === "users" && (
        <div className="space-y-4">
          {/* Search with auto-suggest */}
          <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[#EAECEF] mb-4 flex items-center gap-2"><Search size={16} className="text-[#F0B90B]" /> Search User</h3>
            <div className="relative">
              <input value={searchEmail} onChange={e => { setSearchEmail(e.target.value); }} placeholder="Search by name or email..." className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F0B90B] focus:outline-none" />
              {/* Auto-suggest dropdown */}
              {suggestions.length > 0 && searchEmail.length >= 2 && !searchedUser && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1E2026] border border-[#363A45] rounded-xl shadow-2xl z-50 max-h-[240px] overflow-y-auto">
                  {suggestions.map(s => (
                    <button key={s.id} onClick={() => handleSelectSuggest(s)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#2B2F36] transition-colors border-b border-[#2B2F36]/50 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-[#F0B90B]/10 flex items-center justify-center text-[#F0B90B] font-bold text-xs uppercase border border-[#F0B90B]/20 shrink-0">
                        {s.email.substring(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#EAECEF] truncate">{s.display_name || s.email.split("@")[0]}</div>
                        <div className="text-xs text-[#848E9C] truncate">{s.email}</div>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${s.twin_grid_balance >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
                        ${s.twin_grid_balance.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {actionMsg && <div className={`mt-3 text-xs p-3 rounded-lg ${actionMsg.type === "success" ? "bg-[#0ECB81]/10 text-[#0ECB81]" : "bg-[#F6465D]/10 text-[#F6465D]"}`}>{actionMsg.text}</div>}
          </div>

          {/* Selected user detail */}
          {searchedUser && (
            <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                  <div><div className="text-[10px] text-[#848E9C] uppercase mb-1">Email</div><div className="text-sm text-[#EAECEF] font-medium">{searchedUser.email}</div></div>
                  <div><div className="text-[10px] text-[#848E9C] uppercase mb-1">Balance</div><div className={`text-lg font-bold ${searchedUser.balance >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>${searchedUser.balance.toFixed(2)}</div></div>
                  <div><div className="text-[10px] text-[#848E9C] uppercase mb-1">Total Deposited</div><div className="text-sm text-[#EAECEF]">${searchedUser.total_deposited.toFixed(2)}</div></div>
                  <div><div className="text-[10px] text-[#848E9C] uppercase mb-1">Fee Override</div><div className="text-sm text-[#EAECEF]">{searchedUser.fee_percentage_override !== null ? `${searchedUser.fee_percentage_override}%` : "Global"}</div></div>
                </div>
                <button onClick={() => { setSearchedUser(null); setSearchEmail(""); }} className="p-1.5 text-[#848E9C] hover:text-[#EAECEF] shrink-0"><X size={18} /></button>
              </div>
              <hr className="border-[#363A45]" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-semibold text-[#848E9C] uppercase mb-3">Adjust Balance</h4>
                  <div className="space-y-3">
                    <input type="number" step="0.01" value={adjustAmt} onChange={e => setAdjustAmt(e.target.value)} placeholder="Amount (+/-)" className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F0B90B] focus:outline-none" />
                    <input value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="Reason (required)" className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F0B90B] focus:outline-none" />
                    <button onClick={handleAdjust} disabled={!adjustAmt || !adjustNote} className="w-full py-2.5 rounded-lg bg-[#F0B90B] text-[#1E2026] font-semibold text-sm hover:bg-[#F0B90B]/90 disabled:opacity-50">Apply Adjustment</button>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-[#848E9C] uppercase mb-3">Fee Override</h4>
                  <div className="space-y-3">
                    <input type="number" step="0.1" min="0" max="100" value={feeOverride} onChange={e => setFeeOverride(e.target.value)} placeholder="Fee % (empty = global)" className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F0B90B] focus:outline-none" />
                    <button onClick={handleFeeOverride} className="w-full py-2.5 rounded-lg bg-[#3B82F6] text-white font-semibold text-sm hover:bg-[#3B82F6]/90">{feeOverride ? `Set ${feeOverride}%` : "Clear Override (Use Global)"}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* All Users Table */}
          <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[#363A45] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#EAECEF]">All Users ({allUsersTotal})</h3>
            </div>
            {allUsersLoading ? (
              <div className="p-8 text-center"><Loader2 className="inline w-6 h-6 animate-spin text-[#F0B90B]" /></div>
            ) : allUsers.length === 0 ? (
              <div className="p-8 text-center text-[#848E9C] text-sm">No users found</div>
            ) : (
              <>
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs text-[#848E9C] border-b border-[#363A45]">
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-right px-4 py-3 font-medium">TG Balance</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr></thead><tbody>
                  {allUsers.map(u => (
                    <tr key={u.id} className="border-b border-[#363A45]/50 hover:bg-[#363A45]/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#F0B90B]/10 flex items-center justify-center text-[#F0B90B] font-bold text-[10px] uppercase border border-[#F0B90B]/20 shrink-0">
                            {u.email.substring(0, 2)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-[#EAECEF]">{u.display_name || u.email.split("@")[0]}</div>
                            <div className="text-[11px] text-[#848E9C]">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#848E9C]">{u.role}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-semibold tabular-nums ${u.twin_grid_balance >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
                          ${u.twin_grid_balance.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#0ECB81]/10 text-[#0ECB81]">Active</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F6465D]/10 text-[#F6465D]">Suspended</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleSelectFromTable(u)} className="px-3 py-1.5 rounded-lg bg-[#F0B90B]/10 text-[#F0B90B] text-xs font-medium hover:bg-[#F0B90B]/20 transition-colors">
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody></table></div>
                {/* Pagination */}
                <div className="p-4 border-t border-[#363A45] flex items-center justify-between">
                  <div className="text-xs text-[#848E9C]">
                    Page {allUsersPage} of {Math.ceil(allUsersTotal / 10) || 1} · {allUsersTotal} users
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setAllUsersPage(p => Math.max(1, p - 1))} disabled={allUsersPage <= 1}
                      className="px-3 py-1.5 rounded-lg bg-[#181A20] text-[#848E9C] text-xs font-medium border border-[#363A45] hover:text-[#EAECEF] disabled:opacity-40 transition-colors">
                      Previous
                    </button>
                    <button onClick={() => setAllUsersPage(p => p + 1)} disabled={allUsersPage >= Math.ceil(allUsersTotal / 10)}
                      className="px-3 py-1.5 rounded-lg bg-[#181A20] text-[#848E9C] text-xs font-medium border border-[#363A45] hover:text-[#EAECEF] disabled:opacity-40 transition-colors">
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings */}
      {tab === "settings" && settings && (
        <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl p-6 space-y-5">
          <h3 className="text-sm font-semibold text-[#EAECEF] flex items-center gap-2"><Settings size={16} className="text-[#F0B90B]" /> Fee System Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-[#848E9C] mb-1.5">Fee Percentage (%)</label>
              <input type="number" step="0.1" min="0" max="100" value={editSettings.fee_percentage} onChange={e => setEditSettings({...editSettings, fee_percentage: parseFloat(e.target.value)})} className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F0B90B] focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#848E9C] mb-1.5">Minimum Deposit (USDT)</label>
              <input type="number" step="1" min="0" value={editSettings.min_deposit} onChange={e => setEditSettings({...editSettings, min_deposit: parseFloat(e.target.value)})} className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F0B90B] focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#848E9C] mb-1.5">Deposit Address (TRC-20)</label>
              <input value={editSettings.deposit_address} onChange={e => setEditSettings({...editSettings, deposit_address: e.target.value})} className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F0B90B] focus:outline-none font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#848E9C] mb-1.5">Min Balance Multiplier</label>
              <input type="number" step="0.5" min="1" max="10" value={editSettings.min_balance_multiplier} onChange={e => setEditSettings({...editSettings, min_balance_multiplier: parseFloat(e.target.value)})} className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F0B90B] focus:outline-none" />
              <p className="text-[10px] text-[#5E6673] mt-1">Multiplier for min balance calculation (e.g., 2× expected fee)</p>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editSettings.fee_enabled} onChange={e => setEditSettings({...editSettings, fee_enabled: e.target.checked})} className="w-4 h-4 rounded bg-[#181A20] border-[#363A45] text-[#F0B90B] focus:ring-[#F0B90B]" />
                <span className="text-sm text-[#EAECEF] font-medium">Fee System Enabled</span>
              </label>
            </div>
          </div>
          {actionMsg && <div className={`text-xs p-3 rounded-lg ${actionMsg.type === "success" ? "bg-[#0ECB81]/10 text-[#0ECB81]" : "bg-[#F6465D]/10 text-[#F6465D]"}`}>{actionMsg.text}</div>}
          <button onClick={handleSaveSettings} disabled={saving} className="px-6 py-2.5 rounded-lg bg-[#F0B90B] text-[#1E2026] font-semibold text-sm hover:bg-[#F0B90B]/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : null} Save Settings
          </button>
        </div>
      )}

      {/* All Transactions */}
      {tab === "transactions" && (
        <div className="bg-[#2B2F36] border border-[#363A45] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#363A45]"><h3 className="text-sm font-semibold text-[#EAECEF]">All Fee Transactions ({txTotal})</h3></div>
          {transactions.length === 0 ? <div className="p-8 text-center text-[#848E9C] text-sm">No transactions yet</div> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs text-[#848E9C] border-b border-[#363A45]">
              <th className="text-left px-4 py-3 font-medium">Date</th><th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Type</th><th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Balance After</th><th className="text-left px-4 py-3 font-medium">Note</th>
            </tr></thead><tbody>
              {transactions.map(t => (
                <tr key={t.id} className="border-b border-[#363A45]/50 hover:bg-[#363A45]/20">
                  <td className="px-4 py-3 text-xs text-[#848E9C] whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-[#EAECEF]">{t.user_email}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded ${t.type === 'FEE_DEDUCTION' ? 'bg-[#F6465D]/10 text-[#F6465D]' : t.type === 'DEPOSIT' ? 'bg-[#0ECB81]/10 text-[#0ECB81]' : 'bg-[#3B82F6]/10 text-[#3B82F6]'}`}>{t.type.replace(/_/g, ' ')}</span></td>
                  <td className={`px-4 py-3 text-right font-medium ${t.amount >= 0 ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>{t.amount >= 0 ? '+' : ''}{t.amount.toFixed(2)}</td>

                  <td className="px-4 py-3 text-right text-[#EAECEF]">${t.balance_after.toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-[#848E9C] max-w-[200px] truncate">{t.note || "—"}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      )}
      {/* Approve/Reject Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !modalLoading && setModal(null)}>
          <div className="bg-[#1E2026] border border-[#2B2F36] rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#2B2F36]">
              <h3 className="text-base font-semibold text-[#EAECEF] flex items-center gap-2">
                {modal.type === "approve" ? <CheckCircle2 size={18} className="text-[#0ECB81]" /> : <AlertTriangle size={18} className="text-[#F6465D]" />}
                {modal.type === "approve" ? "Approve Deposit" : "Reject Deposit"}
              </h3>
              <button onClick={() => !modalLoading && setModal(null)} className="p-1 rounded text-[#848E9C] hover:text-[#EAECEF] transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="bg-[#181A20] rounded-lg p-4 border border-[#2B2F36] space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#848E9C]">User</span>
                  <span className="text-[#EAECEF] font-medium">{modal.email}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#848E9C]">Amount</span>
                  <span className="text-[#0ECB81] font-bold">${modal.amount.toFixed(2)} USDT</span>
                </div>
              </div>

              {modal.type === "approve" ? (
                <p className="text-sm text-[#848E9C]">
                  This will credit <strong className="text-[#EAECEF]">${modal.amount.toFixed(2)}</strong> to the user&apos;s Twin Grid Balance.
                </p>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-[#848E9C] mb-1.5">Rejection Reason</label>
                  <textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Enter reason for rejection..."
                    rows={3}
                    className="w-full bg-[#181A20] border border-[#363A45] text-[#EAECEF] text-sm rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-[#F6465D] focus:border-[#F6465D] focus:outline-none transition-colors placeholder:text-[#5E6673] resize-none"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-[#2B2F36]">
              <button
                onClick={() => { setModal(null); setRejectReason(""); }}
                disabled={modalLoading}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-[#848E9C] hover:text-[#EAECEF] bg-[#2B2F36] hover:bg-[#363A45] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={modal.type === "approve" ? handleApprove : handleReject}
                disabled={modalLoading}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 ${
                  modal.type === "approve"
                    ? "bg-[#0ECB81] text-[#1E2026] hover:bg-[#0ECB81]/90"
                    : "bg-[#F6465D] text-white hover:bg-[#F6465D]/90"
                }`}
              >
                {modalLoading ? <Loader2 size={16} className="animate-spin" /> : modal.type === "approve" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                {modalLoading ? "Processing..." : modal.type === "approve" ? "Confirm Approve" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
