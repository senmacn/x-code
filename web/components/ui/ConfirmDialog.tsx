"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "default";
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
};

export const ConfirmProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<(ConfirmOptions & { visible: boolean }) | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ ...options, visible: true });
    });
  }, []);

  const close = (result: boolean) => {
    setState((s) => (s ? { ...s, visible: false } : null));
    setTimeout(() => {
      resolverRef.current?.(result);
      resolverRef.current = null;
      setState(null);
    }, 200);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          className={cn(
            "fixed inset-0 z-[110] flex items-center justify-center p-4 transition-opacity duration-200",
            state.visible ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => close(false)} />
          <div
            className={cn(
              "relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 transition-all duration-200",
              state.visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
            )}
          >
            {state.variant === "danger" && (
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center mb-4">
                <AlertTriangle size={20} className="text-rose-600" />
              </div>
            )}
            {state.title && (
              <h3 className="text-base font-semibold text-slate-900 mb-1">{state.title}</h3>
            )}
            <p className="text-sm text-slate-600 mb-6">{state.message}</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                {state.cancelText || "取消"}
              </button>
              <button
                onClick={() => close(true)}
                className={cn(
                  "px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors",
                  state.variant === "danger"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-sky-600 hover:bg-sky-700"
                )}
              >
                {state.confirmText || "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
