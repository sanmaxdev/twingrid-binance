"use client"

import { useEffect, useState } from "react"
import { PlusCircle, LinkIcon, AlertTriangle, Wallet } from "lucide-react"
import { accountsService, AccountResponse } from "@/lib/services/accounts"
import api from "@/lib/api"
import AccountList from "./components/AccountList"
import AddAccountModal from "./components/AddAccountModal"
import Link from "next/link"

interface WalletBalance {
  balance: number;
  minimum_required: number;
  is_sufficient: boolean;
  fee_percentage: number;
  fee_enabled: boolean;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null)

  const fetchAccounts = async () => {
    setIsLoading(true)
    try {
      const data = await accountsService.listAccounts()
      setAccounts(data)
    } catch (error) {
      console.error("Failed to fetch accounts", error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchWalletBalance = async () => {
    try {
      const res = await api.get("/wallet/balance")
      const data = await res.json()
      setWalletBalance(data)
    } catch {
      // Wallet endpoint may not be available
    }
  }

  useEffect(() => {
    fetchAccounts()
    fetchWalletBalance()
  }, [])

  return (
    <div className="flex flex-1 flex-col gap-5 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#EAECEF]">Connected Accounts</h2>
          <p className="text-sm text-[#848E9C] font-medium mt-1">
            Manage your Binance Futures API connections and strategy configurations.
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex justify-center items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[6px] hover:bg-[#D0980B] transition-all duration-200 shadow-pill w-full sm:w-auto"
        >
          <PlusCircle className="h-4 w-4" />
          Connect Account
        </button>
      </div>

      {/* Insufficient Balance Warning */}
      {walletBalance && !walletBalance.is_sufficient && walletBalance.fee_enabled && (
        <div className="bg-[#F6465D]/10 border border-[#F6465D]/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-[#F6465D] mt-0.5 shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#F6465D]">Insufficient Twin Grid Balance</p>
            <p className="text-xs text-[#F6465D]/80 mt-0.5">
              Your balance (${walletBalance.balance.toFixed(2)}) is below the minimum required (${walletBalance.minimum_required.toFixed(2)}).
              Your bots cannot open new trades until you deposit funds.
            </p>
          </div>
          <Link
            href="/dashboard/wallet"
            className="shrink-0 px-4 py-2 rounded-lg bg-[#F6465D]/20 text-[#F6465D] text-xs font-semibold hover:bg-[#F6465D]/30 transition-colors flex items-center gap-1.5"
          >
            <Wallet size={14} />
            Deposit
          </Link>
        </div>
      )}

      <div className="flex-1">
        {isLoading ? (
          <div className="flex h-[400px] items-center justify-center rounded-card border border-[#2B2F36] bg-[#1E2026]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#F0B90B]/10 flex items-center justify-center animate-pulse">
                <LinkIcon className="h-4 w-4 text-[#F0B90B]" />
              </div>
              <span className="text-sm text-[#848E9C] font-medium">Loading accounts...</span>
            </div>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex h-[400px] flex-col items-center justify-center rounded-card border border-dashed border-[#2B2F36] bg-[#1E2026] text-center">
            <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#2B2F36]">
                <LinkIcon className="h-8 w-8 text-[#5E6673]" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-[#EAECEF]">No accounts connected</h3>
              <p className="mb-5 mt-2 text-sm text-[#848E9C] font-medium">
                You haven't connected any Binance Futures accounts yet. Add an API key to start trading.
              </p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[6px] hover:bg-[#D0980B] transition-all duration-200"
              >
                <PlusCircle className="h-4 w-4" />
                Connect Account
              </button>
            </div>
          </div>
        ) : (
          <AccountList accounts={accounts} onRefresh={fetchAccounts} />
        )}
      </div>

      <AddAccountModal
        isOpen={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        onSuccess={fetchAccounts}
      />
    </div>
  )
}
