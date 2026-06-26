import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Activity, Settings, Trash2, CheckCircle2, XCircle, RefreshCw, LayoutDashboard, Play, Square, Zap, ZapOff, Loader2, Pause, AlertTriangle, Wallet, TrendingUp, TrendingDown, Globe, Clock, Shield } from "lucide-react"
import { format } from "date-fns"
import Link from "next/link"
import { accountsService, AccountResponse } from "@/lib/services/accounts"
import AccountSettingsModal from "./AccountSettingsModal"
import { useConfirmDialog } from "@/components/ConfirmDialog"

function AccountQuickStats({ accountId }: { accountId: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    accountsService.getAccountDashboard(accountId)
      .then((res) => {
        if (mounted) setData(res)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [accountId])

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 mt-4 animate-pulse">
        <div className="h-16 bg-[#2B2F36] rounded-xl"></div>
        <div className="h-16 bg-[#2B2F36] rounded-xl"></div>
      </div>
    )
  }

  if (!data || !data.account_summary) return null

  const balance = parseFloat(data.account_summary.total_wallet_balance || "0")
  const pnl = parseFloat(data.account_summary.total_unrealized_pnl || "0")
  const pnlClass = pnl > 0 ? "text-[#0ECB81]" : pnl < 0 ? "text-[#F6465D]" : "text-[#848E9C]"

  return (
    <div className="grid grid-cols-2 gap-3 mt-4">
      <div className="bg-[#181A20] rounded-xl p-3.5 border border-[#2B2F36]/60">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Wallet className="h-3 w-3 text-[#F0B90B]" />
          <span className="text-[10px] uppercase tracking-wider text-[#5E6673] font-semibold">Balance</span>
        </div>
        <div className="text-base font-bold text-[#EAECEF] font-mono">
          ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div className="bg-[#181A20] rounded-xl p-3.5 border border-[#2B2F36]/60">
        <div className="flex items-center gap-1.5 mb-1.5">
          {pnl >= 0 ? <TrendingUp className="h-3 w-3 text-[#0ECB81]" /> : <TrendingDown className="h-3 w-3 text-[#F6465D]" />}
          <span className="text-[10px] uppercase tracking-wider text-[#5E6673] font-semibold">Unrealized</span>
        </div>
        <div className={`text-base font-bold font-mono ${pnlClass}`}>
          {pnl > 0 ? "+" : ""}{pnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  )
}

interface AccountListProps {
  accounts: AccountResponse[]
  onRefresh: () => void
}

export default function AccountList({ accounts, onRefresh }: AccountListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [settingsAccount, setSettingsAccount] = useState<AccountResponse | null>(null)
  const [platformTradingEnabled, setPlatformTradingEnabled] = useState<boolean>(true)
  const { confirm, ConfirmDialog } = useConfirmDialog()

  useEffect(() => {
    accountsService.getPlatformTradingStatus()
      .then((res) => setPlatformTradingEnabled(res.trading_enabled))
      .catch(() => {})
  }, [])

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Remove Account",
      message: "Are you sure you want to remove this account? Active grids will be halted and all associated data will be removed.",
      confirmLabel: "Remove Account",
      variant: "danger",
    })
    if (!ok) return

    setDeletingId(id)
    try {
      await accountsService.deleteAccount(id)
      toast.success("Account removed")
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || "Failed to remove account")
    } finally {
      setDeletingId(null)
    }
  }

  const handleTestConnection = async (id: string) => {
    setTestingId(id)
    try {
      await accountsService.testConnection(id)
      toast.success("Connection test successful")
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || "Connection test failed")
    } finally {
      setTestingId(null)
    }
  }

  const handleToggleAutoTrade = async (account: AccountResponse) => {
    const newState = !account.auto_trade_enabled
    setTogglingId(account.id)
    try {
      await accountsService.toggleAutoTrade(account.id, newState)
      toast.success(newState ? "Auto-trade enabled" : "Auto-trade disabled")
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || "Failed to toggle auto-trade")
    } finally {
      setTogglingId(null)
    }
  }

  const handleStartTrading = async (id: string) => {
    setStartingId(id)
    try {
      await accountsService.startTrading(id)
      toast.success("Trading started")
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || "Failed to start trading")
    } finally {
      setStartingId(null)
    }
  }

  const handleStopTrading = async (id: string) => {
    setStoppingId(id)
    try {
      await accountsService.stopTrading(id)
      toast.success("Trading stopped")
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || "Failed to stop trading")
    } finally {
      setStoppingId(null)
    }
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "RUNNING":
        return { icon: Activity, color: "text-[#0ECB81]", bg: "bg-[#0ECB81]/10", border: "border-[#0ECB81]/30", dot: "bg-[#0ECB81]", pulse: true }
      case "IDLE":
        return { icon: CheckCircle2, color: "text-[#F0B90B]", bg: "bg-[#F0B90B]/10", border: "border-[#F0B90B]/30", dot: "bg-[#F0B90B]", pulse: false }
      case "PAUSED":
        return { icon: Pause, color: "text-[#FFD000]", bg: "bg-[#FFD000]/10", border: "border-[#FFD000]/30", dot: "bg-[#FFD000]", pulse: false }
      case "HALTED":
      case "ERROR":
        return { icon: XCircle, color: "text-[#F6465D]", bg: "bg-[#F6465D]/10", border: "border-[#F6465D]/30", dot: "bg-[#F6465D]", pulse: false }
      default:
        return { icon: Activity, color: "text-[#848E9C]", bg: "bg-[#848E9C]/10", border: "border-[#848E9C]/30", dot: "bg-[#848E9C]", pulse: false }
    }
  }

  return (
    <>
      {/* Platform Trading Disabled Banner */}
      {!platformTradingEnabled && (
        <div className="mb-6 bg-amber-950/30 border border-amber-900/40 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-amber-400 font-medium text-sm">Platform Trading is Disabled</p>
            <p className="text-amber-500/70 text-xs mt-0.5">The administrator has disabled trading. Auto-trade cannot be enabled until the admin re-enables platform trading.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {accounts.map((account) => {
          const statusCfg = getStatusConfig(account.status)
          const StatusIcon = statusCfg.icon

          return (
            <div
              key={account.id}
              className="group relative bg-gradient-to-b from-[#1E2329] to-[#1A1D23] rounded-2xl border border-[#2B2F36] hover:border-[#F0B90B]/30 transition-all duration-300 overflow-hidden flex flex-col"
            >
              {/* Status glow accent */}
              <div className={`absolute top-0 left-0 right-0 h-[2px] ${statusCfg.bg.replace('/10', '/40')}`} style={{ background: `linear-gradient(90deg, transparent, ${account.status === 'RUNNING' ? '#0ECB81' : account.status === 'IDLE' ? '#F0B90B' : account.status === 'HALTED' || account.status === 'ERROR' ? '#F6465D' : '#848E9C'}40, transparent)` }} />

              {/* Header */}
              <div className="p-5 pb-3">
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/accounts/${account.id}`}
                      className="text-[#EAECEF] font-semibold text-lg hover:text-[#F0B90B] transition-colors block truncate"
                    >
                      {account.name}
                    </Link>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${statusCfg.pulse ? 'animate-pulse' : ''}`} />
                        {account.status}
                      </span>
                      <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${account.is_testnet ? 'text-[#FFD000]' : 'text-[#0ECB81]'}`}>
                        <Globe className="h-2.5 w-2.5" />
                        {account.is_testnet ? "Testnet" : "Mainnet"}
                      </span>
                    </div>
                  </div>

                  {/* Auto-Trade Toggle */}
                  <button
                    onClick={() => handleToggleAutoTrade(account)}
                    disabled={togglingId === account.id || (!account.auto_trade_enabled && !platformTradingEnabled)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      account.auto_trade_enabled
                        ? 'bg-[#0ECB81]/15 text-[#0ECB81] border border-[#0ECB81]/30 hover:bg-[#0ECB81]/25'
                        : (!platformTradingEnabled
                          ? 'bg-[#2B2F36]/50 text-[#5E6673] border border-[#2B2F36] cursor-not-allowed'
                          : 'bg-[#2B2F36] text-[#848E9C] border border-[#363A45] hover:border-[#F0B90B]/30')
                    }`}
                    title={
                      !platformTradingEnabled && !account.auto_trade_enabled
                        ? "Platform trading is disabled by admin"
                        : account.auto_trade_enabled ? "Click to disable auto-trade" : "Click to enable auto-trade"
                    }
                  >
                    {togglingId === account.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : account.auto_trade_enabled ? (
                      <Zap className="h-3 w-3" />
                    ) : (
                      <ZapOff className="h-3 w-3" />
                    )}
                    {account.auto_trade_enabled ? "AUTO" : "OFF"}
                  </button>
                </div>

                {/* Strategy Grid */}
                {account.settings && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-[#181A20] rounded-xl p-3.5 border border-[#2B2F36]/60">
                    <div className="col-span-2 flex items-center gap-2 mb-1 pb-2 border-b border-[#2B2F36]/60">
                      <Shield className="h-3 w-3 text-[#F0B90B]" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#F0B90B]">Grid Strategy</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#5E6673]">Symbol{((account.settings.config.active_symbols || []).length > 1) ? "s" : ""}</span>
                      <span className="text-xs font-semibold text-[#EAECEF]">
                        {Array.isArray(account.settings.config.active_symbols)
                          ? account.settings.config.active_symbols.map((s: string) => s.replace("USDT", "")).join(", ")
                          : (account.settings.config.active_symbol || "BTCUSDT").replace("USDT", "")
                        }
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#5E6673]">Leverage</span>
                      <span className="text-xs font-semibold text-[#EAECEF]">{account.settings.config.leverage}x</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#5E6673]">Base Order</span>
                      <span className="text-xs font-semibold text-[#EAECEF]">
                        {account.settings.config.sizing_mode === "pct_capital"
                          ? `${account.settings.config.base_order_pct}%`
                          : `$${account.settings.config.base_order_usd ?? 1}`
                        }
                        {account.settings.config.compounding_enabled && " \uD83D\uDD04"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#5E6673]">Take Profit</span>
                      <span className="text-xs font-semibold text-[#0ECB81]">
                        {account.settings.config.tp_mode === "fixed"
                          ? `$${account.settings.config.tp_fixed_amount ?? 5}`
                          : `${account.settings.config.take_profit_pct}%`
                        }
                      </span>
                    </div>
                  </div>
                )}

                {/* Live Stats */}
                <AccountQuickStats accountId={account.id} />

                {/* Added date */}
                <div className="flex items-center gap-1.5 mt-3 text-[10px] text-[#5E6673]">
                  <Clock className="h-2.5 w-2.5" />
                  Added {format(new Date(account.created_at), "MMM d, yyyy")}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-auto border-t border-[#2B2F36]/60 bg-[#14161B] p-4">
                <div className="flex gap-2 mb-3">
                  {account.status === "RUNNING" ? (
                    <button
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#F0B90B] hover:bg-[#D0980B] text-[#1E2026] transition-all"
                      onClick={() => handleStopTrading(account.id)}
                      disabled={stoppingId === account.id}
                    >
                      {stoppingId === account.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                      Stop
                    </button>
                  ) : (
                    <button
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0ECB81] hover:bg-[#0BA360] text-[#1E2026] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => handleStartTrading(account.id)}
                      disabled={startingId === account.id || !platformTradingEnabled}
                      title={!platformTradingEnabled ? "Platform trading is disabled" : "Start trading"}
                    >
                      {startingId === account.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Start
                    </button>
                  )}
                  <Link href={`/dashboard/accounts/${account.id}`} className="flex-1">
                    <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20 hover:bg-[#F0B90B]/20 transition-all">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </button>
                  </Link>
                </div>

                {/* Utility row */}
                <div className="flex justify-end gap-2">
                  <button
                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#2B2F36] border border-[#363A45] hover:border-[#F0B90B]/30 transition-all"
                    onClick={() => setSettingsAccount(account)}
                    title="Settings"
                  >
                    <Settings className="h-3.5 w-3.5 text-[#848E9C]" />
                  </button>
                  <button
                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#2B2F36] border border-[#363A45] hover:border-[#F0B90B]/30 transition-all"
                    onClick={() => handleTestConnection(account.id)}
                    disabled={testingId === account.id}
                    title="Test Connection"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-[#848E9C] ${testingId === account.id ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#F6465D]/10 border border-[#F6465D]/20 hover:bg-[#F6465D]/20 transition-all"
                    onClick={() => handleDelete(account.id)}
                    disabled={deletingId === account.id}
                    title="Remove Account"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[#F6465D]" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {settingsAccount && (
          <AccountSettingsModal
            account={settingsAccount}
            isOpen={!!settingsAccount}
            onOpenChange={(open) => !open && setSettingsAccount(null)}
            onSuccess={onRefresh}
          />
        )}
      </div>
      {ConfirmDialog}
    </>
  )
}
