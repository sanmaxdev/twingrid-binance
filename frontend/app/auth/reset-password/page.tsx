"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import api from "@/lib/api";
import { Zap, ArrowRight, ArrowLeft, Eye, EyeOff, CheckCircle, Lock } from "lucide-react";

function ResetPasswordForm() {
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

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
    if (newPassword.length < 12) { setError("Password must be at least 12 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    setError(""); setLoading(true);
    try {
      await api.post("/auth/reset-password", { email, otp: code, new_password: newPassword });
      setSuccess(true);
      setTimeout(() => router.push("/auth/login?reset=success"), 2000);
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#0B0E11]">
        <div className="text-center max-w-sm px-4">
          <p className="text-[#848E9C] text-sm mb-4">No email address provided.</p>
          <button onClick={() => router.push("/auth/forgot-password")} className="text-[#F0B90B] text-sm font-semibold hover:text-[#FFD43B]">Go to Forgot Password</button>
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
            <h2 className="text-xl font-bold text-[#EAECEF] mb-2">Password Reset!</h2>
            <p className="text-sm text-[#5E6673]">Redirecting to login...</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h2 className="text-[22px] font-bold text-[#EAECEF] mb-2">Reset Password</h2>
              <p className="text-sm text-[#5E6673]">
                Enter the code sent to <strong className="text-[#EAECEF]">{email}</strong>
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* OTP */}
              <div>
                <label className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-2">
                  Reset Code
                </label>
                <div className="flex justify-center gap-2.5" onPaste={handlePaste}>
                  {otp.map((digit, i) => (
                    <input key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text" inputMode="numeric" maxLength={1} value={digit}
                      onChange={(e) => handleChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-xl border-2 bg-[#181A20] text-[#EAECEF] outline-none transition-all duration-200 ${
                        digit ? "border-[#F0B90B] shadow-[0_0_0_3px_rgba(240,185,11,0.1)]" : "border-[#2B2F36]"
                      } focus:border-[#F0B90B] focus:shadow-[0_0_0_3px_rgba(240,185,11,0.15)]`}
                    />
                  ))}
                </div>
              </div>

              {/* New Password */}
              <div>
                <label htmlFor="rp-password" className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input id="rp-password" type={showPassword ? "text" : "password"} required
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-11 text-sm text-[#EAECEF] bg-[#181A20] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all duration-200 placeholder:text-[#363A45]"
                    placeholder="Minimum 12 characters" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5E6673] hover:text-[#848E9C] transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-2 h-1 rounded-full bg-[#181A20] overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${
                      newPassword.length >= 16 ? "w-full bg-[#0ECB81]" :
                      newPassword.length >= 12 ? "w-3/4 bg-[#F0B90B]" :
                      newPassword.length >= 8 ? "w-1/2 bg-[#F6465D]" : "w-1/4 bg-[#F6465D]"
                    }`} />
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label htmlFor="rp-confirm" className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <input id="rp-confirm" type={showPassword ? "text" : "password"} required
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-11 text-sm text-[#EAECEF] bg-[#181A20] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all duration-200 placeholder:text-[#363A45]"
                    placeholder="Re-enter your password" />
                  {confirmPassword && newPassword === confirmPassword && (
                    <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#0ECB81]" />
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2.5 text-sm text-[#F6465D] bg-[#F6465D]/[0.08] border border-[#F6465D]/15 px-4 py-3 rounded-xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#F6465D] shrink-0" />
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold text-[#0B0E11] bg-gradient-to-r from-[#F0B90B] to-[#F8D12F] rounded-xl hover:from-[#D4A20B] hover:to-[#F0B90B] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-[#F0B90B]/10">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-[#0B0E11]/30 border-t-[#0B0E11] rounded-full animate-spin" />
                ) : (
                  <>Reset Password <Lock className="h-4 w-4" /></>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link href="/auth/login" className="inline-flex items-center gap-1.5 text-sm text-[#5E6673] hover:text-[#F0B90B] transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#0B0E11]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F0B90B] to-[#D4A20B] flex items-center justify-center animate-pulse">
          <Zap className="h-5 w-5 text-[#0B0E11]" />
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
