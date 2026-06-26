"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/AuthContext";
import { Eye, EyeOff, Zap, TrendingUp, Shield, BarChart3, ArrowRight } from "lucide-react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password, needsTotp ? totpCode : undefined, rememberMe);
      const redirect = searchParams.get("redirect") || "/dashboard";
      router.push(redirect);
    } catch (err: any) {
      const msg = err.message || "Failed to login";
      if (msg.toLowerCase().includes("totp code required")) {
        setNeedsTotp(true);
        setError("");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

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
              Automate your<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F0B90B] to-[#FFD43B]">
                trading strategy
              </span>
            </h1>
            <div className="space-y-5">
              {[
                { icon: TrendingUp, text: "Trading bots run 24/7 with zero downtime", color: "#0ECB81" },
                { icon: Shield, text: "Enterprise-grade security & encryption", color: "#F0B90B" },
                { icon: BarChart3, text: "Real-time analytics & performance tracking", color: "#3B82F6" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3.5 group">
                  <div className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
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
        {/* Subtle ambient glow */}
        <div className="absolute top-1/3 right-1/4 w-[350px] h-[350px] bg-[#F0B90B]/[0.02] rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-[400px] relative z-10">
          {/* Mobile Brand (shown only on mobile) */}
          <div className="flex items-center justify-center mb-8 lg:hidden">
            <Image src="/logo.png" alt="Twin Grid" width={170} height={38} className="h-9 w-auto" />
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-[22px] sm:text-2xl font-bold text-[#EAECEF] mb-1.5">Welcome back</h2>
            <p className="text-sm text-[#5E6673]">Sign in to your account to continue</p>
          </div>

          <form className="space-y-5" onSubmit={handleLogin}>
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-2">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                className="w-full px-4 py-3 text-sm text-[#EAECEF] bg-[#181A20] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all duration-200 placeholder:text-[#363A45]"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-[11px] font-semibold text-[#848E9C] uppercase tracking-[0.08em] mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 text-sm text-[#EAECEF] bg-[#181A20] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all duration-200 placeholder:text-[#363A45]"
                  placeholder="Enter your password"
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
            </div>

            {/* TOTP Code (shown when 2FA is required) */}
            {needsTotp && (
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-[#848E9C] uppercase tracking-wider">
                  Authenticator Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  className="w-full px-4 py-3.5 text-sm text-center tracking-[0.3em] font-mono text-[#EAECEF] bg-[#181A20] border border-[#2B2F36] rounded-xl focus:ring-2 focus:ring-[#F0B90B]/30 focus:border-[#F0B90B]/60 focus:outline-none transition-all placeholder:text-[#363A45]"
                  placeholder="000000"
                />
                <p className="text-[11px] text-[#5E6673]">Enter the 6-digit code from your authenticator app</p>
              </div>
            )}
            {/* Forgot Password */}
            <div className="flex justify-end -mt-1">
              <Link href="/auth/forgot-password" className="text-[12px] text-[#5E6673] hover:text-[#F0B90B] transition-colors">
                Forgot password?
              </Link>
            </div>

            {/* Remember Me */}
            <label className="flex items-center gap-2.5 cursor-pointer group select-none">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-[18px] h-[18px] rounded-[5px] border-2 border-[#363A45] bg-[#181A20] peer-checked:bg-[#F0B90B] peer-checked:border-[#F0B90B] transition-all duration-200 flex items-center justify-center">
                  {rememberMe && (
                    <svg className="w-3 h-3 text-[#181A20]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-[13px] text-[#5E6673] group-hover:text-[#848E9C] transition-colors">
                Keep me logged in
              </span>
            </label>

            {/* Success Message */}
            {searchParams.get("reset") === "success" && !error && (
              <div className="flex items-center gap-2.5 text-sm text-[#0ECB81] bg-[#0ECB81]/[0.08] border border-[#0ECB81]/15 px-4 py-3 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-[#0ECB81] shrink-0" />
                Password reset successful! Please sign in.
              </div>
            )}

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
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold text-[#181A20] bg-gradient-to-r from-[#F0B90B] to-[#F8D12F] rounded-xl hover:from-[#D4A20B] hover:to-[#F0B90B] focus:outline-none focus:ring-2 focus:ring-[#F0B90B]/40 focus:ring-offset-2 focus:ring-offset-[#181A20] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_0_15px_rgba(240,185,11,0.2)]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-[#181A20]/30 border-t-[#181A20] rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-7">
            <div className="flex-1 h-px bg-[#2B2F36]" />
            <span className="text-[11px] text-[#363A45] font-medium uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-[#2B2F36]" />
          </div>

          {/* Register Link */}
          <p className="text-center text-sm text-[#5E6673]">
            Don&apos;t have an account?{" "}
            <Link href="/auth/register" className="text-[#F0B90B] font-semibold hover:text-[#FFD43B] transition-colors">
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#181A20]">
        <div className="flex w-10 h-10 items-center justify-center rounded-xl bg-[#F0B90B] shadow-[0_0_15px_rgba(240,185,11,0.3)] animate-pulse" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
