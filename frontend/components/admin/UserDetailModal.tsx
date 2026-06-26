"use client";
import { useEffect, useState } from "react";
import { adminService } from "@/lib/services/admin";
import {
  X, Mail, Shield, Calendar, Clock, Globe, Key, Wallet,
  TrendingUp, TrendingDown, BarChart3, Users, Activity, CreditCard,
  ArrowUpRight, ArrowDownRight, Hash, Percent, Zap, Link, UserPlus,
  DollarSign, ArrowDownToLine
} from "lucide-react";
import { Portal } from "@/components/Portal";

function StatCard({ label, value, icon: Icon, color = "#EAECEF", sub }: { label: string; value: string; icon: any; color?: string; sub?: string }) {
  return (
    <div className="bg-[#181A20] rounded-xl p-3.5 border border-[#2B2F36]/50">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <span className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-base font-bold font-mono" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-[#5E6673] mt-0.5">{sub}</div>}
    </div>
  );
}

export default function UserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "fees" | "subscription" | "accounts" | "affiliates">("overview");

  useEffect(() => {
    (async () => {
      try { const d = await adminService.getUserDetail(userId); setData(d); }
      catch (e: any) { setError(e.message || "Failed to load user details"); }
      finally { setLoading(false); }
    })();
  }, [userId]);

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString() : "Never";
  const fmtMoney = (v: number) => `$${v.toFixed(2)}`;
  const u = data?.user;
  const s = data?.stats;

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-6 px-3 sm:py-10" onClick={onClose}>
      <div className="bg-[#1E2026] border border-[#2B2F36] rounded-2xl shadow-2xl w-full max-w-2xl relative" onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button onClick={onClose} className="absolute right-4 top-4 z-10 text-[#5E6673] hover:text-[#EAECEF] transition-colors p-1">
          <X className="h-5 w-5" />
        </button>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-2 h-2 bg-[#F0B90B] rounded-full animate-pulse" />
          </div>
        ) : error ? (
          <div className="p-10 text-center text-[#F6465D] text-sm">{error}</div>
        ) : !u ? (
          <div className="p-10 text-center text-[#848E9C]">User not found</div>
        ) : (
          <>
            {/* Header */}
            <div className="p-5 pb-4 border-b border-[#2B2F36]">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F0B90B]/20 to-[#F0B90B]/5 flex items-center justify-center text-[#F0B90B] font-bold text-sm uppercase border border-[#F0B90B]/20">
                  {u.email.substring(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-[#EAECEF] truncate">{u.display_name || u.email.split("@")[0]}</h2>
                    {u.role === "SUPER_ADMIN" ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-[#F0B90B]/15 text-[#F0B90B] rounded-md border border-[#F0B90B]/20">SUPER ADMIN</span>
                    ) : u.role === "ADMIN" ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-[#F0B90B]/10 text-[#F0B90B]/70 rounded-md border border-[#F0B90B]/15">ADMIN</span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-[#2B2F36] text-[#848E9C] rounded-md">USER</span>
                    )}
                    {u.is_active ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-[#0ECB81]/10 text-[#0ECB81] rounded-md">Active</span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-[#F6465D]/10 text-[#F6465D] rounded-md">Suspended</span>
                    )}
                  </div>
                  <div className="text-xs text-[#5E6673] mt-0.5 truncate">{u.email}</div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#2B2F36] px-5">
              {(["overview", "fees", "subscription", "accounts", "affiliates"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2.5 text-xs font-semibold capitalize transition-colors relative ${
                    tab === t ? "text-[#F0B90B]" : "text-[#5E6673] hover:text-[#848E9C]"
                  }`}>
                  {t}
                  {tab === t && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#F0B90B] rounded-t" />}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {tab === "overview" && (
                <div className="space-y-5">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <StatCard label="TG Balance" value={fmtMoney(u.twin_grid_balance)} icon={Wallet} color="#F0B90B" />
                    <StatCard label="Realized PnL" value={fmtMoney(s.total_realized_pnl)} icon={s.total_realized_pnl >= 0 ? TrendingUp : TrendingDown} color={s.total_realized_pnl >= 0 ? "#0ECB81" : "#F6465D"} />
                    <StatCard label="Win Rate" value={`${s.win_rate}%`} icon={BarChart3} color="#3B82F6" sub={`${s.winning_baskets ?? 0}W / ${s.losing_baskets ?? 0}L`} />
                    <StatCard label="TG Fees Paid" value={fmtMoney(s.total_tg_fees_paid)} icon={CreditCard} color="#F6465D" />
                    <StatCard label="Total Deposits" value={fmtMoney(s.total_deposits)} icon={ArrowUpRight} color="#0ECB81" />
                    <StatCard label="Binance Fees" value={fmtMoney(s.total_binance_fees)} icon={Percent} color="#848E9C" />
                  </div>

                  {/* Activity Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-[#181A20] rounded-lg p-3 border border-[#2B2F36]/50 text-center">
                      <div className="text-lg font-bold text-[#EAECEF] font-mono">{s.total_accounts}</div>
                      <div className="text-[10px] text-[#5E6673] mt-0.5">Accounts</div>
                    </div>
                    <div className="bg-[#181A20] rounded-lg p-3 border border-[#2B2F36]/50 text-center">
                      <div className="text-lg font-bold text-[#EAECEF] font-mono">{s.total_baskets}</div>
                      <div className="text-[10px] text-[#5E6673] mt-0.5">Total Baskets</div>
                    </div>
                    <div className="bg-[#181A20] rounded-lg p-3 border border-[#2B2F36]/50 text-center">
                      <div className="text-lg font-bold text-[#0ECB81] font-mono">{s.active_baskets}</div>
                      <div className="text-[10px] text-[#5E6673] mt-0.5">Active</div>
                    </div>
                    <div className="bg-[#181A20] rounded-lg p-3 border border-[#2B2F36]/50 text-center">
                      <div className="text-lg font-bold text-[#EAECEF] font-mono">{s.active_sessions}</div>
                      <div className="text-[10px] text-[#5E6673] mt-0.5">Sessions</div>
                    </div>
                  </div>

                  {/* User Details */}
                  <div className="bg-[#181A20] rounded-xl border border-[#2B2F36]/50 divide-y divide-[#2B2F36]/30">
                    {[
                      [Mail, "Email", u.email],
                      [Key, "Invite Code", u.invite_code],
                      [Shield, "2FA", u.totp_enabled ? "Enabled" : "Disabled"],
                      [Percent, "Fee Override", u.fee_percentage_override ? `${u.fee_percentage_override}%` : "Default"],
                      [Calendar, "Joined", fmtDate(u.created_at)],
                      [Clock, "Last Login", fmtDate(u.last_login_at)],
                      [Globe, "Last IP", u.last_login_ip || "—"],
                    ].map(([Icon, label, value], i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Icon className="h-3.5 w-3.5 text-[#5E6673]" />
                          <span className="text-xs text-[#848E9C]">{label as string}</span>
                        </div>
                        <span className="text-xs text-[#EAECEF] font-mono text-right max-w-[55%] truncate">{value as string}</span>
                      </div>
                    ))}
                  </div>

                  {/* Telegram Connection */}
                  <div className="bg-[#181A20] rounded-xl border border-[#2B2F36]/50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2B2F36]/30">
                      <div className="flex items-center gap-2">
                        <svg className="h-3.5 w-3.5 text-[#2196F3]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
                        <span className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider">Telegram</span>
                      </div>
                      {u.telegram_chat_id ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#0ECB81]/10 text-[#0ECB81]">CONNECTED</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#363A45] text-[#5E6673]">NOT CONNECTED</span>
                      )}
                    </div>
                    {u.telegram_chat_id ? (
                      <div className="divide-y divide-[#2B2F36]/30">
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-xs text-[#848E9C]">Username</span>
                          <span className="text-xs text-[#2196F3] font-medium">{u.telegram_username ? `@${u.telegram_username}` : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-xs text-[#848E9C]">Chat ID</span>
                          <span className="text-xs text-[#EAECEF] font-mono">{u.telegram_chat_id}</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-xs text-[#848E9C]">Connected</span>
                          <span className="text-xs text-[#EAECEF] font-mono">{u.telegram_connected_at ? new Date(u.telegram_connected_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>
                        </div>
                        {u.telegram_notifications && (
                          <div className="px-4 py-2.5">
                            <div className="text-[10px] text-[#5E6673] uppercase tracking-wider font-semibold mb-2">Notification Preferences</div>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(u.telegram_notifications as Record<string, boolean>).map(([key, enabled]) => (
                                <span key={key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${enabled ? "bg-[#0ECB81]/10 text-[#0ECB81]" : "bg-[#2B2F36] text-[#5E6673]"}`}>
                                  {enabled ? "✓" : "✗"} {key.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-xs text-[#5E6673]">User has not connected a Telegram account</div>
                    )}
                  </div>

                  {u.suspended_at && (
                    <div className="bg-[#F6465D]/[0.06] border border-[#F6465D]/15 rounded-xl px-4 py-3">
                      <div className="text-xs font-semibold text-[#F6465D] mb-1">Suspended</div>
                      <div className="text-[11px] text-[#848E9C]">{u.suspended_reason || "No reason given"}</div>
                      <div className="text-[10px] text-[#5E6673] mt-1">{fmtDate(u.suspended_at)}</div>
                    </div>
                  )}
                </div>
              )}

              {tab === "fees" && (
                <div>
                  {data.fee_history.length === 0 ? (
                    <div className="text-center text-[#5E6673] text-sm py-10">No fee transactions</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[500px]">
                        <thead className="bg-[#0B0E11] text-[10px] text-[#5E6673] uppercase tracking-wider">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Type</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                            <th className="px-3 py-2 text-right font-semibold">Balance</th>
                            <th className="px-3 py-2 text-left font-semibold">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2B2F36]/30">
                          {data.fee_history.map((f: any) => (
                            <tr key={f.id} className="hover:bg-[#181A20]/60 transition-colors">
                              <td className="px-3 py-2.5 text-[#848E9C] font-mono whitespace-nowrap">{new Date(f.created_at).toLocaleDateString()}</td>
                              <td className="px-3 py-2.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  f.type === "FEE_DEDUCTION" ? "bg-[#F6465D]/10 text-[#F6465D]" :
                                  f.type === "DEPOSIT" ? "bg-[#0ECB81]/10 text-[#0ECB81]" :
                                  "bg-[#F0B90B]/10 text-[#F0B90B]"
                                }`}>{f.type.replace(/_/g, " ")}</span>
                              </td>
                              <td className={`px-3 py-2.5 text-right font-mono font-semibold ${f.amount >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                                {f.amount >= 0 ? "+" : ""}{f.amount.toFixed(2)}

                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-[#848E9C]">${f.balance_after.toFixed(2)}</td>
                              <td className="px-3 py-2.5 text-[#5E6673] truncate max-w-[150px]">{f.note || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tab === "subscription" && (() => {
                const sub = data.subscription;
                const planColors: Record<string, { border: string; icon: string }> = {
                  free:  { border: "border-[#2B2F36]",     icon: "text-[#848E9C]" },
                  pro:   { border: "border-[#F0B90B]/40",  icon: "text-[#F0B90B]" },
                  elite: { border: "border-purple-500/40", icon: "text-purple-400" },
                };
                const statusColors: Record<string, string> = {
                  active: "bg-[#0ECB81]/10 text-[#0ECB81]",
                  grace_period: "bg-amber-500/10 text-amber-400",
                  cancelled: "bg-[#F6465D]/10 text-[#F6465D]",
                  expired: "bg-[#F6465D]/10 text-[#F6465D]",
                };
                const pc = planColors[sub?.plan_id] || planColors.free;
                const fmtD = (d: string | null) => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
                return (
                  <div className="space-y-4">
                    <div className={`rounded-xl border-2 p-4 ${pc.border} bg-[#181A20]`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-[10px] text-[#5E6673] uppercase tracking-wider mb-1">Current Plan</div>
                          <div className="text-xl font-bold text-[#EAECEF]">{sub?.plan_name || "Free"}</div>
                          <div className={`text-2xl font-extrabold mt-1 ${pc.icon}`}>
                            ${sub?.plan_price ?? 0}<span className="text-xs font-normal text-[#848E9C] ml-1">/month</span>
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${statusColors[sub?.status] || statusColors.active}`}>
                            {(sub?.status || "active").replace(/_/g, " ").toUpperCase()}
                          </span>
                          {u.fee_percentage_override !== null && (
                            <div>
                              <span className="text-[11px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-semibold">
                                Fee Override: {u.fee_percentage_override}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#181A20] rounded-xl border border-[#2B2F36]/50 divide-y divide-[#2B2F36]/30">
                      {([
                        ["Plan Started", fmtD(sub?.started_at)],
                        ["Renews / Expires", sub?.plan_price > 0 ? fmtD(sub?.current_period_end) : null],
                        ["Grace Period Ends", sub?.grace_period_end ? fmtD(sub.grace_period_end) : null],
                        ["Cancel Scheduled", sub?.cancel_at_period_end ? `Yes — access until ${fmtD(sub?.current_period_end)}` : null],
                        ["Cancelled At", sub?.cancelled_at ? fmtD(sub.cancelled_at) : null],
                      ] as [string, string | null][]).filter(([, v]) => v !== null).map(([label, value], i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-xs text-[#848E9C]">{label}</span>
                          <span className={`text-xs font-medium ${label === "Cancel Scheduled" ? "text-[#F6465D]" : "text-[#EAECEF]"}`}>
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {sub?.status === "grace_period" && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <div className="text-amber-400 text-xs font-bold mb-1">⚠ Payment Failed — Grace Period Active</div>
                        <div className="text-[#848E9C] text-xs">Grace ends {fmtD(sub.grace_period_end)}. User will be downgraded to Free if not resolved.</div>
                      </div>
                    )}

                    {u.fee_percentage_override !== null && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <div className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">Admin Fee Override Active</div>
                        <div className="text-[#848E9C] text-xs">
                          Profit share fee overridden to <strong className="text-amber-400">{u.fee_percentage_override}%</strong>.
                          This takes priority over plan defaults. Reset via Fee Management → User Balances.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {tab === "accounts" && (
                <div>
                  {data.accounts.length === 0 ? (
                    <div className="text-center text-[#5E6673] text-sm py-10">No accounts connected</div>
                  ) : (
                    <div className="space-y-2.5">
                      {data.accounts.map((a: any) => (
                        <div key={a.id} className="bg-[#181A20] rounded-xl border border-[#2B2F36]/50 px-4 py-3 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-[#EAECEF]">{a.name}</div>
                            <div className="text-[10px] text-[#5E6673] mt-0.5 font-mono">{a.is_testnet ? "Testnet" : "Live"} · {a.exchange}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {a.auto_trade_enabled && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-[#0ECB81]/10 text-[#0ECB81] rounded">AUTO</span>
                            )}
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              a.status === "IDLE" || a.status === "ACTIVE" ? "bg-[#0ECB81]/10 text-[#0ECB81]" : "bg-[#F6465D]/10 text-[#F6465D]"
                            }`}>{a.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "affiliates" && (
                <div className="space-y-5">
                  {/* Affiliate Stat Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <StatCard label="Affiliate Balance" value={fmtMoney(data.affiliate?.balance || 0)} icon={Wallet} color="#8B5CF6" />
                    <StatCard label="Total Earned" value={fmtMoney(data.affiliate?.total_earned || 0)} icon={TrendingUp} color="#0ECB81" sub="Commission earned" />
                    <StatCard label="Total Withdrawn" value={fmtMoney(data.affiliate?.total_withdrawn || 0)} icon={ArrowDownToLine} color="#F6465D" />
                    <StatCard label="Pending" value={fmtMoney(data.affiliate?.pending_withdrawal || 0)} icon={Clock} color="#F0B90B" sub="Awaiting approval" />
                    <StatCard label="Referrals" value={String(data.affiliate?.referral_count || 0)} icon={UserPlus} color="#3B82F6" sub="Invited users" />
                    <StatCard label="Commission Rate" value={data.affiliate?.commission_override != null ? `${data.affiliate.commission_override}%` : "Default"} icon={Percent} color="#848E9C" sub={data.affiliate?.commission_override != null ? "Custom override" : "Platform default"} />
                  </div>

                  {/* Invited By */}
                  {data.affiliate?.invited_by && (
                    <div className="bg-[#181A20] rounded-xl border border-[#2B2F36]/50 px-4 py-3 flex items-center gap-3">
                      <UserPlus className="h-4 w-4 text-[#5E6673] flex-shrink-0" />
                      <div>
                        <div className="text-[10px] text-[#5E6673] uppercase tracking-wider font-semibold">Invited By</div>
                        <div className="text-xs text-[#EAECEF] mt-0.5">
                          {data.affiliate.invited_by.display_name || data.affiliate.invited_by.email.split("@")[0]}
                          <span className="text-[#5E6673] ml-1.5">{data.affiliate.invited_by.email}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Invite Code */}
                  <div className="bg-[#181A20] rounded-xl border border-[#2B2F36]/50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Link className="h-3.5 w-3.5 text-[#5E6673]" />
                      <span className="text-xs text-[#848E9C]">Invite Code</span>
                    </div>
                    <span className="text-xs text-[#EAECEF] font-mono font-semibold">{data.affiliate?.invite_code || u.invite_code}</span>
                  </div>

                  {/* Referral List */}
                  <div>
                    <div className="text-[11px] font-semibold text-[#5E6673] uppercase tracking-wider mb-2">Referrals ({data.affiliate?.referrals?.length || 0})</div>
                    {(!data.affiliate?.referrals || data.affiliate.referrals.length === 0) ? (
                      <div className="text-center text-[#5E6673] text-sm py-8 bg-[#181A20] rounded-xl border border-[#2B2F36]/50">No referrals yet</div>
                    ) : (
                      <div className="overflow-x-auto bg-[#181A20] rounded-xl border border-[#2B2F36]/50">
                        <table className="w-full text-xs min-w-[420px]">
                          <thead className="bg-[#0B0E11] text-[10px] text-[#5E6673] uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold">User</th>
                              <th className="px-3 py-2 text-center font-semibold">Status</th>
                              <th className="px-3 py-2 text-right font-semibold">Earned</th>
                              <th className="px-3 py-2 text-right font-semibold">Joined</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#2B2F36]/30">
                            {data.affiliate.referrals.map((r: any) => (
                              <tr key={r.id} className="hover:bg-[#0B0E11]/60 transition-colors">
                                <td className="px-3 py-2.5">
                                  <div className="text-[#EAECEF] font-medium">{r.display_name || r.email.split("@")[0]}</div>
                                  <div className="text-[10px] text-[#5E6673]">{r.email}</div>
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.is_active ? "bg-[#0ECB81]/10 text-[#0ECB81]" : "bg-[#F6465D]/10 text-[#F6465D]"}`}>
                                    {r.is_active ? "Active" : "Inactive"}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#0ECB81]">
                                  ${(r.commission_earned || 0).toFixed(2)}
                                </td>
                                <td className="px-3 py-2.5 text-right text-[#848E9C] font-mono whitespace-nowrap">
                                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Commission History */}
                  <div>
                    <div className="text-[11px] font-semibold text-[#5E6673] uppercase tracking-wider mb-2">Commission History</div>
                    {(!data.affiliate?.commission_history || data.affiliate.commission_history.length === 0) ? (
                      <div className="text-center text-[#5E6673] text-sm py-8 bg-[#181A20] rounded-xl border border-[#2B2F36]/50">No commissions yet</div>
                    ) : (
                      <div className="overflow-x-auto bg-[#181A20] rounded-xl border border-[#2B2F36]/50">
                        <table className="w-full text-xs min-w-[500px]">
                          <thead className="bg-[#0B0E11] text-[10px] text-[#5E6673] uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold">Date</th>
                              <th className="px-3 py-2 text-left font-semibold">From</th>
                              <th className="px-3 py-2 text-right font-semibold">Fee</th>
                              <th className="px-3 py-2 text-center font-semibold">Rate</th>
                              <th className="px-3 py-2 text-right font-semibold">Commission</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#2B2F36]/30">
                            {data.affiliate.commission_history.map((c: any) => (
                              <tr key={c.id} className="hover:bg-[#0B0E11]/60 transition-colors">
                                <td className="px-3 py-2.5 text-[#848E9C] font-mono whitespace-nowrap">
                                  {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="text-[#EAECEF]">{c.referral_name || c.referral_email?.split("@")[0] || "—"}</div>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-[#848E9C]">${c.fee_amount.toFixed(2)}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#8B5CF6]/10 text-[#8B5CF6]">{c.commission_pct}%</span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#0ECB81]">+${c.commission_amount.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </Portal>
  );
}
