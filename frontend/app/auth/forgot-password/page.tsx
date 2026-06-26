"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import api from "@/lib/api";
import { Zap, ArrowRight, ArrowLeft, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send reset code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#0B0E11] px-5 py-10">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[#F0B90B]/[0.02] rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10">
        {/* Brand */}
        <div className="flex items-center justify-center mb-10">
          <Image src="/logo.png" alt="Twin Grid" width={170} height={38} className="h-9 w-auto" />
        </div>

        {sent ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-[#F0B90B]/10 flex items-center justify-center mx-auto mb-5">
              <Mail className="h-8 w-8 text-[#F0B90B]" />
            </div>
            <h2 className="text-xl font-bold text-[#EAECEF] mb-2">Check Your Email</h2>
            <p className="text-sm text-[#5E6673] mb-6 leading-relaxed">
              We sent a 6-digit reset code to<br />
              <strong className="text-[#EAECEF]">{email}</strong>
            </p>
            <button onClick={() => router.push(`/auth/reset-password?email=${encodeURIComponent(email)}`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold text-[#0B0E11] bg-gradient-to-r from-[#F0B90B] to-[#F8D12F] rounded-xl hover:from-[#D4A20B] hover:to-[#F0B90B] transition-all duration-200 shadow-lg shadow-[#F0B90B]/10">
              Enter Reset Code <ArrowRight className="h-4 w-4" />
            </button>
            <button onClick={() => { setSent(false); setEmail(""); }}
              className="mt-4 text-sm text-[#5E6673] hover:text-[#848E9C] transition-colors">
              Try a different email
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-[22px] font-bold text-[#EAECEF] mb-1.5">Forgot Password?</h2>
              <p className="text-sm text-[#5E6673]">Enter your email to receive a reset code</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="fp-email" className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-2">
                  Email Address
                </label>
                <input id="fp-email" type="email" required autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 text-sm text-[#EAECEF] bg-[#181A20] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all duration-200 placeholder:text-[#363A45]"
                  placeholder="you@example.com" />
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
                  <>Send Reset Code <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>

            <div className="mt-7 text-center">
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
