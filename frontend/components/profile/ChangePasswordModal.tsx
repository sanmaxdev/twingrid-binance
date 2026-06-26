"use client";
import { useState } from "react";
import { Lock, Eye, EyeOff, CheckCircle, X, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Portal } from "@/components/Portal";

export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ type: "", text: "" });
    if (newPw.length < 12) { setMsg({ type: "error", text: "Minimum 12 characters" }); return; }
    if (newPw !== confirmPw) { setMsg({ type: "error", text: "Passwords do not match" }); return; }
    setLoading(true);
    try {
      await api.post("/me/password", { current_password: currentPw, new_password: newPw });
      setMsg({ type: "success", text: "Password changed!" });
      setTimeout(() => { onClose(); setCurrentPw(""); setNewPw(""); setConfirmPw(""); setMsg({ type: "", text: "" }); }, 1200);
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "Failed" });
    } finally { setLoading(false); }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#1E2026] border border-[#2B3139] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2B3139]">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-sm font-bold text-[#EAECEF]">Change Password</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#5E6673] hover:text-[#EAECEF] transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5">Current Password</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} required value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                className="w-full px-4 py-3 pr-11 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all placeholder:text-[#363A45]"
                placeholder="Enter current password" />
              <button type="button" onClick={() => setShowPw(!showPw)} tabIndex={-1}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5E6673] hover:text-[#848E9C]">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5">New Password</label>
            <input type={showPw ? "text" : "password"} required value={newPw} onChange={e => setNewPw(e.target.value)}
              className="w-full px-4 py-3 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all placeholder:text-[#363A45]"
              placeholder="Minimum 12 characters" />
            {newPw && (
              <div className="mt-1.5 h-1 rounded-full bg-[#0B0E11] overflow-hidden">
                <div className={`h-full rounded-full transition-all ${newPw.length >= 16 ? "w-full bg-[#0ECB81]" : newPw.length >= 12 ? "w-3/4 bg-[#F0B90B]" : "w-1/3 bg-[#F6465D]"}`} />
              </div>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5">Confirm Password</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} required value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                className="w-full px-4 py-3 text-sm text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all placeholder:text-[#363A45]"
                placeholder="Re-enter new password" />
              {confirmPw && newPw === confirmPw && <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#0ECB81]" />}
            </div>
          </div>
          {msg.text && (
            <div className={`text-xs px-3 py-2 rounded-lg ${msg.type === "success" ? "text-[#0ECB81] bg-[#0ECB81]/10" : "text-[#F6465D] bg-[#F6465D]/10"}`}>{msg.text}</div>
          )}
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[#0B0E11] bg-gradient-to-r from-[#F0B90B] to-[#F8D12F] rounded-xl hover:from-[#D4A20B] hover:to-[#F0B90B] disabled:opacity-50 transition-all">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Password"}
          </button>
        </form>
      </div>
    </div>
    </Portal>
  );
}
