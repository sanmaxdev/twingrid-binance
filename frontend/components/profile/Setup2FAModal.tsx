"use client";
import { useState } from "react";
import { ShieldCheck, X, Loader2, Copy, Check } from "lucide-react";
import api from "@/lib/api";
import { Portal } from "@/components/Portal";

type Step = "idle" | "setup" | "verify" | "done" | "disable";

export default function Setup2FAModal({ open, onClose, enabled, onComplete }: {
  open: boolean; onClose: () => void; enabled: boolean; onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>(enabled ? "disable" : "idle");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleSetup = async () => {
    setLoading(true); setError("");
    try {
      const res = await api.post("/me/totp/setup", {});
      const data = await res.json();
      setSecret(data.secret);
      setUri(data.uri);
      setStep("verify");
    } catch (err: any) { setError(err.message || "Failed to setup"); }
    setLoading(false);
  };

  const handleVerify = async () => {
    if (code.length !== 6) { setError("Enter 6-digit code"); return; }
    setLoading(true); setError("");
    try {
      await api.post("/me/totp/verify", { code, secret });
      setStep("done");
      setTimeout(() => { onComplete(); onClose(); }, 1500);
    } catch (err: any) { setError(err.message || "Invalid code"); }
    setLoading(false);
  };

  const handleDisable = async () => {
    if (code.length !== 6) { setError("Enter 6-digit code"); return; }
    setLoading(true); setError("");
    try {
      await api.post("/me/totp/disable", { code });
      setStep("done");
      setTimeout(() => { onComplete(); onClose(); }, 1500);
    } catch (err: any) { setError(err.message || "Invalid code"); }
    setLoading(false);
  };

  const copySecret = () => { navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const qrUrl = uri ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}` : "";

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#1E2026] border border-[#2B3139] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2B3139]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-sm font-bold text-[#EAECEF]">{enabled ? "Disable 2FA" : "Enable 2FA"}</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#5E6673] hover:text-[#EAECEF] transition-colors"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {step === "done" && (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#0ECB81]/10 flex items-center justify-center mb-3">
                <Check className="h-6 w-6 text-[#0ECB81]" />
              </div>
              <p className="text-sm font-semibold text-[#0ECB81]">{enabled ? "2FA Disabled" : "2FA Enabled!"}</p>
            </div>
          )}

          {/* Enable flow: Start */}
          {!enabled && step === "idle" && (
            <>
              <p className="text-sm text-[#848E9C]">Add an extra layer of security by enabling two-factor authentication with an authenticator app.</p>
              <button onClick={handleSetup} disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[#0B0E11] bg-gradient-to-r from-[#F0B90B] to-[#F8D12F] rounded-xl hover:from-[#D4A20B] hover:to-[#F0B90B] disabled:opacity-50 transition-all">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate QR Code"}
              </button>
            </>
          )}

          {/* Enable flow: QR + Verify */}
          {step === "verify" && (
            <>
              <p className="text-xs text-[#848E9C]">Scan this QR code with Google Authenticator, Authy, or any TOTP app:</p>
              {qrUrl && (
                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-xl">
                    <img src={qrUrl} alt="2FA QR Code" className="w-40 h-40" />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-[#0B0E11] border border-[#2B2F36] rounded-lg">
                  <span className="text-[11px] text-[#5E6673] block">Manual Key</span>
                  <span className="text-xs font-mono text-[#EAECEF] break-all">{secret}</span>
                </div>
                <button onClick={copySecret} className="p-2 text-[#5E6673] hover:text-[#F0B90B] transition-colors shrink-0">
                  {copied ? <Check className="h-4 w-4 text-[#0ECB81]" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5">Verification Code</label>
                <input type="text" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full px-4 py-3 text-sm text-center tracking-[0.3em] font-mono text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all placeholder:text-[#363A45]"
                  placeholder="000000" />
              </div>
              <button onClick={handleVerify} disabled={loading || code.length !== 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[#0B0E11] bg-gradient-to-r from-[#F0B90B] to-[#F8D12F] rounded-xl hover:from-[#D4A20B] hover:to-[#F0B90B] disabled:opacity-50 transition-all">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Enable"}
              </button>
            </>
          )}

          {/* Disable flow */}
          {enabled && step === "disable" && (
            <>
              <p className="text-sm text-[#848E9C]">Enter your current authenticator code to disable 2FA.</p>
              <div>
                <label className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5">Authenticator Code</label>
                <input type="text" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full px-4 py-3 text-sm text-center tracking-[0.3em] font-mono text-[#EAECEF] bg-[#0B0E11] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all placeholder:text-[#363A45]"
                  placeholder="000000" />
              </div>
              <button onClick={handleDisable} disabled={loading || code.length !== 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-[#F6465D] rounded-xl hover:bg-[#D83A50] disabled:opacity-50 transition-all">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable 2FA"}
              </button>
            </>
          )}

          {error && <div className="text-xs text-[#F6465D] bg-[#F6465D]/10 px-3 py-2 rounded-lg">{error}</div>}
        </div>
      </div>
    </div>
    </Portal>
  );
}
