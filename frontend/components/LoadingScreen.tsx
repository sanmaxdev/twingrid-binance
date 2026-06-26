"use client";

import Image from "next/image";

/**
 * Premium full-screen loading component with Twin Grid branding.
 * Features: pulsing logo glow, rotating ring, animated dots.
 */
export default function LoadingScreen({ message = "Loading" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0B0E14] relative overflow-hidden">
      {/* Subtle radial glow behind logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[400px] h-[400px] rounded-full bg-[#F0B90B]/[0.03] blur-[100px] animate-pulse" />
      </div>

      <div className="flex flex-col items-center gap-6 relative z-10">
        {/* Logo with rotating ring */}
        <div className="relative">
          {/* Outer rotating ring */}
          <div className="absolute -inset-4 rounded-full border-2 border-transparent border-t-[#F0B90B]/40 border-r-[#F0B90B]/10 animate-spin" style={{ animationDuration: "2s" }} />
          <div className="absolute -inset-4 rounded-full border-2 border-transparent border-b-[#F0B90B]/20 animate-spin" style={{ animationDuration: "3s", animationDirection: "reverse" }} />

          {/* Logo container with glow pulse */}
          <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(240,185,11,0.15)] animate-[logoPulse_2s_ease-in-out_infinite]">
            <Image
              src="/icon-192.png"
              alt="Twin Grid"
              width={64}
              height={64}
              className="w-full h-full object-contain"
              priority
            />
          </div>
        </div>

        {/* Brand name */}
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-bold text-[#EAECEF] tracking-tight">Twin</span>
          <span className="text-lg font-bold text-[#F0B90B] tracking-tight">Grid</span>
        </div>

        {/* Animated loading text with dots */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-[#848E9C] tracking-wide">{message}</span>
          <span className="flex gap-0.5">
            <span className="w-1 h-1 bg-[#F0B90B] rounded-full animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
            <span className="w-1 h-1 bg-[#F0B90B] rounded-full animate-bounce" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
            <span className="w-1 h-1 bg-[#F0B90B] rounded-full animate-bounce" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
          </span>
        </div>
      </div>

      {/* Inject keyframes for logo pulse */}
      <style jsx global>{`
        @keyframes logoPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(240, 185, 11, 0.1); }
          50% { box-shadow: 0 0 40px rgba(240, 185, 11, 0.25); }
        }
      `}</style>
    </div>
  );
}
