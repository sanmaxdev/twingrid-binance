"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { LogOut, AlertTriangle } from "lucide-react";

interface LogoutConfirmDialogProps {
  onConfirm: () => void;
  variant?: "dashboard" | "admin";
}

export default function LogoutConfirmDialog({ onConfirm, variant = "dashboard" }: LogoutConfirmDialogProps) {
  const [open, setOpen] = useState(false);

  const buttonClass = variant === "admin"
    ? "flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-sm font-medium text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#2B2F36] transition-all"
    : "flex items-center gap-3 px-3 py-2.5 w-full rounded-input text-sm font-medium text-[#848E9C] hover:text-[#F6465D] hover:bg-[#F6465D]/10 transition-all duration-200";

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass}>
        <LogOut size={18} />
        Logout
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div className="relative bg-[#1E2026] border border-[#2B2F36] rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex flex-col items-center gap-3 pt-8 pb-4 px-6">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#F6465D]/10 border border-[#F6465D]/20">
                <AlertTriangle className="text-[#F6465D]" size={28} />
              </div>
              <h3 className="text-lg font-semibold text-[#EAECEF]">Confirm Logout</h3>
              <p className="text-sm text-[#848E9C] text-center leading-relaxed">
                Are you sure you want to sign out? You'll need to log in again to access your account.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 p-6 pt-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-[#EAECEF] bg-[#2B2F36] border border-[#363A45] rounded-lg hover:bg-[#363A45] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#F6465D] rounded-lg hover:bg-[#D9304A] transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
