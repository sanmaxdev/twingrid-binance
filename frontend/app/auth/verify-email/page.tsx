"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import api from "@/lib/api";
import Image from "next/image";
import { Zap, ArrowRight, RotateCcw, CheckCircle } from "lucide-react";

function VerifyEmailForm() {
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const email = searchParams.get("email") || "";

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) newOtp[i] = pasted[i];
    setOtp(newOtp);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length !== 6) { setError("Please enter all 6 digits"); return; }
    setError(""); setLoading(true);
    try {
      await api.post("/auth/verify-email", { email, otp: code });
      setSuccess(true);
      await refreshUser();
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err: any) {
      setError(err.message || "Verification failed");
      setOtp(Array(6).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendLoading(true);
    try {
      await api.post("/auth/resend-verification", { email });
      setResendCooldown(60);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to resend code");
    } finally {
      setResendLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#0B0E11]">
        <div className="text-center max-w-sm px-4">
          <p className="text-[#848E9C] text-sm mb-4">No email address provided.</p>
          <button onClick={() => router.push("/auth/register")} className="text-[#F0B90B] text-sm font-semibold hover:text-[#FFD43B]">Go to Register</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#0B0E11] px-5 py-10">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[#F0B90B]/[0.02] rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10">
        {/* Brand */}
        <div className="flex items-center justify-center mb-10">
          <Image src="/logo.png" alt="Twin Grid" width={170} height={38} className="h-9 w-auto" />
        </div>

        {success ? (
          <div className="text-center animate-in fade-in duration-500">
            <div className="w-16 h-16 rounded-full bg-[#0ECB81]/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-[#0ECB81]" />
            </div>
            <h2 className="text-xl font-bold text-[#EAECEF] mb-2">Email Verified!</h2>
            <p className="text-sm text-[#5E6673]">Redirecting to dashboard...</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h2 className="text-[22px] font-bold text-[#EAECEF] mb-2">Verify Your Email</h2>
              <p className="text-sm text-[#5E6673] leading-relaxed">
                We sent a 6-digit code to<br />
                <strong className="text-[#EAECEF]">{email}</strong>
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* OTP Inputs */}
              <div className="flex justify-center gap-2.5" onPaste={handlePaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className={`w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-xl border-2 bg-[#181A20] text-[#EAECEF] outline-none transition-all duration-200 ${
                      digit ? "border-[#F0B90B] shadow-[0_0_0_3px_rgba(240,185,11,0.1)]" : "border-[#2B2F36]"
                    } focus:border-[#F0B90B] focus:shadow-[0_0_0_3px_rgba(240,185,11,0.15)]`}
                  />
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2.5 text-sm text-[#F6465D] bg-[#F6465D]/[0.08] border border-[#F6465D]/15 px-4 py-3 rounded-xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#F6465D] shrink-0" />
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || otp.join("").length !== 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold text-[#0B0E11] bg-gradient-to-r from-[#F0B90B] to-[#F8D12F] rounded-xl hover:from-[#D4A20B] hover:to-[#F0B90B] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-[#F0B90B]/10">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-[#0B0E11]/30 border-t-[#0B0E11] rounded-full animate-spin" />
                ) : (
                  <>Verify & Continue <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button onClick={handleResend} disabled={resendCooldown > 0 || resendLoading}
                className="inline-flex items-center gap-1.5 text-sm text-[#5E6673] hover:text-[#F0B90B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <RotateCcw className={`h-3.5 w-3.5 ${resendLoading ? "animate-spin" : ""}`} />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#0B0E11]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F0B90B] to-[#D4A20B] flex items-center justify-center animate-pulse">
          <Zap className="h-5 w-5 text-[#0B0E11]" />
        </div>
      </div>
    }>
      <VerifyEmailForm />
    </Suspense>
  );
}
