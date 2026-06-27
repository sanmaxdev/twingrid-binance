"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard, Users, Briefcase, ArrowLeft, LogOut,
  Wallet, Activity, Shield, BarChart3, FlaskConical, Menu, X,
  Server, DollarSign, Mail, UserPlus, Database, Brain, Crown, ChevronUp,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useScrollLock } from "@/lib/hooks/useScrollLock";
import { Portal } from "@/components/Portal";
import LoadingScreen from "@/components/LoadingScreen";

const NAV_ITEMS = [
  { name: "System Overview",   href: "/admin",              icon: LayoutDashboard },
  { name: "Users",             href: "/admin/users",        icon: Users },
  { name: "Subscriptions",     href: "/admin/subscriptions",icon: Crown },
  { name: "Workspaces",        href: "/admin/workspaces",   icon: Briefcase },
  { name: "Accounts",          href: "/admin/accounts",     icon: Wallet },
  { name: "Fee Management",    href: "/admin/fees",         icon: DollarSign },
  { name: "Affiliates",        href: "/admin/affiliates",   icon: UserPlus },
  { name: "Email",             href: "/admin/email",        icon: Mail },
  { name: "Events",            href: "/admin/events",       icon: Activity },
  { name: "Audit Log",         href: "/admin/audit",        icon: Shield },
  { name: "Metrics",           href: "/admin/metrics",      icon: BarChart3 },
  { name: "System Monitor",    href: "/admin/system",       icon: Server },
  { name: "Strategy Backtest", href: "/admin/backtest",     icon: FlaskConical },
  { name: "AI Strategy Tuner", href: "/admin/ai-tuner",     icon: Brain },
  { name: "Market Data",       href: "/admin/market-data",  icon: Database },
];

function AdminSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef  = useRef<HTMLDivElement>(null);

  // Close popup on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inDesktop = desktopRef.current?.contains(target);
      const inMobile  = mobileRef.current?.contains(target);
      if (!inDesktop && !inMobile) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = user?.display_name
    ? user.display_name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : (user?.email?.slice(0, 2).toUpperCase() ?? "AD");

  /** Reusable nav list */
  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      <Link
        href="/dashboard"
        onClick={onClick}
        className="flex items-center gap-3 px-3 py-2.5 rounded-md transition-all text-sm font-medium text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#2B2F36] mb-4 border border-[#2B2F36]"
      >
        <ArrowLeft size={16} /> Back to App
      </Link>
      <div className="text-[10px] font-semibold text-[#848E9C]/60 uppercase tracking-widest mb-3 px-3 mt-2">
        Management
      </div>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all text-sm font-medium ${
              isActive
                ? "bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20"
                : "text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#2B2F36] border border-transparent"
            }`}
          >
            <Icon size={18} /> {item.name}
          </Link>
        );
      })}
    </>
  );

  /** Profile card + popup — shared between desktop & mobile */
  const ProfileSection = ({ sectionRef }: { sectionRef: React.RefObject<HTMLDivElement | null> }) => (
    <div className="border-t border-[#2B2F36] relative" ref={sectionRef}>
      {/* Popup */}
      {userMenuOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-[#2B2F36] border border-[#363A45] rounded-lg shadow-xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 fade-in duration-150">
          <button
            onClick={() => { setUserMenuOpen(false); setShowLogoutConfirm(true); }}
            className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-[#848E9C] hover:text-[#F6465D] hover:bg-[#F6465D]/10 transition-colors"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      )}
      {/* Card button */}
      <button
        onClick={() => setUserMenuOpen(!userMenuOpen)}
        className="flex items-center gap-3 w-full p-4 hover:bg-[#2B2F36]/50 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F0B90B] to-[#D4A20B] flex items-center justify-center text-[#1E2026] text-xs font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#EAECEF] truncate">{user?.display_name || "Admin"}</p>
          <p className="text-[11px] text-[#5E6673] truncate">{user?.email || ""}</p>
        </div>
        <ChevronUp
          size={16}
          className={`text-[#5E6673] transition-transform duration-200 ${userMenuOpen ? "" : "rotate-180"}`}
        />
      </button>
    </div>
  );

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside className="w-64 border-r border-[#2B2F36] bg-[#0B0E11] flex-col h-screen fixed top-0 left-0 z-40 hidden md:flex">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-[#2B2F36]">
          <div className="flex items-center gap-2">
            <Link href="/admin">
              <Image src="/logo.png" alt="Twin Grid" width={140} height={32} className="h-7 w-auto" priority />
            </Link>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20 uppercase tracking-widest">
              Admin
            </span>
          </div>
        </div>
        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-1 px-3">
          <NavLinks />
        </div>
        {/* Profile */}
        <ProfileSection sectionRef={desktopRef} />
      </aside>

      {/* ── Mobile Sidebar (Portal) ── */}
      <Portal>
        {isOpen && (
          <div className="fixed inset-0 bg-black/60 z-[9998] md:hidden" onClick={onClose} />
        )}
        <aside
          className={`w-64 border-r border-[#2B2F36] bg-[#0B0E11] flex flex-col h-screen fixed top-0 left-0 z-[9999] transition-transform duration-300 ease-in-out md:hidden ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-5 border-b border-[#2B2F36]">
            <div className="flex items-center gap-2">
              <Link href="/admin">
                <Image src="/logo.png" alt="Twin Grid" width={120} height={28} className="h-6 w-auto" />
              </Link>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20 uppercase tracking-widest">
                Admin
              </span>
            </div>
            <button onClick={onClose} className="p-1 text-[#848E9C] hover:text-[#EAECEF]">
              <X size={20} />
            </button>
          </div>
          {/* Nav */}
          <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-1 px-3">
            <NavLinks onClick={onClose} />
          </div>
          {/* Profile */}
          <ProfileSection sectionRef={mobileRef} />
        </aside>
      </Portal>

      {/* ── Logout Confirmation Modal ── */}
      {showLogoutConfirm && (
        <Portal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowLogoutConfirm(false)} />
            <div className="relative bg-[#1E2026] border border-[#2B2F36] rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
              <div className="flex flex-col items-center gap-3 pt-8 pb-4 px-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#F6465D]/10 border border-[#F6465D]/20">
                  <LogOut className="text-[#F6465D]" size={28} />
                </div>
                <h3 className="text-lg font-semibold text-[#EAECEF]">Confirm Logout</h3>
                <p className="text-sm text-[#848E9C] text-center leading-relaxed">
                  Are you sure you want to sign out of the admin panel?
                </p>
              </div>
              <div className="flex gap-3 p-6 pt-2">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-[#EAECEF] bg-[#2B2F36] border border-[#363A45] rounded-lg hover:bg-[#363A45] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowLogoutConfirm(false); logout(); }}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#F6465D] rounded-lg hover:bg-[#D9304A] transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading, isAdmin, isAuthenticated } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useScrollLock(isMobileMenuOpen);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) router.replace("/auth/login");
      else if (!isAdmin)    router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, isAdmin, router]);

  if (isLoading)                        return <LoadingScreen message="Loading Admin Panel" />;
  if (!isAuthenticated || !isAdmin)     return <LoadingScreen message="Redirecting..." />;

  return (
    <div className="min-h-screen bg-[#181A20] text-[#EAECEF] flex flex-col md:flex-row">
      <AdminSidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0 md:ml-64 md:h-screen md:overflow-y-auto">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between h-14 px-4 border-b border-[#2B2F36] bg-[#0B0E11] sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Twin Grid" width={120} height={28} className="h-6 w-auto" />
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20 uppercase tracking-widest">
              Admin
            </span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-[#848E9C] hover:text-[#EAECEF] transition-colors"
          >
            <Menu size={22} />
          </button>
        </div>

        <div className="p-4 md:p-8 flex-1">{children}</div>
      </main>
    </div>
  );
}
