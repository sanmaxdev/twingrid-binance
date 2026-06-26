"use client";

import { useEffect, useState } from "react";
import { Mail, ToggleLeft, ToggleRight, Send, RefreshCcw, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";

const EVENT_GROUPS = [
  {
    label: "Account & Trading",
    events: {
      welcome: { label: "Welcome & Verify", desc: "OTP code on registration", icon: "🎉" },
      login_alert: { label: "Login Alert", desc: "New login detected email", icon: "🔐" },
      password_reset: { label: "Password Reset", desc: "OTP code for password reset", icon: "🔑" },
      account_suspended: { label: "Account Suspended", desc: "Suspension notification", icon: "🚫" },
      account_unsuspended: { label: "Account Restored", desc: "Unsuspension notification", icon: "✅" },
      basket_opened: { label: "Basket Opened", desc: "New trading basket alert", icon: "📈" },
      basket_closed: { label: "Basket Closed", desc: "TP hit or force close", icon: "📊" },
      position_closed_externally: { label: "Position Closed Externally", desc: "Manual close / liquidation / ADL alert", icon: "🚨" },
      fee_deducted: { label: "Fee Deducted", desc: "TG fee deduction alert", icon: "💰" },
      deposit_credited: { label: "Deposit Credited", desc: "Balance credit notification", icon: "💵" },
      low_balance: { label: "Low Balance Warning", desc: "Balance warning < threshold", icon: "⚠️" },
    },
  },
  {
    label: "Subscription Lifecycle",
    events: {
      subscription_activated: { label: "Subscription Activated", desc: "Sent when user subscribes to Pro or Elite", icon: "🚀" },
      subscription_renewed: { label: "Subscription Renewed", desc: "Sent on successful monthly renewal", icon: "🔄" },
      subscription_payment_failed: { label: "Payment Failed (Grace Period)", desc: "Sent when renewal fails — 3-day grace notice", icon: "⚠️" },
      subscription_downgraded: { label: "Downgraded to Free", desc: "Sent when user is moved to Free plan", icon: "📉" },
      subscription_cancelled: { label: "Subscription Cancelled", desc: "Confirmation when user cancels their plan", icon: "❌" },
    },
  },
] as const;

// Flat map for backward compatibility
const EVENT_LABELS: Record<string, { label: string; desc: string; icon: string }> = Object.fromEntries(
  EVENT_GROUPS.flatMap(g => Object.entries(g.events))
);


export default function AdminEmailPage() {
  const [tab, setTab] = useState<"events" | "logs" | "test">("events");
  const [events, setEvents] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (tab === "logs") loadLogs();
  }, [tab]);

  const loadSettings = async () => {
    try {
      const res = await api.get("/admin/super/management/email/settings");
      const data = await res.json();
      setEvents(data.events || {});
    } catch { }
    setLoading(false);
  };

  const loadLogs = async () => {
    try {
      const res = await api.get("/admin/super/management/email/logs");
      const data = await res.json();
      setLogs(data.logs || []);
    } catch { }
  };

  const toggleEvent = async (event: string) => {
    const updated = { ...events, [event]: !events[event] };
    setEvents(updated);
    setSaving(true);
    try {
      await api.patch("/admin/super/management/email/settings", { events: { [event]: updated[event] } });
    } catch { }
    setSaving(false);
  };

  const sendTestEmail = async () => {
    setTestLoading(true); setTestResult(null);
    try {
      const res = await api.post("/admin/super/management/email/test", { to: testEmail || undefined });
      const data = await res.json();
      setTestResult({ success: data.success, msg: data.detail });
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message || "Failed" });
    }
    setTestLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 text-[#F0B90B] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#EAECEF]">Email Management</h1>
        <p className="text-sm text-[#5E6673] mt-1">Manage email notifications and monitor delivery</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[#181A20] rounded-xl border border-[#2B2F36] w-fit">
        {([
          { key: "events", label: "Event Toggles", icon: ToggleRight },
          { key: "logs", label: "Email Log", icon: Clock },
          { key: "test", label: "Test Email", icon: Send },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === key ? "bg-[#F0B90B]/10 text-[#F0B90B]" : "text-[#5E6673] hover:text-[#848E9C]"
            }`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Events Tab */}
      {tab === "events" && (
        <div className="space-y-4">
          {EVENT_GROUPS.map((group) => (
            <div key={group.label} className="bg-[#181A20] rounded-2xl border border-[#2B2F36] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#2B2F36] flex items-center justify-between bg-[#1E2026]">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#F0B90B]" />
                  <span className="text-sm font-semibold text-[#EAECEF]">{group.label}</span>
                  <span className="text-[10px] text-[#5E6673]">({Object.keys(group.events).length} events)</span>
                </div>
                {saving && <span className="text-[10px] text-[#F0B90B] animate-pulse">Saving...</span>}
              </div>
              <div className="divide-y divide-[#2B2F36]/50">
                {Object.entries(group.events).map(([key, { label, desc, icon }]) => (
                  <div key={key} className="flex items-center justify-between px-5 py-4 hover:bg-[#1E2026] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-lg w-7 text-center">{icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-[#EAECEF]">{label}</div>
                        <div className="text-[11px] text-[#5E6673]">{desc}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold ${events[key] !== false ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                        {events[key] !== false ? "ON" : "OFF"}
                      </span>
                      <button onClick={() => toggleEvent(key)} className="transition-all">
                        {events[key] !== false ? (
                          <ToggleRight className="h-7 w-7 text-[#0ECB81]" />
                        ) : (
                          <ToggleLeft className="h-7 w-7 text-[#363A45]" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}


      {/* Logs Tab */}
      {tab === "logs" && (
        <div className="bg-[#181A20] rounded-2xl border border-[#2B2F36] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2B2F36] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#F0B90B]" />
              <span className="text-sm font-semibold text-[#EAECEF]">Recent Emails</span>
              <span className="text-[10px] text-[#5E6673]">({logs.length})</span>
            </div>
            <button onClick={loadLogs} className="text-[#5E6673] hover:text-[#F0B90B] transition-colors">
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>
          {logs.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-[#5E6673]">No emails sent yet</div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] uppercase text-[#5E6673] tracking-wider border-b border-[#2B2F36]">
                    <th className="text-left px-5 py-2.5">To</th>
                    <th className="text-left px-3 py-2.5">Subject</th>
                    <th className="text-center px-3 py-2.5">Status</th>
                    <th className="text-right px-5 py-2.5">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2B2F36]/30">
                  {logs.map((log, i) => (
                    <tr key={i} className="hover:bg-[#1E2026] transition-colors">
                      <td className="px-5 py-3 text-xs text-[#EAECEF] font-mono truncate max-w-[200px]">{log.to}</td>
                      <td className="px-3 py-3 text-xs text-[#848E9C] truncate max-w-[250px]">{log.subject}</td>
                      <td className="px-3 py-3 text-center">
                        {log.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0ECB81] bg-[#0ECB81]/10 px-2 py-0.5 rounded">
                            <CheckCircle className="h-3 w-3" /> Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#F6465D] bg-[#F6465D]/10 px-2 py-0.5 rounded">
                            <XCircle className="h-3 w-3" /> Failed
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[11px] text-[#5E6673] text-right whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Test Tab */}
      {tab === "test" && (
        <div className="bg-[#181A20] rounded-2xl border border-[#2B2F36] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2B2F36]">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-[#F0B90B]" />
              <span className="text-sm font-semibold text-[#EAECEF]">Send Test Email</span>
            </div>
          </div>
          <div className="px-5 py-5 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-1.5">
                Recipient Email (optional)
              </label>
              <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
                className="w-full px-4 py-3 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all placeholder:text-[#363A45]"
                placeholder="Leave empty to send to your admin email" />
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${
                testResult.success
                  ? "text-[#0ECB81] bg-[#0ECB81]/[0.08] border-[#0ECB81]/15"
                  : "text-[#F6465D] bg-[#F6465D]/[0.08] border-[#F6465D]/15"
              }`}>
                {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {testResult.msg}
              </div>
            )}

            <button onClick={sendTestEmail} disabled={testLoading}
              className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-[#0B0E11] bg-gradient-to-r from-[#F0B90B] to-[#F8D12F] rounded-xl hover:from-[#D4A20B] hover:to-[#F0B90B] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#F0B90B]/10">
              {testLoading ? (
                <div className="w-5 h-5 border-2 border-[#0B0E11]/30 border-t-[#0B0E11] rounded-full animate-spin" />
              ) : (
                <><Send className="h-4 w-4" /> Send Test Email</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
