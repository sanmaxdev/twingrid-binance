"use client";

import { useState, useCallback, ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ShieldAlert, Trash2, Info } from "lucide-react";

type DialogVariant = "warning" | "danger" | "info";

interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
}

const variantConfig = {
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-[#F0B90B]/10 border-[#F0B90B]/20",
    iconColor: "text-[#F0B90B]",
    confirmBg: "bg-[#F0B90B] hover:bg-[#D0980B] text-[#1E2026]",
  },
  danger: {
    icon: ShieldAlert,
    iconBg: "bg-[#F6465D]/10 border-[#F6465D]/20",
    iconColor: "text-[#F6465D]",
    confirmBg: "bg-[#F6465D] hover:bg-[#D9304A] text-white",
  },
  info: {
    icon: Info,
    iconBg: "bg-[#1E9CF1]/10 border-[#1E9CF1]/20",
    iconColor: "text-[#1E9CF1]",
    confirmBg: "bg-[#1E9CF1] hover:bg-[#1580CC] text-white",
  },
};

/**
 * Hook that returns a `confirm()` replacement function and the dialog JSX.
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirmDialog();
 *   ...
 *   const ok = await confirm({ title: "...", message: "..." });
 *   if (ok) { doThing(); }
 *   ...
 *   return <>{ConfirmDialog}</>
 */
export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmDialogOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    open: false,
    options: { title: "", message: "" },
    resolve: null,
  });

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, options, resolve });
    });
  }, []);

  const handleClose = useCallback((result: boolean) => {
    state.resolve?.(result);
    setState((prev) => ({ ...prev, open: false, resolve: null }));
  }, [state.resolve]);

  const { variant = "warning" } = state.options;
  const config = variantConfig[variant];
  const Icon = config.icon;

  const ConfirmDialog = state.open && typeof document !== "undefined"
    ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => handleClose(false)}
          />

          {/* Dialog */}
          <div className="relative bg-[#1E2026] border border-[#2B2F36] rounded-xl shadow-2xl w-full max-w-[420px] overflow-hidden">
            {/* Content */}
            <div className="flex flex-col items-center gap-3 pt-8 pb-4 px-6">
              <div className={`flex items-center justify-center w-14 h-14 rounded-full border ${config.iconBg}`}>
                <Icon className={config.iconColor} size={28} />
              </div>
              <h3 className="text-lg font-semibold text-[#EAECEF] text-center">{state.options.title}</h3>
              <p className="text-sm text-[#848E9C] text-center leading-relaxed whitespace-pre-line">
                {state.options.message}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 p-6 pt-2">
              <button
                onClick={() => handleClose(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-[#EAECEF] bg-[#2B2F36] border border-[#363A45] rounded-lg hover:bg-[#363A45] transition-colors"
              >
                {state.options.cancelLabel || "Cancel"}
              </button>
              <button
                onClick={() => handleClose(true)}
                className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${config.confirmBg}`}
              >
                {state.options.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return { confirm, ConfirmDialog };
}
