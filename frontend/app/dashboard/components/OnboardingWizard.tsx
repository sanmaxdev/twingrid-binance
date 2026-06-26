"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Rocket, Key, Settings2, CheckCircle2, ChevronRight,
  ArrowRight, Shield, TrendingUp, Sparkles, Zap
} from "lucide-react";
import { accountsService } from "@/lib/services/accounts";

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to Twin Grid",
    subtitle: "Enterprise-grade Binance Futures grid trading",
    icon: Rocket,
  },
  {
    id: "connect",
    title: "Connect Your Account",
    subtitle: "Link your Binance API credentials",
    icon: Key,
  },
  {
    id: "configure",
    title: "Configure Your Grid",
    subtitle: "Set your trading parameters",
    icon: Settings2,
  },
  {
    id: "complete",
    title: "You're All Set!",
    subtitle: "Start trading with confidence",
    icon: CheckCircle2,
  },
];

export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    exchange: "BINANCE",
    api_key: "",
    api_secret: "",
    is_testnet: true,
  });

  const currentStep = STEPS[step];

  const handleConnect = async () => {
    if (!form.name || !form.api_key || !form.api_secret) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      await accountsService.createAccount(form);
      toast.success("Account connected successfully!");
      setStep(3);
    } catch (e: any) {
      toast.error(e.message || "Failed to connect account");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-[#2B2F36] border border-[#363A45] rounded-input px-4 py-3 text-sm text-[#EAECEF] placeholder:text-[#5E6673] focus:border-[#F0B90B] focus:ring-1 focus:ring-[#F0B90B] outline-none transition-all";

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="text-center space-y-8">
            <div className="relative">
              <div className="absolute inset-0 bg-[#F0B90B]/5 blur-3xl rounded-full" />
              <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-md mx-auto">
                {[
                  { icon: Shield, label: "Multi-Tenant Security", color: "text-[#F0B90B]" },
                  { icon: TrendingUp, label: "Grid Trading Engine", color: "text-[#0ECB81]" },
                  { icon: Zap, label: "Real-time Monitoring", color: "text-[#F0B90B]" },
                ].map((f, i) => (
                  <div key={i} className="bg-[#2B2F36] border border-[#363A45] rounded-card p-4 text-center">
                    <f.icon className={`h-8 w-8 mx-auto mb-2 ${f.color}`} />
                    <p className="text-[11px] text-[#848E9C] leading-tight font-medium">{f.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-[#848E9C] text-sm max-w-md mx-auto font-medium">
                Twin Grid is an enterprise-grade platform for automated Binance Futures grid trading.
                Follow this quick setup to get started in under 2 minutes.
              </p>
            </div>
            <button
              className="px-8 py-3 text-base font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[6px] hover:bg-[#D0980B] transition-all duration-200 shadow-glow inline-flex items-center gap-2"
              onClick={() => setStep(1)}
            >
              Get Started <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5">Account Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Main Trading Account"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5">API Key</label>
                <input
                  type="text"
                  value={form.api_key}
                  onChange={(e) => setForm(f => ({ ...f, api_key: e.target.value }))}
                  placeholder="Enter your Binance API key"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5">API Secret</label>
                <input
                  type="password"
                  value={form.api_secret}
                  onChange={(e) => setForm(f => ({ ...f, api_secret: e.target.value }))}
                  placeholder="Enter your Binance API secret"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div className="flex items-center gap-3 p-4 bg-[#2B2F36] border border-[#363A45] rounded-input">
                <input
                  type="checkbox"
                  id="testnet"
                  checked={form.is_testnet}
                  onChange={(e) => setForm(f => ({ ...f, is_testnet: e.target.checked }))}
                  className="w-4 h-4 rounded border-[#363A45] bg-[#181A20] text-[#F0B90B] focus:ring-[#F0B90B]/30 accent-[#F0B90B]"
                />
                <label htmlFor="testnet" className="text-sm text-[#EAECEF] cursor-pointer font-medium">
                  Use Testnet <span className="text-[#5E6673] text-xs">(recommended for first setup)</span>
                </label>
              </div>
            </div>
            <div className="bg-[#F0B90B]/5 border border-[#F0B90B]/15 rounded-input p-4">
              <p className="text-[#F0B90B] text-xs flex items-start gap-2 font-medium">
                <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                Your API keys are encrypted at rest using AES-256 and never leave our secure servers.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => setStep(0)} className="w-full sm:w-auto sm:flex-1 px-4 py-3 text-sm font-semibold text-[#848E9C] bg-[#2B2F36] border border-[#363A45] rounded-[6px] hover:text-[#EAECEF] transition-colors">Back</button>
              <button
                className="w-full sm:w-auto sm:flex-1 px-4 py-3 text-sm font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[6px] hover:bg-[#D0980B] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-1"
                onClick={() => setStep(2)}
                disabled={!form.name || !form.api_key || !form.api_secret}
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Leverage", value: "10x", desc: "Default leverage" },
                { label: "Base Order", value: "$25", desc: "Initial position size" },
                { label: "Safety Orders", value: "8", desc: "DCA grid levels" },
                { label: "TP Target", value: "1.5%", desc: "Take profit target" },
              ].map((p, i) => (
                <div key={i} className="bg-[#2B2F36] border border-[#363A45] rounded-card p-4">
                  <div className="text-[10px] text-[#5E6673] mb-1 font-semibold uppercase tracking-wider">{p.label}</div>
                  <div className="text-xl font-bold text-[#EAECEF] font-mono">{p.value}</div>
                  <div className="text-[10px] text-[#848E9C] mt-1">{p.desc}</div>
                </div>
              ))}
            </div>
            <div className="bg-[#0ECB81]/5 border border-[#0ECB81]/15 rounded-input p-4">
              <p className="text-[#0ECB81] text-xs flex items-start gap-2 font-medium">
                <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                Default grid strategy is pre-configured. You can fine-tune parameters from the account dashboard after setup.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => setStep(1)} className="w-full sm:w-auto sm:flex-1 px-4 py-3 text-sm font-semibold text-[#848E9C] bg-[#2B2F36] border border-[#363A45] rounded-[6px] hover:text-[#EAECEF] transition-colors">Back</button>
              <button
                className="w-full sm:w-auto sm:flex-1 px-4 py-3 text-sm font-semibold bg-[#0ECB81] text-[#1E2026] rounded-[6px] hover:bg-[#0BA360] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
                onClick={handleConnect}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2"><span className="h-4 w-4 border-2 border-[#1E2026]/30 border-t-[#1E2026] rounded-full animate-spin" /> Connecting...</span>
                ) : (
                  <>Connect Account <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="text-center space-y-6">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-[#0ECB81]/20 blur-2xl rounded-full" />
              <CheckCircle2 className="relative h-20 w-20 text-[#0ECB81] mx-auto" />
            </div>
            <div className="space-y-2">
              <p className="text-[#848E9C] text-sm max-w-md mx-auto font-medium">
                Your Binance account is connected and ready. You can now monitor positions,
                configure grids, and view real-time analytics from your dashboard.
              </p>
            </div>
            <div className="flex flex-col gap-3 max-w-sm mx-auto">
              <button
                className="px-8 py-3 text-base font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[6px] hover:bg-[#D0980B] transition-all duration-200 shadow-glow inline-flex items-center justify-center gap-2"
                onClick={() => {
                  localStorage.setItem("onboarding_complete", "true");
                  onComplete();
                  router.push("/dashboard/accounts");
                }}
              >
                Go to Dashboard <ArrowRight className="h-5 w-5" />
              </button>
              <button
                className="text-sm font-medium text-[#848E9C] hover:text-[#EAECEF] transition-colors py-2"
                onClick={() => {
                  localStorage.setItem("onboarding_complete", "true");
                  onComplete();
                  router.push("/dashboard/guide");
                }}
              >
                View Getting Started Guide
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#181A20] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`h-2.5 rounded-full transition-all duration-500 ${
                i <= step ? "w-10 bg-[#F0B90B]" : "w-2.5 bg-[#2B2F36]"
              }`} />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex p-3 rounded-xl bg-[#F0B90B]/10 mb-4">
            <currentStep.icon className="h-8 w-8 text-[#F0B90B]" />
          </div>
          <h1 className="text-2xl font-bold text-[#EAECEF] mb-2">{currentStep.title}</h1>
          <p className="text-[#848E9C] font-medium">{currentStep.subtitle}</p>
        </div>

        {/* Content Card */}
        <div className="bg-[#1E2026] border border-[#2B2F36] rounded-card p-6 sm:p-8 shadow-card">
          {renderStepContent()}
        </div>

        {/* Skip */}
        {step < 3 && (
          <div className="text-center mt-6">
            <button
              className="text-xs text-[#5E6673] hover:text-[#848E9C] transition-colors font-medium"
              onClick={() => {
                localStorage.setItem("onboarding_complete", "true");
                onComplete();
              }}
            >
              Skip setup — I'll configure later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
