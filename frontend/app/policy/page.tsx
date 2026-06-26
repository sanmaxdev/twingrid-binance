"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function PolicyPage() {
  return (
    <main className="min-h-screen bg-[#181A20] text-[#EAECEF] selection:bg-[#F0B90B]/25">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 flex items-center px-8 py-4 border-b border-[#2B2F36] bg-[#1E2026]/95 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2 text-[#848E9C] hover:text-[#EAECEF] transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-semibold">Back to Home</span>
        </Link>
      </nav>

      <div className="max-w-4xl mx-auto py-16 px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-tight text-[#EAECEF]">
              Privacy & <span className="text-[#F0B90B]">Terms</span>
            </h1>
            <p className="text-[#848E9C] text-lg font-medium">Last updated: May 2026</p>
          </div>

          <div className="prose prose-invert prose-headings:font-bold prose-headings:text-[#EAECEF] prose-p:text-[#848E9C] prose-p:leading-relaxed prose-a:text-[#F0B90B] prose-a:no-underline hover:prose-a:underline max-w-none">
            <h2>1. Introduction</h2>
            <p>
              Welcome to Twin Grid. These Terms of Service and Privacy Policy govern your use of our automated trading bot platform.
              By accessing or using our service, you agree to be bound by these terms. Our platform provides customizable bot strategies
              including Dollar Cost Averaging (DCA) and Trend Following execution.
            </p>

            <h2>2. Disclaimer of Liability</h2>
            <p>
              Twin Grid provides algorithmic trading software. We do not provide financial, investment, or legal advice. 
              Cryptocurrency trading involves significant risk, and you may lose some or all of your capital. 
              The performance of past trading strategies is not indicative of future results. You are solely responsible 
              for configuring your bot parameters, managing your API keys, and monitoring your trading accounts.
            </p>

            <h2>3. API Security & Access</h2>
            <p>
              We prioritize the security of your exchange API keys. All keys are encrypted at rest using industry-standard 
              AES-256 encryption. We only require API keys with trading permissions; we explicitly forbid the provision 
              of API keys with withdrawal permissions. You are responsible for maintaining the confidentiality of your 
              account credentials.
            </p>

            <h2>4. Data Collection & Privacy</h2>
            <p>
              We collect minimal personal data required to operate the service: your email address for account authentication, 
              and your exchange API keys to execute trades on your behalf. We also collect anonymized usage telemetry to 
              improve system performance. We never sell your personal data to third parties.
            </p>

            <h2>5. Service Availability</h2>
            <p>
              While we strive for 99.9% uptime, algorithmic trading is subject to exchange latency, API rate limits, 
              and network connectivity issues. Twin Grid is not responsible for missed trades, delayed execution, or 
              any losses incurred due to platform downtime or exchange API instability.
            </p>

            <h2>6. Intellectual Property</h2>
            <p>
              The Twin Grid software, algorithms, user interface, and original content are the exclusive property of 
              Twin Grid. You are granted a limited, non-exclusive, non-transferable license to use the platform for 
              your personal or internal business trading operations.
            </p>

            <div className="mt-12 p-6 bg-[#2B2F36] rounded-xl border border-[#2B2F36]">
              <p className="text-sm m-0 text-[#EAECEF]">
                If you have questions about these terms or our privacy practices, please contact us at 
                <a href="mailto:help@twingridbot.com" className="text-[#F0B90B] ml-1">help@twingridbot.com</a>.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="py-8 border-t border-[#2B2F36] bg-[#1E2026] text-center mt-12">
        <p className="text-[#5E6673] text-sm font-medium">© {new Date().getFullYear()} Twin Grid Console. All rights reserved.</p>
      </footer>
    </main>
  );
}
