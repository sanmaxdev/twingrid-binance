"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import api from "@/lib/api";
import { Eye, EyeOff, Zap, TrendingUp, Shield, BarChart3, ArrowRight, CheckCircle2 } from "lucide-react";

export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}

function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Prefill invite code from ?ref= URL param
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) setInviteCode(ref);
  }, [searchParams]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.post("/auth/register", {
        email,
        password,
        display_name: displayName,
        invite_code: inviteCode
      });
      router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      setError(err.message || "Failed to register");
    } finally {
      setLoading(false);
    }
  };

  // Password strength
  const getStrength = (p: string) => {
    let s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 12) s++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  };
  const strength = getStrength(password);
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong", "Excellent"][strength];
  const strengthColor = ["", "#F6465D", "#F0B90B", "#F0B90B", "#0ECB81", "#0ECB81"][strength];

  return (
    <div className="flex min-h-[100dvh] bg-[#181A20]">
      {/* ─── Left Brand Panel (hidden on mobile) ─── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[#181A20] via-[#1E2026] to-[#181A20] border-r border-[#2B2F36]/50">
        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#F0B90B]/[0.03] rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[250px] h-[250px] bg-[#F0B90B]/[0.02] rounded-full blur-[80px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-[#F0B90B]/[0.04] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] border border-[#F0B90B]/[0.03] rounded-full" />

        {/* Brand Content */}
        <div className="relative z-10 p-10 pt-12">
          <div className="mb-2">
            <Image src="/logo.png" alt="Twin Grid" width={200} height={45} className="h-10 w-auto" priority />
          </div>
          <p className="text-[13px] text-[#5E6673] font-medium mt-1">Advanced Algorithmic Trading Platform</p>
        </div>

        <div className="relative z-10 px-10 flex-1 flex items-center">
          <div className="space-y-8">
            <h1 className="text-[28px] leading-[1.2] font-bold text-[#EAECEF]">
              Start trading<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F0B90B] to-[#FFD43B]">
                in minutes
              </span>
            </h1>
            <div className="space-y-5">
              {[
                { icon: CheckCircle2, text: "Connect your Binance account securely", color: "#0ECB81" },
                { icon: TrendingUp, text: "Configure bot strategy with smart defaults", color: "#F0B90B" },
                { icon: BarChart3, text: "Monitor performance with real-time analytics", color: "#3B82F6" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3.5 group">
                  <div className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${item.color}10` }}>
                    <item.icon className="h-4 w-4" style={{ color: item.color }} />
                  </div>
                  <p className="text-[13px] text-[#848E9C] leading-relaxed pt-1.5">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 p-10 pb-10">
          <div className="text-[11px] text-[#363A45] font-medium">
            © {new Date().getFullYear()} Twin Grid Console. All rights reserved.
          </div>
        </div>
      </div>

      {/* ─── Right Form Panel ─── */}
      <div className="flex-1 flex items-center justify-center px-5 py-10 sm:px-8 relative">
        <div className="absolute top-1/3 right-1/4 w-[350px] h-[350px] bg-[#F0B90B]/[0.02] rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-[400px] relative z-10">
          {/* Mobile Brand */}
          <div className="flex items-center justify-center mb-8 lg:hidden">
            <Image src="/logo.png" alt="Twin Grid" width={170} height={38} className="h-9 w-auto" />
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-[22px] sm:text-2xl font-bold text-[#EAECEF] mb-1.5">Create your account</h2>
            <p className="text-sm text-[#5E6673]">Join Twin Grid to start automated trading</p>
          </div>

          <form className="space-y-4" onSubmit={handleRegister}>
            {/* Email */}
            <div>
              <label htmlFor="reg-email" className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-2">
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                autoComplete="email"
                className="w-full px-4 py-3 text-sm text-[#EAECEF] bg-[#181A20] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all duration-200 placeholder:text-[#363A45]"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Display Name */}
            <div>
              <label htmlFor="reg-name" className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-2">
                Display Name
              </label>
              <input
                id="reg-name"
                type="text"
                required
                autoComplete="name"
                className="w-full px-4 py-3 text-sm text-[#EAECEF] bg-[#181A20] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all duration-200 placeholder:text-[#363A45]"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            {/* Invite Code */}
            <div>
              <label htmlFor="reg-invite" className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-2">
                Invite Code
              </label>
              <input
                id="reg-invite"
                type="text"
                required
                className="w-full px-4 py-3 text-sm text-[#EAECEF] bg-[#181A20] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all duration-200 placeholder:text-[#363A45]"
                placeholder="Enter invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="reg-password" className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  minLength={12}
                  className="w-full px-4 py-3 pr-11 text-sm text-[#EAECEF] bg-[#181A20] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all duration-200 placeholder:text-[#363A45]"
                  placeholder="Min. 12 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5E6673] hover:text-[#848E9C] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Strength indicator */}
              {password.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{ backgroundColor: i <= strength ? strengthColor : '#2B2F36' }} />
                    ))}
                  </div>
                  <p className="text-[11px] font-medium" style={{ color: strengthColor }}>{strengthLabel}</p>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 text-sm text-[#F6465D] bg-[#F6465D]/[0.08] border border-[#F6465D]/15 px-4 py-3 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-[#F6465D] shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold text-[#181A20] bg-gradient-to-r from-[#F0B90B] to-[#F8D12F] rounded-xl hover:from-[#D4A20B] hover:to-[#F0B90B] focus:outline-none focus:ring-2 focus:ring-[#F0B90B]/40 focus:ring-offset-2 focus:ring-offset-[#181A20] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_0_15px_rgba(240,185,11,0.2)] mt-1"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-[#181A20]/30 border-t-[#181A20] rounded-full animate-spin" />
              ) : (
                <>Create Account <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-7">
            <div className="flex-1 h-px bg-[#2B2F36]" />
            <span className="text-[11px] text-[#363A45] font-medium uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-[#2B2F36]" />
          </div>

          {/* Login Link */}
          <p className="text-center text-sm text-[#5E6673]">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-[#F0B90B] font-semibold hover:text-[#FFD43B] transition-colors">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
