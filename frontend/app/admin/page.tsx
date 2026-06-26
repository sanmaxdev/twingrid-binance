"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Users, Briefcase, Activity, Key, CheckCircle, XCircle, Loader2, Power, AlertTriangle, Zap, ToggleLeft, ToggleRight } from "lucide-react";
import { adminService, AdminStats } from "@/lib/services/admin";
import { toast } from "sonner";
import { useConfirmDialog } from "@/components/ConfirmDialog";

export default function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRotating, setIsRotating] = useState(false);
  const [isTogglingTrading, setIsTogglingTrading] = useState(false);
  const [isHalting, setIsHalting] = useState(false);
  const [health, setHealth] = useState<{ database: string; redis: string } | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  useEffect(() => { fetchStats(); fetchHealth(); }, []);

  const fetchStats = async () => {
    try { const data = await adminService.getStats(); setStats(data); }
    catch (error: any) { toast.error(error.message || "Failed to fetch stats"); }
    finally { setLoading(false); }
  };

  const fetchHealth = async () => {
    try { const data = await adminService.getSystemHealth(); setHealth(data); }
    catch { setHealth({ database: "error", redis: "error" }); }
  };

  const handleRotateKey = async () => {
    const ok = await confirm({
      title: "Rotate Encryption Key",
      message: "This re-encrypts all API credentials with a new key.\nYou must update MASTER_ENCRYPTION_KEY in .env and restart services afterward.",
      confirmLabel: "Rotate Key",
      variant: "danger",
    });
    if (!ok) return;
    try {
      setIsRotating(true);
      const result = await adminService.rotateEncryptionKey();
      toast.success("Key rotated!");
      alert(`New MASTER_ENCRYPTION_KEY:\n${result.new_key}\n\nUpdate .env and restart services.`);
    } catch (error: any) { toast.error(error.message || "Failed"); }
    finally { setIsRotating(false); }
  };

  const handleToggleTrading = async () => {
    const action = stats?.platform_trading_enabled ? "DISABLE" : "ENABLE";
    const ok = await confirm({
      title: `${action} Trading`,
      message: `Are you sure you want to ${action.toLowerCase()} platform-wide trading?`,
      confirmLabel: action === "DISABLE" ? "Disable Trading" : "Enable Trading",
      variant: action === "DISABLE" ? "warning" : "info",
    });
    if (!ok) return;
    try {
      setIsTogglingTrading(true);
      const result = await adminService.togglePlatformTrading();
      toast.success(result.message);
      setStats(prev => prev ? { ...prev, platform_trading_enabled: result.trading_enabled } : null);
    } catch (error: any) { toast.error(error.message || "Failed"); }
    finally { setIsTogglingTrading(false); }
  };

  const handleHaltAll = async () => {
    const ok1 = await confirm({
      title: "⚠️ Emergency Halt",
      message: "This will immediately disable trading, halt ALL accounts, and disable auto-trade for every user.\n\nThis action cannot be easily undone.",
      confirmLabel: "Proceed to Halt",
      variant: "danger",
    });
    if (!ok1) return;
    const ok2 = await confirm({
      title: "Final Confirmation",
      message: "Are you absolutely sure? All trading operations will be stopped immediately.",
      confirmLabel: "HALT ALL TRADING",
      variant: "danger",
    });
    if (!ok2) return;
    try {
      setIsHalting(true);
      const result = await adminService.haltAll();
      toast.success(result.message);
      await fetchStats();
    } catch (error: any) { toast.error(error.message || "Failed"); }
    finally { setIsHalting(false); }
  };

  const tradingEnabled = stats?.platform_trading_enabled ?? false;

  const statCards = [
    { name: "Total Users", value: stats?.total_users ?? "—", icon: Users, color: "#F0B90B" },
    { name: "Workspaces", value: stats?.total_workspaces ?? "—", icon: Briefcase, color: "#F0B90B" },
    { name: "Connected Accounts", value: stats?.total_connected_accounts ?? "—", icon: Key, color: "#F0B90B" },
    { name: "Active Bots", value: stats?.active_trading_bots ?? "—", icon: Activity, color: "#0ECB81" },
  ];

  return (
    <>
      <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#EAECEF] mb-1">System Overview</h1>
        <p className="text-sm text-[#848E9C]">Super Administrator Console</p>
      </div>

      {/* Stat Cards */}
      {loading ? (
        <div className="flex items-center gap-2 text-[#848E9C]">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">Loading stats...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-8">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.name} className="bg-[#2B2F36] rounded-xl p-5 border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all duration-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-[#181A20] flex items-center justify-center">
                    <Icon size={20} style={{ color: stat.color }} />
                  </div>
                </div>
                <h3 className="text-2xl font-semibold text-[#EAECEF] font-mono mb-1">{stat.value}</h3>
                <p className="text-xs font-medium text-[#848E9C] uppercase tracking-wider">{stat.name}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Trading Engine Control */}
      <div className="mb-6">
        <div className={`bg-[#2B2F36] rounded-xl overflow-hidden border ${tradingEnabled ? 'border-[#0ECB81]/30' : 'border-[#F0B90B]/30'}`}>
          <div className={`px-4 sm:px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${tradingEnabled ? 'bg-[#0ECB81]/5 border-[#0ECB81]/20' : 'bg-[#F0B90B]/5 border-[#F0B90B]/20'}`}>
            <div className="flex items-center gap-3">
              <Zap size={20} style={{ color: tradingEnabled ? '#0ECB81' : '#F0B90B' }} />
              <h3 className="text-base font-semibold" style={{ color: tradingEnabled ? '#0ECB81' : '#F0B90B' }}>
                Trading Engine
              </h3>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${tradingEnabled ? 'bg-[#0ECB81]/10 text-[#0ECB81] border border-[#0ECB81]/20' : 'bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20'}`}>
              {tradingEnabled ? "ACTIVE" : "DISABLED"}
            </span>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Master Trading Switch */}
              <div>
                <h4 className="text-[#EAECEF] font-semibold mb-2 flex items-center gap-2 text-sm">
                  <Power size={16} /> Master Trading Switch
                </h4>
                <p className="text-sm text-[#848E9C] mb-4 leading-relaxed">
                  {tradingEnabled
                    ? "Trading is ENABLED. Accounts with auto-trade will execute trades."
                    : "Trading is DISABLED. No accounts can trade regardless of settings."}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleToggleTrading}
                    disabled={isTogglingTrading}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-md font-semibold text-sm transition-all ${
                      tradingEnabled
                        ? 'bg-[#F0B90B] hover:bg-[#D0980B] text-[#1E2026]'
                        : 'bg-[#0ECB81] hover:bg-[#0ECB81]/80 text-[#1E2026]'
                    } disabled:opacity-50`}
                  >
                    {isTogglingTrading ? <Loader2 size={16} className="animate-spin" /> : tradingEnabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    {tradingEnabled ? "Disable Trading" : "Enable Trading"}
                  </button>
                  {stats && <span className="text-xs text-[#848E9C]">{stats.auto_trade_enabled_count} auto-trade on</span>}
                </div>
              </div>

              {/* Emergency Halt */}
              <div>
                <h4 className="text-[#F6465D] font-semibold mb-2 flex items-center gap-2 text-sm">
                  <AlertTriangle size={16} /> Emergency Halt All
                </h4>
                <p className="text-sm text-[#848E9C] mb-4 leading-relaxed">
                  Immediately disables trading, halts ALL accounts, disables auto-trade. Use only in emergencies.
                </p>
                <button
                  onClick={handleHaltAll}
                  disabled={isHalting}
                  className="bg-[#F6465D] hover:bg-[#F6465D]/80 disabled:opacity-50 text-white px-5 py-2.5 rounded-md font-semibold text-sm transition-all flex items-center gap-2"
                >
                  {isHalting ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
                  Halt All Trading
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Security Controls */}
        <div className="bg-[#2B2F36] rounded-xl overflow-hidden border border-[#2B2F36]">
          <div className="px-6 py-4 border-b border-[#181A20] flex items-center gap-3">
            <ShieldAlert size={20} className="text-[#F6465D]" />
            <h3 className="text-base font-semibold text-[#EAECEF]">System Security</h3>
          </div>
          <div className="p-6">
            <h4 className="text-[#EAECEF] font-semibold mb-2 text-sm">Encryption Key Rotation</h4>
            <p className="text-sm text-[#848E9C] mb-5 leading-relaxed">
              Re-encrypts all stored API secrets with a new Fernet key. Update MASTER_ENCRYPTION_KEY in .env and restart services afterward.
            </p>
            <button
              onClick={handleRotateKey}
              disabled={isRotating}
              className="bg-[#F6465D] hover:bg-[#F6465D]/80 disabled:opacity-50 text-white px-4 py-2.5 rounded-md font-semibold text-sm transition-all flex items-center gap-2"
            >
              {isRotating ? <><Loader2 size={16} className="animate-spin" /> Rotating...</> : <><Key size={16} /> Rotate Master Key</>}
            </button>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-[#2B2F36] rounded-xl overflow-hidden border border-[#2B2F36]">
          <div className="px-6 py-4 border-b border-[#181A20] flex items-center gap-3">
            <Activity size={20} className="text-[#F0B90B]" />
            <h3 className="text-base font-semibold text-[#EAECEF]">Service Health</h3>
          </div>
          <div className="p-6 space-y-3">
            {[
              { name: "FastAPI Backend", key: "database", check: (h: any) => h.database !== "error" },
              { name: "PostgreSQL Database", key: "database", check: (h: any) => h.database === "ok" },
              { name: "Redis & Celery Workers", key: "redis", check: (h: any) => h.redis === "ok" },
            ].map((svc) => (
              <div key={svc.name} className="flex items-center justify-between p-3 bg-[#181A20] rounded-lg">
                <span className="text-sm font-medium text-[#EAECEF]">{svc.name}</span>
                {health ? (
                  <span className={`flex items-center gap-2 text-sm font-semibold ${svc.check(health) ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                    {svc.check(health) ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    {svc.check(health) ? "Online" : "Error"}
                  </span>
                ) : (
                  <span className="text-sm text-[#848E9C]">Checking...</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
      {ConfirmDialog}
    </>
  );
}
