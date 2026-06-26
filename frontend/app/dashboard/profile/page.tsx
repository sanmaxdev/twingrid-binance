"use client";
import { useEffect, useState, useCallback } from "react";
import { Copy, Check, Mail, User, ShieldCheck, Clock, Calendar, Loader2, Lock, Pencil, Gift, ChevronRight, ExternalLink } from "lucide-react";
import api from "@/lib/api";
import ChangePasswordModal from "@/components/profile/ChangePasswordModal";
import Setup2FAModal from "@/components/profile/Setup2FAModal";

function getInitials(name?: string, email?: string): string {
  if (name) return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return email ? email[0].toUpperCase() : "U";
}

function getAccountAge(d?: string): string {
  if (!d) return "—";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days < 30) return `${days}d`;
  const m = Math.floor(days / 30);
  return m < 12 ? `${m}mo` : `${Math.floor(m / 12)}y`;
}

const TG_PREF_LABELS: Record<string, { label: string; emoji: string }> = {
  basket_opened: { label: "Basket Opened", emoji: "🟢" },
  basket_closed: { label: "Take Profit / Close", emoji: "✅" },
  safety_order: { label: "Safety Order Filled", emoji: "🔵" },
  risk_stop: { label: "Risk Stop", emoji: "🛡️" },
  external_close: { label: "External Close", emoji: "🔴" },
  fee_deducted: { label: "Fee Deducted", emoji: "💰" },
  deposit_credited: { label: "Deposit Credited", emoji: "💳" },
  low_balance: { label: "Low Balance Warning", emoji: "⚠️" },
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [tfaModal, setTfaModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);

  // Telegram state
  const [tg, setTg] = useState<any>(null);
  const [tgLoading, setTgLoading] = useState(true);
  const [tgConnecting, setTgConnecting] = useState(false);
  const [tgDisconnecting, setTgDisconnecting] = useState(false);
  const [prefSaving, setPrefSaving] = useState<string | null>(null);

  const loadProfile = async () => {
    try {
      const res = await api.get("/me/profile");
      setProfile(await res.json());
    } catch (err: any) { setError(err.message || "Failed"); }
    setLoading(false);
  };

  const loadTelegram = useCallback(async () => {
    try {
      const res = await api.get("/me/telegram");
      setTg(await res.json());
    } catch { }
    setTgLoading(false);
  }, []);

  useEffect(() => { loadProfile(); loadTelegram(); }, [loadTelegram]);

  const saveName = async () => {
    if (!newName.trim()) return;
    setNameLoading(true);
    try {
      const res = await api.put("/me/profile", { display_name: newName.trim() });
      setProfile(await res.json());
      setEditingName(false);
    } catch { }
    setNameLoading(false);
  };

  const copyInvite = () => {
    if (profile?.invite_code) {
      navigator.clipboard.writeText(profile.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const connectTelegram = async () => {
    setTgConnecting(true);
    try {
      const res = await api.get("/me/telegram");
      const data = await res.json();
      setTg(data);
      if (data.connect_url) {
        window.open(data.connect_url, "_blank");
        // Poll for connection (user is in Telegram pressing START)
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const r = await api.get("/me/telegram");
            const d = await r.json();
            if (d.connected) {
              setTg(d);
              clearInterval(poll);
              setTgConnecting(false);
            }
          } catch { }
          if (attempts > 60) { // 2 minutes max
            clearInterval(poll);
            setTgConnecting(false);
          }
        }, 2000);
      }
    } catch {
      setTgConnecting(false);
    }
  };

  const disconnectTelegram = async () => {
    setTgDisconnecting(true);
    try {
      await api.delete("/me/telegram");
      setTg({ connected: false, preferences: tg?.preferences });
    } catch { }
    setTgDisconnecting(false);
  };

  const togglePref = async (key: string) => {
    if (!tg?.connected) return;
    setPrefSaving(key);
    const newVal = !tg.preferences[key];
    try {
      const res = await api.put("/me/telegram/preferences", {
        preferences: { [key]: newVal },
      });
      const data = await res.json();
      setTg((prev: any) => ({ ...prev, preferences: data.preferences }));
    } catch { }
    setPrefSaving(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-[#F0B90B]" />
    </div>
  );
  if (error) return <div className="p-8 text-center text-red-400">{error}</div>;
  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-10">
      {/* Header */}
      <div className="relative bg-[#1E2026] border border-[#2B3139] rounded-2xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#F0B90B] via-[#F8D12F] to-[#F0B90B]" />
        <div className="p-5 sm:p-6 flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#F0B90B] to-[#D09A0B] flex items-center justify-center shadow-lg shadow-[#F0B90B]/10">
              <span className="text-lg font-bold text-[#1E2026]">{getInitials(profile.display_name, profile.email)}</span>
            </div>
            {profile.is_active && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#0ECB81] border-2 border-[#1E2026] rounded-full" />}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[#EAECEF] truncate">{profile.display_name || profile.email?.split("@")[0]}</h1>
            <p className="text-xs text-[#848E9C] truncate">{profile.email}</p>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-[#5E6673]">
            <span><Calendar className="h-3 w-3 inline mr-1" />{new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            <span><Clock className="h-3 w-3 inline mr-1" />{getAccountAge(profile.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-[#1E2026] border border-[#2B3139] rounded-2xl overflow-hidden">
        <div className="divide-y divide-[#2B3139]/50">
          {/* Email */}
          <div className="px-5 py-3.5 flex items-center gap-3">
            <Mail className="h-4 w-4 text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-[#5E6673] uppercase tracking-wider">Email</div>
              <div className="text-sm text-[#EAECEF] truncate">{profile.email}</div>
            </div>
          </div>

          {/* Display Name */}
          <div className="px-5 py-3.5 flex items-center gap-3">
            <User className="h-4 w-4 text-[#F0B90B] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-[#5E6673] uppercase tracking-wider">Display Name</div>
              {editingName ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    className="flex-1 px-2.5 py-1 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-lg focus:ring-1 focus:ring-[#F0B90B]/40 focus:outline-none" />
                  <button onClick={saveName} disabled={nameLoading} className="px-2.5 py-1 text-xs font-semibold text-[#0B0E11] bg-[#F0B90B] rounded-lg">{nameLoading ? "..." : "Save"}</button>
                  <button onClick={() => setEditingName(false)} className="text-xs text-[#5E6673]">Cancel</button>
                </div>
              ) : (
                <div className="text-sm text-[#EAECEF]">{profile.display_name || "—"}</div>
              )}
            </div>
            {!editingName && (
              <button onClick={() => { setNewName(profile.display_name || ""); setEditingName(true); }}
                className="p-1.5 text-[#5E6673] hover:text-[#F0B90B] transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
            )}
          </div>
        </div>
      </div>

      {/* Security Actions */}
      <div className="bg-[#1E2026] border border-[#2B3139] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2B3139]">
          <span className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider">Security</span>
        </div>
        <div className="divide-y divide-[#2B3139]/50">
          {/* Change Password */}
          <button onClick={() => setPwModal(true)} className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-[#2B3139]/20 transition-colors text-left">
            <div className="p-2 rounded-lg bg-[#F0B90B]/10"><Lock className="h-4 w-4 text-[#F0B90B]" /></div>
            <div className="flex-1">
              <div className="text-sm font-medium text-[#EAECEF]">Change Password</div>
              <div className="text-[11px] text-[#5E6673]">Update your account password</div>
            </div>
            <ChevronRight className="h-4 w-4 text-[#363A45]" />
          </button>

          {/* 2FA */}
          <button onClick={() => setTfaModal(true)} className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-[#2B3139]/20 transition-colors text-left">
            <div className={`p-2 rounded-lg ${profile.totp_enabled ? "bg-[#0ECB81]/10" : "bg-[#F6465D]/10"}`}>
              <ShieldCheck className={`h-4 w-4 ${profile.totp_enabled ? "text-[#0ECB81]" : "text-[#F6465D]"}`} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-[#EAECEF]">Two-Factor Authentication</div>
              <div className="text-[11px]">
                {profile.totp_enabled
                  ? <span className="text-[#0ECB81]">Enabled — Account secured</span>
                  : <span className="text-[#5E6673]">Not enabled — Add extra security</span>}
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${profile.totp_enabled ? "bg-[#0ECB81]/10 text-[#0ECB81]" : "bg-[#F6465D]/10 text-[#F6465D]"}`}>
              {profile.totp_enabled ? "ON" : "OFF"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Telegram Notifications ── */}
      <div className="bg-[#1E2026] border border-[#2B3139] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2B3139] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📱</span>
            <span className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-wider">Telegram Notifications</span>
          </div>
          {tg?.connected && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#0ECB81]/10 text-[#0ECB81]">
              CONNECTED
            </span>
          )}
        </div>

        {tgLoading ? (
          <div className="px-5 py-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#5E6673]" />
          </div>
        ) : tg?.connected ? (
          /* ── Connected State ── */
          <div className="divide-y divide-[#2B3139]/50">
            {/* Connection Info */}
            <div className="px-5 py-3.5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#2196F3]/10">
                <svg className="h-4 w-4 text-[#2196F3]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#EAECEF] font-medium">
                  {tg.username ? `@${tg.username}` : "Connected"}
                </div>
                <div className="text-[10px] text-[#5E6673]">
                  Since {tg.connected_at ? new Date(tg.connected_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </div>
              </div>
              <button
                onClick={disconnectTelegram}
                disabled={tgDisconnecting}
                className="px-3 py-1.5 text-[11px] font-semibold text-[#F6465D] bg-[#F6465D]/10 rounded-lg hover:bg-[#F6465D]/20 transition-colors disabled:opacity-50"
              >
                {tgDisconnecting ? "..." : "Disconnect"}
              </button>
            </div>

            {/* Notification Preferences */}
            <div className="px-5 py-3">
              <div className="text-[10px] text-[#5E6673] uppercase tracking-wider mb-3">Alert Preferences</div>
              <div className="space-y-1">
                {Object.entries(TG_PREF_LABELS).map(([key, { label, emoji }]) => (
                  <button
                    key={key}
                    onClick={() => togglePref(key)}
                    disabled={prefSaving === key}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#2B3139]/30 transition-colors"
                  >
                    <span className="text-sm w-5 text-center">{emoji}</span>
                    <span className="flex-1 text-left text-[13px] text-[#B7BDC6]">{label}</span>
                    <div className={`relative w-8 h-[18px] rounded-full transition-colors ${tg.preferences?.[key] ? "bg-[#0ECB81]" : "bg-[#363A45]"}`}>
                      <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${tg.preferences?.[key] ? "left-[16px]" : "left-[2px]"}`} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Disconnected State ── */
          <div className="px-5 py-6 text-center">
            <div className="mb-3">
              <svg className="h-10 w-10 mx-auto text-[#2196F3]/60" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
            </div>
            <p className="text-sm text-[#B7BDC6] mb-1">Connect your Telegram to receive</p>
            <p className="text-sm text-[#B7BDC6] mb-4">instant trading alerts in real-time.</p>
            <button
              onClick={connectTelegram}
              disabled={tgConnecting}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#2196F3] rounded-xl hover:bg-[#1E88E5] transition-colors disabled:opacity-50 shadow-lg shadow-[#2196F3]/20"
            >
              {tgConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for connection...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" />
                  Connect Telegram
                </>
              )}
            </button>
            {tgConnecting && (
              <p className="text-[11px] text-[#5E6673] mt-2">Press START in the Telegram bot to complete</p>
            )}
          </div>
        )}
      </div>

      {/* Invite Code */}
      {profile.invite_code && (
        <div className="bg-[#1E2026] border border-[#2B3139] rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Gift className="h-4 w-4 text-[#F0B90B]" />
              <div>
                <div className="text-xs font-semibold text-[#EAECEF]">Invite Code</div>
                <div className="text-[10px] text-[#5E6673]">Share with friends</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm tracking-[0.2em] text-[#F0B90B] font-bold select-all">{profile.invite_code}</span>
              <button onClick={copyInvite}
                className={`p-1.5 rounded-lg transition-all ${copied ? "text-[#0ECB81]" : "text-[#5E6673] hover:text-[#F0B90B]"}`}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ChangePasswordModal open={pwModal} onClose={() => setPwModal(false)} />
      <Setup2FAModal open={tfaModal} onClose={() => { setTfaModal(false); }} enabled={!!profile.totp_enabled} onComplete={loadProfile} />
    </div>
  );
}
