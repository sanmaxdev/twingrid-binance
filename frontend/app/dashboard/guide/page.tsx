"use client";
import {
  Key, Settings2, TrendingUp, Shield, BarChart3,
  Monitor, Zap, ArrowRight, BookOpen,
  CheckCircle2, AlertTriangle, Lightbulb, ChevronDown,
  Rocket, HelpCircle, Sparkles
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/* ───────────── Guide Steps Data ───────────── */
const STEPS = [
  {
    icon: Key,
    title: "Connect Your Binance Account",
    accent: "#F0B90B",
    content: [
      "Navigate to **Accounts** → **Add Account**",
      "Enter a descriptive name for your account",
      "Paste your Binance API Key and Secret",
      "Enable **Futures Trading** permission on Binance first",
      "Toggle **Testnet** for paper trading (recommended for beginners)",
      "Click **Connect** to verify and save",
    ],
    tip: "Start with Testnet to familiarize yourself with the platform before using real funds.",
  },
  {
    icon: Settings2,
    title: "Configure Grid Strategy",
    accent: "#0ECB81",
    content: [
      "Open your account → **Settings** (gear icon)",
      "Set your **Leverage** (default: 10x)",
      "Configure **Base Order Size** (initial position margin)",
      "Set **Safety Order** count and step multiplier",
      "Define your **Take Profit** percentage target",
      "Save settings — they apply to the next grid cycle",
    ],
    tip: "Lower leverage (5-10x) and smaller base orders reduce risk significantly.",
  },
  {
    icon: Zap,
    title: "Start Trading",
    accent: "#3B82F6",
    content: [
      "Enable **Auto-Trade** on your account card",
      "Click **Start** to begin the grid bot",
      "The bot will place a Base Order to enter a position",
      "Safety Orders are placed as DCA levels below/above entry",
      "Take Profit is calculated from the average entry price",
      "Monitor activity in real-time on the account dashboard",
    ],
    tip: "The platform pauses new entries during high-risk conditions automatically.",
  },
  {
    icon: Monitor,
    title: "Monitor & Analyze",
    accent: "#A855F7",
    content: [
      "**Dashboard** — Live positions, equity, and active baskets",
      "**History** — Full trade history with PnL analytics",
      "**Equity Chart** — Visual equity curve with time ranges",
      "**Basket Forensics** — Deep-dive into any individual trade cycle",
      "**CSV Export** — Download complete trade history",
    ],
    tip: "Check the Equity Chart regularly to spot drawdown patterns early.",
  },
  {
    icon: Shield,
    title: "Risk Management",
    accent: "#F6465D",
    content: [
      "**Daily Loss Limit** — Auto-halts trading if exceeded",
      "**Cooldown Period** — Pause between losing cycles",
      "**Liquidation Estimator** — Real-time distance to liquidation",
      "**Reconciler** — Syncs DB state with Binance exchange",
      "**Platform Kill Switch** — Admin can disable all trading",
      "**Telegram Alerts** — Instant notifications for critical events",
    ],
    warning: "Never risk more than you can afford to lose. Always start with Testnet.",
  },
];

const FAQ_ITEMS = [
  {
    q: "What permissions does my API key need?",
    a: "Enable 'Futures Trading' permission on Binance. Do NOT enable 'Withdrawals' — Twin Grid never needs withdrawal access.",
  },
  {
    q: "How does the grid strategy work?",
    a: "The bot places a Base Order, then sets Safety Orders at lower prices. When price drops, Safety Orders fill to DCA your entry. A Take Profit order closes the entire position at a profit target calculated from the average entry.",
  },
  {
    q: "What happens during a liquidation risk?",
    a: "The Risk Manager continuously monitors margin ratio. If liquidation risk is detected, it sends Telegram alerts and can auto-close positions to prevent forced liquidation.",
  },
  {
    q: "Can I run multiple accounts?",
    a: "Yes. Each workspace can have multiple Binance accounts, each with independent settings, grids, and risk parameters.",
  },
  {
    q: "Is my API key safe?",
    a: "Yes. All API keys are encrypted with AES-256 at rest. They are decrypted only in-memory when executing trades.",
  },
];

/* ───────────── Markdown bold renderer ───────────── */
function renderBold(text: string) {
  return text.replace(
    /\*\*(.*?)\*\*/g,
    '<strong class="text-[#EAECEF] font-semibold">$1</strong>'
  );
}

/* ───────────── FAQ Component ───────────── */
function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {FAQ_ITEMS.map((item, i) => (
        <div
          key={i}
          className="bg-[#2B2F36]/60 border border-[#2B2F36] rounded-xl overflow-hidden transition-all hover:border-[#F0B90B]/20"
        >
          <button
            className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left group"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${open === i ? 'bg-[#F0B90B]/10' : 'bg-[#181A20]'}`}>
                <HelpCircle className={`h-3.5 w-3.5 transition-colors ${open === i ? 'text-[#F0B90B]' : 'text-[#848E9C]'}`} />
              </div>
              <span className="text-sm font-medium text-[#EAECEF] group-hover:text-white transition-colors">
                {item.q}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-[#848E9C] shrink-0 transition-transform duration-300 ${open === i ? "rotate-180 text-[#F0B90B]" : ""}`}
            />
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${open === i ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}
          >
            <div className="px-5 pb-5 text-sm text-[#848E9C] leading-relaxed pl-[3.25rem]">
              {item.a}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────── Main Page ───────────── */
export default function GuidePage() {
  return (
    <div className="max-w-4xl mx-auto pb-16 px-4 sm:px-0">
      {/* ─── Hero Header ─── */}
      <div className="relative mb-10 sm:mb-12">
        {/* Decorative glow */}
        <div className="absolute -top-8 -left-8 w-40 h-40 bg-[#F0B90B]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-4 right-0 w-24 h-24 bg-[#0ECB81]/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 mb-6">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[#F0B90B] to-[#D0980B] flex items-center justify-center shadow-lg shadow-[#F0B90B]/20 shrink-0">
            <BookOpen className="h-6 w-6 sm:h-7 sm:w-7 text-[#1E2026]" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#EAECEF] tracking-tight">
              Getting Started
            </h1>
            <p className="text-sm text-[#848E9C] mt-1">
              Everything you need to launch your first grid bot in 5 minutes
            </p>
          </div>
        </div>

        {/* Quick nav pills */}
        <div className="flex gap-2 flex-wrap">
          <Link href="/dashboard/accounts">
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20 hover:bg-[#F0B90B]/20 transition-all">
              <TrendingUp className="h-3 w-3" /> My Accounts
            </button>
          </Link>
        </div>
      </div>

      {/* ─── Step Cards ─── */}
      <div className="space-y-4 sm:space-y-5">
        {STEPS.map((step, i) => (
          <div
            key={i}
            className="group relative bg-[#1E2026] border border-[#2B2F36] rounded-2xl overflow-hidden hover:border-[#2B2F36]/80 transition-all duration-300"
          >
            {/* Accent top line */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, ${step.accent}, transparent)` }}
            />

            <div className="p-5 sm:p-7">
              {/* Step header */}
              <div className="flex items-center gap-3 sm:gap-4 mb-5">
                <div className="relative">
                  <div
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${step.accent}15` }}
                  >
                    <step.icon className="h-5 w-5" style={{ color: step.accent }} />
                  </div>
                  {/* Step number badge */}
                  <div
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-[#1E2026]"
                    style={{ backgroundColor: step.accent }}
                  >
                    {i + 1}
                  </div>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-[#EAECEF] tracking-tight">
                  {step.title}
                </h2>
              </div>

              {/* Checklist */}
              <ul className="space-y-2.5 sm:space-y-3 mb-5">
                {step.content.map((item, j) => (
                  <li key={j} className="flex items-start gap-3">
                    <CheckCircle2
                      className="h-4 w-4 mt-0.5 shrink-0"
                      style={{ color: `${step.accent}80` }}
                    />
                    <span
                      className="text-sm text-[#848E9C] leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: renderBold(item) }}
                    />
                  </li>
                ))}
              </ul>

              {/* Tip callout */}
              {step.tip && (
                <div
                  className="rounded-xl p-3.5 flex items-start gap-2.5 border"
                  style={{
                    backgroundColor: `${step.accent}08`,
                    borderColor: `${step.accent}20`,
                  }}
                >
                  <Lightbulb
                    className="h-4 w-4 shrink-0 mt-0.5"
                    style={{ color: step.accent }}
                  />
                  <p className="text-xs leading-relaxed" style={{ color: step.accent }}>
                    {step.tip}
                  </p>
                </div>
              )}

              {/* Warning callout */}
              {step.warning && (
                <div className="rounded-xl p-3.5 flex items-start gap-2.5 bg-[#F6465D]/5 border border-[#F6465D]/20">
                  <AlertTriangle className="h-4 w-4 text-[#F6465D] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#F6465D] leading-relaxed">{step.warning}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ─── FAQ Section ─── */}
      <div className="mt-12 sm:mt-14">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#2B2F36] flex items-center justify-center">
            <HelpCircle className="h-5 w-5 text-[#F0B90B]" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#EAECEF]">
              Frequently Asked Questions
            </h2>
            <p className="text-xs text-[#848E9C] mt-0.5">Common questions about Twin Grid</p>
          </div>
        </div>
        <FAQ />
      </div>

      {/* ─── CTA Section ─── */}
      <div className="mt-12 sm:mt-14">
        <div className="relative bg-gradient-to-br from-[#1E2026] to-[#2B2F36] border border-[#2B2F36] rounded-2xl p-6 sm:p-10 text-center overflow-hidden">
          {/* Glow decorations */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-[#F0B90B]/8 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-[#0ECB81]/5 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-[#F0B90B]/10 flex items-center justify-center mx-auto mb-4">
              <Rocket className="h-6 w-6 text-[#F0B90B]" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-[#EAECEF] mb-2">
              Ready to start trading?
            </h3>
            <p className="text-sm text-[#848E9C] mb-6 max-w-md mx-auto">
              Connect your Binance account and launch your first grid bot in under 2 minutes.
            </p>
            <Link href="/dashboard/accounts">
              <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-[#F0B90B] text-[#1E2026] hover:bg-[#D0980B] transition-all shadow-lg shadow-[#F0B90B]/20">
                <Sparkles className="h-4 w-4" />
                Go to Accounts
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
