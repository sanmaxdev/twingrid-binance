"use client";

import { useState, useRef, useEffect } from "react";


import { usePathname, useRouter } from "next/navigation";

import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard, Wallet, Briefcase, User, Users, LogOut, ShieldAlert, BookOpen, Menu, X, Coins, ChevronUp, Crown } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";
import { useScrollLock } from "@/lib/hooks/useScrollLock";
import LoadingScreen from "@/components/LoadingScreen";
import { Portal } from "@/components/Portal";

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { workspaces, activeWorkspace, setActiveWorkspace, loading } = useWorkspace();
  const { isAdmin, logout, user } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileUserMenuRef = useRef<HTMLDivElement>(null);
  const [planId, setPlanId] = useState<string>("free");

  // Fetch active subscription plan for badge
  useEffect(() => {
    import("@/lib/api").then(({ default: api }) => {
      api.get("/subscriptions/current")
        .then(r => r.json())
        .then(d => { if (d?.effective_plan?.id) setPlanId(d.effective_plan.id); })
        .catch(() => {});
    });
  }, []);

  const planBadgeCfg: Record<string, { label: string; cls: string }> = {
    free:  { label: "Free",  cls: "bg-[#2B2F36] text-[#848E9C] border border-[#363A45]" },
    pro:   { label: "Pro",   cls: "bg-[#F0B90B]/15 text-[#F0B90B] border border-[#F0B90B]/30" },
    elite: { label: "Elite", cls: "bg-purple-500/15 text-purple-400 border border-purple-500/30" },
  };
  const planBadge = planBadgeCfg[planId] || planBadgeCfg.free;

  // Close user menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node) &&
          mobileUserMenuRef.current && !mobileUserMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);


  const userInitials = user?.display_name
    ? user.display_name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Binance Accounts", href: "/dashboard/accounts", icon: Wallet },
    { name: "Twin Grid Wallet", href: "/dashboard/wallet", icon: Coins },
    { name: "Subscription", href: "/dashboard/subscription", icon: Crown },
    { name: "Affiliates", href: "/dashboard/affiliates", icon: Users },
    { name: "Workspaces", href: "/dashboard/workspaces", icon: Briefcase },
    { name: "Getting Started", href: "/dashboard/guide", icon: BookOpen },
  ];

  return (
    <>
      {/* Desktop sidebar — rendered in place */}
      <aside className={`w-64 border-r border-[#2B2F36]/50 bg-[#1E2026] flex-col h-screen fixed top-0 left-0 z-40 hidden md:flex`}>
        {/* Brand + Plan Badge */}
        <div className="h-16 flex items-center px-5 border-b border-[#2B2F36] gap-3">
          <Link href="/dashboard" className="shrink-0">
            <Image src="/logo.png" alt="Twin Grid" width={160} height={36} className="h-8 w-auto" priority />
          </Link>
          <Link href="/dashboard/subscription"
            className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-80 ${planBadge.cls}`}>
            {planBadge.label}
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-5 flex flex-col gap-1 px-3">
          {/* Workspace Selector */}
          {!loading && workspaces.length > 0 && (
            <div className="px-2 mb-5">
              <div className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-[0.1em] mb-2">Workspace</div>
              <select
                className="w-full bg-[#2B2F36] border border-[#363A45] text-sm text-[#EAECEF] rounded-input p-2 focus:ring-1 focus:ring-[#F0B90B] focus:border-[#F0B90B] focus:outline-none transition-colors"
                value={activeWorkspace?.id || ""}
                onChange={(e) => {
                  const ws = workspaces.find(w => w.id === e.target.value);
                  if (ws) setActiveWorkspace(ws);
                }}
              >
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-[0.1em] mb-2 px-2">Menu</div>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-input transition-all duration-200 text-sm font-medium relative ${
                  isActive
                    ? "bg-[#F0B90B]/10 text-[#F0B90B]"
                    : "text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#2B2F36]"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#F0B90B] rounded-r-full" />
                )}
                <Icon size={18} />
                {item.name}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-[0.1em] mb-2 px-2 mt-6">Administration</div>
              <Link
                href="/admin"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-input transition-all duration-200 text-sm font-medium ${
                  pathname.startsWith("/admin")
                    ? "bg-[#F6465D]/10 text-[#F6465D]"
                    : "text-[#848E9C] hover:text-[#F6465D] hover:bg-[#2B2F36]"
                }`}
              >
                <ShieldAlert size={18} />
                Admin Panel
              </Link>
            </>
          )}
        </div>

        <div className="border-t border-[#2B2F36] relative" ref={userMenuRef}>
          {/* User menu popup */}
          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-[#2B2F36] border border-[#363A45] rounded-lg shadow-xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 fade-in duration-150">
              <Link
                href="/dashboard/profile"
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#363A45] transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                <User size={16} />
                Profile
              </Link>
              <div className="border-t border-[#363A45]" />
              <button
                onClick={() => { setUserMenuOpen(false); setShowLogoutConfirm(true); }}
                className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-[#848E9C] hover:text-[#F6465D] hover:bg-[#F6465D]/10 transition-colors"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          )}

          {/* User card button */}
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-3 w-full p-4 hover:bg-[#2B2F36]/50 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F0B90B] to-[#D4A20B] flex items-center justify-center text-[#1E2026] text-xs font-bold shrink-0">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#EAECEF] truncate">{user?.display_name || "User"}</p>
              <p className="text-[11px] text-[#5E6673] truncate">{user?.email || ""}</p>
            </div>
            <ChevronUp size={16} className={`text-[#5E6673] transition-transform duration-200 ${userMenuOpen ? "" : "rotate-180"}`} />
          </button>
        </div>
      </aside>

      {/* Mobile sidebar — Portal to document.body for correct fixed positioning */}
      <Portal>
        {/* Mobile Overlay */}
        {isOpen && (
          <div 
            className="fixed inset-0 bg-black/60 z-[9998] md:hidden"
            onClick={onClose}
          />
        )}
        
        <aside className={`w-64 border-r border-[#2B2F36]/50 bg-[#1E2026] flex flex-col h-screen md:h-0 fixed top-0 left-0 z-[9999] transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}>
          {/* Brand */}
          <div className="h-16 flex items-center justify-between px-5 border-b border-[#2B2F36]">
            <Link href="/dashboard">
              <Image src="/logo.png" alt="Twin Grid" width={140} height={32} className="h-7 w-auto" />
            </Link>
            <button onClick={onClose} className="p-1 text-[#848E9C] hover:text-[#EAECEF]">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-5 flex flex-col gap-1 px-3">
            {/* Workspace Selector */}
            {!loading && workspaces.length > 0 && (
              <div className="px-2 mb-5">
                <div className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-[0.1em] mb-2">Workspace</div>
                <select
                  className="w-full bg-[#2B2F36] border border-[#363A45] text-sm text-[#EAECEF] rounded-input p-2 focus:ring-1 focus:ring-[#F0B90B] focus:border-[#F0B90B] focus:outline-none transition-colors"
                  value={activeWorkspace?.id || ""}
                  onChange={(e) => {
                    const ws = workspaces.find(w => w.id === e.target.value);
                    if (ws) setActiveWorkspace(ws);
                  }}
                >
                  {workspaces.map(ws => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-[0.1em] mb-2 px-2">Menu</div>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-input transition-all duration-200 text-sm font-medium relative ${
                    isActive
                      ? "bg-[#F0B90B]/10 text-[#F0B90B]"
                      : "text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#2B2F36]"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#F0B90B] rounded-r-full" />
                  )}
                  <Icon size={18} />
                  {item.name}
                </Link>
              );
            })}

            {isAdmin && (
              <>
                <div className="text-[10px] font-semibold text-[#5E6673] uppercase tracking-[0.1em] mb-2 px-2 mt-6">Administration</div>
                <Link
                  href="/admin"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-input transition-all duration-200 text-sm font-medium ${
                    pathname.startsWith("/admin")
                      ? "bg-[#F6465D]/10 text-[#F6465D]"
                      : "text-[#848E9C] hover:text-[#F6465D] hover:bg-[#2B2F36]"
                  }`}
                >
                  <ShieldAlert size={18} />
                  Admin Panel
                </Link>
              </>
            )}
          </div>

          <div className="border-t border-[#2B2F36] relative" ref={mobileUserMenuRef}>
            {/* User menu popup */}
            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-[#2B2F36] border border-[#363A45] rounded-lg shadow-xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 fade-in duration-150">
                <Link
                  href="/dashboard/profile"
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#363A45] transition-colors"
                  onClick={() => { setUserMenuOpen(false); onClose(); }}
                >
                  <User size={16} />
                  Profile
                </Link>
                <div className="border-t border-[#363A45]" />
                <button
                  onClick={() => { setUserMenuOpen(false); setShowLogoutConfirm(true); }}
                  className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-[#848E9C] hover:text-[#F6465D] hover:bg-[#F6465D]/10 transition-colors"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            )}

            {/* User card button */}
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-3 w-full p-4 hover:bg-[#2B2F36]/50 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F0B90B] to-[#D4A20B] flex items-center justify-center text-[#1E2026] text-xs font-bold shrink-0">
                {userInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#EAECEF] truncate">{user?.display_name || "User"}</p>
                <p className="text-[11px] text-[#5E6673] truncate">{user?.email || ""}</p>
              </div>
              <ChevronUp size={16} className={`text-[#5E6673] transition-transform duration-200 ${userMenuOpen ? "" : "rotate-180"}`} />
            </button>
          </div>
        </aside>
      </Portal>

      {/* Logout Confirmation Modal */}
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
                  Are you sure you want to sign out? You'll need to log in again to access your account.
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

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();

  // Lock body scroll when mobile sidebar is open
  useScrollLock(isMobileMenuOpen);

  // Active redirect when auth check completes and user is NOT authenticated.
  // This prevents the "Redirecting..." stuck screen — the redirect fires
  // immediately once we know the user is unauthenticated.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Show loading while auth is resolving
  if (isLoading) {
    return <LoadingScreen message="Loading Dashboard" />;
  }

  // Briefly show loading while redirect fires
  if (!isAuthenticated) {
    return <LoadingScreen message="Redirecting..." />;
  }


  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#EAECEF] flex flex-col md:flex-row relative">
      {/* Premium Graphic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#0B0E14]">
        {/* Tech Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#2B2F36_1px,transparent_1px),linear-gradient(to_bottom,#2B2F36_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_20%,transparent_100%)]" />
        
        {/* Glowing Orbs */}
        <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-[#F0B90B]/10 blur-[150px] rounded-full mix-blend-screen animate-pulse-slow" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[#1E2026] blur-[150px] rounded-full" />
        <div className="absolute top-[40%] left-[20%] w-[30vw] h-[30vw] bg-[#F0B90B]/5 blur-[120px] rounded-full mix-blend-screen" />

        {/* Noise overlay for cinematic texture */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      </div>

      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      
      <main className="flex-1 flex flex-col min-w-0 md:ml-64 relative z-10">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between h-14 px-4 border-b border-[#2B2F36]/50 bg-[#1E2026]/80 backdrop-blur-xl sticky top-0 z-20">
          <Link href="/dashboard">
            <Image src="/logo.png" alt="Twin Grid" width={130} height={30} className="h-7 w-auto" />
          </Link>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-[#848E9C] hover:text-[#EAECEF] transition-colors"
          >
            <Menu size={24} />
          </button>
        </div>
        
        <div className="p-4 md:p-8 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <DashboardContent>{children}</DashboardContent>
    </WorkspaceProvider>
  );
}
